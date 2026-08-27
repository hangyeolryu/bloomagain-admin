'use client';

/**
 * 티타임 신청 명단 — 앱의 teatime_signup_sheet가 teatime_signups에 쓴 예약.
 *
 * 구성(2026-08-26 개편):
 *  - 다가오는 자리를 시간순(가까운 것부터)으로, 지난 자리는 접힌 한 줄로 아래에.
 *  - 자리마다 노출 조건(정원·성별·출생연도·지역·숨김·제외)을 머리에 적는다 —
 *    "왜 이 자리가 그 분에게 안 보였지?"를 코드를 열지 않고 답하기 위해.
 *  - 본 사람을 이름으로 풀고, 시트를 열어 머문 시간과 '이번엔 못 가요' 선택까지
 *    한 자리에서 본다. 숫자 깔때기는 "몇 명"만 말하고 "누가"는 여기서 말한다.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getTeatimeSignups, getTeatimeFunnelByEvent, getCloseReasons,
  getTeatimeViewerDetails, getUsersByIds,
} from '@/lib/firestore';
import type {
  TeatimeSignup, TeatimeFunnel, CloseReasonSummary, TeatimeViewerDetail,
} from '@/lib/firestore';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// 참석은 여기서 못 고친다 — 고치는 곳은 '티타임 자리 관리' 한 곳뿐이다.
// 같은 걸 두 화면에서 고칠 수 있으면 어느 쪽이 맞는지 모르게 된다.
const ATT_KO: Record<string, string> = {
  pending: '—',
  coming: '온다고 함',
  cant: '못 온다고 함',
  attended: '왔음',
  noshow: '안 왔음',
};

const ATT_TONE: Record<string, string> = {
  coming: 'text-emerald-700',
  cant: 'text-gray-400',
  attended: 'font-semibold text-blue-700',
  noshow: 'text-red-600',
};

// 취소 사유 key → 사람 말. 앱 3.1.35+가 취소 시 묻기 시작한 값.
const CANCEL_REASON_KO: Record<string, string> = {
  schedule: '일정이 생겼어요',
  date_time: '날짜·시간이 안 맞아요',
  health: '몸이 안 좋아요',
  other_seat: '다른 자리로 갈게요',
  hesitant: '아직 망설여져요',
  etc: '기타',
};

function genderKo(g?: string): string {
  const v = (g ?? '').toLowerCase().trim();
  if (['female', 'f', '여', '여성', 'woman'].includes(v)) return '여성';
  if (['male', 'm', '남', '남성', 'man'].includes(v)) return '남성';
  return '미상';
}

interface SeatInfo {
  id: string;
  dateLabel?: string;
  district?: string;
  cardTitle?: string;
  capacity?: number;
  published?: boolean;
  status?: string;
  startAt?: string;
  genderPref?: string;
  minBirthYear?: number;
  maxBirthYear?: number;
  excludeUids?: string[];
  _excludeUids?: string[];
}

/** 자리 이름 한 줄. 세션을 못 읽었으면 id라도 보여준다. */
function seatName(s: SeatInfo | undefined, id: string): string {
  if (!s) return id;
  const parts = [s.dateLabel, s.district].filter(Boolean);
  return parts.length ? parts.join(' · ') : (s.cardTitle || id);
}

function fmtStartAt(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', weekday: 'short',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtDwell(ms: number): string {
  if (ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}분 ${s % 60}초` : `${m}분`;
}

/** 이 자리가 앱에서 누구에게 보이는가 — 카드가 안 뜬 이유를 찾는 첫 줄. */
function CondLine({ s }: { s?: SeatInfo }) {
  if (!s) return null;
  const parts: string[] = [];
  if (s.capacity) parts.push(`정원 ${s.capacity}`);
  if (s.genderPref === 'women') parts.push('여성만');
  else if (s.genderPref === 'men') parts.push('남성만');
  else parts.push('성별 무관');
  if (s.minBirthYear && s.maxBirthYear) parts.push(`${s.minBirthYear}~${s.maxBirthYear}년생`);
  else if (s.minBirthYear) parts.push(`${s.minBirthYear}년생부터`);
  else if (s.maxBirthYear) parts.push(`~${s.maxBirthYear}년생`);
  else parts.push('나이 무관');
  const excl = (s.excludeUids ?? s._excludeUids ?? []).length;
  if (excl > 0) parts.push(`제외 ${excl}명`);
  return (
    <p className="mt-0.5 text-xs text-gray-500">
      보이는 조건: {parts.join(' · ')}
      {s.published === false && (
        <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-gray-600">숨김 — 아무에게도 안 보임</span>
      )}
    </p>
  );
}

/**
 * 본 사람 → 열어본 사람 → 신청.
 *
 * "그냥 닫음"을 따로 보여주는 이유: 열어봤는데 안 한 사람이 많다는 건
 * 카드가 아니라 안내문이나 조건에서 마음이 식었다는 뜻이다.
 */
function FunnelBar({ f }: { f?: TeatimeFunnel }) {
  if (!f) return <span className="text-xs text-gray-400">기록 없음</span>;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
      <span className="text-gray-600">
        본 사람 <b className="text-gray-900">{f.viewers}</b>
        <span className="ml-1 text-gray-400">(노출 {f.shown})</span>
      </span>
      <span className="text-gray-300">→</span>
      <span className="text-gray-600">
        열어봄 <b className="text-gray-900">{f.tapped}</b>
        <span className="ml-1 text-gray-400">{pct(f.tapped, f.viewers)}%</span>
      </span>
      <span className="text-gray-300">→</span>
      <span className={f.signup > 0 ? 'text-emerald-700' : 'text-gray-500'}>
        신청 <b>{f.signup}</b>
        <span className="ml-1 text-gray-400">{pct(f.signup, f.tapped)}%</span>
      </span>
      {f.closed > 0 && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
          열었다 그냥 나감 {f.closed}
        </span>
      )}
    </div>
  );
}

/** 자리 한 곳의 전체 내용 — 다가오는 자리는 펼쳐서, 지난 자리는 접힌 안에서 재사용. */
function EventBody({
  signups, viewers, cantRows, nameOf,
}: {
  signups: TeatimeSignup[];
  viewers: TeatimeViewerDetail[];
  cantRows: CloseReasonSummary['rows'];
  nameOf: (uid: string) => string;
}) {
  // 취소한 신청은 명단에서 뺀다 — 자리는 이미 다른 분께 열려 있는데 명단에
  // 그대로 있으면 정원을 잘못 센다. 대신 아래에 신청→취소 시각과 함께 남긴다.
  const cancelled = signups.filter((r) => r.status === 'cancelled' && !r.withdrawn);
  const list = signups.filter((r) => !r.withdrawn && r.status !== 'cancelled');
  const left = signups.filter((r) => r.withdrawn);
  const openedViewers = viewers.filter((v) => v.opened && !v.signedUp);
  const cardOnly = viewers.filter((v) => !v.opened);
  const fmtShort = (d?: Date) =>
    d ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '?';

  return (
    <>
      {/* 열어봤는데 신청 안 한 사람 — 이 자리에서 제일 궁금한 사람들 */}
      {(openedViewers.length > 0 || cantRows.length > 0 || cardOnly.length > 0) && (
        <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 space-y-2 text-xs">
          {openedViewers.length > 0 && (
            <p className="text-gray-700">
              <span className="font-semibold text-gray-900">열어봤지만 신청 안 함</span>{' '}
              {openedViewers.map((v, i) => {
                const cant = cantRows.find((c) => c.uid === v.uid);
                return (
                  <span key={v.uid} className="whitespace-nowrap">
                    {i > 0 && <span className="text-gray-300"> · </span>}
                    <Link href={`/dashboard/users/view?id=${v.uid}`} className="text-blue-600 hover:underline">
                      {nameOf(v.uid)}
                    </Link>
                    <span className="text-gray-400"> {fmtDwell(v.dwellMs)}</span>
                    {cant && <span className="text-amber-700"> — {cant.label}</span>}
                  </span>
                );
              })}
            </p>
          )}
          {/* 열지도 않고 '못 가요'만 남긴 경우는 드물지만 놓치지 않는다 */}
          {cantRows.filter((c) => !openedViewers.some((v) => v.uid === c.uid)).map((c) => (
            <p key={`${c.uid}${c.key}`} className="text-amber-800">
              <Link href={`/dashboard/users/view?id=${c.uid}`} className="text-blue-600 hover:underline">
                {nameOf(c.uid)}
              </Link>
              님이 &lsquo;이번엔 못 가요&rsquo; — {c.label}
            </p>
          ))}
          {cardOnly.length > 0 && (
            <details className="text-gray-500">
              <summary className="cursor-pointer select-none">
                카드만 보고 안 연 사람 {cardOnly.length}명
              </summary>
              <p className="mt-1 leading-relaxed">
                {cardOnly.map((v, i) => (
                  <span key={v.uid}>
                    {i > 0 && ' · '}
                    <Link href={`/dashboard/users/view?id=${v.uid}`} className="text-blue-600 hover:underline">
                      {nameOf(v.uid)}
                    </Link>
                  </span>
                ))}
              </p>
            </details>
          )}
        </div>
      )}

      {list.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-2.5">이름</th>
              <th className="text-left px-5 py-2.5">지역</th>
              <th className="text-left px-5 py-2.5">성별</th>
              <th className="text-left px-5 py-2.5">참석</th>
              <th className="hidden sm:table-cell text-right px-5 py-2.5">머문 시간</th>
              <th className="text-right px-5 py-2.5">신청 시각</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const v = viewers.find((x) => x.uid === r.uid);
              return (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <Link href={`/dashboard/users/view?id=${r.uid}`} className="text-blue-600 hover:underline font-medium">
                      {r.name || '(이름 없음)'}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-gray-700">{r.region || '—'}</td>
                  <td className="px-5 py-2.5 text-gray-700">{genderKo(r.gender)}</td>
                  <td className={`px-5 py-2.5 ${ATT_TONE[r.attendance ?? 'pending'] ?? 'text-gray-400'}`}>
                    {ATT_KO[r.attendance ?? 'pending'] ?? '—'}
                  </td>
                  <td className="hidden sm:table-cell px-5 py-2.5 text-right tabular-nums text-gray-500">
                    {v ? fmtDwell(v.dwellMs) : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">
                    {r.createdAt ? r.createdAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {list.length === 0 && (
        <p className="px-5 py-4 text-sm text-gray-400">아직 신청자가 없습니다.</p>
      )}
      {cancelled.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-2.5 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">신청했다가 취소 {cancelled.length}건</p>
          {cancelled.map((r) => (
            <p key={r.id}>
              <Link href={`/dashboard/users/view?id=${r.uid}`} className="text-blue-600 hover:underline">
                {r.name || '(이름 없음)'}
              </Link>
              <span className="ml-1 tabular-nums text-gray-400">
                {fmtShort(r.createdAt)} 신청 → {fmtShort(r.cancelledAt)} 취소
              </span>
              {r.cancelReason && <span className="ml-1 text-amber-700">— {CANCEL_REASON_KO[r.cancelReason] ?? r.cancelReason}</span>}
            </p>
          ))}
        </div>
      )}
      {left.length > 0 && (
        <p className="border-t border-gray-100 bg-gray-50 px-5 py-2.5 text-xs text-gray-500">
          탈퇴해서 뺀 신청 {left.length}건
          <span className="ml-1 text-gray-400">
            ({left.map((r) => r.name || '이름없음').join(', ')})
          </span>
        </p>
      )}
    </>
  );
}

export default function TeatimePage() {
  const [rows, setRows] = useState<TeatimeSignup[] | null>(null);
  const [funnel, setFunnel] = useState<Record<string, TeatimeFunnel>>({});
  const [viewerDetails, setViewerDetails] = useState<Record<string, TeatimeViewerDetail[]>>({});
  const [seats, setSeats] = useState<Record<string, SeatInfo>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<CloseReasonSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCloseReasons()
      .then((r) => { if (!cancelled) setReasons(r); })
      .catch(() => {/* 못 읽어도 명단은 보여준다 */});
    getTeatimeSignups()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    getTeatimeFunnelByEvent()
      .then((f) => { if (!cancelled) setFunnel(f); })
      .catch(() => {/* 깔때기를 못 읽어도 명단은 보여준다 */});
    getTeatimeViewerDetails()
      .then((v) => { if (!cancelled) setViewerDetails(v); })
      .catch(() => {/* 상세를 못 읽어도 명단은 보여준다 */});
    fetch('/api/backend/titatime-sessions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const m: Record<string, SeatInfo> = {};
        for (const s of (j.items ?? []) as SeatInfo[]) m[s.id] = s;
        setSeats(m);
      })
      .catch(() => {/* 못 읽으면 id로라도 보여준다 */});
    return () => { cancelled = true; };
  }, []);

  // 본 사람·못가요 uid들의 이름. 신청자는 문서에 이름이 박제돼 있지만
  // 구경만 한 사람은 uid뿐이라 users에서 가져온다.
  useEffect(() => {
    const uids = new Set<string>();
    Object.values(viewerDetails).forEach((l) => l.forEach((v) => uids.add(v.uid)));
    (reasons?.rows ?? []).forEach((r) => r.uid && uids.add(r.uid));
    const missing = [...uids].filter((u) => !(u in names));
    if (!missing.length) return;
    getUsersByIds(missing).then((users) => {
      setNames((prev) => {
        const next = { ...prev };
        for (const u of missing) next[u] = '(탈퇴/없음)';
        for (const u of users) next[u.id] = u.displayName || u.id.slice(0, 6);
        return next;
      });
    }).catch(() => {/* 이름을 못 얻으면 uid 앞자리로 */});
    // names를 deps에 넣으면 setNames가 다시 트리거한다 — missing 계산이 이미 중복을 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerDetails, reasons]);

  const nameOf = (uid: string) => names[uid] ?? `${uid.slice(0, 6)}…`;

  // 자리 목록 = 신청이 있는 자리 ∪ 세션에 등록된 자리. 시작 시각으로
  // 다가오는/지난 을 가른다(시작 +3시간 지나면 지난 자리).
  const { upcoming, past } = useMemo(() => {
    const signupsByEvent = new Map<string, TeatimeSignup[]>();
    for (const r of rows ?? []) {
      (signupsByEvent.get(r.eventId) ?? signupsByEvent.set(r.eventId, []).get(r.eventId)!).push(r);
    }
    const ids = new Set<string>([...signupsByEvent.keys(), ...Object.keys(seats), ...Object.keys(viewerDetails)]);
    const now = Date.now();
    const items = [...ids].map((id) => {
      const startMs = seats[id]?.startAt ? new Date(seats[id].startAt!).getTime() : NaN;
      return {
        id,
        signups: signupsByEvent.get(id) ?? [],
        startMs: isNaN(startMs) ? null : startMs,
        isPast: !isNaN(startMs) && startMs + 3 * 60 * 60 * 1000 < now,
      };
    });
    return {
      // 가까운 자리부터. 시작 시각을 모르는 자리는 맨 뒤.
      upcoming: items.filter((x) => !x.isPast)
        .sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity)),
      // 지난 자리는 최근 것부터.
      past: items.filter((x) => x.isPast)
        .sort((a, b) => (b.startMs ?? 0) - (a.startMs ?? 0)),
    };
  }, [rows, seats, viewerDetails]);

  return (
    <div className="space-y-6">
      <Header
        title="티타임 신청 명단"
        subtitle="날짜가 확정된 티타임에 실제로 신청한 분들. 장소 확정·문자 안내에 쓰세요."
      />

      {/* 자리를 만드는 곳과 신청을 보는 곳이 갈려 있고, 경로도 titatime /
          teatime으로 한 글자만 달라 서로를 못 찾는다. 양쪽에 길을 낸다. */}
      <p className="-mt-4 text-xs text-gray-500">
        <b>참석 체크</b>와 확인 문자, 자리를 새로 열거나 고치는 일은{' '}
        <Link href="/dashboard/titatime" className="font-medium text-emerald-700 underline">
          티타임 자리 관리
        </Link>
        에서 합니다. 이 화면은 신청 이력만 보여줍니다.
      </p>

      {/* 열어보고 왜 안 했는지 — 회원이 직접 고른 답의 전체 합계. 자리별
          "누가"는 아래 각 자리 카드에 있다. */}
      {reasons && reasons.total > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-5">
          <summary className="cursor-pointer select-none font-semibold text-gray-900">
            열어보고 안 한 이유 <span className="font-normal text-gray-400">전체 {reasons.total}건</span>
          </summary>
          <ul className="mt-3 space-y-1.5">
            {reasons.byReason.map((r) => {
              const pct = Math.round((r.count / reasons.total) * 100);
              return (
                <li key={r.key} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 text-gray-700">{r.label}</span>
                  <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-gray-900">
                    {r.count}
                  </span>
                  <span
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(pct * 2, 4)}px` }}
                  />
                  <span className="text-xs text-gray-400">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          불러오기 실패: {error}
        </div>
      ) : rows === null ? (
        <LoadingSpinner />
      ) : (
        <>
          {upcoming.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
              다가오는 자리가 없습니다.
            </div>
          )}
          {upcoming.map(({ id, signups }) => {
            const s = seats[id];
            const list = signups.filter((r) => !r.withdrawn && r.status !== 'cancelled');
            const f = list.filter((r) => genderKo(r.gender) === '여성').length;
            const m = list.filter((r) => genderKo(r.gender) === '남성').length;
            const when = fmtStartAt(s?.startAt);
            return (
              <section key={id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold text-gray-900">
                      {seatName(s, id)}
                      {when && <span className="ml-2 text-sm font-normal text-emerald-700">{when}</span>}
                      <span className="ml-3 text-sm font-normal text-gray-500">
                        신청 {list.length}명 (여 {f} · 남 {m})
                        {s?.capacity ? ` / 정원 ${s.capacity}` : ''}
                      </span>
                    </h2>
                    <FunnelBar f={funnel[id]} />
                  </div>
                  <CondLine s={s} />
                  <div className="mt-0.5 font-mono text-[11px] text-gray-300">{id}</div>
                </div>
                <EventBody
                  signups={signups}
                  viewers={viewerDetails[id] ?? []}
                  cantRows={(reasons?.rows ?? []).filter((r) => r.eventId === id)}
                  nameOf={nameOf}
                />
              </section>
            );
          })}

          {/* 지난 자리 — 한 줄 요약으로 접어 둔다. 눌러야 전체가 열린다. */}
          {past.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-500">지난 자리 {past.length}곳</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {past.map(({ id, signups }) => {
                  const s = seats[id];
                  const list = signups.filter((r) => !r.withdrawn && r.status !== 'cancelled');
                  const attended = list.filter((r) => r.attendance === 'attended').length;
                  const noshow = list.filter((r) => r.attendance === 'noshow').length;
                  const fu = funnel[id];
                  return (
                    <details key={id}>
                      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-gray-50">
                        <span className="text-gray-700">
                          {seatName(s, id)}
                          <span className="ml-2 text-xs text-gray-400">{fmtStartAt(s?.startAt)}</span>
                        </span>
                        <span className="text-xs tabular-nums text-gray-500">
                          신청 {list.length}
                          {attended > 0 && ` · 참석 ${attended}`}
                          {noshow > 0 && ` · 노쇼 ${noshow}`}
                          {fu && ` · 본 사람 ${fu.viewers}`}
                        </span>
                      </summary>
                      <div className="border-t border-gray-100">
                        <div className="px-5 pt-3">
                          <FunnelBar f={fu} />
                          <CondLine s={s} />
                        </div>
                        <EventBody
                          signups={signups}
                          viewers={viewerDetails[id] ?? []}
                          cantRows={(reasons?.rows ?? []).filter((r) => r.eventId === id)}
                          nameOf={nameOf}
                        />
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

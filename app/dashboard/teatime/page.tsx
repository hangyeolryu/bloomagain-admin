'use client';

/**
 * 티타임 신청 명단 — 앱의 teatime_signup_sheet가 teatime_signups에 쓴 예약.
 * 이벤트별로 누가 신청했는지 보고, 장소 확정·문자 안내에 쓴다.
 * (열린 자리표=대기 중 블랙홀과 달리, 날짜가 확정된 자리의 실제 참석 명단)
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getTeatimeSignups, getTeatimeFunnelByEvent, getCloseReasons } from '@/lib/firestore';
import type { TeatimeSignup, TeatimeFunnel, CloseReasonSummary } from '@/lib/firestore';
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
  minToOpen?: number;
  published?: boolean;
  startAt?: string;
}

/** 자리 이름 한 줄. 세션을 못 읽었으면 id라도 보여준다. */
function seatName(s: SeatInfo | undefined, id: string): string {
  if (!s) return id;
  const parts = [s.dateLabel, s.district].filter(Boolean);
  return parts.length ? parts.join(' · ') : (s.cardTitle || id);
}

/**
 * 본 사람 → 열어본 사람 → 신청.
 *
 * "그냥 닫음"을 따로 보여주는 이유: 열어봤는데 안 한 사람이 많다는 건
 * 카드가 아니라 안내문이나 조건에서 마음이 식었다는 뜻이다. 카드를 키워봐야
 * 소용이 없다.
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

export default function TeatimePage() {
  const [rows, setRows] = useState<TeatimeSignup[] | null>(null);
  const [funnel, setFunnel] = useState<Record<string, TeatimeFunnel>>({});
  const [seats, setSeats] = useState<Record<string, SeatInfo>>({});
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
    // 자리 제목은 세션에서 온다. 예전엔 여기 문서 id가 그대로 떠서, 어느
    // 자리인지 알려면 id를 외우고 있어야 했다.
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

  // 이벤트별 그룹 (최신 이벤트가 위로)
  const byEvent = useMemo(() => {
    const m = new Map<string, TeatimeSignup[]>();
    for (const r of rows ?? []) {
      (m.get(r.eventId) ?? m.set(r.eventId, []).get(r.eventId)!).push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

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

      {/* 열어보고 왜 안 했는지 — 회원이 직접 고른 답. 깔때기가 "몇 명이
          돌아섰나"를 말한다면 이건 "왜"를 말한다. */}
      {reasons && reasons.total > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">열어보고 안 한 이유</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            자리를 열어보고 그냥 닫으신 분께 여쭤본 답 {reasons.total}건. 한 분께
            7일에 한 번만, 두 자리 이상 닫아보신 뒤에 묻습니다.
          </p>
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
        </section>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          불러오기 실패: {error}
        </div>
      ) : rows === null ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          아직 신청자가 없습니다.
        </div>
      ) : (
        byEvent.map(([eventId, all]) => {
          // 신청 후 탈퇴한 사람은 명단에서 뺀다 — 정원과 성비가 그대로면
          // 안 올 사람을 세면서 자리를 닫게 된다. 대신 몇 명이 빠졌는지는
          // 아래 한 줄로 남긴다.
          const list = all.filter((r) => !r.withdrawn);
          const left = all.filter((r) => r.withdrawn);
          const f = list.filter((r) => genderKo(r.gender) === '여성').length;
          const m = list.filter((r) => genderKo(r.gender) === '남성').length;
          const na = list.length - f - m;
          return (
            <section key={eventId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {seatName(seats[eventId], eventId)}
                    {seats[eventId]?.published === false && (
                      <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600">숨김</span>
                    )}
                    <span className="ml-3 text-sm font-normal text-gray-500">
                      총 {list.length}명 · 여성 {f} · 남성 {m} · 미상 {na}
                      {seats[eventId]?.capacity ? ` / 정원 ${seats[eventId]?.capacity}` : ''}
                    </span>
                  </h2>
                  <div className="mt-0.5 font-mono text-[11px] text-gray-400">{eventId}</div>
                </div>
                <FunnelBar f={funnel[eventId]} />
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-2.5">이름</th>
                    <th className="text-left px-5 py-2.5">지역</th>
                    <th className="text-left px-5 py-2.5">성별</th>
                    <th className="text-left px-5 py-2.5">상태</th>
                    <th className="text-left px-5 py-2.5">참석</th>
                    <th className="text-right px-5 py-2.5">신청 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/dashboard/users/view?id=${r.uid}`} className="text-blue-600 hover:underline font-medium">
                          {r.name || '(이름 없음)'}
                        </Link>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{r.uid.slice(0, 10)}…</div>
                      </td>
                      <td className="px-5 py-2.5 text-gray-700">{r.region || '—'}</td>
                      <td className="px-5 py-2.5 text-gray-700">{genderKo(r.gender)}</td>
                      <td className="px-5 py-2.5 text-gray-600">{r.status}</td>
                      <td className={`px-5 py-2.5 ${ATT_TONE[r.attendance ?? 'pending'] ?? 'text-gray-400'}`}>
                        {ATT_KO[r.attendance ?? 'pending'] ?? '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">
                        {r.createdAt ? r.createdAt.toLocaleString('ko-KR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {left.length > 0 && (
                <p className="border-t border-gray-100 bg-gray-50 px-5 py-2.5 text-xs text-gray-500">
                  탈퇴해서 뺀 신청 {left.length}건
                  <span className="ml-1 text-gray-400">
                    ({left.map((r) => r.name || '이름없음').join(', ')})
                  </span>
                </p>
              )}
            </section>
          );
        })
      )}

      {/* 신청이 0인 자리는 위 목록에 아예 안 나온다. 그런데 "본 사람은 있는데
          아무도 신청 안 한 자리"가 제일 봐야 할 자리다 — 무엇이 걸리는지
          거기에 답이 있다. */}
      {(() => {
        const withSignups = new Set(byEvent.map(([id]) => id));
        const empty = Object.values(seats)
          .filter((s) => !withSignups.has(s.id))
          .sort((a, b) => (b.startAt ?? '').localeCompare(a.startAt ?? ''));
        if (!empty.length) return null;
        return (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">아직 신청이 없는 자리</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                본 사람은 있는데 아무도 신청하지 않은 자리. 카드에서 막힌 건지
                안내문에서 막힌 건지 여기서 갈립니다.
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {empty.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {seatName(s, s.id)}
                    </span>
                    {s.published === false && (
                      <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">숨김</span>
                    )}
                    <div className="mt-0.5 font-mono text-[11px] text-gray-400">{s.id}</div>
                  </div>
                  <FunnelBar f={funnel[s.id]} />
                </li>
              ))}
            </ul>
          </section>
        );
      })()}
    </div>
  );
}

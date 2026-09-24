'use client';

/**
 * 갈 곳 — 사람들이 관심을 갖나.
 *
 * 앱의 '갈 곳' 탭(2026-09-24)이 서울시 공공데이터를 목록으로 보여주고,
 * 회원이 "여기 같이 갈래요"를 누르면 seat_proposals로 넘어간다.
 *
 * 이 화면이 답해야 하는 것은 하나다 — **열어보고 그냥 닫나, 뭔가 하나.**
 * 자리에서는 상세를 연 분의 97%가 그냥 닫았다(2026-09-07 실측). 이 탭을
 * 만든 이유가 그 97%를 내리는 것이라, 그 숫자를 맨 위에 크게 둔다.
 *
 * 칩을 무엇을 눌렀는지도 같이 본다 — **관심의 가장 싼 신호**다. 숲·공원이
 * 많이 눌리면 자리를 그쪽으로 열면 된다.
 */

import { useEffect, useMemo, useState } from 'react';
import { getOutingFunnel, getCultureEvents, getOutingHolds } from '@/lib/firestore';
import type { OutingFunnelRow, CultureEventRow, OutingHoldRow } from '@/lib/firestore';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const PHASE_KO: Record<string, string> = {
  tabOpen: '탭을 열었다',
  filter: '걸러봤다',
  cardTap: '카드를 눌렀다',
  linkOpen: '페이지를 열었다',
  wantToGo: '같이 갈래요',
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

function countBy<T>(rows: T[], key: (r: T) => string) {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) || '(없음)';
    m[k] = (m[k] ?? 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

const HOLD_LABEL: Record<string, string> = {
  alone: '아직 혼자',
  age: '또래 기다림',
  gender: '성별 조건',
  time: '시간대 다름',
};

const SLOT_LABEL: Record<string, string> = {
  weekday_day: '주중 낮',
  weekend_day: '주말 낮',
  evening: '저녁',
};

export default function OutingsPage() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<OutingFunnelRow[]>([]);
  const [events, setEvents] = useState<CultureEventRow[]>([]);
  const [holds, setHolds] = useState<OutingHoldRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 불러온 시각. '마지막 갱신 N시간 전'을 재는 기준이다.
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let alive = true;
    // 받아온 뒤에 그리는 화면이라 setState가 비동기 안에 있다.
    // alive 플래그로 떠난 뒤의 setState를 막는다.
    const run = async () => {
      try {
        const [f, e, h] = await Promise.all([
          getOutingFunnel(days),
          getCultureEvents(),
          getOutingHolds(),
        ]);
        if (!alive) return;
        setRows(f);
        setEvents(e);
        setHolds(h);
        setLoadedAt(Date.now());
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [days]);

  const v = useMemo(() => {
    const of = (p: string) => rows.filter((r) => r.phase === p);
    const who = (p: string) => new Set(of(p).map((r) => r.uid)).size;
    const closes = of('sheetClose');
    const acted = closes.filter((r) => r.acted === 1).length;
    return {
      of, who, closes, acted,
      open: who('tabOpen'),
      chips: countBy(of('filter'), (r) => r.chip ?? ''),
      gus: countBy(of('filter'), (r) => r.district ?? ''),
      freeOn: of('filter').filter((r) => r.free_only === 1).length,
      cats: countBy(of('cardTap'), (r) => r.category ?? ''),
      kinds: countBy(of('cardTap'), (r) => r.kind ?? ''),
      freeTap: of('cardTap').filter((r) => r.is_free === 1).length,
      whenPick: countBy(of('wantToGo'), (r) => r.when ?? ''),
      whoPick: countBy(of('wantToGo'), (r) => r.who ?? ''),
    };
  }, [rows]);

  // 목록 자체의 건강 상태 — 갱신이 멎으면 회원에게는 빈 탭이 된다.
  const stock = useMemo(() => {
    const free = events.filter((e) => e.isFree).length;
    const resv = events.filter((e) => e.kind === 'reservation').length;
    const newest = events.reduce<Date | undefined>(
      (a, e) => (!a || (e.updatedAt && e.updatedAt > a) ? e.updatedAt : a),
      undefined,
    );
    // 지금 시각은 렌더 중에 읽지 않는다(react-hooks/purity) — 불러온 시점을
    // 기준으로 센다. 어차피 이 화면은 열 때 한 번 받아온다.
    const hoursAgo = newest
      ? Math.round((loadedAt - newest.getTime()) / 3600000)
      : undefined;
    return { total: events.length, free, resv, hoursAgo };
  }, [events, loadedAt]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      <Header title="갈 곳" subtitle="사람들이 관심을 갖나" />

      <div className="flex gap-2">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => {
              setLoading(true);
              setDays(d);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              days === d ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {d}일
          </button>
        ))}
      </div>

      {/* ── 이 화면의 본론 ─────────────────────────────── */}
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="text-sm font-semibold text-emerald-900">
          상세를 열고 뭔가 한 비율
        </div>
        <div className="mt-2 text-4xl font-bold text-emerald-900">
          {pct(v.acted, v.closes.length)}
        </div>
        <div className="mt-1 text-sm text-emerald-800">
          상세 닫힘 {v.closes.length}번 중 {v.acted}번
        </div>
        <p className="mt-3 text-sm leading-relaxed text-emerald-900/80">
          자리에서는 상세를 연 분의 <b>97%가 그냥 닫았다</b>(2026-09-07).
          이 탭을 만든 이유가 그 97%를 내리는 것이다 — 여기가 그보다 나은지가
          이 화면의 유일한 질문이다.
        </p>
      </section>

      {/* ── 퍼널 ───────────────────────────────────────── */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="mb-4 font-semibold">사람 수로 본 퍼널</h2>
        {v.open === 0 ? (
          <p className="text-sm text-gray-500">
            아직 아무도 갈 곳 탭을 열지 않았습니다. 앱이 안 나갔을 수도 있습니다.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(PHASE_KO).map(([p, ko]) => {
                const n = v.who(p);
                return (
                  <tr key={p} className="border-b last:border-0">
                    <td className="py-2">{ko}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{n}명</td>
                    <td className="w-20 py-2 text-right text-gray-500 tabular-nums">
                      {pct(n, v.open)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── 무엇에 관심이 있나 ──────────────────────── */}
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="font-semibold">어떤 칩을 눌렀나</h2>
          <p className="mb-3 text-xs text-gray-500">
            관심의 가장 싼 신호. 많이 눌린 쪽으로 자리를 열면 된다.
          </p>
          {v.chips.length === 0 ? (
            <p className="text-sm text-gray-400">아직 없음</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {v.chips.map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-semibold tabular-nums">{n}번</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t pt-3 text-xs text-gray-600">
            <div>
              자치구: {v.gus.slice(0, 6).map(([k, n]) => `${k} ${n}`).join(' · ') || '—'}
            </div>
            <div className="mt-1">
              &apos;무료만&apos;을 켠 비율 {pct(v.freeOn, v.of('filter').length)}
            </div>
          </div>
        </section>

        {/* ── 어떤 곳을 눌렀나 ───────────────────────── */}
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="font-semibold">어떤 곳을 눌렀나</h2>
          <p className="mb-3 text-xs text-gray-500">카드를 눌러 상세까지 연 것.</p>
          {v.cats.length === 0 ? (
            <p className="text-sm text-gray-400">아직 없음</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {v.cats.slice(0, 10).map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-semibold tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t pt-3 text-xs text-gray-600">
            <div>
              종류: {v.kinds.map(([k, n]) =>
                `${k === 'reservation' ? '신청해야 가는 것' : '그냥 가는 것'} ${n}`,
              ).join(' · ') || '—'}
            </div>
            <div className="mt-1">
              무료를 누른 비율 {pct(v.freeTap, v.of('cardTap').length)}
            </div>
          </div>
        </section>
      </div>

      {/* ── 같이 갈래요 ───────────────────────────────── */}
      {v.of('wantToGo').length > 0 && (
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="mb-3 font-semibold">
            &quot;여기 같이 갈래요&quot; {v.of('wantToGo').length}건
          </h2>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-gray-500">언제</div>
              {v.whenPick.map(([k, n]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span><span className="font-semibold">{n}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs text-gray-500">어떤 분들과</div>
              {v.whoPick.map(([k, n]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span><span className="font-semibold">{n}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            같은 수만큼 <b>seat_proposals</b>에 들어가 있어야 한다 — 자리표에서 확인.
          </p>
        </section>
      )}

      {/* ── 목록 자체의 건강 ───────────────────────────── */}
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="mb-3 font-semibold">목록 상태</h2>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-2xl font-bold tabular-nums">{stock.total}</div>
            <div className="text-xs text-gray-500">전체</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{stock.free}</div>
            <div className="text-xs text-gray-500">무료</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{stock.resv}</div>
            <div className="text-xs text-gray-500">신청해야 가는 것</div>
          </div>
          <div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                (stock.hoursAgo ?? 99) > 36 ? 'text-red-600' : ''
              }`}
            >
              {stock.hoursAgo === undefined ? '—' : `${stock.hoursAgo}시간`}
            </div>
            <div className="text-xs text-gray-500">마지막 갱신</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          매일 새벽 5시 20분에 <b>refreshCultureEvents</b>가 돈다.
          마지막 갱신이 <b>36시간</b>을 넘으면 빨갛게 뜬다 — 갱신이 멎으면
          회원에게는 지난 행사만 남은 탭이 된다.
        </p>
      </section>

      {/* ── 손 들었는데 아직 안 묶인 분들 ───────────────────────── */}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-bold">기다리고 계신 분들</h2>
        <p className="mt-1 text-sm text-gray-600">
          앱에서는 <b>이유를 보여드리지 않는다.</b> &ldquo;9월 27일이면 나이는 빼고
          묶어드릴게요&rdquo;는 우리 규칙 해설이고, &ldquo;조건 때문에 막혔으니
          넓히시겠어요?&rdquo;는 우리가 정한 규칙의 뒷감당을 회원께 떠넘기는 말이다.
          이유는 여기서 우리가 본다.
        </p>
        {holds.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            지금 기다리고 계신 분이 없습니다.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr className="border-b">
                  <th className="py-2 pr-3">누가</th>
                  <th className="py-2 pr-3">어디</th>
                  <th className="py-2 pr-3">왜 안 묶였나</th>
                  <th className="py-2 pr-3">같은 곳에</th>
                  <th className="py-2 pr-3">기다린 날</th>
                  <th className="py-2">조건</th>
                </tr>
              </thead>
              <tbody>
                {holds.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{h.userName}</td>
                    <td className="py-2 pr-3 max-w-[22rem] truncate">
                      {h.eventTitle}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          h.holdReason === 'gender'
                            ? 'bg-red-100 text-red-700'
                            : h.holdReason === 'age'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {HOLD_LABEL[h.holdReason] ?? '아직 안 봤음'}
                      </span>
                      {h.holdReason === 'age' && h.holdAgeOpensAt && (
                        <span className="ml-2 text-xs text-gray-500">
                          {h.holdAgeOpensAt.getMonth() + 1}/
                          {h.holdAgeOpensAt.getDate()}에 풀림
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {h.holdCandidates}명
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {h.waitedDays}일
                    </td>
                    <td className="py-2 text-xs text-gray-500">
                      {SLOT_LABEL[h.timeSlot] ?? h.timeSlot}
                      {h.genderPref === 'same' && ' · 같은 성별끼리'}
                      {h.agePref === 'near' && ' · 또래 먼저'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">
          <b>또래 기다림</b>은 사흘 뒤(또는 행사 닷새 전)에 저절로 풀린다 —
          그냥 두면 된다. <b>성별</b>만 우리가 봐야 한다. 안 풀리는 조건이라,
          사흘을 넘기면 관리자 알림이 한 번 간다.
        </p>
      </section>
    </div>
  );
}

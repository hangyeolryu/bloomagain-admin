'use client';

// 자동 결모임 — 자리표 수요 · 제안 성사 대시보드
// ──────────────────────────────────────────────────────────────────────────
// 자리표(무엇을 기다리나)와 제안(조립이 얼마나 성사되나)을 본다.
// · 만남 자리표의 동네 분포 = 오프라인 수요 지도 (성립 안 돼도 자산)
// · room_created 제안의 평균 minPair = T_abs/K 캘리브레이션 참고값
//   (7일 생존율 데이터가 쌓이면 문턱을 조정한다 — 스펙 §3-B)

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getMoimStats, type MoimStats } from '@/lib/firestore';

const SLOT_LABEL: Record<string, string> = {
  day: '낮', evening: '저녁', weekend: '주말',
};
function fmtDateTime(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Tile({ label, value, hint, strong }: { label: string; value: string | number; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? 'text-3xl font-bold text-gray-900' : 'text-2xl font-semibold text-gray-900'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

function Bar({ label, count, max, note }: { label: string; count: number; max: number; note?: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-44 shrink-0 truncate text-sm text-gray-700" title={label}>{label}</div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
        <div className="absolute inset-y-0 left-0 rounded bg-green-600/80" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 shrink-0 text-right text-sm tabular-nums text-gray-600">
        {count}{note ? <span className="text-xs text-gray-400"> {note}</span> : null}
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  proposed: '초대 중',
  room_created: '방 생성',
  expired: '만료',
  not_formed: '무산',
};

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

export default function MoimDashboardPage() {
  const [stats, setStats] = useState<MoimStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMoimStats()
      .then(setStats)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;
  if (!stats) return null;

  const t = stats.tickets;
  const p = stats.proposals;
  const maxDemand = stats.meetDemand[0]?.count ?? 0;
  const maxTopic = stats.topicDemand[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="결모임 자리표" subtitle="자리표 수요와 자동 조립 성사 현황" />
      <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        {/* 자리표 현황 */}
        <section>
          <h2 className="mb-3 text-sm font-bold text-gray-900">자리표 (대기 수요)</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="대기 중 자리표" value={t.active} strong hint={`전체 ${t.total}장 · 쉬는 중 ${t.paused}장`} />
            <Tile label="대화 자리 (전 세계 풀)" value={t.chat} />
            <Tile label="만나는 자리 (동네 풀)" value={t.meet} />
            <Tile label="'이번 주 안엔'" value={t.thisWeek} hint="긴급 시드 우선" />
          </div>
        </section>

        {/* 최근 등록된 자리표 — 누가·뭘·언제 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-bold text-gray-900">최근 등록된 자리표 (누가·뭘·언제)</h2>
          <p className="mb-3 text-xs text-gray-500">
            등록자·자리 종류·조건을 등록 최신순으로. 이름을 누르면 그 회원 상세로 이동해요.
          </p>
          {stats.recentTickets.length === 0 ? (
            <p className="text-sm text-gray-400">아직 등록된 자리표가 없어요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="py-2 pr-3">등록자</th>
                    <th className="py-2 pr-3">종류</th>
                    <th className="py-2 pr-3">조건</th>
                    <th className="py-2 pr-3">상태</th>
                    <th className="py-2">등록 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTickets.map((r, i) => {
                    const cond: string[] = [];
                    if (r.type === 'meet') {
                      if (r.district) cond.push(r.district);
                      cond.push(r.party === 'couple' ? '부부·동반' : '혼자');
                      if (r.timeSlots.length)
                        cond.push(r.timeSlots.map((s) => SLOT_LABEL[s] ?? s).join('·'));
                    }
                    if (r.topics.length) cond.push(r.topics.join('·'));
                    if (r.urgency === 'this_week') cond.push('이번 주 안엔');
                    return (
                      <tr key={`${r.uid}-${i}`} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/dashboard/users/view?id=${r.uid}`}
                            className="font-medium text-green-700 hover:underline"
                          >
                            {r.displayName}
                          </Link>
                          <span className="ml-1 font-mono text-[10px] text-gray-400">
                            {r.uid.slice(0, 6)}…
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.type === 'meet'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {r.type === 'meet' ? '🍵 만나는 자리' : '💬 대화 자리'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-700">
                          {cond.length ? cond.join(' · ') : '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          {r.active ? (
                            <span className="text-green-600">대기 중</span>
                          ) : (
                            <span className="text-gray-400">쉬는 중</span>
                          )}
                        </td>
                        <td className="py-2.5 text-gray-500">{fmtDateTime(r.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 제안 성사 */}
        <section>
          <h2 className="mb-3 text-sm font-bold text-gray-900">제안 (자동 조립 결과)</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="방 생성" value={p.roomCreated} strong hint={`제안 ${p.total}건 중`} />
            <Tile label="초대 응답률" value={pct(p.responseRate)} hint="초대 슬롯 중 응답" />
            <Tile label="응답 중 수락률" value={pct(p.inviteAcceptRate)} />
            <Tile label="성사 제안 평균 minPair" value={p.avgMinPair === null ? '—' : p.avgMinPair.toFixed(3)} hint="T_abs 캘리브레이션 참고" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="초대 중" value={p.proposed} />
            <Tile label="만료" value={p.expired} />
            <Tile label="무산 (수락 부족)" value={p.notFormed} />
            <Tile label="전체 제안" value={p.total} />
          </div>
        </section>

        {/* 동네 수요 지도 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-bold text-gray-900">동네별 만남 수요</h2>
          <p className="mb-3 text-xs text-gray-500">
            성립 안 된 대기도 그대로 수요 지도 — 어느 동네부터 오프라인을 열지의 근거.
          </p>
          {stats.meetDemand.length === 0 ? (
            <p className="text-sm text-gray-400">아직 만남 자리표가 없어요.</p>
          ) : (
            <div className="space-y-2">
              {stats.meetDemand.slice(0, 20).map((d) => (
                <Bar key={d.district} label={d.district} count={d.count} max={maxDemand} note={d.couple > 0 ? `부부 ${d.couple}` : undefined} />
              ))}
            </div>
          )}
        </section>

        {/* 주제 수요 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">이야기 주제 수요</h2>
          {stats.topicDemand.length === 0 ? (
            <p className="text-sm text-gray-400">주제를 고른 자리표가 아직 없어요.</p>
          ) : (
            <div className="space-y-2">
              {stats.topicDemand.map((d) => (
                <Bar key={d.topic} label={d.topic} count={d.count} max={maxTopic} />
              ))}
            </div>
          )}
        </section>

        {/* 최근 제안 */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">최근 제안 40건</h2>
          {stats.recentProposals.length === 0 ? (
            <p className="text-sm text-gray-400">아직 제안이 없어요. backend /moim/assemble 크론이 자리표를 조립하면 여기 쌓여요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="py-2 pr-3">시각</th>
                    <th className="py-2 pr-3">종류</th>
                    <th className="py-2 pr-3">동네</th>
                    <th className="py-2 pr-3">인원</th>
                    <th className="py-2 pr-3">수락/응답</th>
                    <th className="py-2 pr-3">minPair</th>
                    <th className="py-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentProposals.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                        {r.createdAt ? r.createdAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="py-2 pr-3">{r.type === 'meet' ? '만남' : '대화'}</td>
                      <td className="py-2 pr-3 text-gray-600">{r.district ?? '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.members}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.accepted}/{r.responded}</td>
                      <td className="py-2 pr-3 tabular-nums text-gray-600">{r.minPair === null ? '—' : r.minPair.toFixed(3)}</td>
                      <td className="py-2">
                        <span className={
                          r.status === 'room_created' ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800' :
                          r.status === 'proposed' ? 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800' :
                          'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600'
                        }>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {stats.capped && (
          <p className="text-xs text-gray-400">표본이 상한(2,000)에 걸려 일부만 집계됐어요.</p>
        )}
      </main>
    </div>
  );
}

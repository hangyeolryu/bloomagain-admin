'use client';

// 결 유형 테스트 (무가입) — 관심·유입 대시보드
// ──────────────────────────────────────────────────────────────────────────
// 마케팅 웹(tita-app.com/gyeol)의 무가입 결 유형 테스트가 남기는 익명 이벤트를
// 집계한다. 테스트는 로그인이 없어 "누가"(개인)는 없고, "몇 명·어떤 유형·
// 어디서·다운 전환"을 본다. 데이터: Firestore `gyeol_test_events` (백엔드가
// POST /api/v1/gyeol/events로 적재).

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  getGyeolStats,
  gyeolTypeLabel,
  GYEOL_GENDER_LABELS,
  GYEOL_COMFORT_LABELS,
  type GyeolStats,
} from '@/lib/firestore';

function Tile({ label, value, hint, strong }: { label: string; value: string | number; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? 'text-3xl font-bold text-gray-900' : 'text-2xl font-semibold text-gray-900'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 truncate text-sm text-gray-700" title={label}>{label}</div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
        <div className="absolute inset-y-0 left-0 rounded bg-green-600/80" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-12 shrink-0 text-right text-sm tabular-nums text-gray-600">{count}</div>
    </div>
  );
}

export default function GyeolDashboardPage() {
  const [stats, setStats] = useState<GyeolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getGyeolStats()
      .then(setStats)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;
  if (!stats) return null;

  const t = stats.totals;
  // 비율은 0~100%로 클램프한다. start 전송이 유실되거나(네트워크) 한 유저가
  // iOS/Android 둘 다 누르면 비율이 100%를 넘을 수 있어 표시가 깨진다.
  const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
  const typeMax = stats.typeDistribution[0]?.count ?? 0;
  const srcMax = stats.bySource[0]?.count ?? 0;
  const genderMax = stats.genderDistribution[0]?.count ?? 0;
  const comfortMax = stats.comfortDistribution[0]?.count ?? 0;
  const genderKnown = stats.genderDistribution.reduce((s, d) => s + d.count, 0);
  // 막대 스케일은 start·complete 통합 최댓값 기준 (complete>start여도 안 넘침).
  const dayMax = Math.max(1, ...stats.daily.flatMap((d) => [d.start, d.complete]));

  return (
    <div className="max-w-5xl space-y-8 p-6">
      <Header
        title="결 유형 테스트"
        subtitle="무가입 테스트 관심·유입 (익명 집계 — 개인 신원은 남지 않음)"
      />

      {/* 퍼널 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">퍼널</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Tile label="테스트 시작" value={t.start} strong />
          <Tile label="완료" value={t.complete} strong />
          <Tile label="완료율" value={pct(stats.completionRate)} hint="완료 / 시작" />
          <Tile label="결과 공유" value={t.share} />
          <Tile label="다운로드 클릭" value={t.download} />
          <Tile label="다운 전환율" value={pct(stats.downloadRate)} hint="다운클릭 / 완료" />
        </div>
      </section>

      {/* 유형 분포 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">어떤 결 유형이 많이 나오나</h2>
        <p className="mb-3 text-xs text-gray-400">완료 기준 · 어떤 결의 사람들이 관심 갖는지</p>
        {stats.typeDistribution.length === 0 ? (
          <p className="text-sm text-gray-400">아직 완료 데이터가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {stats.typeDistribution.map((d) => (
              <Bar key={d.type} label={gyeolTypeLabel(d.type)} count={d.count} max={typeMax} />
            ))}
          </div>
        )}
      </section>

      {/* 성비 + 편안함 (여성-우선 핵심 지표) */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">성별 · 누구와 편한지</h2>
        <p className="mb-3 text-xs text-gray-400">
          완료 시점 선택(익명·선택) · 여성-우선 성비와 매칭 필터 근거
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-gray-500">성별</span>
              <span className="text-sm font-semibold text-green-700 tabular-nums">
                여성 {genderKnown > 0 ? `${Math.round(stats.femaleShare * 100)}%` : '—'}
                <span className="ml-1 text-xs font-normal text-gray-400">(응답 {genderKnown})</span>
              </span>
            </div>
            {stats.genderDistribution.length === 0 ? (
              <p className="text-sm text-gray-400">아직 응답이 없어요.</p>
            ) : (
              <div className="space-y-2">
                {stats.genderDistribution.map((d) => (
                  <Bar key={d.gender} label={GYEOL_GENDER_LABELS[d.gender] ?? d.gender} count={d.count} max={genderMax} />
                ))}
              </div>
            )}
          </div>
          <div>
            <span className="mb-2 block text-xs font-medium text-gray-500">누구와 함께가 편한지</span>
            {stats.comfortDistribution.length === 0 ? (
              <p className="text-sm text-gray-400">아직 응답이 없어요.</p>
            ) : (
              <div className="space-y-2">
                {stats.comfortDistribution.map((d) => (
                  <Bar key={d.comfort} label={GYEOL_COMFORT_LABELS[d.comfort] ?? d.comfort} count={d.count} max={comfortMax} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 유입 소스 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">어디서 왔나 (유입 채널)</h2>
        <p className="mb-3 text-xs text-gray-400">완료 기준 · utm_source → 없으면 유입 도메인</p>
        {stats.bySource.length === 0 ? (
          <p className="text-sm text-gray-400">아직 데이터가 없어요.</p>
        ) : (
          <div className="space-y-2">
            {stats.bySource.slice(0, 12).map((d) => (
              <Bar key={d.source} label={d.source} count={d.count} max={srcMax} />
            ))}
          </div>
        )}
      </section>

      {/* 일별 추이 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">최근 14일 추이</h2>
        {stats.daily.length === 0 ? (
          <p className="text-sm text-gray-400">아직 데이터가 없어요.</p>
        ) : (
          <div className="flex gap-1.5 rounded-lg border border-gray-100 bg-gray-50/50 p-3" style={{ height: 150 }}>
            {stats.daily.map((d) => {
              const barH = (v: number) =>
                `${Math.min(100, (v / dayMax) * 100)}%`;
              return (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col gap-1"
                  title={`${d.date} · 시작 ${d.start} / 완료 ${d.complete}`}
                >
                  <div className="relative w-full flex-1">
                    {/* 연한 넓은 막대 = 시작, 진한 좁은 막대 = 완료 (둘 다 바닥 정렬) */}
                    <div
                      className="absolute bottom-0 left-0 w-full rounded-t bg-green-200"
                      style={{ height: barH(d.start) }}
                    />
                    <div
                      className="absolute bottom-0 left-1/2 w-1/2 -translate-x-1/2 rounded-t bg-green-600"
                      style={{ height: barH(d.complete) }}
                    />
                  </div>
                  <div className="text-center text-[9px] text-gray-400">
                    {d.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">진한 막대 = 완료, 연한 막대 = 시작</p>
      </section>

      {/* 최근 이벤트 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">최근 이벤트</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">시각</th>
                <th className="px-3 py-2 text-left font-medium">단계</th>
                <th className="px-3 py-2 text-left font-medium">결 유형</th>
                <th className="px-3 py-2 text-left font-medium">유입</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{r.createdAt ? r.createdAt.toLocaleString('ko-KR') : '—'}</td>
                  <td className="px-3 py-2">{{ start: '시작', complete: '완료', share: '공유', download: '다운클릭' }[r.phase] ?? r.phase}</td>
                  <td className="px-3 py-2 text-gray-700">{r.type ? gyeolTypeLabel(r.type) : '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.source ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-400">
        {stats.capped && '최근 2,000건 기준 집계. '}
        테스트는 무가입이라 개인 신원은 저장하지 않아요. 실시간 이벤트는 GA4에서도 볼 수 있어요.
      </p>
    </div>
  );
}

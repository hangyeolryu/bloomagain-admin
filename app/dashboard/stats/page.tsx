'use client';

import { useEffect, useState } from 'react';
import { getStatsPageData } from '@/lib/stats';
import type { StatsPageData, TrendPoint, RetentionStat, CohortRow } from '@/lib/stats';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(a: number, b: number) {
  if (!b) return '-';
  return `${Math.round((a / b) * 100)}%`;
}

function delta(curr: number, prev: number): { text: string; up: boolean } | null {
  if (prev === 0) return curr ? { text: `신규 +${curr}`, up: true } : null;
  const p = Math.round(((curr - prev) / prev) * 100);
  if (p === 0) return null;
  return { text: `${p > 0 ? '▲' : '▼'}${Math.abs(p)}%`, up: p > 0 };
}

function healthColor(value: number, ok: number, good: number) {
  if (value >= good) return 'text-green-600';
  if (value >= ok)   return 'text-yellow-600';
  return 'text-red-500';
}

function heatmapClass(pct: number) {
  if (pct >= 50) return 'bg-green-600 text-white';
  if (pct >= 35) return 'bg-green-400 text-white';
  if (pct >= 20) return 'bg-green-200 text-gray-800';
  if (pct >= 10) return 'bg-green-100 text-gray-700';
  if (pct > 0)   return 'bg-gray-100 text-gray-500';
  return 'bg-gray-50 text-gray-300';
}

// ── sub-components ────────────────────────────────────────────────────────────

function Chip({
  label, value, sub, badge, info,
}: {
  label: string;
  value: string | number;
  sub?: string;
  badge?: { text: string; up: boolean } | null;
  info?: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-0.5 min-w-[130px]"
      title={info}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        {info && <span className="text-gray-300 text-xs cursor-help" title={info}>ⓘ</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-gray-900 tabular-nums">{value}</span>
        {badge && (
          <span className={`text-xs font-semibold ${badge.up ? 'text-green-600' : 'text-red-500'}`}>
            {badge.text}
          </span>
        )}
      </div>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-gray-700">{children}</h2>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: TrendPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.count), 1);
  const showEvery = Math.ceil(data.length / 10);

  return (
    <div>
      <div className="flex items-end gap-px h-36 bg-gray-50 rounded-xl px-2 pt-2 pb-0">
        {data.map((d, i) => {
          const barPct = (d.count / max) * 100;
          const isH = hovered === i;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end items-center relative"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onTouchStart={() => setHovered(i)}
            >
              {isH && (
                <div className="absolute bottom-full mb-1 bg-gray-900 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap z-10 pointer-events-none">
                  {d.label}: <strong>{d.count}명</strong>
                </div>
              )}
              <div
                className={`w-full rounded-t-sm transition-colors ${isH ? 'bg-green-500' : 'bg-green-300'}`}
                style={{ height: `${barPct}%`, minHeight: d.count > 0 ? '2px' : '0' }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-px px-2 mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 overflow-hidden text-center">
            {i % showEvery === 0 && (
              <span className="text-xs text-gray-400 block truncate">{d.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Retention Card ────────────────────────────────────────────────────────────

function RetentionCard({
  label, stat, okPct, goodPct, hint,
}: {
  label: string; stat: RetentionStat; okPct: number; goodPct: number; hint: string;
}) {
  const p = stat.eligible ? Math.round((stat.kept / stat.eligible) * 100) : null;
  const color = p != null ? healthColor(p, okPct, goodPct) : 'text-gray-400';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400" title={hint}>ⓘ</span>
      </div>
      <div className={`text-3xl font-bold tabular-nums ${color}`}>
        {p != null ? `${p}%` : '-'}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        {stat.eligible > 0
          ? `${stat.kept} / ${stat.eligible}명`
          : '대상 없음'}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-50 text-xs text-gray-400">
        양호 {okPct}%↑ · 우수 {goodPct}%↑
      </div>
      <div className="mt-1 text-xs text-gray-400 leading-relaxed">{hint}</div>
    </div>
  );
}

// ── Cohort Table ──────────────────────────────────────────────────────────────

function CohortTable({ cohorts }: { cohorts: CohortRow[] }) {
  if (!cohorts.length) return <p className="text-sm text-gray-400 py-4">데이터 없음</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">가입 월</th>
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">가입자</th>
            {['M0', 'M1', 'M2', 'M3', 'M4', 'M5'].map((m) => (
              <th key={m} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {cohorts.map((row) => (
            <tr key={row.cohortLabel} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2.5 text-xs font-medium text-gray-700 whitespace-nowrap">{row.cohortLabel}</td>
              <td className="px-3 py-2.5 text-center text-xs text-gray-500">{row.total}</td>
              {row.months.map((cell, mi) => {
                if (!cell) {
                  return (
                    <td key={mi} className="px-3 py-2.5 text-center">
                      <span className="text-xs text-gray-300">-</span>
                    </td>
                  );
                }
                return (
                  <td key={mi} className="px-1 py-1">
                    <div
                      className={`rounded-lg px-2 py-1.5 text-center text-xs font-semibold tabular-nums ${heatmapClass(cell.pct)}`}
                      title={`${cell.count}명`}
                    >
                      {cell.pct}%{cell.isPartial ? '*' : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
        * 아직 구간이 끝나지 않은 셀 — 실제 수치는 올라갈 수 있음 &nbsp;·&nbsp;
        활성 기준: <code>lastActiveAt</code> (앱 열기) &nbsp;·&nbsp;
        M0 = 가입 후 0~30일, M1 = 31~60일…
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Period = '30d' | '12w' | '12m';

export default function StatsPage() {
  const [data, setData] = useState<StatsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');

  useEffect(() => {
    getStatsPageData()
      .then(setData)
      .catch((e) => console.error('[Stats]', e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!data) return <p className="text-sm text-gray-400 p-8">데이터를 불러오지 못했습니다.</p>;

  const { total, today, d7, d7prev, d30, d30prev, dailyAvg30,
    dau, wau, mau, activeCount, notifEnabled, hasInterests,
    trend30d, trend12w, trend12m, usersWithoutCreatedAt,
    retention, cohorts } = data;

  const stickinessDauMau = mau ? Math.round((dau / mau) * 100) : 0;
  const stickinessWauMau = mau ? Math.round((wau / mau) * 100) : 0;
  const trendData: TrendPoint[] = period === '30d' ? trend30d : period === '12w' ? trend12w : trend12m;
  const periodLabel = period === '30d' ? '최근 30일 (일별)' : period === '12w' ? '최근 12주 (주별)' : '최근 12개월 (월별)';

  return (
    <div className="space-y-8">
      <Header
        title="성장 통계"
        subtitle="본인인증 완료 유저 기준"
      />

      {/* ── 1. 성장 지표 ───────────────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="가입 완료 기준. 본인인증(NICE) 마친 유저만 집계합니다.">
          📈 성장 지표
        </SectionTitle>
        <div className="flex gap-3 overflow-x-auto pb-1">
          <Chip
            label="전체 유저"
            value={total.toLocaleString()}
            info="본인인증 완료 유저 총합"
          />
          <Chip
            label="오늘 가입"
            value={today}
            info="오늘 자정 이후 가입"
          />
          <Chip
            label="7일 가입"
            value={d7}
            badge={delta(d7, d7prev)}
            info="직전 7일 대비 증감. 직전 기간이 0이면 '신규 +N' 표시"
          />
          <Chip
            label="30일 가입"
            value={d30}
            badge={delta(d30, d30prev)}
            info="직전 30일 대비 증감"
          />
          <Chip
            label="일평균 가입"
            value={dailyAvg30}
            sub="(최근 30일)"
            info="최근 30일 가입 수 ÷ 30일"
          />
        </div>
      </section>

      {/* ── 2. 활성 지표 ───────────────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="lastActiveAt(세션 시작)을 기준으로, 앱을 열어본 유저까지 포함합니다. 저장·매칭 없이 열어만 봐도 카운트됩니다.">
          🔥 활성 지표 (세션 기준)
        </SectionTitle>
        <div className="flex gap-3 overflow-x-auto pb-1 mb-3">
          <Chip
            label="DAU"
            value={dau}
            sub={`MAU 대비 ${pct(dau, mau)}`}
            info="오늘 앱을 열어본 인증 유저"
          />
          <Chip
            label="WAU"
            value={wau}
            sub={`MAU 대비 ${pct(wau, mau)}`}
            info="최근 7일 내 앱을 열어본 유저"
          />
          <Chip
            label="MAU"
            value={mau}
            sub={`전체 대비 ${pct(mau, total)}`}
            info="최근 30일 내 앱을 열어본 유저"
          />
          <Chip
            label="고착도 DAU/MAU"
            value={`${stickinessDauMau}%`}
            sub={stickinessDauMau >= 20 ? '✅ 양호' : stickinessDauMau >= 10 ? '⚠️ 보통' : '❌ 낮음'}
            info="DAU/MAU × 100. 20%↑ 양호, 5% 이하는 이탈 위험 신호. SNS 앱 평균 20~25%."
          />
          <Chip
            label="고착도 WAU/MAU"
            value={`${stickinessWauMau}%`}
            sub={stickinessWauMau >= 40 ? '✅ 양호' : stickinessWauMau >= 20 ? '⚠️ 보통' : '❌ 낮음'}
            info="WAU/MAU × 100. 40%↑ 양호, 60%↑ 우수. 주간 습관 형성 여부를 나타냅니다."
          />
        </div>

        {/* 기타 지표 (비율 포함) */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          <Chip
            label="활성 계정"
            value={activeCount}
            sub={`전체 대비 ${pct(activeCount, total)}`}
            info="accountStatus = active (또는 미설정). 정지·차단 제외."
          />
          <Chip
            label="알림 구독"
            value={notifEnabled}
            sub={`전체 대비 ${pct(notifEnabled, total)}`}
            info="notificationEnabled = true. 50% 이상이면 양호."
          />
          <Chip
            label="취향 완료"
            value={hasInterests}
            sub={`전체 대비 ${pct(hasInterests, total)}`}
            info="interests 배열에 값이 있는 유저. 온보딩 완료율 지표."
          />
        </div>
      </section>

      {/* ── 3. 가입 트렌드 차트 ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle hint="본인인증 완료 유저의 가입일(createdAt) 기준. 빈 날도 0으로 표시합니다.">
            📊 가입 트렌드
          </SectionTitle>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs flex-shrink-0">
            {(['30d', '12w', '12m'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  period === p ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p === '30d' ? '30일' : p === '12w' ? '12주' : '12개월'}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-3">{periodLabel} · 막대에 커서를 올리면 상세 수치</p>
          <BarChart data={trendData} />
          {usersWithoutCreatedAt > 0 && (
            <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">
              ⚠️ createdAt 없는 유저 <strong>{usersWithoutCreatedAt}명</strong>은 차트에 포함되지 않음
            </p>
          )}
        </div>
      </section>

      {/* ── 4. 생존율 (Retention) ──────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="가입 후 N일 이상 지난 유저 중, N일째 이후에도 앱을 열어본 비율. 분모는 해당 기간이 경과한 유저로만 제한합니다.">
          💊 생존율 (Retention)
        </SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RetentionCard
            label="D1 (다음날 복귀)"
            stat={retention.d1}
            okPct={30} goodPct={50}
            hint="가입 다음날에도 앱을 열었는가. 소셜앱 평균 30~40%, 50% 이상이면 우수."
          />
          <RetentionCard
            label="D7 (1주 생존)"
            stat={retention.d7}
            okPct={15} goodPct={30}
            hint="가입 7일 뒤에도 활성. 20% 이상이면 건강한 습관 형성 신호."
          />
          <RetentionCard
            label="D30 (1개월 생존)"
            stat={retention.d30}
            okPct={8} goodPct={20}
            hint="가입 30일 이후에도 사용. 10%↑ 양호, 20%↑ 우수."
          />
          <RetentionCard
            label="D90 (3개월 생존)"
            stat={retention.d90}
            okPct={5} goodPct={15}
            hint="가입 90일 이후에도 사용. 5%↑ 양호, 15%↑ 충성 유저층."
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          ※ 활성 기준 = <code>lastActiveAt</code>(최근 세션 시작). D7 분모가 D30보다 크더라도 정상 — 각 행의 분모가 다릅니다.
        </p>
      </section>

      {/* ── 5. 코호트 리텐션 표 ───────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="가입 월별로 묶어, 가입 후 각 30일 구간에 앱을 열어본 비율. * = 해당 구간이 아직 진행 중.">
          🗓️ 가입 월 코호트 리텐션 (M0~M5)
        </SectionTitle>
        <CohortTable cohorts={cohorts} />
        <div className="flex flex-wrap gap-2 mt-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-600 inline-block" /> 50%+</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> 35~49%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> 20~34%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> 10~19%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" /> 1~9%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-50 border inline-block" /> 0%</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          건강한 앱 기준: M1 이상 30%↑ 유지, M3 이상 15%↑. 코호트별 하락 기울기가 완만할수록 리텐션 구조가 좋습니다.
        </p>
      </section>
    </div>
  );
}

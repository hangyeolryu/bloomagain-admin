'use client';

// 니즈 설문 ("요즘 나에게 필요한 것" — tita-app.com/needs) 대시보드.
// 5060 광고 퍼널의 수요 데이터: situation(자녀독립·이혼·사별·은퇴) ⭐,
// activity(하고 싶은 것) ⭐, worry(걱정=광고 각도) ⭐ + 퍼널·연령·유입.

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  getNeedsStats,
  NEEDS_LABELS,
  NEEDS_DIM_LABELS,
  GYEOL_AGE_LABELS,
  type NeedsStats,
} from '@/lib/firestore';

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

function Bar({ label, count, max, tone }: { label: string; count: number; max: number; tone?: 'green' | 'red' }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-44 shrink-0 truncate text-sm text-gray-700" title={label}>{label}</div>
      <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-100">
        <div
          className={`absolute inset-y-0 left-0 rounded ${tone === 'red' ? 'bg-red-500/80' : 'bg-green-600/80'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-12 shrink-0 text-right text-sm tabular-nums text-gray-600">{count}</div>
    </div>
  );
}

function Section({ title, hint, data, redKey }: {
  title: string; hint?: string;
  data: { key: string; count: number }[]; redKey?: string;
}) {
  const max = data[0]?.count ?? 0;
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mb-3 text-xs text-gray-400">{hint}</p>}
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">아직 응답이 없어요.</p>
      ) : (
        <div className="space-y-2">
          {data.map((d) => (
            <Bar
              key={d.key}
              label={NEEDS_LABELS[d.key] ?? GYEOL_AGE_LABELS[d.key] ?? d.key}
              count={d.count}
              max={max}
              tone={d.key === redKey ? 'red' : 'green'}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function NeedsDashboardPage() {
  const [stats, setStats] = useState<NeedsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getNeedsStats()
      .then(setStats)
      .catch((e) => setErr(e?.message ?? '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (err) return <div className="p-6 text-sm text-red-600">에러: {err}</div>;
  if (!stats) return null;

  const t = stats.totals;
  const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;

  return (
    <div className="space-y-8 p-6">
      <Header
        title="니즈 설문 (5060)"
        subtitle="tita-app.com/needs — 겉은 1분 테스트, 속은 수요 설문. 답 하나하나가 광고·모임 조준 데이터."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="시작" value={t.start} />
        <Tile label="완료" value={t.complete} hint={`완료율 ${pct(stats.completionRate)}`} />
        <Tile label="다운클릭" value={t.download} hint={`완료→다운 ${pct(stats.downloadRate)}`} />
        <Tile label="공유" value={t.share} />
      </div>

      <Section
        title="⭐ 지금 그 시간을 어떻게 보내나 (실태)"
        hint='사실상 경쟁자 조사 — TV·유튜브가 경쟁자인지, "그냥 흘러가요"(핵심 타겟)가 몇인지'
        data={stats.timeuse}
      />
      <Section
        title="⭐ 삶의 변화 (왜 시간이 많아졌나)"
        hint='"비슷한 길을 걷는 사람끼리" 세그먼트 — 자녀독립·이혼·사별·은퇴별 모임/카피 근거'
        data={stats.situation}
      />
      <Section
        title="⭐ 새 친구와 하고 싶은 것"
        hint="모임 주제 수요 + 광고 크리에이티브 분기 근거"
        data={stats.activity}
      />
      <Section
        title="⭐ 만남에서 걱정되는 것"
        hint="1위가 광고 첫 줄이 된다 (사기 걱정 → 안전 먼저, 어색함 → 여럿이 함께 먼저)"
        data={stats.worry}
      />

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="연령 분포" hint={`45 미만 ${pct(stats.underAgeShare)}`} data={stats.ageBand} redKey="under45" />
        <Section title="어떤 사람이 편한가" data={stats.person} />
        <Section title="성별" data={stats.gender} />
        <Section title="온라인 먼저 vs 만나서" data={stats.funnel} />
        <Section title="'누가 있었으면' 순간" data={stats.moment} />
      </div>

      {/* "또는, 직접 쓸게요" 원문 — 보기 밖 수요의 원석. 다음 보기·모임 기획 재료 */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">✏️ 직접 입력 답변 (원문)</h2>
        <p className="mb-3 text-xs text-gray-400">
          보기에 없어서 직접 쓴 답 — 다음 보기 확장·모임 기획의 재료 (최신 100건)
        </p>
        {stats.customTexts.length === 0 ? (
          <p className="text-sm text-gray-400">아직 직접 입력한 답이 없어요.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {stats.customTexts.map((c, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {NEEDS_DIM_LABELS[c.dim] ?? c.dim}
                </span>
                <span className="flex-1 text-gray-800">{c.text}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-400">
                  {c.createdAt ? c.createdAt.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Section title="유입 채널" hint="완료 기준 · utm_source → 없으면 유입 도메인" data={
        stats.bySource.slice(0, 10).map((s) => ({ key: s.source, count: s.count }))
      } />

      {stats.capped && (
        <p className="text-xs text-amber-600">⚠️ 최근 2,000건까지만 집계했어요.</p>
      )}
    </div>
  );
}

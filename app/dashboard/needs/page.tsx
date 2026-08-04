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
  type NeedsDay,
} from '@/lib/firestore';

const sumOf = (rows: NeedsDay[], k: keyof NeedsDay) =>
  rows.reduce((a, r) => a + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
// 다운로드는 두 갈래로 들어온다 — 설문을 끝내고 받는 길, 첫 질문에서 건너뛰고
// 받는 길. 둘을 따로만 보면 "오늘 몇 명이 받았나"를 매번 암산해야 한다.
const totalDown = (rows: NeedsDay[]) => sumOf(rows, 'download') + sumOf(rows, 'skipDownload');

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev <= 0) return null;
  const d = Math.round(((now - prev) / prev) * 100);
  if (d === 0) return <span className="text-gray-400">직전 7일과 같음</span>;
  return (
    <span className={d > 0 ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>
      직전 7일 {d > 0 ? '▲' : '▼'}{Math.abs(d)}%
    </span>
  );
}

// 요약 — 표를 읽기 전에 "지금 어떤 상태인가"를 문장으로 먼저 준다.
// 기간이 섞이면 거짓말이 되므로, 최근 7일과 전체 기간을 갈라서 말한다.
function Summary({ stats }: { stats: NeedsStats }) {
  const d = stats.daily;
  if (d.length === 0) return null;
  const last7 = d.slice(-7);
  // 직전 주가 온전히 7일 있을 때만 비교한다. 7/28부터 데이터가 있어서, 그냥
  // slice하면 "7일 대 1일"을 견줘 ▲1100% 같은 헛소리가 나온다.
  const prev7 = d.length >= 14 ? d.slice(-14, -7) : [];

  const start = sumOf(last7, 'start');
  const complete = sumOf(last7, 'complete');
  const down = totalDown(last7);
  const skipOpen = sumOf(last7, 'skipOpen');
  const skipDown = sumOf(last7, 'skipDownload');
  const pc = (n: number, d0: number) => (d0 > 0 ? `${Math.round((n / d0) * 100)}%` : '—');

  // 전체 기간 기준 — 여기만 stepFunnel/연령을 쓴다(일자별로는 안 쌓고 있다).
  const base = stats.stepFunnel[0]?.reached ?? 0;
  const q1 = stats.stepFunnel.find((f) => f.step === 0);
  const topSource = stats.bySource[0];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">한눈에</h2>

      <p className="mt-3 text-[15px] leading-relaxed text-gray-800">
        최근 7일 <b className="tabular-nums">{start}</b>명이 도착해{' '}
        <b className="tabular-nums">{complete}</b>명이 끝까지 답했고(
        <span className="tabular-nums">{pc(complete, start)}</span>),{' '}
        <b className="tabular-nums">{down}</b>명이 앱을 받으러 갔습니다(도착의{' '}
        <span className="tabular-nums">{pc(down, start)}</span>).
      </p>
      <p className="mt-1 text-xs text-gray-500">
        도착 <Delta now={start} prev={sumOf(prev7, 'start')} /> · 다운{' '}
        <Delta now={down} prev={totalDown(prev7)} />
      </p>

      <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
        {q1 && base > 0 && (
          <li>
            가장 크게 새는 곳은 여전히 <b>첫 질문</b> — 전체 기간 도착{' '}
            <span className="tabular-nums">{base}</span>명 중{' '}
            <b className="tabular-nums text-red-600">{q1.abandonedHere}</b>명(
            <span className="tabular-nums">{pc(q1.abandonedHere, base)}</span>)이 아무것도
            안 누르고 나갔습니다.
          </li>
        )}
        <li>
          건너뛰고 앱만 받는 길은 최근 7일 <b className="tabular-nums">{skipOpen}</b>명이
          열어 <b className="tabular-nums">{skipDown}</b>명이 스토어로 갔습니다
          {skipOpen > 0 && <> (<span className="tabular-nums">{pc(skipDown, skipOpen)}</span>)</>}.
          {down > 0 && (
            <> 전체 다운의 <span className="tabular-nums">{pc(skipDown, down)}</span>가 이 길에서 나왔습니다.</>
          )}
        </li>
        {stats.underAgeShare > 0 && (
          <li>
            완주자의 <b className="tabular-nums text-red-600">{Math.round(stats.underAgeShare * 100)}%</b>가
            만 45세 미만입니다 — 설치해도 본인인증에서 막힙니다.
          </li>
        )}
        {topSource && (
          <li>
            유입 1위는 <b>{topSource.source}</b>
            <span className="tabular-nums"> ({topSource.count}명 완주)</span>.
          </li>
        )}
      </ul>
    </section>
  );
}

// 첫 질문 교체 효과 — 교체 전/후를 나란히 놓는다.
//
// 한 표에 겹쳐 그릴 수 없다. step이 숫자로만 저장돼서 교체 전 step 0은
// '시간 사용', 교체 후는 '삶의 변화'다. 겹치면 서로 다른 질문을 같은 줄에서
// 견주게 된다. 그래서 두 벌을 각자 라벨로 그리고, 비교는 "첫 질문"이라는
// 자리끼리만 한다 — 우리가 바꾼 게 바로 그 자리다.
function SwapCompare({ swap }: { swap: NeedsStats['swap'] }) {
  const { before, after } = swap;
  // 표본이 적을 때 퍼센트를 크게 띄우면 소음을 신호로 읽는다. 최소치를 두고
  // 그 아래면 판정을 미룬다.
  const MIN = 80;
  const ready = after.base >= MIN;
  const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const q1Before = rate(before.q1Abandoned, before.base);
  const q1After = rate(after.q1Abandoned, after.base);
  const diff = q1After - q1Before;

  const Col = ({ era, tone }: { era: typeof before; tone: 'gray' | 'green' }) => {
    const head = tone === 'green'
      ? 'border-emerald-200 bg-emerald-50/50'
      : 'border-gray-200 bg-gray-50';
    return (
      <div className={`rounded-xl border ${head} p-4`}>
        <div className="text-xs font-semibold text-gray-500">{era.title}</div>
        <div className="mt-0.5 text-sm font-medium text-gray-900">
          첫 질문: “{era.firstQuestion}”
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ['도착', era.base, null],
            ['첫 질문 이탈', era.q1Abandoned, rate(era.q1Abandoned, era.base)],
            ['완주', era.complete, rate(era.complete, era.base)],
          ].map(([label, n, p]) => (
            <div key={label as string} className="rounded-lg bg-white px-2 py-2">
              <dt className="text-[11px] text-gray-500">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-gray-900">{n as number}</dd>
              {p !== null && (
                <dd className="text-[11px] tabular-nums text-gray-400">
                  {Math.round(p as number)}%
                </dd>
              )}
            </div>
          ))}
        </dl>
        <div className="mt-3 space-y-1.5">
          {era.funnel.map((f) => (
            <Bar key={f.step} label={f.label} count={f.reached} max={era.base || 1} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">첫 질문 교체 효과</h2>
      <p className="mb-3 text-xs text-gray-400">
        2026-08-04 18:55 교체. 세션은 시작 시각으로 한쪽에 붙습니다. 질문 순서가
        달라 각 시기의 라벨은 그때 순서 그대로입니다 — <b>비교는 &apos;첫 질문&apos; 자리끼리만</b> 하세요.
      </p>

      <div
        className={`mb-3 rounded-xl border p-4 ${
          ready
            ? diff < 0
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        {ready ? (
          <p className="text-sm text-gray-800">
            첫 질문 이탈률{' '}
            <b className="tabular-nums">{Math.round(q1Before)}%</b> →{' '}
            <b className="tabular-nums">{Math.round(q1After)}%</b>{' '}
            <b className={diff < 0 ? 'text-emerald-700' : 'text-red-700'}>
              ({diff < 0 ? '▼' : '▲'}
              {Math.abs(Math.round(diff))}%p)
            </b>
            {diff < 0 ? ' — 교체가 먹혔습니다.' : ' — 교체 전이 더 나았습니다.'}
          </p>
        ) : (
          <p className="text-sm text-amber-900">
            교체 후 도착이 아직 <b className="tabular-nums">{after.base}</b>명입니다
            (판정 기준 {MIN}명). 지금 퍼센트는 몇 사람에 따라 크게 흔들리니
            <b> 판단을 미뤄 주세요.</b>{' '}
            {after.base === 0
              ? `교체 전 첫 질문 이탈률은 ${Math.round(q1Before)}%였습니다 — 이 숫자보다 낮아지면 성공입니다.`
              : `참고로 지금은 ${Math.round(q1Before)}% → ${Math.round(q1After)}%입니다.`}
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Col era={before} tone="gray" />
        <Col era={after} tone="green" />
      </div>
    </section>
  );
}

// 나날의 현황 — 누적만 보면 소재를 바꾸거나 화면을 고친 날이 평균에 묻힌다.
function DailyTable({ daily, partialFrom }: { daily: NeedsDay[]; partialFrom: string | null }) {
  const rows = daily.slice(-14).reverse(); // 최신이 위
  if (rows.length === 0) return null;
  const maxStart = Math.max(...rows.map((r) => r.start), 1);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">나날의 현황 (최근 14일)</h2>
      <p className="mb-3 text-xs text-gray-400">
        한국 시간 기준. &apos;다운&apos;은 설문을 끝내고 받은 것과 건너뛰고 받은 것을 합친 수입니다.
        {partialFrom && ` ${partialFrom} 이전은 조회 상한에 걸려 표시하지 않습니다.`}
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">날짜</th>
              <th className="px-3 py-2.5 text-right font-medium">도착</th>
              <th className="px-3 py-2.5 text-right font-medium">완주</th>
              <th className="px-3 py-2.5 text-right font-medium">완주율</th>
              <th className="px-3 py-2.5 text-right font-medium">다운</th>
              <th className="px-3 py-2.5 text-right font-medium">도착→다운</th>
              <th className="px-3 py-2.5 text-right font-medium">건너뛰기</th>
              <th className="px-3 py-2.5 text-left font-medium">공유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const down = r.download + r.skipDownload;
              const dt = new Date(`${r.day}T00:00:00Z`);
              const isToday = r.day === today;
              return (
                <tr key={r.day} className={isToday ? 'bg-amber-50/60' : undefined}>
                  <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                    {r.day.slice(5).replace('-', '/')}
                    <span className="ml-1.5 text-xs text-gray-400">{WD[dt.getUTCDay()]}</span>
                    {isToday && <span className="ml-1.5 text-xs text-amber-600">오늘</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                    <div className="flex items-center justify-end gap-2">
                      {/* 막대를 옆에 붙여야 "어느 날 광고가 세게 돌았나"가 눈으로 잡힌다. */}
                      <span
                        className="h-1.5 rounded-full bg-blue-200"
                        style={{ width: `${Math.max(2, (r.start / maxStart) * 56)}px` }}
                      />
                      {r.start}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.complete}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {r.start > 0 ? `${Math.round((r.complete / r.start) * 100)}%` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${down > 0 ? 'font-semibold text-emerald-700' : 'text-gray-300'}`}>
                    {down}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {r.start > 0 ? `${Math.round((down / r.start) * 100)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {r.skipOpen > 0 ? `${r.skipOpen} → ${r.skipDownload}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-400">{r.share || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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

      <Summary stats={stats} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="도착 (실제 본)" value={t.start} hint={`7/28 14:19 정확 집계 이후 · 누적 ${stats.allTotals.start}`} />
        <Tile label="완료" value={t.complete} hint={`완료율 ${pct(stats.completionRate)} · 누적 ${stats.allTotals.complete}`} />
        <Tile label="다운클릭" value={t.download} hint={`완료→다운 ${pct(stats.downloadRate)} · 누적 ${stats.allTotals.download}`} />
        <Tile label="공유" value={t.share} hint={`누적 ${stats.allTotals.share}`} />
      </div>

      {/* 설문 건너뛰고 앱만 받기 — 첫 질문에서 떠나는 사람에게 뚫어준 길.
          여기 숫자가 붙으면 그만큼은 원래 그냥 잃던 사람이다. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="건너뛰기 열어봄"
          value={stats.skip.open}
          hint="첫 질문에서 '앱만 받을게요'"
        />
        <Tile
          label="건너뛰기로 다운"
          value={stats.skip.download}
          hint={stats.skip.open
            ? `열어본 사람의 ${pct(stats.skip.download / stats.skip.open)}`
            : '아직 없음'}
        />
      </div>

      <SwapCompare swap={stats.swap} />

      <DailyTable daily={stats.daily} partialFrom={stats.dailyPartialFrom} />

      {/* 질문별 이탈 — answer 이벤트 도입(2026-07-28) 이후 세션부터 잡힌다 */}
      {stats.stepFunnel.some((f) => f.reached > 0) && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-gray-900">어디서 관두나 (질문별 도달)</h2>
          <p className="mb-3 text-xs text-gray-400">
            7/28 14:19(정확 집계) 이후 — 도달=답한 세션, "보고 나감"=그 질문을 보다가 답 없이 떠남
          </p>
          {/* 이 표는 두 시기가 섞여 있다. 교체 효과를 볼 자리는 위의 비교 카드다. */}
          <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            이 표는 <b>교체 전후가 섞여</b> 있고 라벨은 지금 순서 기준입니다(8/4에 1번과
            3번을 맞바꿈). 교체 효과는 위의 <b>&lsquo;첫 질문 교체 효과&rsquo;</b>에서 보세요.
          </p>
          <div className="space-y-2">
            {stats.stepFunnel.map((f) => (
              <div key={f.step} className="flex items-center gap-2">
                <div className="flex-1">
                  <Bar label={f.label} count={f.reached} max={stats.stepFunnel[0]?.reached ?? 0} />
                </div>
                <span className={`w-24 shrink-0 text-right text-xs tabular-nums ${f.abandonedHere > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                  {f.abandonedHere > 0 ? `보고 나감 ${f.abandonedHere}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 분포 기준 안내 — 타일(정확 집계 이후)과 분모가 다름을 명시 */}
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
        아래 응답 분포는 <b>완주 {stats.allTotals.complete}명 전체</b> 기준이에요
        (상단 타일은 7/28 14:19 정확 집계 이후만 세서 숫자가 달라요).
      </p>

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
        <p className="text-xs text-amber-600">
          질문별 퍼널은 최근 8,000건까지만 봤어요 (합계·응답 분포는 전체 기준).
        </p>
      )}
    </div>
  );
}

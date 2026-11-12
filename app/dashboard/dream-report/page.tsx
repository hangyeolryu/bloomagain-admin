'use client';

// 꿈 리포트 — 티타AI 꿈 인터뷰(웹 /dream + 앱 회원 인터뷰)를 결정에 쓰는 숫자로.
//
// 2026-11-12. 대화마다 AI가 이름 없는 요약 카드를 만든다(꿈 종류·미룬 이유·또래와
// 하고 싶은지·AI 거부감·인용). 이 화면은 그 카드만 읽는다 — 대화 원문은 읽지 않는다.
// 끝까지 안 간 대화도 매일 밤 요약된다("중간 요약"). 떠난 분 목소리가 더 중요해서.
//
// 칸이 5명 미만이면 "기타(5명 미만)"로 묶이고, 또래 비율도 5명이 안 되면 내지 않는다.
// 한두 명으로 가설을 판정하지 않으려는 것이고, 작은 칸은 누구 얘긴지 짐작되기 때문이다.
// 웹 대화는 90일 뒤 지워진다 — 길게 볼 숫자는 BigQuery dream_web_cards에 남는다.

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type Cell = { label: string; n: number };
type Funnel = {
  variant: string;
  started: number;
  answered1: number;
  answered2: number;
  completed: number;
  stopped: number;
  completedRate: number;
  answered1Rate: number;
};
type Report = {
  days: number;
  minCell: number;
  cards: { total: number; web: number; app: number; partial: number };
  wantsPeer: { yes: number; no: number; unknown: number; rate: number | null };
  category: Cell[];
  categoryBySource: { web: Cell[]; app: Cell[] };
  barrier: Cell[];
  aiAttitude: Cell[];
  weekly: { week: string; web: number; app: number }[];
  quotes: { source: 'web' | 'app'; text: string; category: string }[];
  titaWishes: string[];
  webFeedback?: { total: number; good: number; ok: number; bad: number; goodRate: number | null;
    comments: { rating: 'good' | 'ok' | 'bad'; text: string }[] } | null;
  appFeedback?: string[];
  handoff?: { issued: number; claimed: number } | null;
  coreWants?: { source: 'web' | 'app'; dream: string; core: string; category: string }[];
  webFunnel: Funnel[];
  appInterviews: { total: number; completed: number; abandoned: number; error: string | null };
};

// 숫자 → 할 일. 이 표가 리포트의 존재 이유다.
const BARRIER_ACTION: Record<string, string> = {
  사람: '같이 할 사람이 없다 → 같은 꿈 또래 매칭을 먼저',
  용기: '엄두가 안 난다 → 티타AI가 첫걸음을 아주 작게 쪼개기',
  시간: '시간이 없다 → 하루 10분짜리 목표',
  돈: '돈이 든다 → 무료·저비용 활동부터',
  건강: '몸이 걱정된다 → 무리 없는 강도, 같이 걷기류',
  기타: '기타 — 인용을 읽어 보세요',
};

const VARIANT_LABEL: Record<string, string> = { a: 'A 문구', b: 'B 문구' };

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function Bars({ cells, total }: { cells: Cell[]; total: number }) {
  if (!cells.length) return <p className="text-sm text-gray-400">아직 없어요</p>;
  const max = Math.max(...cells.map((c) => c.n), 1);
  return (
    <ul className="space-y-2">
      {cells.map((c) => (
        <li key={c.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 text-gray-700 truncate">{c.label}</span>
          <span className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <span
              className="block h-full rounded-full bg-emerald-700"
              style={{ width: `${(c.n / max) * 100}%` }}
            />
          </span>
          <span className="w-20 shrink-0 text-right tabular-nums text-gray-600">
            {c.n}
            <span className="text-gray-400"> · {total ? Math.round((c.n / total) * 100) : 0}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-500 mt-0.5 mb-4">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default function DreamReportPage() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/backend/dream-report?days=${days}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (alive) {
          setData(body as Report);
          setError(null);
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  const peerAnswered = data ? data.wantsPeer.yes + data.wantsPeer.no : 0;
  const barrierTotal = data ? data.cards.total : 0;

  return (
    <div>
      <Header
        title="꿈 리포트"
        subtitle="티타AI 꿈 인터뷰(웹 /dream + 앱 회원) 요약 카드만 모아 본 숫자예요. 대화 원문은 읽지 않아요."
        action={
          <div className="flex gap-1.5">
            {[7, 28, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setDays(d);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  days === d ? 'bg-emerald-800 text-white' : 'bg-white border border-gray-200 text-gray-600'
                }`}
              >
                최근 {d}일
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center py-16 text-red-500 bg-white rounded-2xl border border-red-100">
          <p className="font-semibold">불러오지 못했어요</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      ) : !data ? null : (
        <div className="space-y-6">
          {/* 한눈에 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="요약 카드" value={data.cards.total} sub={`웹 ${data.cards.web} · 앱 ${data.cards.app}`} />
            <Stat label="중간에 멈춘 분 요약" value={data.cards.partial} sub="끝까지 안 간 대화" />
            <Stat
              label="또래와 같이 하고 싶다"
              value={pct(data.wantsPeer.rate)}
              sub={
                data.wantsPeer.rate == null
                  ? `답한 분 ${peerAnswered}명 — ${data.minCell}명부터 비율을 내요`
                  : `답한 ${peerAnswered}명 중 ${data.wantsPeer.yes}명`
              }
              tone={data.wantsPeer.rate == null ? undefined : data.wantsPeer.rate >= 0.5 ? 'good' : 'warn'}
            />
            {data.handoff && (
              <Stat
                label="웹 → 앱 이어가기"
                value={data.handoff.claimed}
                sub={`코드 받음 ${data.handoff.issued} · 앱에서 씀 ${data.handoff.claimed}`}
              />
            )}
            <Stat
              label="앱 회원 인터뷰"
              value={data.appInterviews.total}
              sub={
                data.appInterviews.error ??
                `끝까지 ${data.appInterviews.completed} · 중간 ${data.appInterviews.abandoned}`
              }
            />
          </div>

          <Card
            title="피봇 핵심 가설 — 같이 하면 오래 간다"
            hint="또래와 같이 하고 싶다는 비율이 50% 이상이면 같은 꿈 또래 매칭을 1순위로. 아래면 혼자 하는 코칭부터."
          >
            <div className="flex items-center gap-4 text-sm">
              <span className="text-3xl font-bold tabular-nums text-gray-900">{pct(data.wantsPeer.rate)}</span>
              <span className="text-gray-500">
                같이 {data.wantsPeer.yes} · 혼자 {data.wantsPeer.no} · 말 안 함 {data.wantsPeer.unknown}
              </span>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card title="왜 미뤘나 → 무엇을 만들까" hint="한 사람이 이유를 여럿 말하면 각각 셉니다.">
              <Bars cells={data.barrier} total={barrierTotal} />
              {data.barrier.length > 0 && (
                <ul className="mt-4 space-y-1 text-xs text-gray-600">
                  {data.barrier
                    .filter((c) => BARRIER_ACTION[c.label])
                    .slice(0, 3)
                    .map((c) => (
                      <li key={c.label}>· {BARRIER_ACTION[c.label]}</li>
                    ))}
                </ul>
              )}
            </Card>

            <Card title="어떤 꿈인가 → 어떤 모임부터" hint="몸·배움·만들기·떠나기·나누기·생활·돈·기타">
              <Bars cells={data.category} total={data.cards.total} />
            </Card>
          </div>

          <Card
            title="광고 문구별 — 어느 쪽에 예산을"
            hint="웹 /dream만. 위기로 끝난 대화는 이 표에 넣지 않아요. 앱 받기 클릭(중간/끝)은 GA dream_download의 where로 봐요."
          >
            {data.webFunnel.length === 0 ? (
              <p className="text-sm text-gray-400">아직 없어요</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2 pr-4">문구</th>
                      <th className="py-2 pr-4 text-right">들어옴</th>
                      <th className="py-2 pr-4 text-right">첫 답</th>
                      <th className="py-2 pr-4 text-right">두 번째 답</th>
                      <th className="py-2 pr-4 text-right">끝까지</th>
                      <th className="py-2 text-right">그만</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.webFunnel.map((f) => (
                      <tr key={f.variant} className="border-b last:border-0 tabular-nums">
                        <td className="py-2 pr-4 font-semibold">{VARIANT_LABEL[f.variant] ?? f.variant}</td>
                        <td className="py-2 pr-4 text-right">{f.started}</td>
                        <td className="py-2 pr-4 text-right">
                          {f.answered1} <span className="text-gray-400">({pct(f.answered1Rate)})</span>
                        </td>
                        <td className="py-2 pr-4 text-right">{f.answered2}</td>
                        <td className="py-2 pr-4 text-right">
                          {f.completed} <span className="text-gray-400">({pct(f.completedRate)})</span>
                        </td>
                        <td className="py-2 text-right">{f.stopped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card title="AI에 대한 느낌 (앱 회원)" hint="거부감이 크면 광고·화면에서 'AI'를 앞세우지 않기.">
              <Bars cells={data.aiAttitude} total={data.aiAttitude.reduce((s, c) => s + c.n, 0)} />
            </Card>
            <Card title="주별 요약 카드 수">
              {data.weekly.length === 0 ? (
                <p className="text-sm text-gray-400">아직 없어요</p>
              ) : (
                <ul className="space-y-1 text-sm tabular-nums">
                  {data.weekly.map((w) => (
                    <li key={w.week} className="flex justify-between">
                      <span className="text-gray-600">{w.week} 주</span>
                      <span>
                        웹 {w.web} · 앱 {w.app}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {data.coreWants && data.coreWants.length > 0 && (
            <Card
              title="겉 꿈 → 진짜 바라는 것"
              hint="티타AI가 한 겹 아래를 물어 찾은 마음이에요. 왼쪽(생각한 것)과 오른쪽(마음이 끌리는 것)이 다를수록 코칭·모임 설계의 실마리가 돼요."
            >
              <ul className="space-y-2.5">
                {data.coreWants.map((c, i) => (
                  <li key={i} className="text-sm leading-relaxed flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[11px] font-semibold text-gray-400">{c.source === 'app' ? '앱' : '웹'}</span>
                    <span className="text-gray-500">{c.dream || '—'}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-semibold text-emerald-800">{c.core}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(data.webFeedback || (data.appFeedback && data.appFeedback.length > 0)) && (
            <Card
              title="대화가 어땠는지 — 피드백"
              hint="웹은 끝 화면의 '좋았어요/그저 그래요/별로였어요', 앱은 인터뷰 끝 질문에 남긴 한마디예요."
            >
              {data.webFeedback && (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm mb-3 tabular-nums">
                  <span className="text-2xl font-bold text-gray-900">{pct(data.webFeedback.goodRate)}</span>
                  <span className="text-gray-500">
                    웹 좋았어요 {data.webFeedback.good} · 그저 그래요 {data.webFeedback.ok} · 별로였어요 {data.webFeedback.bad}
                    {data.webFeedback.goodRate == null && ` (${data.minCell}명부터 비율)`}
                  </span>
                </div>
              )}
              <ul className="space-y-1.5 text-sm text-gray-800">
                {data.webFeedback?.comments.map((c, i) => (
                  <li key={`w${i}`}>
                    <span className="mr-2 text-[11px] font-semibold text-gray-400">
                      웹 · {c.rating === 'good' ? '좋았어요' : c.rating === 'ok' ? '그저' : '별로'}
                    </span>
                    {c.text}
                  </li>
                ))}
                {data.appFeedback?.map((t, i) => (
                  <li key={`a${i}`}>
                    <span className="mr-2 text-[11px] font-semibold text-amber-600">앱</span>
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="이분들이 한 말"
            hint="이름 없이 남은 인용이에요. 광고 문구의 재료로 읽되 그대로 옮기지는 않아요."
          >
            {data.quotes.length === 0 ? (
              <p className="text-sm text-gray-400">아직 없어요</p>
            ) : (
              <ul className="space-y-2">
                {data.quotes.map((q, i) => (
                  <li key={i} className="text-sm text-gray-800 leading-relaxed">
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        q.source === 'app' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {q.source === 'app' ? '앱' : '웹'} · {q.category}
                    </span>
                    “{q.text}”
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.titaWishes.length > 0 && (
            <Card title="회원이 바라는 티타" hint="앱 회원 인터뷰의 '무엇이 있으면 더 오고 싶은지'.">
              <ul className="space-y-1.5 text-sm text-gray-800">
                {data.titaWishes.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`text-2xl font-bold tabular-nums mt-1 ${
          tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

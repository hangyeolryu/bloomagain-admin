'use client';

// 사용자 패턴 — "우리 회원은 얼마나 자주, 언제, 무엇을 하러 들어오는가".
//
// 성장 통계(stats)가 '몇 명이 왔는가'를 본다면 이 페이지는 '온 사람이 어떻게
// 쓰는가'를 본다. 데이터는 전부 users/{uid}/activity_daily 롤업 하나에서
// 나온다(앱 하트비트가 30분 스로틀로 쓰는 문서) — collectionGroup 쿼리
// 한 번으로 모든 섹션을 채우므로 읽기 비용은 윈도우 내 문서 수만큼이다.

import { useEffect, useState } from 'react';
import { getActivityPatterns, type ActivityPatterns } from '@/lib/firestore';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';
import StatWarnings from '@/components/ui/StatWarnings';

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(a: number, b: number) {
  if (!b) return '-';
  return `${Math.round((a / b) * 100)}%`;
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function dayKeyLabel(dayKey: string) {
  return `${Number(dayKey.slice(4, 6))}/${Number(dayKey.slice(6, 8))}`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-bold text-gray-800">{children}</h2>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Chip({ label, value, sub, info }: {
  label: string; value: string | number; sub?: string; info?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-0.5 min-w-[130px]">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-gray-900 tabular-nums">{value}</span>
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
      {info && <span className="text-xs text-gray-400 mt-1 leading-relaxed">{info}</span>}
    </div>
  );
}

function HBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const p = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-16 shrink-0 text-gray-600">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: color }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums text-gray-700">
        {value.toLocaleString()}명 · {p}%
      </span>
    </div>
  );
}

/** 세로 막대 히스토그램 — 시간대·요일·일별 추이 공용. */
function VBars({ points, highlightMax }: {
  points: { label: string; count: number; dim?: boolean }[];
  highlightMax?: boolean;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex items-end gap-1">
      {points.map((p, i) => {
        const isMax = highlightMax && p.count === max && p.count > 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className={`text-[10px] tabular-nums ${isMax ? 'font-bold text-emerald-700' : 'text-gray-400'}`}>
              {p.count > 0 ? p.count : ''}
            </span>
            {/* 고정 높이 트랙 안에서 %를 계산한다 — 컬럼 자체는 내용 높이라
                막대에 바로 %를 주면 무시돼 전부 최소높이로 깔린다. */}
            <div className="w-full h-24 flex items-end">
              <div
                className={`w-full rounded-t ${isMax ? 'bg-emerald-500' : p.dim ? 'bg-gray-200' : 'bg-emerald-300'}`}
                style={{ height: `${Math.max(Math.round((p.count / max) * 100), p.count > 0 ? 4 : 1)}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 truncate w-full text-center">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

type Window = 14 | 30;

export default function PatternsPage() {
  const [data, setData] = useState<ActivityPatterns | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<Window>(30);

  useEffect(() => {
    setLoading(true);
    getActivityPatterns(windowDays)
      .then(setData)
      .catch((e) => console.error('[Patterns]', e))
      .finally(() => setLoading(false));
  }, [windowDays]);

  if (loading) return <LoadingSpinner />;
  if (!data) return <p className="text-sm text-gray-400 p-8">데이터를 불러오지 못했습니다.</p>;

  const {
    totalActiveUsers, activeDaysBuckets, avgActiveDays, medianActiveDays,
    dayOfWeek, dauTrend, weekReturn, peakHours, engagementBuckets,
    avgHeartbeatsPerUser,
  } = data;

  const engTotal =
    engagementBuckets.visitOnly + engagementBuckets.waveSender +
    engagementBuckets.conversationOpener + engagementBuckets.messageSender;

  const peakHour = peakHours.reduce((a, b) => (b.count > a.count ? b : a), peakHours[0]);
  const peakDow = dayOfWeek.indexOf(Math.max(...dayOfWeek));

  return (
    <div className="space-y-8">
      <Header
        title="사용자 패턴"
        subtitle="앱 하트비트(activity_daily) 기준 — 얼마나 자주, 언제, 무엇을 하러 오는가"
      />

      {data.error && (
        <StatWarnings warnings={[{ label: '활동 패턴 집계', message: data.error }]} />
      )}

      {/* 기간 선택 */}
      <div className="flex gap-2">
        {([14, 30] as Window[]).map((w) => (
          <button
            key={w}
            onClick={() => setWindowDays(w)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              windowDays === w
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            최근 {w}일
          </button>
        ))}
      </div>

      {/* ── 1. 핵심 숫자 ─────────────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="한 번이라도 앱을 연 회원 기준(본인인증 여부 무관).">
          🔑 핵심 숫자
        </SectionTitle>
        <div className="flex gap-3 overflow-x-auto pb-1">
          <Chip
            label={`활동 회원 (${windowDays}일)`}
            value={totalActiveUsers.toLocaleString()}
            info="윈도우 안에 하루라도 앱을 연 고유 회원"
          />
          <Chip
            label="평균 활동일"
            value={avgActiveDays}
            sub={`/ ${windowDays}일`}
            info="활동 회원 1인당 앱을 연 날 수의 평균"
          />
          <Chip
            label="활동일 중앙값"
            value={medianActiveDays}
            sub={`/ ${windowDays}일`}
            info="절반은 이보다 자주, 절반은 이보다 드물게. 평균은 헤비유저가 끌어올리므로 이 값이 '보통 회원'에 가깝다"
          />
          <Chip
            label="주간 재방문율"
            value={pct(weekReturn.returned, weekReturn.eligible)}
            sub={`${weekReturn.returned}/${weekReturn.eligible}명`}
            info="지지난주(8~14일 전) 활동자 중 지난 7일에도 온 비율"
          />
          <Chip
            label="하루 체류 신호"
            value={avgHeartbeatsPerUser}
            sub="회/인"
            info="30분 간격 하트비트 평균 — 세션 수 근사치. 2.0이면 하루 안에 두 번쯤 열거나 1시간쯤 머문다는 뜻"
          />
        </div>
      </section>

      {/* ── 2. 방문 빈도 분포 ───────────────────────────────────────────────── */}
      <section>
        <SectionTitle hint={`최근 ${windowDays}일 중 며칠 들어왔는가. 하루에 몇 번을 열든 그 날은 1일로 센다.`}>
          📆 방문 빈도 분포
        </SectionTitle>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
          {activeDaysBuckets.map((b, i) => (
            <HBar
              key={b.label}
              label={b.label}
              value={b.count}
              total={totalActiveUsers}
              color={['#d1d5db', '#a7f3d0', '#6ee7b7', '#34d399', '#059669'][i] ?? '#059669'}
            />
          ))}
          <p className="text-xs text-gray-400 pt-2">
            1일 구간이 크면 &ldquo;와보고 안 돌아온&rdquo; 사람이 많다는 뜻 —
            온보딩·첫 화면 문제. 15일+ 구간이 습관이 든 코어층입니다.
          </p>
        </div>
      </section>

      {/* ── 3. 일별 활동 추이 ──────────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="날짜별 고유 활동 회원 수. lastActiveAt 스냅샷과 달리 과거 일자도 정확하다.">
          📈 일별 활동 회원
        </SectionTitle>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <VBars
            points={dauTrend.map((p, i) => ({
              label: i % Math.ceil(dauTrend.length / 10) === 0 ? dayKeyLabel(p.dayKey) : '',
              count: p.count,
            }))}
          />
        </div>
      </section>

      {/* ── 4. 언제 들어오는가 ────────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="푸시·자리 공지 시점을 정할 때 보는 축. 초록이 가장 붐비는 때.">
          🕰️ 언제 들어오는가
        </SectionTitle>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              시간대별 <span className="text-xs font-normal text-gray-400">— 피크 {peakHour.hour}시</span>
            </p>
            <VBars
              highlightMax
              points={peakHours.map((p) => ({
                label: p.hour % 3 === 0 ? `${p.hour}` : '',
                count: p.count,
                dim: p.hour < 7,
              }))}
            />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              요일별 <span className="text-xs font-normal text-gray-400">— 피크 {DOW_LABELS[peakDow]}요일</span>
            </p>
            <VBars
              highlightMax
              points={dayOfWeek.map((count, i) => ({ label: DOW_LABELS[i], count }))}
            />
          </div>
        </div>
      </section>

      {/* ── 5. 들어와서 무엇을 하는가 ─────────────────────────────────────── */}
      <section>
        <SectionTitle hint="윈도우 안에서 가장 깊은 행동 기준으로 한 명당 한 구간. 오른쪽으로 갈수록 깊다.">
          🌱 들어와서 무엇을 하는가
        </SectionTitle>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
          <HBar label="구경만" value={engagementBuckets.visitOnly} total={engTotal} color="#d1d5db" />
          <HBar label="웨이브" value={engagementBuckets.waveSender} total={engTotal} color="#a7f3d0" />
          <HBar label="대화 열기" value={engagementBuckets.conversationOpener} total={engTotal} color="#34d399" />
          <HBar label="메시지" value={engagementBuckets.messageSender} total={engTotal} color="#059669" />
          <p className="text-xs text-gray-400 pt-2">
            구경만 구간이 크면 볼거리는 있는데 걸 행동이 없다는 뜻입니다.
            메시지 구간이 리텐션을 만드는 사람들이에요.
          </p>
        </div>
      </section>
    </div>
  );
}

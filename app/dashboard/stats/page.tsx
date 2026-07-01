'use client';

// 통계 오버뷰 — 티타 한눈에 보기
// ──────────────────────────────────────────────────────────────────────────
// 한 화면에서 "지금 티타가 어떻게 굴러가고 있나"를 파악할 수 있게 만든
// 관리자 대시보드. 각 섹션은 상세 페이지가 있으면 링크로 넘어감.
//
// 데이터 소스는 전부 Firestore 클라이언트 SDK. 스티키니스 (DAU/MAU) 처럼
// 상세 트렌드가 없는 지표는 상세 시계열이 필요할 때 GA4 export로 보완.
//
// 새 지표를 추가할 때는 lib/firestore.ts에 helper 추가한 뒤 여기 카드 하나 붙이면 끝.
//
// Created 2026-07-05.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  getDataCollectionStats,
  getDeviceMix,
  getEngagementRollup,
  getMatchingStats,
  getOnboardingFunnel,
  getSignupTrend,
  type DataCollectionStats,
  type DeviceMix,
  type EngagementRollup,
  type MatchingStats,
  type OnboardingFunnel,
  type SignupTrendPoint,
} from '@/lib/firestore';

// ── Reusable primitives ──────────────────────────────────────────────────

function SectionHeading({
  title,
  href,
  hint,
}: {
  title: string;
  href?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      {href && (
        <Link href={href} className="text-xs text-green-600 hover:underline font-medium">
          자세히 →
        </Link>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  hint,
  emphasis = 'normal',
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  emphasis?: 'normal' | 'strong' | 'muted';
}) {
  const valueClass =
    emphasis === 'strong'
      ? 'text-3xl font-bold text-gray-900'
      : emphasis === 'muted'
      ? 'text-xl font-semibold text-gray-500'
      : 'text-2xl font-bold text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`${valueClass} mt-1 tabular-nums`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="text-base font-semibold text-gray-400 ml-0.5">{suffix}</span>}
      </p>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="text-gray-700 truncate">{label}</span>
        <span className="tabular-nums text-gray-500 text-xs">
          {value.toLocaleString()} <span className="text-gray-400">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function SignupChart({ data }: { data: SignupTrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-[3px] h-32 pt-2">
      {data.map((d) => {
        const h = Math.max(2, (d.count / max) * 100);
        // First-of-month labels help scan without cluttering.
        const day = Number(d.date.slice(-2));
        const showTick = day === 1 || day === 15;
        return (
          <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center" title={`${d.date}: ${d.count}명`}>
            <div className="w-full bg-green-400 hover:bg-green-500 transition-colors rounded-t" style={{ height: `${h}%` }} />
            {showTick && <span className="text-[9px] text-gray-400 mt-1 whitespace-nowrap">{d.date.slice(5)}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function StatsOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [engagement, setEngagement] = useState<EngagementRollup | null>(null);
  const [device, setDevice] = useState<DeviceMix | null>(null);
  const [trend, setTrend] = useState<SignupTrendPoint[]>([]);
  const [funnel, setFunnel] = useState<OnboardingFunnel | null>(null);
  const [matching, setMatching] = useState<MatchingStats | null>(null);
  const [dataCol, setDataCol] = useState<DataCollectionStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Parallel — most helpers read `users` collection, but Firestore SDK
        // pipelines these fine over one connection.
        const [e, d, t, f, m, dc] = await Promise.all([
          getEngagementRollup(),
          getDeviceMix(),
          getSignupTrend(30),
          getOnboardingFunnel(),
          getMatchingStats(),
          getDataCollectionStats(),
        ]);
        if (cancelled) return;
        setEngagement(e);
        setDevice(d);
        setTrend(t);
        setFunnel(f);
        setMatching(m);
        setDataCol(dc);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          데이터 로딩 실패: {err}
        </div>
      </div>
    );
  }

  const deviceTotal = device ? device.ios + device.android + device.web + device.unknown : 0;
  const answerRate = dataCol && dataCol.totalUsers > 0
    ? Math.round((dataCol.usersWithTags / dataCol.totalUsers) * 100)
    : 0;

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <Header
        title="통계 오버뷰"
        subtitle="티타 지금 어떻게 굴러가고 있나 한눈에. 상세는 각 섹션 링크로."
      />

      {/* ── 활성 사용자 ─────────────────────────────────── */}
      <section>
        <SectionHeading
          title="활성 사용자"
          hint="lastActiveAt 하트비트 기반 (앱 포그라운드 진입 시 30분에 한 번 기록)"
        />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Metric
            label="총 가입자"
            value={engagement?.totalUsers ?? 0}
            emphasis="strong"
          />
          <Metric
            label="DAU (24시간)"
            value={engagement?.dau ?? 0}
            hint={`오늘 새 가입 ${engagement?.newLast24h ?? 0}명`}
          />
          <Metric
            label="WAU (7일)"
            value={engagement?.wau ?? 0}
            hint={`주간 새 가입 ${engagement?.newLast7d ?? 0}명`}
          />
          <Metric
            label="MAU (30일)"
            value={engagement?.mau ?? 0}
            hint={`월간 새 가입 ${engagement?.newLast30d ?? 0}명`}
          />
          <Metric
            label="Stickiness"
            value={engagement?.stickiness ?? 0}
            suffix="%"
            hint="DAU/MAU · 시니어 커뮤 20%+가 건강"
          />
        </div>
      </section>

      {/* ── 신규 가입 트렌드 ────────────────────────────── */}
      <section>
        <SectionHeading
          title="신규 가입 트렌드 (최근 30일)"
          hint="users.createdAt 일별 집계"
        />
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <SignupChart data={trend} />
        </div>
      </section>

      {/* ── 온보딩 Funnel + 디바이스 ─────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <SectionHeading
            title="온보딩 진행"
            href="/dashboard/onboarding"
            hint="Firestore 상태 스냅샷 (세부 이탈 단계는 GA4 funnel 참조)"
          />
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            {funnel && (
              <>
                <Bar label="완료" value={funnel.byCompleted} total={funnel.totalSignedUp} color="#10B981" />
                <Bar label="프로필 작성 중 중단" value={funnel.byProfilePartial} total={funnel.totalSignedUp} color="#FBBF24" />
                <Bar label="NICE 통과, 프로필 시작 전" value={funnel.byNiceDone} total={funnel.totalSignedUp} color="#F59E0B" />
                <Bar label="가입만 함 (본인인증 전 이탈)" value={funnel.bySignedUp} total={funnel.totalSignedUp} color="#EF4444" />
                <div className="pt-2 border-t border-gray-100 text-xs text-gray-500">
                  최근 7일 미완료 사용자 <span className="font-semibold text-gray-900">{funnel.recentDropoffs.length}명</span> — 링크에서 follow-up 대상 확인
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <SectionHeading title="디바이스 사용" hint="users.device.platform 기반" />
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            {device && deviceTotal > 0 ? (
              <>
                <Bar label="iOS" value={device.ios} total={deviceTotal} color="#111827" />
                <Bar label="Android" value={device.android} total={deviceTotal} color="#22C55E" />
                {device.web > 0 && <Bar label="Web" value={device.web} total={deviceTotal} color="#3B82F6" />}
                {device.unknown > 0 && (
                  <Bar label="미상 (기록 전 가입자)" value={device.unknown} total={deviceTotal} color="#9CA3AF" />
                )}
              </>
            ) : (
              <div className="text-sm text-gray-400 py-6 text-center">디바이스 정보 없음</div>
            )}
          </div>
        </div>
      </section>

      {/* ── 매칭 & 웨이브 ─────────────────────────────── */}
      <section>
        <SectionHeading
          title="매칭 & 웨이브"
          href="/dashboard/matching"
          hint="waves 컬렉션 status 기반"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric
            label="매칭 통과율"
            value={matching?.acceptanceRate ?? 0}
            suffix="%"
            hint="응답 중 accepted 비율"
            emphasis="strong"
          />
          <Metric
            label="웨이브 응답률"
            value={matching?.responseRate ?? 0}
            suffix="%"
            hint="전체 웨이브 중 응답 (accept+decline)"
          />
          <Metric
            label="총 웨이브"
            value={matching?.totalWaves ?? 0}
            hint={`최근 24시간 ${matching?.wavesLast24h ?? 0} · 7일 ${matching?.wavesLast7d ?? 0}`}
          />
          <Metric
            label="대화 시작률"
            value={matching?.conversationStartRate ?? 0}
            suffix="%"
            hint={`총 대화 ${matching?.totalConversations ?? 0}개`}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <Metric label="pending 웨이브" value={matching?.pendingWaves ?? 0} emphasis="muted" />
          <Metric label="accepted" value={matching?.acceptedWaves ?? 0} emphasis="muted" />
          <Metric label="declined" value={matching?.declinedWaves ?? 0} emphasis="muted" />
        </div>
      </section>

      {/* ── 결큐 데이터 ───────────────────────────────── */}
      <section>
        <SectionHeading
          title="결큐 답변 & 데이터 수집"
          href="/dashboard/data-collection"
          hint="users/{uid}/dailyQuestions 집계"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric
            label="결큐 답변한 사용자"
            value={answerRate}
            suffix="%"
            hint={`${dataCol?.usersWithTags ?? 0} / ${dataCol?.totalUsers ?? 0}명 (dailyQuestionTags 있음)`}
            emphasis="strong"
          />
          <Metric
            label="누적 답변"
            value={dataCol?.totalDailyAnswers ?? 0}
            hint={`오늘 ${dataCol?.todaysDailyAnswers ?? 0}건`}
          />
          <Metric
            label="사용자당 평균"
            value={dataCol?.avgAnswersPerUser?.toFixed(1) ?? '0.0'}
            hint="유의미한 매칭엔 5+ 필요"
          />
          <Metric
            label="임베딩 완료"
            value={dataCol?.usersWithEmbedding ?? 0}
            hint="매칭 후보에 나타나는 사용자"
          />
        </div>
      </section>

      {/* ── Footer hint ─────────────────────────────── */}
      <p className="text-xs text-gray-400 leading-relaxed">
        Tip: DAU 일별 트렌드처럼 시계열이 필요한 지표는 Firebase Analytics (GA4)를 활용하세요. 여기 나오는 DAU/WAU/MAU는 <span className="font-mono">lastActiveAt</span> 하트비트에 기반한 스냅샷 값 (해당 창 안에서 최소 한 번이라도 앱 포그라운드로 진입한 사용자 수)입니다.
      </p>
    </div>
  );
}

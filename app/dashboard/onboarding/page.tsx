'use client';

// Onboarding 드롭오프 모니터링
// ──────────────────────────────────────────────────────────────────────────
// "Where are people stopping during onboarding?" — answered from the
// Firestore-visible state of each user doc. For pre-NICE step-level
// resolution (font size → intro → features → photo → terms), use the GA4
// funnel report on `onboarding_page_view` events instead — those steps
// don't write anything to Firestore.
//
// Created 2026-05-17. Read-only.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOnboardingFunnel } from '@/lib/firestore';
import type { OnboardingFunnel, OnboardingStage } from '@/lib/firestore';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

// Stacked-segment funnel bar. Width is proportional to count vs total.
function FunnelRow({
  label,
  count,
  total,
  pct,
  color,
  caption,
}: {
  label: string;
  count: number;
  total: number;
  pct: number;
  color: string;
  caption?: string;
}) {
  const widthPct = total > 0 ? Math.max((count / total) * 100, count > 0 ? 6 : 0) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-700">
          {label}
          {caption && <span className="ml-2 text-xs text-gray-400">{caption}</span>}
        </span>
        <span className="tabular-nums">
          <span className="font-bold text-gray-900">{count.toLocaleString()}</span>
          <span className="text-xs text-gray-500 ml-2">({pct}%)</span>
        </span>
      </div>
      <div className="h-7 bg-gray-100 rounded-md overflow-hidden">
        <div
          className="h-full transition-all rounded-md"
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const stageLabels: Record<OnboardingStage, { label: string; color: string }> = {
  signed_up: { label: '가입만 함 (NICE 전 이탈)', color: '#EF4444' },
  nice_done: { label: 'NICE 통과, 프로필 시작 전', color: '#F59E0B' },
  profile_partial: { label: '프로필 작성 중 중단', color: '#FBBF24' },
  completed: { label: '완료 ✓', color: '#10B981' },
};

export default function OnboardingFunnelPage() {
  const [data, setData] = useState<OnboardingFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await getOnboardingFunnel();
        if (!cancelled) setData(stats);
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

  if (!data) return null;

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">온보딩 드롭오프</h1>
        <p className="text-sm text-gray-500 mt-1">
          가입한 사용자가 어느 단계에서 멈추는지. Firestore에서 보이는 상태만.
          단계별 (폰트크기 → intro → features → photo → terms) 세분화는{' '}
          <span className="font-mono text-xs bg-gray-100 px-1 rounded">
            onboarding_page_view
          </span>{' '}
          GA4 funnel을 보세요.
        </p>
      </div>

      {/* Headline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-sm text-gray-500 font-medium">총 가입자 (users 컬렉션)</div>
        <div className="text-4xl font-bold tabular-nums mt-1">
          {data.totalSignedUp.toLocaleString()}
        </div>
      </div>

      {/* Funnel */}
      <div>
        <SectionHeading>단계별 분포</SectionHeading>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <FunnelRow
            label={stageLabels.signed_up.label}
            count={data.bySignedUp}
            total={data.totalSignedUp}
            pct={data.pctSignedUp}
            color={stageLabels.signed_up.color}
            caption="가입 직후 본인인증 안 함"
          />
          <FunnelRow
            label={stageLabels.nice_done.label}
            count={data.byNiceDone}
            total={data.totalSignedUp}
            pct={data.pctNiceDone}
            color={stageLabels.nice_done.color}
            caption="본인인증은 통과, 이름·관심사 비어있음"
          />
          <FunnelRow
            label={stageLabels.profile_partial.label}
            count={data.byProfilePartial}
            total={data.totalSignedUp}
            pct={data.pctProfilePartial}
            color={stageLabels.profile_partial.color}
            caption="이름 또는 관심사/지역 중 일부 미입력"
          />
          <FunnelRow
            label={stageLabels.completed.label}
            count={data.byCompleted}
            total={data.totalSignedUp}
            pct={data.pctCompleted}
            color={stageLabels.completed.color}
            caption="이름 + 관심사/지역 모두 있음"
          />
        </div>
      </div>

      {/* Recent dropoffs */}
      <div>
        <SectionHeading>최근 7일 미완료 사용자 ({data.recentDropoffs.length}명)</SectionHeading>
        <p className="text-xs text-gray-500 mb-3">
          가장 오래된 순. 며칠째 멈춰있는지 한눈에 보고, 필요시 카톡 등으로 follow-up.
        </p>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {data.recentDropoffs.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              최근 7일 내 미완료 사용자 없음 — 깔끔합니다 ✨
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">사용자</th>
                  <th className="text-left px-4 py-3">단계</th>
                  <th className="text-right px-4 py-3">가입 후</th>
                  <th className="text-left px-4 py-3 pl-6">이메일</th>
                </tr>
              </thead>
              <tbody>
                {data.recentDropoffs.map((u) => (
                  <tr key={u.uid} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/users/${u.uid}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {u.displayName || `(이름 없음)`}
                      </Link>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">
                        {u.uid.slice(0, 12)}…
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block px-2 py-1 rounded-md text-xs font-medium"
                        style={{
                          backgroundColor: `${stageLabels[u.stage].color}20`,
                          color: stageLabels[u.stage].color,
                        }}
                      >
                        {stageLabels[u.stage].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {u.daysSinceCreated}일 전
                    </td>
                    <td className="px-4 py-3 pl-6 text-gray-500 truncate max-w-[260px]">
                      {u.email || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-gray-400 leading-relaxed">
        Tip: NICE 이전 세부 단계 (어디서 정확히 멈췄나)는 Firebase Console →
        Analytics → Explorations → Funnel Exploration에서{' '}
        <span className="font-mono">onboarding_page_view</span> events를 step으로
        구성하면 보입니다.
      </div>
    </div>
  );
}

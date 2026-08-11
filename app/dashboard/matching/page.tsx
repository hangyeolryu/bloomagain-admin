'use client';

// 매칭 모니터링 Dashboard
// ──────────────────────────────────────────────────────────────────────────
// Beta-stage operator view of the wave funnel. Answers questions like:
//   • Are users actually sending waves after seeing matches?
//   • What % of waves get a response (accepted OR declined)?
//   • What % of accepted waves convert to conversations?
//   • Who are the power users (concentration vs spread)?
//   • What % of users are even *eligible* to be recommended
//     (have a backend embedding)?
//
// Created 2026-05-15. Companion to /dashboard/data-collection — that page
// shows data INTAKE volume, this one shows OUTPUT engagement.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMatchingStats } from '@/lib/firestore';
import type { MatchingStats } from '@/lib/firestore';
import StatsCard from '@/components/ui/StatsCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

// Funnel bar — horizontal bar with absolute count + % of previous step.
function FunnelStep({
  label,
  count,
  total,
  color,
  pctOfPrevious,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  pctOfPrevious?: number;
}) {
  const widthPct = total > 0 ? Math.max((count / total) * 100, count > 0 ? 6 : 0) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="tabular-nums">
          <span className="font-bold text-gray-900">{count.toLocaleString()}</span>
          {pctOfPrevious !== undefined && (
            <span className="text-xs text-gray-500 ml-2">
              ({pctOfPrevious}% 전 단계 대비)
            </span>
          )}
        </span>
      </div>
      <div className="h-7 bg-gray-100 rounded-md overflow-hidden">
        <div
          className="h-full transition-all rounded-md"
          style={{
            width: `${widthPct}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function PowerUserList({
  title,
  data,
  emptyText,
}: {
  title: string;
  data: Array<{ uidPrefix: string; count: number }>;
  emptyText: string;
}) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-sm text-gray-400 italic">{emptyText}</p>
      </div>
    );
  }
  const max = data[0]?.count ?? 1;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-4">
        익명화된 UID 첫 8자리 — 분포 모양만 확인용
      </p>
      <div className="space-y-2">
        {data.map((row, i) => (
          <div key={row.uidPrefix + i} className="flex items-center gap-3">
            <span className="w-5 text-xs text-gray-400 tabular-nums">{i + 1}</span>
            <code className="font-mono text-xs text-gray-700 w-20 truncate">
              {row.uidPrefix}...
            </code>
            <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-400 to-rose-500"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700 w-10 text-right tabular-nums">
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchingPage() {
  const [stats, setStats] = useState<MatchingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMatchingStats()
      .then((s) => setStats(s))
      .catch((e) => {
        console.error('[matching] load error:', e);
        setError((e as Error).message ?? '로드 실패');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner message="매칭 현황 로딩 중..." />;
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
      <p className="text-red-800 font-semibold">데이터 로드 실패</p>
      <p className="text-sm text-red-600 mt-1">{error}</p>
    </div>
  );
  if (!stats) return null;

  // Funnel: matched_seen ≥ wave_sent ≥ responded ≥ accepted ≥ conversation
  // We don't have "matches seen" Firestore-side, so totalWaves is the
  // funnel head. acceptanceRate / responseRate already computed in stats.
  const sentToRespondedPct =
    stats.totalWaves > 0
      ? Math.round(
          ((stats.acceptedWaves + stats.declinedWaves) / stats.totalWaves) * 100,
        )
      : 0;
  const respondedToAcceptedPct =
    stats.acceptedWaves + stats.declinedWaves > 0
      ? Math.round(
          (stats.acceptedWaves / (stats.acceptedWaves + stats.declinedWaves)) * 100,
        )
      : 0;
  const acceptedToConvoPct =
    stats.acceptedWaves > 0
      ? Math.round((stats.totalConversations / stats.acceptedWaves) * 100)
      : 0;

  const embeddingCoveragePct =
    stats.totalUsers > 0
      ? Math.round((stats.usersWithEmbedding / stats.totalUsers) * 100)
      : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">매칭 모니터링</h1>
        <p className="text-gray-500 text-sm mt-1">
          웨이브 funnel · 응답률 · 대화 전환 · 사용자 활동 분포
        </p>
      </div>

      {/* ── 핵심 KPI ── */}
      <div className="mb-6">
        <SectionHeading>핵심 KPI</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            label="총 웨이브"
            value={stats.totalWaves}
            icon="👋"
            color="bg-rose-50"
            href="/dashboard/waves"
          />
          <StatsCard
            label="응답률"
            value={`${stats.responseRate}%`}
            icon="📨"
            color="bg-pink-50"
            delta="응답(수락+거절) / 전체 웨이브"
          />
          <StatsCard
            label="수락률"
            value={`${stats.acceptanceRate}%`}
            icon="💞"
            color="bg-fuchsia-50"
            delta="수락 / (수락+거절)"
          />
          <StatsCard
            label="대화 전환율"
            value={`${stats.conversationStartRate}%`}
            icon="💬"
            color="bg-violet-50"
            delta="대화 시작 / 수락"
          />
        </div>
      </div>

      {/* ── 시간대별 ── */}
      <div className="mb-6">
        <SectionHeading>최근 활동</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            label="웨이브 (24h)"
            value={stats.wavesLast24h}
            icon="⏰"
            color="bg-blue-50"
          />
          <StatsCard
            label="웨이브 (7일)"
            value={stats.wavesLast7d}
            icon="📅"
            color="bg-sky-50"
          />
          <StatsCard
            label="총 대화"
            value={stats.totalConversations}
            icon="💬"
            color="bg-teal-50"
            href="/dashboard/conversations"
          />
          <StatsCard
            label="대화 (7일)"
            value={stats.conversationsLast7d}
            icon="🌿"
            color="bg-emerald-50"
          />
        </div>
      </div>

      {/* ── 웨이브 Funnel ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-1">웨이브 Funnel</h3>
        <p className="text-xs text-gray-500 mb-5">
          웨이브 발송 → 응답 → 수락 → 대화 시작까지의 conversion 흐름
        </p>
        <div className="space-y-4">
          <FunnelStep
            label="① 웨이브 발송"
            count={stats.totalWaves}
            total={stats.totalWaves}
            color="#FB7185"
          />
          <FunnelStep
            label="② 응답 (수락+거절)"
            count={stats.acceptedWaves + stats.declinedWaves}
            total={stats.totalWaves}
            color="#F472B6"
            pctOfPrevious={sentToRespondedPct}
          />
          <FunnelStep
            label="③ 수락"
            count={stats.acceptedWaves}
            total={stats.totalWaves}
            color="#E879F9"
            pctOfPrevious={respondedToAcceptedPct}
          />
          <FunnelStep
            label="④ 대화 시작"
            count={stats.totalConversations}
            total={stats.totalWaves}
            color="#A78BFA"
            pctOfPrevious={acceptedToConvoPct}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-gray-100 text-sm">
          <div>
            <p className="text-gray-500 mb-1">대기 중</p>
            <p className="font-bold text-amber-600 tabular-nums">
              {stats.pendingWaves.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">수락</p>
            <p className="font-bold text-emerald-600 tabular-nums">
              {stats.acceptedWaves.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">거절</p>
            <p className="font-bold text-gray-500 tabular-nums">
              {stats.declinedWaves.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── Embedding 커버리지 ── */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 shadow-sm p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-1">매칭 후보 커버리지</h3>
        <p className="text-xs text-gray-600 mb-4">
          embedding을 가진 사용자만 다른 사람의 매칭 결과에 등장. 커버리지가 낮으면
          매칭 풀이 작아져 빈 추천 화면이 나옴.
        </p>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold text-indigo-700 tabular-nums">
              {embeddingCoveragePct}%
            </p>
            <p className="text-xs text-gray-600 mt-1">embedding 보유</p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{stats.usersWithEmbedding.toLocaleString()} 명</span>
              <span>전체 {stats.totalUsers.toLocaleString()} 명</span>
            </div>
            <div className="h-4 bg-white/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all"
                style={{ width: `${embeddingCoveragePct}%` }}
              />
            </div>
          </div>
        </div>
        {embeddingCoveragePct < 30 && (
          <p className="text-xs text-amber-700 mt-4 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
            ⚠ 커버리지 30% 미만 — Cloud Function embedding 생성이 자주 트리거되지
            않거나, 사용자들이 daily question에 거의 답변하지 않을 가능성. <br />
            <Link
              href="/dashboard/data-collection"
              className="underline font-medium"
            >
              데이터 수집 현황 →
            </Link>
          </p>
        )}
      </div>

      {/* ── Top users ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <PowerUserList
          title="Top 10 웨이브 발송자"
          data={stats.topSenders}
          emptyText="아직 발송된 웨이브 없음"
        />
        <PowerUserList
          title="Top 10 웨이브 수신자"
          data={stats.topReceivers}
          emptyText="아직 수신된 웨이브 없음"
        />
      </div>

      {/* ── 진단 가이드 ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">진단 가이드</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>
            <strong className="text-gray-900">응답률 &lt; 20%</strong>: 사용자가
            매칭을 받지만 행동으로 이어지지 않음 → 카드 UI / CTA / 매칭 품질 점검
          </li>
          <li>
            <strong className="text-gray-900">수락률 &lt; 30%</strong>: 매칭 알고리즘
            점수 미스매치 → daily question 답변 누적 부족 또는 weights 재조정
          </li>
          <li>
            <strong className="text-gray-900">대화 전환율 &lt; 50%</strong>: 수락
            후에도 대화 안 시작 → 대화 진입 UX 점검 (initial message 어색함 등)
          </li>
          <li>
            <strong className="text-gray-900">Top 발송자 1명이 50%+</strong>: 한 명이
            모든 활동 차지 → 정상 베타 신호이거나 봇 가능성
          </li>
          <li>
            <strong className="text-gray-900">embedding 커버리지 &lt; 50%</strong>:
            Cloud Function 또는 backend embedding sync 점검 →{' '}
            <Link
              href="/dashboard/data-collection"
              className="underline text-emerald-600"
            >
              데이터 수집 현황
            </Link>
          </li>
        </ul>
      </div>

      {/* ── 빠른 진단 링크 ── */}
      <div className="text-xs text-gray-500 mt-4">
        💡 <strong>관련 화면</strong>:{' '}
        <Link
          href="/dashboard/data-collection"
          className="text-emerald-600 hover:underline"
        >
          데이터 수집 현황
        </Link>{' '}
        ·{' '}
        <Link href="/dashboard/waves" className="text-emerald-600 hover:underline">
          웨이브 목록
        </Link>{' '}
        ·{' '}
        <Link
          href="/dashboard/conversations"
          className="text-emerald-600 hover:underline"
        >
          대화 목록
        </Link>{' '}
        ·{' '}
        <Link href="/dashboard/health" className="text-emerald-600 hover:underline">
          백엔드 상태
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDashboardStats, getAdminAlerts, getReports } from '@/lib/firestore';
import type { DashboardStats, AdminAlert, Report } from '@/types';
import StatsCard from '@/components/ui/StatsCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getSeverityVariant(severity: string) {
  if (severity === 'high') return 'red' as const;
  if (severity === 'medium') return 'yellow' as const;
  return 'gray' as const;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getAdminAlerts(5),
      getReports('pending', 5),
    ]).then(([s, a, r]) => {
      setStats(s);
      setAlerts(a.items);
      setReports(r.items);
      setLoading(false);
    }).catch((err) => { console.error('[Dashboard] load error:', err); setLoading(false); });
  }, []);

  if (loading) return <LoadingSpinner message="대시보드 로딩 중..." />;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-gray-500 text-sm mt-1">다시, 봄 서비스 현황 요약</p>
      </div>

      {stats && (
        <div className="space-y-6 mb-8">

          {/* ── 사용자 현황 ── */}
          <div>
            <SectionHeading>사용자 현황</SectionHeading>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatsCard
                label="총 사용자"
                value={stats.totalUsers}
                icon="👥"
                color="bg-blue-50"
                href="/dashboard/users"
              />
              <StatsCard
                label="신규 가입 (7일)"
                value={stats.newUsersThisWeek}
                icon="🌱"
                color="bg-emerald-50"
                href="/dashboard/users"
              />
              <StatsCard
                label="신규 가입 (30일)"
                value={stats.newUsersThisMonth}
                icon="📅"
                color="bg-teal-50"
                href="/dashboard/users"
              />
            </div>
          </div>

          {/* ── 활동 & 서비스 ── */}
          <div>
            <SectionHeading>활동 & 서비스</SectionHeading>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                label="주간 활성 (7일)"
                value={stats.activeUsersThisWeek}
                icon="✅"
                color="bg-green-50"
                href="/dashboard/users?status=active"
              />
              <StatsCard
                label="총 모임"
                value={stats.totalCircles}
                icon="🌿"
                color="bg-lime-50"
                href="/dashboard/circles"
              />
              <StatsCard
                label="총 웨이브"
                value={stats.totalWaves}
                icon="👋"
                color="bg-sky-50"
              />
              <StatsCard
                label="총 대화"
                value={stats.totalConversations}
                icon="💬"
                color="bg-violet-50"
              />
            </div>
          </div>

          {/* ── 보안 & 안전 ── */}
          <div>
            <SectionHeading>보안 & 안전</SectionHeading>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatsCard
                label="차단된 사용자"
                value={stats.blockedUsers}
                icon="🚫"
                color="bg-red-50"
                href="/dashboard/users?status=blocked"
              />
              <StatsCard
                label="대기 중 신고"
                value={stats.pendingReports}
                icon="🚨"
                color="bg-orange-50"
                href="/dashboard/reports"
              />
              <StatsCard
                label="미해결 알림"
                value={stats.unresolvedAlerts}
                icon="🔔"
                color="bg-yellow-50"
                href="/dashboard/alerts"
              />
            </div>
          </div>

        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Alerts */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">최근 관리자 알림</h2>
            <Link href="/dashboard/alerts" className="text-xs text-green-600 hover:underline font-medium">
              전체 보기
            </Link>
          </div>
          {alerts.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">알림 없음</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={alert.userId ? `/dashboard/users/${alert.userId}` : '/dashboard/alerts'}
                    className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <Badge variant={getSeverityVariant(alert.severity)}>
                      {alert.severity === 'high' ? '높음' : alert.severity === 'medium' ? '중간' : '낮음'}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {alert.userDisplayName || alert.userId || '-'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{alert.type} · {alert.reason || '-'}</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(alert.timestamp)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending Reports */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">대기 중인 신고</h2>
            <Link href="/dashboard/reports" className="text-xs text-green-600 hover:underline font-medium">
              전체 보기
            </Link>
          </div>
          {reports.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">대기 중인 신고 없음</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link
                    href={r.type === 'user' ? `/dashboard/users/view?id=${r.targetId}` : `/dashboard/circles/view?id=${r.targetId}`}
                    className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <Badge variant="orange">
                      {r.type === 'user' ? '사용자' : '모임'}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{r.reason}</p>
                      <p className="text-xs text-gray-500">신고자: {r.reportedBy.slice(0, 8)}...</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(r.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

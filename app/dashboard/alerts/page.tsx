'use client';

import { useEffect, useState } from 'react';
import { getAdminAlerts, resolveAlert } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { AdminAlert } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getSeverityInfo(severity: string) {
  if (severity === 'high') return { variant: 'red' as const, label: '높음', emoji: '🔴' };
  if (severity === 'medium') return { variant: 'yellow' as const, label: '중간', emoji: '🟡' };
  return { variant: 'gray' as const, label: '낮음', emoji: '🟢' };
}

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    blocked_circle: '차단된 모임',
    suspicious_circle: '의심 모임',
    blocked_image: '차단된 이미지',
    suspicious_image: '의심 이미지',
    multiple_reports: '다중 신고',
    high_security_score: '높은 위험 점수',
  };
  return map[type] || type;
}

export default function AlertsPage() {
  const { can } = useAuth();
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    getAdminAlerts(100).then((a) => {
      setAlerts(a);
      setLoading(false);
    });
  }, []);

  const handleResolve = async (alertId: string) => {
    setResolving(alertId);
    await resolveAlert(alertId);
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, resolved: true } : a));
    setResolving(null);
  };

  const displayed = alerts.filter((a) => showResolved ? true : !a.resolved);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Header
        title="관리자 알림"
        subtitle={`미해결: ${alerts.filter((a) => !a.resolved).length}건 / 전체: ${alerts.length}건`}
        action={
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="w-4 h-4 accent-green-600"
            />
            <span className="text-sm text-gray-600">해결된 알림 포함</span>
          </label>
        }
      />

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">🎉</p>
          <p>미해결 알림 없음</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((alert) => {
            const sev = getSeverityInfo(alert.severity);
            return (
              <div
                key={alert.id}
                className={`bg-white rounded-2xl border shadow-sm p-5 transition-opacity ${
                  alert.resolved ? 'opacity-50 border-gray-100' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl">{sev.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={sev.variant}>{sev.label}</Badge>
                      <span className="text-sm font-semibold text-gray-800">{getTypeLabel(alert.type)}</span>
                      {alert.resolved && <Badge variant="gray">해결됨</Badge>}
                    </div>
                    {alert.userDisplayName && (
                      <p className="text-sm text-gray-700 mb-1">
                        사용자: <strong>{alert.userDisplayName}</strong>
                        {alert.userId && <span className="text-xs text-gray-400 ml-1 font-mono">({alert.userId.slice(0, 8)}...)</span>}
                      </p>
                    )}
                    {alert.reason && <p className="text-sm text-gray-600">{alert.reason}</p>}
                    {alert.circleName && (
                      <p className="text-sm text-gray-600">모임: {alert.circleName}</p>
                    )}
                    {(alert.detectedIssues || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {alert.detectedIssues!.map((issue, i) => (
                          <span key={i} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100">
                            {issue}
                          </span>
                        ))}
                      </div>
                    )}
                    {alert.adultScore !== undefined && (
                      <div className="flex gap-3 mt-2 text-xs text-gray-500">
                        <span>성인: {(alert.adultScore * 100).toFixed(0)}%</span>
                        {alert.violenceScore !== undefined && <span>폭력: {(alert.violenceScore * 100).toFixed(0)}%</span>}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">{formatDate(alert.timestamp)}</p>
                  </div>
                  {!alert.resolved && can('resolveAlerts') && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      disabled={resolving === alert.id}
                      className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium flex-shrink-0 disabled:opacity-50"
                    >
                      {resolving === alert.id ? '처리 중...' : '해결'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

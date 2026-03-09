'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminAlerts, resolveAlert, deleteAlert, blockUser, blockCircle } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { AdminAlert } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';
import Modal from '@/components/ui/Modal';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getSeverityInfo(s: string) {
  if (s === 'high')   return { variant: 'red'    as const, label: '높음', emoji: '🔴', bg: 'bg-red-50 border-red-200' };
  if (s === 'medium') return { variant: 'yellow' as const, label: '중간', emoji: '🟡', bg: 'bg-yellow-50 border-yellow-200' };
  return                     { variant: 'gray'   as const, label: '낮음', emoji: '🟢', bg: 'bg-gray-50 border-gray-200' };
}

const TYPE_META: Record<string, { label: string; icon: string }> = {
  high_security_score: { label: '높은 위험 점수', icon: '⚠️'  },
  multiple_reports:    { label: '다중 신고',       icon: '🚨'  },
  blocked_circle:      { label: '차단된 모임',     icon: '🚫'  },
  suspicious_circle:   { label: '의심 모임',       icon: '👀'  },
  blocked_image:       { label: '차단된 이미지',   icon: '🖼️' },
  suspicious_image:    { label: '의심 이미지',     icon: '🖼️' },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, icon: '📋' };
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className="w-14 text-right shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 font-mono">{pct}%</span>
    </div>
  );
}

type ActivePanel = 'resolve' | 'block_user' | 'block_circle' | 'delete' | null;

// ── component ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { user: adminUser, can } = useAuth();
  const [alerts, setAlerts]           = useState<AdminAlert[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [typeFilter, setTypeFilter]   = useState('all');

  // per-card action state
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [note, setNote]               = useState('');
  const [processing, setProcessing]   = useState<string | null>(null);

  // image preview modal
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);

  useEffect(() => {
    getAdminAlerts(200).then((a) => { setAlerts(a); setLoading(false); });
  }, []);

  // ── derived ──────────────────────────────────────────────────────────────
  const allTypes = Array.from(new Set(alerts.map((a) => a.type)));

  const displayed = alerts.filter((a) => {
    if (!showResolved && a.resolved) return false;
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    return true;
  });

  // ── actions ──────────────────────────────────────────────────────────────
  function toggleCard(id: string, panel: ActivePanel) {
    if (expandedId === id && activePanel === panel) {
      setExpandedId(null); setActivePanel(null); setNote('');
    } else {
      setExpandedId(id); setActivePanel(panel); setNote('');
    }
  }

  async function handleResolve(alert: AdminAlert) {
    setProcessing(alert.id);
    await resolveAlert(alert.id, note, adminUser?.uid);
    setAlerts((prev) => prev.map((a) =>
      a.id === alert.id ? { ...a, resolved: true, resolvedNote: note || undefined } : a
    ));
    setExpandedId(null); setActivePanel(null); setNote('');
    setProcessing(null);
  }

  async function handleBlockUser(alert: AdminAlert) {
    if (!alert.userId || !adminUser) return;
    setProcessing(alert.id);
    await blockUser(alert.userId, note || '관리자 알림에 의한 차단', adminUser.uid);
    await resolveAlert(alert.id, `사용자 차단 처리: ${note}`, adminUser.uid);
    setAlerts((prev) => prev.map((a) =>
      a.id === alert.id ? { ...a, resolved: true } : a
    ));
    setExpandedId(null); setActivePanel(null); setNote('');
    setProcessing(null);
  }

  async function handleBlockCircle(alert: AdminAlert) {
    if (!alert.circleId || !adminUser) return;
    setProcessing(alert.id);
    await blockCircle(alert.circleId, note || '관리자 알림에 의한 차단', adminUser.uid);
    await resolveAlert(alert.id, `모임 차단 처리: ${note}`, adminUser.uid);
    setAlerts((prev) => prev.map((a) =>
      a.id === alert.id ? { ...a, resolved: true } : a
    ));
    setExpandedId(null); setActivePanel(null); setNote('');
    setProcessing(null);
  }

  async function handleDelete(alert: AdminAlert) {
    setProcessing(alert.id);
    await deleteAlert(alert.id);
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    setExpandedId(null); setActivePanel(null);
    setProcessing(null);
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return <LoadingSpinner />;

  const unresolved = alerts.filter((a) => !a.resolved).length;

  return (
    <div>
      <Header
        title="관리자 알림"
        subtitle={`미해결 ${unresolved}건 · 전체 ${alerts.length}건`}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Severity filter */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm">
          {(['all', 'high', 'medium', 'low'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                severityFilter === s ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? '전체' : s === 'high' ? '🔴 높음' : s === 'medium' ? '🟡 중간' : '🟢 낮음'}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">모든 유형</option>
          {allTypes.map((t) => (
            <option key={t} value={t}>{getTypeMeta(t).label}</option>
          ))}
        </select>

        {/* Resolved toggle */}
        <label className="flex items-center gap-2 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="w-4 h-4 accent-green-600"
          />
          <span className="text-sm text-gray-600">해결된 알림 포함</span>
        </label>
      </div>

      {/* Alert count summary */}
      <p className="text-xs text-gray-400 mb-3">{displayed.length}건 표시 중</p>

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">🎉</p>
          <p>{showResolved ? '알림 없음' : '미해결 알림 없음'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((alert) => {
            const sev  = getSeverityInfo(alert.severity);
            const meta = getTypeMeta(alert.type);
            const isExpanded = expandedId === alert.id;
            const isBusy = processing === alert.id;

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-opacity ${
                  alert.resolved ? 'opacity-50 border-gray-100' : sev.bg
                }`}
              >
                {/* ── Main row ── */}
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl flex-shrink-0">{meta.icon}</span>

                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge variant={sev.variant}>{sev.label}</Badge>
                        <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
                        {alert.resolved && <Badge variant="gray">해결됨</Badge>}
                      </div>

                      {/* User */}
                      {alert.userId && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500">사용자:</span>
                          <Link
                            href={`/dashboard/users/${alert.userId}`}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            {alert.userDisplayName || alert.userId.slice(0, 10)}
                          </Link>
                          <span className="text-xs text-gray-400 font-mono">({alert.userId.slice(0, 8)}...)</span>
                        </div>
                      )}

                      {/* Circle */}
                      {alert.circleName && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500">모임:</span>
                          {alert.circleId ? (
                            <Link
                              href={`/dashboard/circles/${alert.circleId}`}
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              {alert.circleName}
                            </Link>
                          ) : (
                            <span className="text-sm text-gray-700">{alert.circleName}</span>
                          )}
                          {alert.circleDescription && (
                            <span className="text-xs text-gray-400 truncate max-w-xs">{alert.circleDescription}</span>
                          )}
                        </div>
                      )}

                      {/* Reason */}
                      {alert.reason && (
                        <p className="text-sm text-gray-600 mb-1">{alert.reason}</p>
                      )}

                      {/* Detected issues chips */}
                      {(alert.detectedIssues ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {alert.detectedIssues!.map((issue, i) => (
                            <span key={i} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100">
                              {issue}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Score bars */}
                      {(alert.adultScore !== undefined || alert.violenceScore !== undefined) && (
                        <div className="space-y-1 mb-2 max-w-xs">
                          {alert.adultScore    !== undefined && <ScoreBar label="성인"  score={alert.adultScore} />}
                          {alert.violenceScore !== undefined && <ScoreBar label="폭력"  score={alert.violenceScore} />}
                        </div>
                      )}

                      {/* Image thumbnail */}
                      {alert.imageUrl && (
                        <button
                          onClick={() => setPreviewUrl(alert.imageUrl!)}
                          className="mt-1 block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={alert.imageUrl}
                            alt="flagged"
                            className="h-20 w-20 object-cover rounded-xl border border-gray-200 hover:opacity-80 transition-opacity"
                          />
                          <span className="text-xs text-blue-500 mt-0.5 block">이미지 확대</span>
                        </button>
                      )}

                      {/* Resolution note */}
                      {alert.resolved && alert.resolvedNote && (
                        <p className="text-xs text-gray-500 mt-2 italic">처리 메모: {alert.resolvedNote}</p>
                      )}

                      <p className="text-xs text-gray-400 mt-2">{formatDate(alert.timestamp)}</p>
                    </div>

                    {/* ── Action buttons ── */}
                    {!alert.resolved && can('resolveAlerts') && (
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {/* View user */}
                        {alert.userId && (
                          <Link
                            href={`/dashboard/users/${alert.userId}`}
                            className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium text-center"
                          >
                            👤 사용자 보기
                          </Link>
                        )}

                        {/* View circle */}
                        {alert.circleId && (
                          <Link
                            href={`/dashboard/circles/${alert.circleId}`}
                            className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium text-center"
                          >
                            🌿 모임 보기
                          </Link>
                        )}

                        {/* Block user */}
                        {alert.userId && can('manageUsers') && (
                          <button
                            onClick={() => toggleCard(alert.id, 'block_user')}
                            className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
                              isExpanded && activePanel === 'block_user'
                                ? 'bg-red-600 text-white'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            🚫 사용자 차단
                          </button>
                        )}

                        {/* Block circle */}
                        {alert.circleId && can('manageCircles') && (
                          <button
                            onClick={() => toggleCard(alert.id, 'block_circle')}
                            className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
                              isExpanded && activePanel === 'block_circle'
                                ? 'bg-orange-600 text-white'
                                : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                            }`}
                          >
                            🚫 모임 차단
                          </button>
                        )}

                        {/* Resolve */}
                        <button
                          onClick={() => toggleCard(alert.id, 'resolve')}
                          className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
                            isExpanded && activePanel === 'resolve'
                              ? 'bg-green-600 text-white'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          ✅ 해결 처리
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => toggleCard(alert.id, 'delete')}
                          className={`px-3 py-1.5 text-xs rounded-lg font-medium ${
                            isExpanded && activePanel === 'delete'
                              ? 'bg-gray-700 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Expanded action panel ── */}
                {isExpanded && !alert.resolved && can('resolveAlerts') && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    {activePanel === 'block_user' && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-red-700">
                          <strong>{alert.userDisplayName || alert.userId}</strong> 사용자를 차단합니다.
                          차단 후 알림이 자동으로 해결 처리됩니다.
                        </p>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="차단 사유를 입력하세요..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setExpandedId(null); setActivePanel(null); setNote(''); }}
                            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white"
                          >취소</button>
                          <button
                            onClick={() => handleBlockUser(alert)}
                            disabled={isBusy}
                            className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50"
                          >
                            {isBusy ? '처리 중...' : '차단 확인'}
                          </button>
                        </div>
                      </div>
                    )}

                    {activePanel === 'block_circle' && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-orange-700">
                          <strong>{alert.circleName}</strong> 모임을 차단합니다.
                          차단 후 알림이 자동으로 해결 처리됩니다.
                        </p>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="차단 사유를 입력하세요..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setExpandedId(null); setActivePanel(null); setNote(''); }}
                            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white"
                          >취소</button>
                          <button
                            onClick={() => handleBlockCircle(alert)}
                            disabled={isBusy || !alert.circleId}
                            className="px-4 py-2 text-sm bg-orange-600 text-white rounded-xl hover:bg-orange-700 disabled:opacity-50"
                          >
                            {isBusy ? '처리 중...' : '차단 확인'}
                          </button>
                        </div>
                      </div>
                    )}

                    {activePanel === 'resolve' && (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600">이 알림을 해결 처리합니다. 메모를 남길 수 있습니다.</p>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="처리 메모 (선택사항)..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setExpandedId(null); setActivePanel(null); setNote(''); }}
                            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white"
                          >취소</button>
                          <button
                            onClick={() => handleResolve(alert)}
                            disabled={isBusy}
                            className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50"
                          >
                            {isBusy ? '처리 중...' : '해결 확인'}
                          </button>
                        </div>
                      </div>
                    )}

                    {activePanel === 'delete' && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-700">
                          이 알림을 <strong>영구 삭제</strong>합니다. 이 작업은 되돌릴 수 없습니다.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setExpandedId(null); setActivePanel(null); }}
                            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white"
                          >취소</button>
                          <button
                            onClick={() => handleDelete(alert)}
                            disabled={isBusy}
                            className="px-4 py-2 text-sm bg-gray-700 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50"
                          >
                            {isBusy ? '삭제 중...' : '삭제 확인'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image preview modal */}
      <Modal isOpen={!!previewUrl} onClose={() => setPreviewUrl(null)} title="이미지 검토">
        {previewUrl && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="flagged content" className="w-full rounded-xl object-contain max-h-[60vh]" />
            <div className="flex justify-end">
              <button
                onClick={() => setPreviewUrl(null)}
                className="px-4 py-2 text-sm bg-gray-100 rounded-xl hover:bg-gray-200"
              >닫기</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

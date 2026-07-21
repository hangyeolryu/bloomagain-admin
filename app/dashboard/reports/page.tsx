'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getReports, resolveReport, dismissReport } from '@/lib/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import type { Report } from '@/types';
import Badge from '@/components/ui/Badge';
import SafetyStatusBadge from '@/components/ui/SafetyStatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Header from '@/components/layout/Header';

const PAGE_SIZE = 30;

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DRAFT_VIOLATION_BADGE: Record<string, { cls: string; label: string }> = {
  yes:     { cls: 'bg-red-100 text-red-800',    label: '🤖 위반 판단' },
  no:      { cls: 'bg-green-100 text-green-800', label: '🤖 위반 아님' },
  unclear: { cls: 'bg-amber-100 text-amber-800', label: '🤖 판단 유보' },
};

const DRAFT_REC_LABEL: Record<string, string> = {
  dismiss: '기각 권고',
  warn: '경고 권고',
  suspend: '정지 권고',
  monitor: '관찰 권고',
};

/** LLM 처리 초안 블록 — 참고용, 최종 조치는 운영자가 버튼으로 실행. */
function AiDraftBlock({ draft }: { draft: NonNullable<Report['aiDraft']> }) {
  if (draft.status !== 'ready') {
    return (
      <p className="mt-1.5 text-xs text-gray-400">
        🤖 AI 초안 {draft.status === 'failed' ? '실패' : '생략'}: {draft.note}
      </p>
    );
  }
  const badge = DRAFT_VIOLATION_BADGE[draft.violation ?? 'unclear'];
  return (
    <div className="mt-2 p-2.5 bg-violet-50 rounded-lg text-xs space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`px-1.5 py-0.5 rounded ${badge.cls} font-medium`}>{badge.label}</span>
        <span className="px-1.5 py-0.5 rounded bg-white text-violet-700 font-medium">
          {DRAFT_REC_LABEL[draft.recommendation ?? 'monitor']}
        </span>
        <span className="text-gray-400">심각도 {draft.severity}</span>
      </div>
      <p className="text-gray-800">{draft.summary}</p>
      {(draft.evidence?.length ?? 0) > 0 && (
        <ul className="text-gray-600">
          {draft.evidence!.map((e, i) => (
            <li key={i} className="truncate">· “{e}”</li>
          ))}
        </ul>
      )}
      {draft.recommendationReason && (
        <p className="text-gray-500">→ {draft.recommendationReason}</p>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const { user: adminUser, can } = useAuth();
  const [reports, setReports]         = useState<Report[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [modal, setModal]             = useState<{ report: Report; type: 'resolve' | 'dismiss' } | null>(null);
  const [resolution, setResolution]   = useState('');
  const [acting, setActing]           = useState(false);

  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});
  // Keep filter in a ref so loadMore always reads the latest value
  const filterRef   = useRef(statusFilter);
  filterRef.current = statusFilter;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const { items, lastDoc } = await getReports(filterRef.current, PAGE_SIZE, lastDocRef.current);
      lastDocRef.current = lastDoc;
      setReports((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  loadMoreRef.current = loadMore;

  // Reset + reload when filter changes
  useEffect(() => {
    setLoading(true);
    setReports([]);
    lastDocRef.current = null;
    setHasMore(false);
    getReports(statusFilter, PAGE_SIZE).then(({ items, lastDoc }) => {
      setReports(items);
      lastDocRef.current = lastDoc;
      setHasMore(items.length === PAGE_SIZE);
      setLoading(false);
    });
  }, [statusFilter]);

  // IntersectionObserver (set up once)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleAction = async () => {
    if (!modal || !adminUser) return;
    setActing(true);
    try {
      if (modal.type === 'resolve') {
        await resolveReport(modal.report.id, resolution, adminUser.uid);
      } else {
        await dismissReport(modal.report.id, adminUser.uid);
      }
      setReports((prev) => prev.filter((r) => r.id !== modal.report.id));
      setModal(null);
      setResolution('');
    } finally {
      setActing(false);
    }
  };

  return (
    <div>
      <Header title="신고 관리" subtitle="사용자 및 모임 신고 처리" />

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['pending', 'reviewed', 'resolved', 'dismissed', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === 'pending' ? '미처리' : s === 'reviewed' ? '검토중' : s === 'resolved' ? '처리완료' : s === 'dismissed' ? '기각' : '전체'}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {reports.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">✅</p>
              <p>해당 신고 없음</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reports.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <SafetyStatusBadge status={r.status} />
                        <Badge variant={r.type === 'user' ? 'blue' : 'green'}>
                          {r.type === 'user' ? '사용자' : '모임'}
                        </Badge>
                        <span className="text-xs text-gray-400">{formatDate(r.createdAt)}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">{r.reason}</p>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p>대상: <span className="font-mono">{r.targetId.slice(0, 12)}…</span></p>
                        <p>신고자: <span className="font-mono">{r.reportedBy.slice(0, 12)}…</span></p>
                        {r.resolution && <p>처리 결과: {r.resolution}</p>}
                      </div>
                      {r.aiDraft && <AiDraftBlock draft={r.aiDraft} />}
                    </div>
                    {r.status === 'pending' && can('resolveReports') && (
                      <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            // LLM 초안이 있으면 처리 메모를 pre-fill — 운영자는
                            // 검토·수정 후 확인만 하면 된다.
                            if (r.aiDraft?.status === 'ready') {
                              const rec = DRAFT_REC_LABEL[r.aiDraft.recommendation ?? 'monitor'];
                              setResolution(
                                `[AI 초안] ${rec} — ${r.aiDraft.summary ?? ''}` +
                                (r.aiDraft.recommendationReason ? ` (${r.aiDraft.recommendationReason})` : ''),
                              );
                            }
                            setModal({ report: r, type: 'resolve' });
                          }}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                          처리
                        </button>
                        <button
                          onClick={() => setModal({ report: r, type: 'dismiss' })}
                          className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                        >
                          기각
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-gray-50 text-xs text-gray-400 flex items-center justify-between">
            <span>{reports.length}건의 신고</span>
            {loadingMore && <span className="text-green-600 animate-pulse">불러오는 중...</span>}
            {!hasMore && reports.length > 0 && <span>전체 로드 완료</span>}
          </div>
        </div>
      )}

      {/* IntersectionObserver sentinel */}
      <div ref={sentinelRef} className="h-1" />

      <Modal
        isOpen={!!modal}
        onClose={() => { setModal(null); setResolution(''); }}
        title={modal?.type === 'resolve' ? '신고 처리' : '신고 기각'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">이 신고를 {modal?.type === 'resolve' ? '처리' : '기각'}하시겠습니까?</p>
          {modal?.type === 'resolve' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">처리 결과 메모</label>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="처리 결과를 입력하세요..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setModal(null); setResolution(''); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleAction}
              disabled={acting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {acting ? '처리 중...' : '확인'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

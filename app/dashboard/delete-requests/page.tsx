'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getDeleteRequests, resolveDeleteRequest } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { DeleteRequest, DeleteRequestStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

const PAGE_SIZE = 30;

type FilterType = 'all' | DeleteRequestStatus;

function getStatusBadge(status: DeleteRequestStatus) {
  if (status === 'completed') return <Badge variant="green">처리 완료</Badge>;
  if (status === 'cancelled') return <Badge variant="gray">취소됨</Badge>;
  return <Badge variant="red">대기 중</Badge>;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DeleteRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests]         = useState<DeleteRequest[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(false);
  const [filter, setFilter]             = useState<FilterType>('pending');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [note, setNote]                 = useState('');
  const [processing, setProcessing]     = useState<string | null>(null);

  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});
  const filterRef   = useRef<FilterType>('pending');
  filterRef.current = filter;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const statusArg = filterRef.current === 'all' ? undefined : filterRef.current;
      const { items, lastDoc } = await getDeleteRequests(statusArg, PAGE_SIZE, lastDocRef.current);
      lastDocRef.current = lastDoc;
      setRequests((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  loadMoreRef.current = loadMore;

  useEffect(() => {
    setLoading(true);
    setRequests([]);
    lastDocRef.current = null;
    const statusArg = filter === 'all' ? undefined : filter;
    getDeleteRequests(statusArg, PAGE_SIZE)
      .then(({ items, lastDoc }) => {
        setRequests(items);
        lastDocRef.current = lastDoc;
        setHasMore(items.length === PAGE_SIZE);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleResolve = async (id: string, status: 'completed' | 'cancelled') => {
    if (!user?.email) return;
    setProcessing(id);
    try {
      await resolveDeleteRequest(id, status, user.email, note.trim() || undefined);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, processedAt: new Date(), processedBy: user.email!, note: note.trim() || undefined }
            : r
        )
      );
      setExpanded(null);
      setNote('');
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount   = requests.filter((r) => r.status === 'pending').length;
  const completedCount = requests.filter((r) => r.status === 'completed').length;
  const cancelledCount = requests.filter((r) => r.status === 'cancelled').length;

  return (
    <div>
      <Header title="계정 삭제 요청" subtitle={`${requests.length}건 로드됨`} />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['pending', 'all', 'completed', 'cancelled'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-red-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all'
              ? `전체 (${requests.length})`
              : f === 'pending'
              ? `대기 중 (${pendingCount})`
              : f === 'completed'
              ? `처리 완료 (${completedCount})`
              : `취소됨 (${cancelledCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">🗑️</p>
          <p>계정 삭제 요청 없음</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              {/* Row */}
              <div
                className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-sm text-gray-500 truncate">{r.contactInfo}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {getStatusBadge(r.status)}
                  <span className="text-xs text-gray-400">{formatDate(r.requestedAt)}</span>
                  <span className="text-gray-400 text-xs">{expanded === r.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded panel */}
              {expanded === r.id && (
                <div className="border-t border-gray-100 px-6 py-5 bg-gray-50 space-y-4">
                  {r.reason && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">삭제 사유</p>
                      <p className="text-sm text-gray-700">{r.reason}</p>
                    </div>
                  )}
                  {r.processedBy && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">처리 정보</p>
                      <p className="text-sm text-gray-700">
                        {formatDate(r.processedAt)} · {r.processedBy}
                        {r.note && ` · ${r.note}`}
                      </p>
                    </div>
                  )}

                  {r.status === 'pending' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">메모 (선택)</label>
                        <input
                          type="text"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="처리 메모를 입력하세요"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResolve(r.id, 'completed')}
                          disabled={processing === r.id}
                          className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          {processing === r.id ? '처리 중...' : '✓ 삭제 처리 완료'}
                        </button>
                        <button
                          onClick={() => handleResolve(r.id, 'cancelled')}
                          disabled={processing === r.id}
                          className="flex-1 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                        >
                          ✕ 취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-400 flex justify-between">
        <span>{requests.length}건 표시</span>
        {loadingMore && <span className="text-red-600 animate-pulse">불러오는 중...</span>}
        {!hasMore && requests.length > 0 && <span>전체 로드 완료</span>}
      </div>

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

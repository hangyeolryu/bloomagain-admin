'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSupportInquiries, resolveSupportInquiry } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { SupportInquiry, SupportInquiryStatus } from '@/types';
import { SUPPORT_CATEGORY_LABELS } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

const PAGE_SIZE = 30;

type FilterType = 'all' | SupportInquiryStatus;

function getStatusBadge(status: SupportInquiryStatus) {
  if (status === 'resolved') return <Badge variant="green">해결 완료</Badge>;
  if (status === 'in_progress') return <Badge variant="yellow">처리 중</Badge>;
  return <Badge variant="red">대기 중</Badge>;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SupportPage() {
  const { user } = useAuth();
  const [inquiries, setInquiries]       = useState<SupportInquiry[]>([]);
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
      const statusArg = filterRef.current === 'all' ? undefined : filterRef.current as SupportInquiryStatus;
      const { items, lastDoc } = await getSupportInquiries(statusArg, PAGE_SIZE, lastDocRef.current);
      lastDocRef.current = lastDoc;
      setInquiries((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  loadMoreRef.current = loadMore;

  useEffect(() => {
    setLoading(true);
    setInquiries([]);
    lastDocRef.current = null;
    const statusArg = filter === 'all' ? undefined : filter as SupportInquiryStatus;
    getSupportInquiries(statusArg, PAGE_SIZE)
      .then(({ items, lastDoc }) => {
        setInquiries(items);
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

  const handleAction = async (id: string, status: 'in_progress' | 'resolved') => {
    if (!user?.email) return;
    setProcessing(id);
    try {
      await resolveSupportInquiry(id, status, user.email, note.trim() || undefined);
      setInquiries((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status,
                ...(status === 'resolved' ? { resolvedAt: new Date(), resolvedBy: user.email! } : {}),
                note: note.trim() || r.note,
              }
            : r
        )
      );
      setExpanded(null);
      setNote('');
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount    = inquiries.filter((r) => r.status === 'pending').length;
  const inProgressCount = inquiries.filter((r) => r.status === 'in_progress').length;
  const resolvedCount   = inquiries.filter((r) => r.status === 'resolved').length;

  return (
    <div>
      <Header title="고객 문의" subtitle={`${inquiries.length}건 로드됨`} />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['pending', 'in_progress', 'resolved', 'all'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all'
              ? `전체 (${inquiries.length})`
              : f === 'pending'
              ? `대기 중 (${pendingCount})`
              : f === 'in_progress'
              ? `처리 중 (${inProgressCount})`
              : `해결 완료 (${resolvedCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : inquiries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">🎧</p>
          <p>문의 내역 없음</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              {/* Row */}
              <div
                className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setExpanded(expanded === r.id ? null : r.id);
                  setNote('');
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    {r.category && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {SUPPORT_CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{r.contact}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {getStatusBadge(r.status)}
                  <span className="text-xs text-gray-400">{formatDate(r.submittedAt)}</span>
                  <span className="text-gray-400 text-xs">{expanded === r.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded panel */}
              {expanded === r.id && (
                <div className="border-t border-gray-100 px-6 py-5 bg-gray-50 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">문의 내용</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.message}</p>
                  </div>

                  {r.userId && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">사용자 ID</p>
                      <p className="text-sm text-gray-500 font-mono">{r.userId}</p>
                    </div>
                  )}

                  {r.note && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">메모</p>
                      <p className="text-sm text-gray-700">{r.note}</p>
                    </div>
                  )}

                  {r.resolvedBy && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">처리 정보</p>
                      <p className="text-sm text-gray-700">
                        {formatDate(r.resolvedAt)} · {r.resolvedBy}
                      </p>
                    </div>
                  )}

                  {r.status !== 'resolved' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                          메모 (선택)
                        </label>
                        <input
                          type="text"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="처리 메모를 입력하세요"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        {r.status === 'pending' && (
                          <button
                            onClick={() => handleAction(r.id, 'in_progress')}
                            disabled={processing === r.id}
                            className="flex-1 py-2 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors"
                          >
                            {processing === r.id ? '처리 중...' : '⏳ 처리 시작'}
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(r.id, 'resolved')}
                          disabled={processing === r.id}
                          className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {processing === r.id ? '처리 중...' : '✓ 해결 완료'}
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
        <span>{inquiries.length}건 표시</span>
        {loadingMore && <span className="text-blue-600 animate-pulse">불러오는 중...</span>}
        {!hasMore && inquiries.length > 0 && <span>전체 로드 완료</span>}
      </div>

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { getWaves } from '@/lib/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { Wave, WaveStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

const PAGE_SIZE = 30;

type FilterType = 'all' | WaveStatus;

function getStatusBadge(status: WaveStatus) {
  if (status === 'accepted') return <Badge variant="green">수락됨</Badge>;
  if (status === 'declined') return <Badge variant="red">거절됨</Badge>;
  return <Badge variant="yellow">대기 중</Badge>;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function WavesPage() {
  const [waves, setWaves]               = useState<Wave[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(false);
  const [filter, setFilter]             = useState<FilterType>('all');

  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});
  const filterRef   = useRef<FilterType>('all');
  filterRef.current = filter;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const statusArg = filterRef.current === 'all' ? undefined : filterRef.current;
      const { items, lastDoc } = await getWaves(PAGE_SIZE, statusArg, lastDocRef.current);
      lastDocRef.current = lastDoc;
      setWaves((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } catch (err) {
      console.error('[Waves] loadMore failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  loadMoreRef.current = loadMore;

  // Initial / filter-change load
  useEffect(() => {
    setLoading(true);
    setWaves([]);
    lastDocRef.current = null;
    const statusArg = filter === 'all' ? undefined : filter;
    getWaves(PAGE_SIZE, statusArg)
      .then(({ items, lastDoc }) => {
        setWaves(items);
        lastDocRef.current = lastDoc;
        setHasMore(items.length === PAGE_SIZE);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[Waves] query failed:', err);
        setLoading(false);
      });
  }, [filter]);

  // IntersectionObserver (set up once)
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

  const pendingCount  = waves.filter((w) => w.status === 'pending').length;
  const acceptedCount = waves.filter((w) => w.status === 'accepted').length;
  const declinedCount = waves.filter((w) => w.status === 'declined').length;

  return (
    <div>
      <Header
        title="웨이브"
        subtitle={`${waves.length}건 로드됨`}
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'accepted', 'declined'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all'
              ? `전체 (${waves.length})`
              : f === 'pending'
              ? `대기 중 (${pendingCount})`
              : f === 'accepted'
              ? `수락됨 (${acceptedCount})`
              : `거절됨 (${declinedCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : waves.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">👋</p>
          <p>웨이브 없음</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">보낸 사람</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">받은 사람</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">메시지</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">보낸 시간</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">대화</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {waves.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/users/view?id=${w.fromUserId}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {w.fromUserId.slice(0, 10)}...
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/users/view?id=${w.toUserId}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {w.toUserId.slice(0, 10)}...
                      </Link>
                    </td>
                    <td className="px-6 py-4 max-w-[200px]">
                      <p className="text-gray-700 truncate text-xs">{w.message || <span className="text-gray-400 italic">메시지 없음</span>}</p>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(w.status)}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">{formatDate(w.sentAt)}</td>
                    <td className="px-6 py-4">
                      {w.conversationId ? (
                        <span className="text-xs text-green-600 font-medium">연결됨</span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 border-t border-gray-50 text-xs text-gray-400 flex items-center justify-between">
            <span>{waves.length}건 표시</span>
            {loadingMore && <span className="text-green-600 animate-pulse">불러오는 중...</span>}
            {!hasMore && waves.length > 0 && <span>전체 로드 완료</span>}
          </div>
        </div>
      )}

      {/* IntersectionObserver sentinel */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { getConversations } from '@/lib/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { Conversation } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

const PAGE_SIZE = 30;

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [hasMore, setHasMore]             = useState(false);

  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const { items, lastDoc } = await getConversations(PAGE_SIZE, lastDocRef.current);
      lastDocRef.current = lastDoc;
      setConversations((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } catch (err) {
      console.error('[Conversations] loadMore failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  loadMoreRef.current = loadMore;

  // Initial load
  useEffect(() => {
    getConversations(PAGE_SIZE)
      .then(({ items, lastDoc }) => {
        setConversations(items);
        lastDocRef.current = lastDoc;
        setHasMore(items.length === PAGE_SIZE);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[Conversations] query failed:', err);
        setLoading(false);
      });
  }, []);

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

  const blockedCount = conversations.filter((c) => (c.blockedParticipants ?? []).length > 0).length;
  const activeCount  = conversations.filter((c) => c.isActive).length;

  return (
    <div>
      <Header
        title="대화"
        subtitle={`${conversations.length}건 로드됨 · 활성 ${activeCount}건 · 차단 포함 ${blockedCount}건`}
      />

      {loading ? (
        <LoadingSpinner />
      ) : conversations.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">💬</p>
          <p>대화 없음</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">참여자</th>
                  <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">마지막 메시지</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                  <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">마지막 활동</th>
                  <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">생성일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {conversations.map((c) => {
                  const isBlocked = (c.blockedParticipants ?? []).length > 0;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          {c.participants.map((uid) => (
                            <Link
                              key={uid}
                              href={`/dashboard/users/view?id=${uid}`}
                              className="font-mono text-xs text-blue-600 hover:underline"
                            >
                              {uid.slice(0, 8)}…
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2.5 max-w-[240px]">
                        <p className="text-xs text-gray-700 truncate">
                          {c.lastMessage || <span className="text-gray-400 italic">메시지 없음</span>}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        {isBlocked ? (
                          <Badge variant="red">차단 포함</Badge>
                        ) : c.isActive ? (
                          <Badge variant="green">활성</Badge>
                        ) : (
                          <Badge variant="gray">비활성</Badge>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {formatDate(c.lastMessageAt)}
                      </td>
                      <td className="hidden md:table-cell px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {formatDate(c.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2.5 border-t border-gray-50 text-xs text-gray-400 flex items-center justify-between">
            <span>{conversations.length}건 표시</span>
            {loadingMore && <span className="text-green-600 animate-pulse">불러오는 중...</span>}
            {!hasMore && conversations.length > 0 && <span>전체 로드 완료</span>}
          </div>
        </div>
      )}

      {/* IntersectionObserver sentinel */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

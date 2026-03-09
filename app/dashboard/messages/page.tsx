'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSuspiciousMessages } from '@/lib/firestore';
import type { SuspiciousMessage } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<SuspiciousMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'blocked' | 'warning'>('all');

  useEffect(() => {
    // source='message' applied at query level (needs composite index: source ASC + timestamp DESC)
    // If the index isn't deployed yet, Firestore will log a link to create it in the console
    getSuspiciousMessages(100, 'message')
      .then((m) => { setMessages(m); setLoading(false); })
      .catch((err) => { console.error('[Messages] query failed — check console for index link:', err); setLoading(false); });
  }, []);

  const displayed = filter === 'all' ? messages : messages.filter((m) => m.action === filter);

  const blockedCount = messages.filter((m) => m.action === 'blocked').length;
  const warningCount = messages.filter((m) => m.action === 'warning').length;

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Header
        title="의심 채팅 메시지"
        subtitle={`차단 ${blockedCount}건 · 경고 ${warningCount}건 · 전체 ${messages.length}건`}
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-5 text-sm text-blue-700">
        <span className="text-lg">ℹ️</span>
        <div>
          채팅 메시지 필터 로그입니다.
          프로필 이미지·모임 설명 관련 플래그는{' '}
          <Link href="/dashboard/alerts" className="underline font-medium">관리자 알림</Link>
          에서 확인하세요.
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {(['all', 'blocked', 'warning'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? `전체 (${messages.length})` : f === 'blocked' ? `차단됨 (${blockedCount})` : `경고 (${warningCount})`}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">💬</p>
          <p>의심 채팅 메시지 없음</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {displayed.map((msg) => (
              <div key={msg.id} className="px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge variant={msg.action === 'blocked' ? 'red' : 'yellow'}>
                        {msg.action === 'blocked' ? '차단됨' : '경고'}
                      </Badge>
                      <span className="text-xs text-gray-400">{formatDate(msg.timestamp)}</span>
                    </div>

                    {/* Message content */}
                    <div className="bg-gray-50 rounded-xl px-4 py-3 mb-3 border-l-4 border-red-200">
                      <p className="text-sm text-gray-800 break-words">{msg.content}</p>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>사유: {msg.reason}</span>
                      <span>·</span>
                      <Link
                        href={`/dashboard/users/${msg.userId}`}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        👤 {msg.userId.slice(0, 12)}...
                      </Link>
                    </div>

                    {/* Detected issues */}
                    {(msg.detectedIssues ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {msg.detectedIssues!.map((issue, i) => (
                          <span
                            key={i}
                            className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100"
                          >
                            {issue}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 border-t border-gray-50 text-xs text-gray-400">
            {displayed.length}건 표시
          </div>
        </div>
      )}
    </div>
  );
}

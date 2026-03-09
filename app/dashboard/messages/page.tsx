'use client';

import { useEffect, useState } from 'react';
import { getSuspiciousMessages } from '@/lib/firestore';
import type { SuspiciousMessage } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getSourceLabel(source: string) {
  const map: Record<string, string> = {
    message: '채팅 메시지',
    circle: '모임 설명',
    profile_image: '프로필 이미지',
  };
  return map[source] || source;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<SuspiciousMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getSuspiciousMessages(100).then((m) => {
      setMessages(m);
      setLoading(false);
    });
  }, []);

  const displayed = filter === 'all' ? messages : messages.filter((m) => m.action === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Header
        title="의심 메시지"
        subtitle={`총 ${messages.length}건의 필터된 콘텐츠`}
      />

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {['all', 'blocked', 'warning'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? '전체' : f === 'blocked' ? '차단됨' : '경고'}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">💬</p>
          <p>의심 메시지 없음</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {displayed.map((msg) => (
              <div key={msg.id} className="px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge variant={msg.action === 'blocked' ? 'red' : 'yellow'}>
                        {msg.action === 'blocked' ? '차단됨' : '경고'}
                      </Badge>
                      <Badge variant="gray">{getSourceLabel(msg.source)}</Badge>
                      <span className="text-xs text-gray-400">{formatDate(msg.timestamp)}</span>
                    </div>

                    {/* Content */}
                    <div className="bg-gray-50 rounded-xl px-4 py-3 mb-2 border-l-4 border-red-200">
                      <p className="text-sm text-gray-800">{msg.content}</p>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>사유: {msg.reason}</span>
                      <span className="font-mono">사용자: {msg.userId.slice(0, 12)}...</span>
                    </div>

                    {(msg.detectedIssues || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {msg.detectedIssues!.map((issue, i) => (
                          <span key={i} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100">
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

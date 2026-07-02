'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

type Msg = {
  id: string;
  senderId: string;
  content: string;
  type: string;
  sentAt?: number | null;
};

type ConvDetail = {
  conversationId: string;
  participants: string[];
  conversationType: string;
  messages: Msg[];
};

function fmt(ms?: number | null) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function ConversationView() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const [data, setData]       = useState<ConvDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('대화 ID가 없습니다.');
      setLoading(false);
      return;
    }
    fetch(`/api/backend/conversations/${encodeURIComponent(id)}/messages`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<ConvDetail>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.');
        setLoading(false);
      });
  }, [id]);

  // For a 1:1 conversation, left-align the first participant, right-align the other.
  const firstParticipant = data?.participants?.[0];

  return (
    <div>
      <Header title="대화 내용" subtitle={id ? `대화 ${id.slice(0, 8)}…` : ''} />

      <div className="mb-3">
        <Link href="/dashboard/conversations" className="text-xs text-blue-600 hover:underline">
          ← 대화 목록
        </Link>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center py-16 text-red-500 bg-white rounded-2xl border border-red-100">
          <p className="text-4xl mb-2">⚠️</p>
          <p className="font-semibold">대화를 불러오지 못했어요</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      ) : !data || data.messages.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">💬</p>
          <p>메시지 없음</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 border-b border-gray-50 pb-3">
            <span>참여자:</span>
            {data.participants.map((uid) => (
              <Link
                key={uid}
                href={`/dashboard/users/view?id=${uid}`}
                className="font-mono text-blue-600 hover:underline"
              >
                {uid.slice(0, 8)}…
              </Link>
            ))}
            <span className="ml-auto">{data.messages.length}개 메시지</span>
          </div>

          <div className="flex flex-col gap-2">
            {data.messages.map((m) => {
              const isFirst = m.senderId === firstParticipant;
              return (
                <div key={m.id} className={`flex ${isFirst ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[72%] rounded-2xl px-3 py-2 ${
                      isFirst ? 'bg-gray-100 text-gray-800' : 'bg-green-50 text-gray-800'
                    }`}
                  >
                    <p className="text-[10px] font-mono text-gray-400 mb-0.5">
                      {m.senderId ? `${m.senderId.slice(0, 8)}…` : '(시스템)'} · {fmt(m.sentAt)}
                      {m.type !== 'text' ? ` · ${m.type}` : ''}
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {m.content || <span className="italic text-gray-400">(내용 없음)</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConversationViewPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ConversationView />
    </Suspense>
  );
}

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface Message {
  id: string;
  senderId: string;
  content: string;
  sentAt?: Date;
  isRead: boolean;
  isAdminMessage?: boolean;
  templateKey?: string;
}

function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return undefined;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ThreadInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('id') ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetName, setTargetName] = useState<string>('...');
  const [targetUid, setTargetUid] = useState<string>('');
  const [conversationLoaded, setConversationLoaded] = useState(false);

  // Load conversation → resolve the other participant's profile
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        const convSnap = await getDoc(doc(db, 'conversations', conversationId));
        if (!convSnap.exists()) {
          setConversationLoaded(true);
          return;
        }
        const data = convSnap.data();
        const participants = (data.participants as string[]) ?? [];
        const other = participants.find((p) => p !== auth.currentUser?.uid);
        if (other) {
          setTargetUid(other);
          const userSnap = await getDoc(doc(db, 'users', other));
          if (userSnap.exists()) {
            setTargetName((userSnap.data().displayName as string) || '이름 없음');
          }
        }
      } finally {
        setConversationLoaded(true);
      }
    })();
  }, [conversationId]);

  // Real-time messages so read receipts update the moment the user opens the
  // chat in-app. Reverse chronological in Firestore, we reverse client-side
  // for display so newest sits at the bottom of the transcript.
  useEffect(() => {
    if (!conversationId) return;
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('sentAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Message[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            senderId: data.senderId as string,
            content: (data.content as string) ?? '',
            sentAt: toDate(data.sentAt),
            isRead: (data.isRead as boolean | undefined) ?? false,
            isAdminMessage: (data.isAdminMessage as boolean | undefined) ?? false,
            templateKey: data.templateKey as string | undefined,
          };
        });
        setMessages(rows);
        setLoading(false);
      },
      (err) => {
        console.error('[thread] snapshot error:', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>대화 ID가 지정되지 않았습니다.</p>
        <button
          onClick={() => router.push('/dashboard/admin-dms')}
          className="mt-4 text-sm text-green-600 hover:text-green-700"
        >
          ← 목록으로
        </button>
      </div>
    );
  }

  const adminUid = auth.currentUser?.uid;
  const adminMessages = messages.filter((m) => m.senderId === adminUid);
  const targetMessages = messages.filter((m) => m.senderId !== adminUid);
  const readByTarget = adminMessages.filter((m) => m.isRead).length;

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        ← 목록으로
      </button>

      <Header
        title={`대화: ${targetName}`}
        subtitle={
          targetUid
            ? `내가 보낸 ${adminMessages.length}건 · 읽음 ${readByTarget}건 · 상대 답장 ${targetMessages.length}건`
            : '(로드 중...)'
        }
        action={
          targetUid ? (
            <Link
              href={`/dashboard/users/view?id=${targetUid}`}
              className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
            >
              프로필 보기 →
            </Link>
          ) : undefined
        }
      />

      {loading || !conversationLoaded ? (
        <LoadingSpinner />
      ) : messages.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p>메시지가 없어요.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="space-y-4">
            {messages.map((m) => {
              const isAdmin = m.senderId === adminUid;
              return (
                <div
                  key={m.id}
                  className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                      isAdmin
                        ? 'bg-green-50 border border-green-100'
                        : 'bg-gray-50 border border-gray-100'
                    }`}
                  >
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                    <div
                      className={`flex items-center gap-2 mt-2 text-[10px] ${
                        isAdmin ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span className="text-gray-400">{formatDate(m.sentAt)}</span>
                      {isAdmin && (
                        <>
                          {m.templateKey && m.templateKey !== 'custom' && (
                            <span className="font-mono text-gray-400">
                              {m.templateKey}
                            </span>
                          )}
                          {m.isRead ? (
                            <Badge variant="green">읽음</Badge>
                          ) : (
                            <Badge variant="orange">안읽음</Badge>
                          )}
                        </>
                      )}
                    </div>
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

export default function ThreadPage() {
  // Suspense boundary needed because useSearchParams triggers CSR bailout
  // in Next.js 15/16 static analysis. Fallback stays minimal — the inner
  // component owns the real loading state.
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ThreadInner />
    </Suspense>
  );
}

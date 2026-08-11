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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getOfficialAdminUid } from '@/lib/firestore';
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
  const [officialUid, setOfficialUid] = useState<string>('');
  const [conversationLoaded, setConversationLoaded] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Load conversation → resolve the other participant's profile.
  // 상대는 "공식 계정도, 내 세션도 아닌 참가자" — 공식 계정 기준으로 먼저 찾고,
  // 옛 대화(다른 어드민 uid 발신)는 내 세션 uid 기준으로 폴백한다.
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        const official = (await getOfficialAdminUid()) ?? auth.currentUser?.uid ?? '';
        setOfficialUid(official);
        const convSnap = await getDoc(doc(db, 'conversations', conversationId));
        if (!convSnap.exists()) {
          setConversationLoaded(true);
          return;
        }
        const data = convSnap.data();
        const participants = (data.participants as string[]) ?? [];
        const other =
          participants.find(
            (p) => p !== official && p !== auth.currentUser?.uid,
          ) ?? participants.find((p) => p !== auth.currentUser?.uid);
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

  const handleReply = async () => {
    const body = reply.trim();
    if (!body || !targetUid) return;
    setSending(true);
    setSendError(null);
    try {
      const functions = getFunctions(undefined, 'asia-northeast3');
      const sendDm = httpsCallable(functions, 'sendOfficialDm');
      await sendDm({
        targetUserId: targetUid,
        title: '티타에서 안내드립니다',
        body,
        templateKey: 'custom',
      });
      setReply(''); // onSnapshot이 새 메시지를 실시간 반영한다
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

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

  // 어드민 측 = 상대가 보낸 것도, 시스템 메시지도 아닌 전부 (공식 계정 +
  // 과거 다른 어드민 uid 발신을 모두 어드민 말풍선으로 묶는다)
  const adminMessages = messages.filter(
    (m) => m.senderId !== targetUid && m.senderId !== '',
  );
  const targetMessages = messages.filter((m) => m.senderId === targetUid);
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
              const isSystem = m.senderId === '';
              const isAdmin = !isSystem && m.senderId !== targetUid;
              if (isSystem) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className="max-w-[85%] rounded-xl bg-amber-50 border border-amber-100 px-4 py-2 text-xs text-amber-800 whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  </div>
                );
              }
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

      {/* 답장 — 서버 sendOfficialDm이 공식 계정으로 발신 + 푸시까지 처리 */}
      {conversationLoaded && targetUid && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          {sendError && (
            <p className="mb-2 text-sm text-red-600">전송 실패: {sendError}</p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={`${targetName}님에게 공식 계정(${officialUid.slice(0, 8)}…)으로 답장…`}
              rows={2}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <button
              onClick={() => void handleReply()}
              disabled={sending || !reply.trim()}
              className="px-5 py-2.5 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium disabled:opacity-40"
            >
              {sending ? '전송 중…' : '보내기'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            유저 앱 채팅에 저장되고 푸시 알림까지 발송됩니다.
          </p>
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

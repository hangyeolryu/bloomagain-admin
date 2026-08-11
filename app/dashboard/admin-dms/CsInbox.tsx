'use client';

// "티타 문의" CS 수신함 — 앱의 문의 채널(conversationType='bot',
// metadata.botType='advisor') 대화 목록 + 어드민 답장.
//
// 답장은 봇 명의(senderId='ai_advisor_bot')로만 쓴다 — 규칙이 그 조합만
// 허용(사칭 불가). 유저 앱에는 "티타 문의" 말풍선으로 자연스럽게 보이고,
// unreadCounts 갱신으로 채팅 목록 뱃지가 켜지며, sendConversationNotification
// callable로 실제 푸시까지 나간다(실패해도 답장 자체는 남음).

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit as fLimit,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/lib/firebase';
import app from '@/lib/firebase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const BOT_UID = 'ai_advisor_bot';

interface CsThread {
  conversationId: string;
  userUid: string;
  userName: string;
  userDeleted: boolean;
  lastMessage: string;
  lastMessageAt?: Date;
  lastFromUser: boolean; // 마지막 발화가 유저면 "답장 대기"
}

interface CsMessage {
  id: string;
  senderId: string;
  content: string;
  sentAt?: Date;
}

function toDate(v: unknown): Date | undefined {
  return v instanceof Timestamp ? v.toDate() : undefined;
}

function fmt(d?: Date) {
  if (!d) return '';
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CsInboxCard() {
  const [threads, setThreads] = useState<CsThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CsMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'conversations'),
          where('conversationType', '==', 'bot'),
          where('metadata.botType', '==', 'advisor'),
          orderBy('lastMessageAt', 'desc'),
          fLimit(30),
        ),
      );
      const rows: CsThread[] = [];
      for (const d0 of snap.docs) {
        const x = d0.data();
        const userUid = ((x.participants as string[]) ?? []).find((p) => p !== BOT_UID);
        if (!userUid) continue;
        let userName = userUid.slice(0, 8);
        let userDeleted = false;
        try {
          const u = await getDoc(doc(db, 'users', userUid));
          if (u.exists()) {
            userName = (u.data().displayName as string) || userName;
            userDeleted = u.data().isDeleted === true;
          }
        } catch { /* best-effort */ }
        // 마지막 발화 주체 — 유저면 답장 대기로 표시
        let lastFromUser = false;
        try {
          const m = await getDocs(
            query(collection(db, 'conversations', d0.id, 'messages'), orderBy('sentAt', 'desc'), fLimit(1)),
          );
          if (m.size > 0) lastFromUser = m.docs[0].data().senderId === userUid;
        } catch { /* ignore */ }
        rows.push({
          conversationId: d0.id,
          userUid,
          userName,
          userDeleted,
          lastMessage: ((x.lastMessage as string) ?? '').slice(0, 60),
          lastMessageAt: toDate(x.lastMessageAt),
          lastFromUser,
        });
      }
      setThreads(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openThread = useCallback(async (cid: string) => {
    setOpenId(cid);
    setMsgLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'conversations', cid, 'messages'), orderBy('sentAt', 'desc'), fLimit(30)),
      );
      setMessages(
        snap.docs
          .map((m) => ({
            id: m.id,
            senderId: (m.data().senderId as string) ?? '',
            content: (m.data().content as string) ?? '',
            sentAt: toDate(m.data().sentAt),
          }))
          .reverse(),
      );
    } finally {
      setMsgLoading(false);
    }
  }, []);

  async function send(thread: CsThread) {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'conversations', thread.conversationId, 'messages'), {
        senderId: BOT_UID,
        content: text,
        type: 'text',
        sentAt: serverTimestamp(),
        isRead: false,
      });
      await updateDoc(doc(db, 'conversations', thread.conversationId), {
        lastMessage: text.slice(0, 60),
        lastMessageAt: serverTimestamp(),
        [`unreadCounts.${thread.userUid}`]: increment(1),
      });
      // 실제 푸시 — 실패해도 답장은 이미 스레드에 남아 있으므로 무시.
      try {
        const fns = getFunctions(app, 'asia-northeast3');
        await httpsCallable(fns, 'sendConversationNotification')({
          targetUserId: thread.userUid,
          conversationId: thread.conversationId,
          fromUserId: BOT_UID,
          message: text,
        });
      } catch { /* best-effort push */ }
      setDraft('');
      await openThread(thread.conversationId);
      await load();
    } catch (e) {
      alert(`답장 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSending(false);
    }
  }

  const open = threads.find((t) => t.conversationId === openId) ?? null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 mb-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">티타 문의 수신함 (CS)</h2>
        <button onClick={() => void load()} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
          새로고침
        </button>
      </div>
      <p className="text-xs text-gray-400">
        앱의 &ldquo;티타 문의&rdquo; 대화. 답장은 <b>티타 문의(봇) 이름</b>으로 전송되고, 유저에게 푸시가 나가요.
      </p>

      {error && <p className="text-sm text-red-600">쿼리 오류: {error}</p>}
      {loading ? (
        <LoadingSpinner />
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-400">문의 대화가 없어요.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {threads.map((t) => (
            <div key={t.conversationId}>
              <button
                onClick={() => (openId === t.conversationId ? setOpenId(null) : void openThread(t.conversationId))}
                className="w-full flex items-center gap-3 px-2 py-2.5 text-left hover:bg-gray-50 rounded-lg"
              >
                <span className={`shrink-0 w-2 h-2 rounded-full ${t.lastFromUser ? 'bg-red-500' : 'bg-gray-200'}`} />
                <span className="shrink-0 text-sm font-medium text-gray-900">
                  {t.userName}
                  {t.userDeleted && <span className="ml-1 text-xs text-red-500">(탈퇴)</span>}
                </span>
                <span className="flex-1 truncate text-sm text-gray-500">{t.lastMessage}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-400">{fmt(t.lastMessageAt)}</span>
              </button>

              {openId === t.conversationId && (
                <div className="mb-3 ml-5 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  {msgLoading ? (
                    <LoadingSpinner />
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto pb-2">
                      {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.senderId === t.userUid ? 'justify-start' : 'justify-end'}`}>
                          <div
                            className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                              m.senderId === t.userUid ? 'bg-white border border-gray-200 text-gray-800' : 'bg-green-700 text-white'
                            }`}
                          >
                            {m.content}
                            <div className={`mt-1 text-[10px] ${m.senderId === t.userUid ? 'text-gray-400' : 'text-green-100'}`}>
                              {m.senderId === t.userUid ? t.userName : '티타 문의'} · {fmt(m.sentAt)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder="답장 입력 — 티타 문의 이름으로 전송돼요"
                      className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
                    />
                    <button
                      onClick={() => void send(t)}
                      disabled={sending || !draft.trim()}
                      className="shrink-0 rounded-lg bg-green-700 px-4 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {sending ? '전송 중' : '보내기'}
                    </button>
                  </div>
                  {t.userDeleted && (
                    <p className="mt-1.5 text-xs text-amber-600">
                      탈퇴한 회원이에요 — 재설치·재로그인 전에는 답장을 못 볼 수 있어요.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

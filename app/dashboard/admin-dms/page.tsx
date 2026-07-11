'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  orderBy,
  limit as fLimit,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getOfficialAdminUid } from '@/lib/firestore';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// One row per admin-initiated conversation. Read status is derived from the
// most recent admin-authored message in the thread (isRead flag flipped by
// the recipient's chat client). Kept intentionally coarse — per-message
// receipts live on the thread detail page.
interface DmSummary {
  conversationId: string;
  targetUid: string;
  targetDisplayName: string;
  targetPhotoUrl?: string;
  lastMessagePreview: string;
  lastMessageAt?: Date;
  lastAdminMessageRead: boolean | null; // null = no admin message yet
  totalAdminMessages: number;
  templateKey?: string;
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

function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return undefined;
}

async function loadAdminDms(adminUid: string): Promise<DmSummary[]> {
  // Only DMs the admin initiated via the send-message flow carry
  // metadata.source === 'admin_dm'. Filtering server-side keeps this page
  // scoped to admin outreach instead of surfacing the admin's personal chats.
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', adminUid),
    where('metadata.source', '==', 'admin_dm'),
    orderBy('lastMessageAt', 'desc'),
    fLimit(100),
  );

  const snap = await getDocs(q);
  const summaries: DmSummary[] = [];

  for (const convDoc of snap.docs) {
    const data = convDoc.data();
    const participants = (data.participants as string[]) ?? [];
    const targetUid = participants.find((p) => p !== adminUid);
    if (!targetUid) continue;

    // Lookup recipient profile for the row's name/avatar.
    let targetDisplayName = '이름 없음';
    let targetPhotoUrl: string | undefined;
    try {
      const userSnap = await getDoc(doc(db, 'users', targetUid));
      if (userSnap.exists()) {
        const u = userSnap.data();
        targetDisplayName = (u.displayName as string) || '이름 없음';
        targetPhotoUrl = u.photoUrl as string | undefined;
      }
    } catch {
      /* best-effort — leave placeholder */
    }

    // Grab the most recent admin-authored message to derive read state and
    // a running count for the summary badge.
    let lastAdminMessageRead: boolean | null = null;
    let totalAdminMessages = 0;
    try {
      const msgSnap = await getDocs(
        query(
          collection(db, 'conversations', convDoc.id, 'messages'),
          where('senderId', '==', adminUid),
          orderBy('sentAt', 'desc'),
          fLimit(20),
        ),
      );
      totalAdminMessages = msgSnap.size;
      if (msgSnap.size > 0) {
        lastAdminMessageRead =
          (msgSnap.docs[0].data().isRead as boolean | undefined) ?? false;
      }
    } catch {
      /* subcollection query may need an index — non-fatal */
    }

    summaries.push({
      conversationId: convDoc.id,
      targetUid,
      targetDisplayName,
      targetPhotoUrl,
      lastMessagePreview: (data.lastMessage as string) ?? '',
      lastMessageAt: toDate(data.lastMessageAt),
      lastAdminMessageRead,
      totalAdminMessages,
      templateKey: (data.metadata as { templateKey?: string } | undefined)
        ?.templateKey,
    });
  }
  return summaries;
}

export default function AdminDmsPage() {
  const [items, setItems] = useState<DmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  // Auth state comes in asynchronously — wait for the first non-null user,
  // then resolve the OFFICIAL account uid (app_config/official_account).
  // 어떤 어드민 세션으로 로그인했든 대화는 공식 계정 기준으로 모여 보인다.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAdminEmail(u?.email ?? null);
      if (!u) {
        setAdminUid(null);
        return;
      }
      void getOfficialAdminUid().then((official) => {
        setAdminUid(official ?? u.uid);
      });
    });
    return () => unsub();
  }, []);

  const refresh = useCallback(async () => {
    if (!adminUid) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await loadAdminDms(adminUid);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [adminUid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const readCount = items.filter((i) => i.lastAdminMessageRead === true).length;
  const unreadCount = items.filter((i) => i.lastAdminMessageRead === false).length;

  return (
    <div>
      <Header
        title="어드민 DM 관리"
        subtitle={`발신자: ${adminEmail ?? '(로그인 중...)'} · ${items.length}건 · 읽음 ${readCount} · 안읽음 ${unreadCount}`}
        action={
          <button
            onClick={() => void refresh()}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
          >
            새로고침
          </button>
        }
      />

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-5 text-sm text-blue-700">
        <span className="text-lg">ℹ️</span>
        <div>
          모든 어드민 DM은 공식 계정{' '}
          <code className="font-mono text-xs">{adminUid?.slice(0, 12) ?? '…'}</code>
          으로 발신·집계됩니다 — 어떤 계정으로 로그인해도 같은 목록이 보여요.
          (공식 계정 지정: Firestore <code className="font-mono text-xs">app_config/official_account</code>)
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
          쿼리 오류: {error}
          {error.includes('index') && (
            <p className="mt-1 text-xs">
              Firestore 콘솔에서 안내한 링크로 인덱스를 생성해주세요.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-2">📭</p>
          <p>아직 발송한 DM이 없어요.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    수신자
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    마지막 메시지
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    보낸 시간
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    상태
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    보낸 개수
                  </th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.conversationId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-sm font-semibold text-green-700 shrink-0">
                          {item.targetDisplayName[0] ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {item.targetDisplayName}
                          </p>
                          <Link
                            href={`/dashboard/users/view?id=${item.targetUid}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {item.targetUid.slice(0, 12)}…
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-xs text-gray-700 truncate">
                        {item.lastMessagePreview || (
                          <span className="text-gray-400 italic">미리보기 없음</span>
                        )}
                      </p>
                      {item.templateKey && item.templateKey !== 'custom' && (
                        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                          {item.templateKey}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(item.lastMessageAt)}
                    </td>
                    <td className="px-4 py-3">
                      {item.lastAdminMessageRead === null ? (
                        <Badge variant="gray">-</Badge>
                      ) : item.lastAdminMessageRead ? (
                        <Badge variant="green">읽음</Badge>
                      ) : (
                        <Badge variant="orange">안읽음</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                      {item.totalAdminMessages}건
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/admin-dms/thread?id=${item.conversationId}`}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        메시지 내역 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

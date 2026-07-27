'use client';

// 결(moim) 그룹방 열람 — 읽기 전용. '빈 방'이 왜 죽는지 눈으로 보려는 화면이다.
// 1:1 공식 DM 뷰어(admin-dms/thread)와 달리 여기는 어드민이 끼지 않은 3~4명
// 또래 방이라, 발신자를 섞지 않고 각자 말풍선으로 보여주고 답장창도 두지 않는다.
// 핵심 질문 두 가지에 답한다: (1) 무슨 얘기가 오갔나 (2) 누가 읽고도 조용한가.

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logMoimRoomAccess } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import Header from '@/components/layout/Header';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface Msg {
  id: string;
  senderId: string;
  content: string;
  sentAt?: Date;
  type: string;
}
interface Member {
  uid: string;
  name: string;
  spoke: number; // 이 방에서 보낸 메시지 수
  unread: number | null; // 안 읽은 수 (null = 방 문서에 기록 없음)
}

// 발신자 구분용 색 — 참가자 순서대로 옅은 배경/이름색을 배정한다.
const PALETTE = [
  { bg: '#EEF6F1', name: '#1F4E3D', ring: '#CFE3D7' },
  { bg: '#EFF3FA', name: '#2B4E7E', ring: '#D3DEEF' },
  { bg: '#FAF1EC', name: '#8A5A34', ring: '#EAD8C9' },
  { bg: '#F5EFF7', name: '#6B3E86', ring: '#E2D3EA' },
  { bg: '#FBF3E6', name: '#8A6D38', ring: '#EEDFC2' },
];

function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return undefined;
}
function fmt(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function RoomInner() {
  const router = useRouter();
  const conversationId = useSearchParams().get('id') ?? '';
  const { user: adminUser, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [groupName, setGroupName] = useState('결 그룹방');
  const [createdAt, setCreatedAt] = useState<Date | undefined>();
  const [lastAt, setLastAt] = useState<Date | undefined>();
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const loggedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        const convSnap = await getDoc(doc(db, 'conversations', conversationId));
        if (!convSnap.exists()) {
          setNotFound(true);
          return;
        }
        const c = convSnap.data();
        const participants = (c.participants as string[]) ?? [];
        const unreadCounts = (c.unreadCounts as Record<string, number>) ?? {};
        setGroupName((c.metadata?.groupName as string) || '결 그룹방');
        setCreatedAt(toDate(c.createdAt));
        setLastAt(toDate(c.lastMessageAt));

        const msgSnap = await getDocs(
          query(
            collection(db, 'conversations', conversationId, 'messages'),
            orderBy('sentAt', 'asc'),
          ),
        );
        const msgs: Msg[] = msgSnap.docs.map((d) => {
          const m = d.data();
          return {
            id: d.id,
            senderId: (m.senderId as string) ?? '',
            content: (m.content as string) ?? '',
            sentAt: toDate(m.sentAt),
            type: (m.type as string) ?? 'text',
          };
        });
        setMessages(msgs);

        const spokeBy = new Map<string, number>();
        msgs.forEach((m) => {
          if (m.senderId) spokeBy.set(m.senderId, (spokeBy.get(m.senderId) ?? 0) + 1);
        });
        const names = await Promise.all(
          participants.map(async (uid) => {
            try {
              const u = await getDoc(doc(db, 'users', uid));
              return (u.data()?.displayName as string) || '(탈퇴한 회원)';
            } catch {
              return '(조회 실패)';
            }
          }),
        );
        setMembers(
          participants.map((uid, i) => ({
            uid,
            name: names[i],
            spoke: spokeBy.get(uid) ?? 0,
            unread: typeof unreadCounts[uid] === 'number' ? unreadCounts[uid] : null,
          })),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [conversationId]);

  // 열람 감사로그 — 방(내용)을 실제로 연 사실을 방당 한 번 기록한다. 어드민은
  // 이 방의 당사자가 아니므로 누가·언제·어떤 방·누구의 메시지를 봤는지 남긴다.
  useEffect(() => {
    if (loading || notFound || !conversationId) return;
    if (!adminUser?.uid || members.length === 0) return;
    if (loggedRef.current === conversationId) return;
    loggedRef.current = conversationId;
    void logMoimRoomAccess({
      viewerUid: adminUser.uid,
      viewerEmail: adminUser.email ?? null,
      viewerRole: role ?? null,
      conversationId,
      participantUids: members.map((m) => m.uid),
    }).catch((e) => console.error('[moim room] audit log failed:', e));
  }, [loading, notFound, conversationId, adminUser, role, members]);

  if (!conversationId) {
    return <div className="py-16 text-center text-gray-400">방 ID가 없습니다.</div>;
  }

  // 발신자 uid → 팔레트/이름 매핑 (참가자 순서 기준)
  const colorOf = (uid: string) => {
    const idx = members.findIndex((m) => m.uid === uid);
    return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
  };
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name ?? '(?)';

  const memberMsgTotal = members.reduce((s, m) => s + m.spoke, 0);
  const spokeCount = members.filter((m) => m.spoke > 0).length;
  // '읽고 조용' = 다 읽었는데(unread 0) 한마디도 안 함 → 바로 이탈 위험 신호
  const readSilent = members.filter((m) => m.spoke === 0 && m.unread === 0);

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        ← 결 대시보드
      </button>

      <Header
        title={groupName}
        subtitle={
          loading
            ? '(로드 중…)'
            : `${members.length}명 · 멤버 대화 ${memberMsgTotal}건 · 생성 ${fmt(createdAt)} · 마지막 ${fmt(lastAt)}`
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : notFound ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-gray-400">
          방을 찾을 수 없어요. (삭제됐거나 아직 생성 전)
        </div>
      ) : (
        <>
          {/* 멤버별 상태 — 누가 읽고도 조용한지 한눈에 */}
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-gray-900">누가 말하고, 누가 조용한가</h3>
              <span className="text-xs text-gray-500">
                {spokeCount}/{members.length}명 말함
              </span>
            </div>
            {memberMsgTotal === 0 && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                아직 아무도 말하지 않은 <b>빈 방</b>이에요. 아래 시스템 안내만 떠 있어요 —
                아이스브레이커에 아무도 답하지 않았는지 대화록에서 확인해 보세요.
              </p>
            )}
            <ul className="divide-y divide-gray-50">
              {members.map((m) => {
                const c = colorOf(m.uid);
                const badge =
                  m.spoke > 0 ? (
                    <Badge variant="green">말함 {m.spoke}</Badge>
                  ) : m.unread === 0 ? (
                    <Badge variant="orange">읽고 조용</Badge>
                  ) : m.unread && m.unread > 0 ? (
                    <Badge variant="gray">안 읽음 {m.unread}</Badge>
                  ) : (
                    <Badge variant="gray">무응답</Badge>
                  );
                return (
                  <li key={m.uid} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.name }}
                      />
                      <Link
                        href={`/dashboard/users/view?id=${m.uid}`}
                        className="text-sm font-medium text-gray-800 hover:underline"
                      >
                        {m.name}
                      </Link>
                    </span>
                    {badge}
                  </li>
                );
              })}
            </ul>
            {readSilent.length > 0 && memberMsgTotal > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                💡 <b>{readSilent.map((m) => m.name).join(', ')}</b> 님은 다 읽고도 한마디도
                안 했어요 — 무엇이 말문을 막았는지가 개선 포인트예요.
              </p>
            )}
          </div>

          {/* 대화록 */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-gray-400">메시지가 없어요.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  if (!m.senderId || m.type === 'system') {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-xl border border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
                          {m.content}
                          <div className="mt-1 text-[10px] text-amber-400">{fmt(m.sentAt)}</div>
                        </div>
                      </div>
                    );
                  }
                  const c = colorOf(m.senderId);
                  return (
                    <div key={m.id} className="flex flex-col items-start">
                      <span className="mb-0.5 pl-1 text-[11px] font-semibold" style={{ color: c.name }}>
                        {nameOf(m.senderId)}
                      </span>
                      <div
                        className="max-w-[78%] rounded-2xl px-4 py-2.5"
                        style={{ backgroundColor: c.bg, border: `1px solid ${c.ring}` }}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
                          {m.content}
                        </p>
                        <div className="mt-1 text-[10px] text-gray-400">{fmt(m.sentAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="mt-3 text-[11px] text-gray-400">
            읽기 전용이에요. 멤버들의 방이라 어드민이 끼어들지 않아요. · 안전·품질 목적의 열람이며, 접근은 기록됩니다.
          </p>
        </>
      )}
    </div>
  );
}

export default function MoimRoomPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <RoomInner />
    </Suspense>
  );
}

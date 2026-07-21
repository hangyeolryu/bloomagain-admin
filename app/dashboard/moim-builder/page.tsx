'use client';

// 찻자리 수동 편성 (결모임 Wizard of Oz)
// ──────────────────────────────────────────────────────────────────────────
// 메인 컨셉("결이 맞는 3~4명의 찻자리를 자동으로 열어주는 앱")의 초기 운영 도구.
// 자동 감지 배치가 만들어지기 전까지, 파운더가 결이 통할 만한 3~4명을 직접
// 골라 그룹 대화방을 연다 — 유저에겐 자동과 구분되지 않는다 (Wizard of Oz).
//
// 규칙 정합: conversations create는 생성자가 participants에 있어야 하므로
// 현재 로그인한 어드민 계정(= 티타 공식 계정이어야 함)이 방의 참여자로
// 들어간다. 이게 곧 "이 방엔 티타지기가 함께 있어요"의 실체.
// 메시지 senderId도 rules상 본인 uid만 가능 → 환영 메시지는 티타 계정 발신.
//
// 안전: '동성만 보기'(showOppositeGender=false) 멤버가 있으면 혼성 편성을
// 차단한다 — 수동 편성이 앱의 양방향 성별 규칙을 우회하면 안 된다.

import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  collectionGroup,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface Candidate {
  uid: string;
  name: string;
  gender: string | null;
  birthYear: number | null;
  region: string | null;
  interests: string[];
  tagCount: number; // 결큐 태그 수 = 결 데이터 양
  showOppositeGender: boolean;
  hasTicket: boolean; // 티타임 자리표(신청)를 낸 사람 = 실제로 만나고 싶어함
}

const DEFAULT_WELCOME = `반갑습니다, 티타지기예요.

결이 통할 것 같은 분들을 한 자리에 모셨어요. 서두르실 것 없이, 차 한 잔 곁에 두고 천천히 이야기 나눠보세요.

저는 구석에서 조용히 차를 우리고 있을게요. 대화에 끼어들지도, 엿듣고 소문내지도 않아요. 다만 누군가 돈 이야기를 꺼내거나 무례해지면 그때만 살짝 헛기침을 해요.

첫 질문 하나 두고 갈게요 —`;

const ICEBREAKERS = [
  '요즘 하루 중 가장 좋아하는 시간은 언제세요?',
  '최근에 혼자 조용히 웃었던 일이 있다면?',
  '요즘 새로 시작해보고 싶은 게 하나 있다면 뭐예요?',
  '나를 제일 편안하게 만드는 장소는 어디예요?',
  '요즘 자꾸 생각나는 음식이 있나요?',
];

export default function MoimBuilderPage() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('결이 통하는 찻자리');
  const [welcome, setWelcome] = useState(DEFAULT_WELCOME);
  const [icebreaker, setIcebreaker] = useState(ICEBREAKERS[0]);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyTicketHolders, setOnlyTicketHolders] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // 티타임 자리표(신청)를 낸 사람 uid — 실제로 만나고 싶어하는 사람.
        // 자리표 문서 경로: users/{uid}/gyeol_moim_tickets/{id}.
        const ticketHolders = new Set<string>();
        try {
          const ticketSnap = await getDocs(
            query(collectionGroup(db, 'gyeol_moim_tickets'), where('active', '==', true))
          );
          ticketSnap.forEach((d) => {
            const uid = d.ref.parent.parent?.id;
            if (uid) ticketHolders.add(uid);
          });
        } catch {
          /* 자리표 조회 실패해도 편성은 전체 후보로 진행 */
        }

        const snap = await getDocs(
          query(
            collection(db, 'users'),
            where('identityVerified', '==', true),
            limit(300)
          )
        );
        const rows: Candidate[] = [];
        snap.forEach((d) => {
          const u = d.data();
          if (u.isAdmin === true || u.isReviewerAccount === true) return;
          if (u.isDeleted === true) return; // 탈퇴한 회원 제외
          const status = (u.accountStatus as string) ?? '';
          if (
            ['suspended', 'suspended_pending_review', 'restricted', 'blocked',
             'locked', 'shadow_ban', 'shadow_banned', 'blacklisted'].includes(status)
          ) return;
          rows.push({
            uid: d.id,
            name: (u.displayName as string) || (u.name as string) || '(이름 없음)',
            gender: ((u.gender as string) ?? null)?.toLowerCase() ?? null,
            birthYear: (u.yearOfBirth as number) ?? (u.legalBirthYear as number) ?? null,
            region: [u.city, u.district].filter((v) => v && v !== '위치미지정').join(' ') || null,
            interests: (u.interests as string[]) ?? [],
            tagCount: ((u.dailyQuestionTags as string[]) ?? []).length,
            showOppositeGender: (u.showOppositeGender as boolean) ?? true,
            hasTicket: ticketHolders.has(d.id),
          });
        });
        // 자리표 낸 사람 먼저, 그다음 결 데이터 많은 순 — 만나고 싶어하는
        // 사람 + 결큐 열심히 한 사람이 편성 1순위.
        rows.sort(
          (a, b) =>
            Number(b.hasTicket) - Number(a.hasTicket) || b.tagCount - a.tagCount,
        );
        setCandidates(rows);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedUsers = useMemo(
    () => candidates.filter((c) => selected.has(c.uid)),
    [candidates, selected]
  );

  // 선택 멤버 간 공통 관심사 — 편성 판단 보조
  const sharedInterests = useMemo(() => {
    if (selectedUsers.length < 2) return [];
    return selectedUsers.reduce<string[]>(
      (acc, u, i) => (i === 0 ? [...u.interests] : acc.filter((t) => u.interests.includes(t))),
      []
    );
  }, [selectedUsers]);

  // 안전 검증: '동성만 보기' 멤버가 있는 혼성 조합 차단
  const genderViolation = useMemo(() => {
    const genders = new Set(selectedUsers.map((u) => u.gender).filter(Boolean));
    if (genders.size <= 1) return null;
    const strict = selectedUsers.filter((u) => !u.showOppositeGender);
    if (strict.length === 0) return null;
    return `${strict.map((u) => u.name).join(', ')}님은 '동성만 보기' 설정이라 혼성 편성이 불가해요.`;
  }, [selectedUsers]);

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else if (next.size < 4) next.add(uid);
      return next;
    });
  }

  async function createRoom() {
    if (!user) return;
    if (selectedUsers.length < 2 || genderViolation) return;
    setCreating(true);
    setErr(null);
    try {
      const participants = [user.uid, ...selectedUsers.map((u) => u.uid)];
      const fullMessage = `${welcome}\n\n${icebreaker}`;
      const conv = await addDoc(collection(db, 'conversations'), {
        participants,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessage: fullMessage.slice(0, 80),
        conversationType: 'group',
        metadata: {
          groupName,
          moimBuilder: true, // 수동 편성 표식 (지표 분리용)
        },
        isActive: true,
      });
      await addDoc(collection(db, 'conversations', conv.id, 'messages'), {
        senderId: user.uid, // rules: 본인 uid만 가능 — 티타 공식 계정으로 로그인 필수
        content: fullMessage,
        type: 'text',
        sentAt: serverTimestamp(),
        isRead: false,
      });
      setCreatedId(conv.id);
      setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;

  const ticketCount = candidates.filter((c) => c.hasTicket).length;
  const filtered = candidates.filter(
    (c) =>
      (!onlyTicketHolders || c.hasTicket) &&
      (!search || c.name.includes(search) || (c.region ?? '').includes(search))
  );

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <Header
        title="찻자리 편성"
        subtitle="결이 통할 3~4명을 골라 그룹 대화방을 엽니다 (자동 결모임의 수동 운영 — 유저에겐 동일하게 보여요)"
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        현재 로그인 계정(<b>{user?.email}</b>)이 방에 <b>티타지기(참여자)</b>로 들어갑니다.
        반드시 <b>티타 공식 계정</b>으로 로그인한 상태에서 여세요.
      </div>

      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">에러: {err}</div>}
      {createdId && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          찻자리가 열렸어요. 대화 ID: <code>{createdId}</code> —{' '}
          <a className="underline" href={`/dashboard/conversations/view?id=${createdId}`}>대화 보기</a>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 후보 목록 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              후보 ({filtered.length}) · 자리표 낸 분 먼저
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·지역 검색"
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
            />
          </div>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={onlyTicketHolders}
              onChange={(e) => setOnlyTicketHolders(e.target.checked)}
              className="h-3.5 w-3.5 accent-green-600"
            />
            🍵 자리표(티타임 신청) 낸 분만 보기
            <span className="text-gray-400">({ticketCount}명)</span>
          </label>
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((c) => {
              const on = selected.has(c.uid);
              return (
                <button
                  key={c.uid}
                  onClick={() => toggle(c.uid)}
                  className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                    on ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">
                      {c.hasTicket && <span className="mr-1" title="티타임 자리표를 낸 분">🍵</span>}
                      {c.name}
                      <span className="ml-2 font-normal text-gray-500">
                        {c.gender === 'female' ? '여' : c.gender === 'male' ? '남' : '?'}
                        {c.birthYear ? ` · ${new Date().getFullYear() - c.birthYear + 1}세` : ''}
                        {c.region ? ` · ${c.region}` : ''}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-green-700 tabular-nums">
                      결 {c.tagCount}
                      {!c.showOppositeGender && <span className="ml-1 text-amber-600">동성만</span>}
                    </span>
                  </div>
                  {c.interests.length > 0 && (
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {c.interests.slice(0, 6).join(' · ')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 편성 패널 */}
        <section className="space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">
              선택된 멤버 ({selectedUsers.length} / 4)
            </h2>
            {selectedUsers.length === 0 ? (
              <p className="text-sm text-gray-400">왼쪽에서 2~4명을 골라주세요.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((u) => (
                  <span key={u.uid} className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                    {u.name} ✕
                  </span>
                ))}
              </div>
            )}
            {sharedInterests.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                공통 관심사: <b className="text-gray-700">{sharedInterests.join(', ')}</b>
              </p>
            )}
            {genderViolation && (
              <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">
                {genderViolation}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">찻자리 이름</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">티타지기 환영 인사</label>
            <textarea
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">첫 질문 (아이스브레이커)</label>
            <select
              value={icebreaker}
              onChange={(e) => setIcebreaker(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {ICEBREAKERS.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>

          <button
            onClick={createRoom}
            disabled={creating || selectedUsers.length < 2 || !!genderViolation}
            className="w-full rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300"
          >
            {creating ? '여는 중…' : `찻자리 열기 (${selectedUsers.length + 1}명 · 티타지기 포함)`}
          </button>
          <p className="text-xs text-gray-400">
            생성 즉시 멤버 전원의 채팅 목록에 방이 나타나고, 티타지기 인사 + 첫 질문이 게시돼요.
            푸시 알림은 앱의 기존 메시지 알림 경로를 따릅니다.
          </p>
        </section>
      </div>
    </div>
  );
}

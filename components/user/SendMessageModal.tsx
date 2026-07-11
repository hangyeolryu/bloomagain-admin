'use client';

import { useState, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import { auth } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserProfile } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetUser: Pick<UserProfile, 'id' | 'displayName' | 'city' | 'district' | 'yearOfBirth'>;
  onSent?: (result: {
    chatWriteStatus: 'written' | 'failed';
    pushStatus: 'delivered' | 'skipped' | 'failed';
    conversationId?: string;
    error?: string;
  }) => void;
}

// Template keys mirror what the old server route used so the audit trail in
// admin_dms can be interpreted uniformly.
type TemplateKey =
  | 'dating_tone_warning'
  | 'welcome_new_user'
  | 'first_meetup_invite'
  | 'titatime_invite'
  | 'seed_member_thanks'
  | 'custom';

interface TemplateDef {
  key: TemplateKey;
  label: string;
  description: string;
  title: string;
  body: (u: Props['targetUser']) => string;
}

const TEMPLATES: TemplateDef[] = [
  {
    key: 'dating_tone_warning',
    label: '데이팅 톤 프로필 안내',
    description: '키·몸무게·돌싱 같은 데이팅 프로필 문법을 쓴 사용자에게',
    title: '티타 프로필 안내드립니다',
    body: (u) => `${u.displayName || '회원'} 님, 안녕하세요.
티타 만들고 있는 유한결이에요.

가입해주셔서 감사드려요.
프로필 안내드리고 싶어서 연락드립니다.

티타는 만남·데이팅 앱이 아니라
45+ 취미·모임 앱이에요. 여성분들이
안심하고 활동하실 수 있도록 설계했습니다.

프로필의 키·몸무게, 결혼 상태 관련 부분이
데이팅 앱 형식이라 다른 분들에게
오해를 만들 수 있어요.

관심사 중심으로 프로필 다시 써주시면
어떨까요? 이 취미로 모임 만들거나
참여하시면 자연스러운 연결이 될 거예요.

궁금하신 점 있으면 편하게 말씀해주세요.

— 유한결`,
  },
  {
    key: 'welcome_new_user',
    label: '신규 가입 환영 인사',
    description: '갓 가입하신 분에게 co-create voice로 첫 인사',
    title: '티타에 오신 것을 환영해요',
    body: (u) => `${u.displayName || '회원'} 님, 티타 가입해주셔서 감사드려요.

유한결이에요. 45+ 분들이 안심하고
친구·모임 만드는 앱을 만들고 있어요.

베타 단계라 완성도 100% 아니에요.
그래서 ${u.displayName || '회원'} 님 의견이 소중해요.

편하게 둘러보시고, "이건 좋아요"·
"이건 이상해요" 한 줄만 주셔도
다음 버전의 직접 재료가 됩니다.

천천히, 편하실 때.

— 유한결`,
  },
  {
    key: 'first_meetup_invite',
    label: '첫 오프라인 모임 초대',
    description: '시드 멤버에게 첫 차담·산책 모임 초대',
    title: '첫 오프라인 모임에 초대드려요',
    body: (u) => `${u.displayName || '회원'} 님, 안녕하세요. 유한결이에요.

첫 오프라인 모임을 준비하고 있어요.
8-12명 소규모 차담·산책 모임으로,
${u.city ? `${u.city} 근처에서` : '접근하기 좋은 동네에서'} 열려고 해요.

${u.displayName || '회원'} 님 오시면 정말 좋을 것 같아서요.

부담 없이 편하실 때 답 주시면 됩니다.

— 유한결`,
  },
  {
    key: 'titatime_invite',
    label: '티타임 초대 (3~4인)',
    description: '결이 맞는 3~4명 소규모 티타임 초대 (동네·낮·카페)',
    title: '${displayName} 님, 티타임에 초대드려요',
    body: (u) => `${u.displayName || '회원'} 님, 안녕하세요. 티타 운영팀이에요.

${u.district ? `${u.district}에서` : u.city ? `${u.city}에서` : '가까운 동네에서'} 결이 잘 맞는 세 분과
차 한 잔 나누는 작은 자리 "티타임"을 준비했어요.

· 서너 명, 90분, 낮 시간 카페
· 본인인증 된 또래 여성분들만
· 만남·소개가 아니라 편하게 친구 사귀는 자리예요

${u.displayName || '회원'} 님 결큐 답변이 잘 맞는 분들이라
오시면 대화가 잘 통하실 것 같아서요.

혹시 관심 있으시면 편하실 때 답 주세요.
날짜·장소 맞춰서 안내드릴게요 🍵

— 티타 운영팀`,
  },
  {
    key: 'seed_member_thanks',
    label: '시드 멤버 감사 인사',
    description: '주요 시드 사용자에게 감사와 진행 상황 공유',
    title: '${displayName} 님 덕분이에요',
    body: (u) => `${u.displayName || '회원'} 님, 티타 이용해주셔서 정말 감사드려요.

주신 의견들이 다음 버전에 하나씩 반영되고 있어요.
계속 함께해주셔서 감사합니다.

— 유한결`,
  },
  {
    key: 'custom',
    label: '자유 작성',
    description: '위 템플릿에 안 맞는 개별 메시지',
    title: '티타에서 안내드립니다',
    body: () => '',
  },
];

// 대화 생성·메시지 쓰기·푸시는 전부 서버(sendOfficialDm, asia-northeast3)가
// 공식 계정 uid로 수행한다. 클라이언트가 직접 Firestore에 쓰던 이전 구현은
// 로그인 세션 uid가 발신자가 되어 어드민 계정마다 대화가 흩어지는 문제가 있었다.

export default function SendMessageModal({
  isOpen,
  onClose,
  targetUser,
  onSent,
}: Props) {
  const [templateKey, setTemplateKey] = useState<TemplateKey>('dating_tone_warning');
  const [title, setTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [initialised, setInitialised] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    if (!isOpen) {
      setInitialised(false);
      return;
    }
    const tpl = TEMPLATES.find((t) => t.key === templateKey)!;
    setTitle(
      tpl.title.replace('${displayName}', targetUser.displayName || '회원'),
    );
    setMessageBody(tpl.body(targetUser));
    setInitialised(true);
  }, [isOpen, templateKey, targetUser]);

  const handleSend = async () => {
    setError(null);
    if (!title.trim() || !messageBody.trim()) {
      setError('제목과 본문을 모두 입력하세요.');
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('로그인 세션이 만료됐어요. 새로고침 후 다시 시도해주세요.');
      return;
    }
    setSending(true);

    // 발신은 항상 서버의 sendOfficialDm 함수가 "공식 계정" uid로 수행한다 —
    // 어떤 어드민 세션(구글/카카오/이메일)에서 보내도 유저에겐 같은 "티타"
    // 대화 하나로 모이고, 프로필 없는 uid가 발신자로 노출되는 일이 없다.
    try {
      const functions = getFunctions(undefined, 'asia-northeast3');
      const sendDm = httpsCallable(functions, 'sendOfficialDm');
      const res = await sendDm({
        targetUserId: targetUser.id,
        title: title.trim(),
        body: messageBody.trim(),
        templateKey,
      });
      const result = res.data as {
        conversationId: string;
        chatWriteStatus: 'written';
        pushStatus: 'delivered' | 'skipped' | 'failed';
      };
      setSending(false);
      onSent?.({
        chatWriteStatus: result.chatWriteStatus,
        pushStatus: result.pushStatus,
        conversationId: result.conversationId,
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`전송 실패: ${message}`);
      setSending(false);
      onSent?.({ chatWriteStatus: 'failed', pushStatus: 'skipped', error: message });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="사용자에게 DM 보내기">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl px-3 py-2 text-sm">
          <span className="text-gray-500">받는 사람: </span>
          <span className="font-medium text-gray-900">
            {targetUser.displayName || '이름 없음'}
          </span>
          <span className="font-mono text-xs text-gray-400 ml-2">
            {targetUser.id.slice(0, 12)}…
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            템플릿
          </label>
          <select
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value as TemplateKey)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {TEMPLATES.find((t) => t.key === templateKey)!.description}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            알림 제목 (푸시 헤더)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            본문
          </label>
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={12}
            maxLength={2000}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none font-mono"
            placeholder={initialised ? '' : '템플릿을 고르면 자동으로 채워집니다.'}
          />
          <p className="text-xs text-gray-400 mt-1 text-right">
            {messageBody.length} / 2000
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          발신자는 지금 로그인된 어드민 계정이에요. 받는 분 채팅 목록에 그 계정의
          displayName으로 대화가 생성됩니다. 티타 관리자 계정으로 발송하려면
          그 계정으로 로그인한 상태에서 눌러주세요.
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {sending ? '보내는 중...' : '보내기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

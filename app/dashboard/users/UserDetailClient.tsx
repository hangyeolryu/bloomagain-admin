'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, blockUser, unblockUser, updateUserStatus, getUserActivity, logIdentityPiiAccess } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { UserProfile, UserActivity } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import SendMessageModal from '@/components/user/SendMessageModal';

function InfoRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right max-w-[60%]">
        {value === undefined || value === null ? '-' : String(value)}
      </span>
    </div>
  );
}

function ActivityStat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl py-4 px-3 gap-1">
      <span className="text-2xl">{icon}</span>
      <span className="text-xl font-bold text-gray-900">{value}</span>
      <span className="text-xs text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR');
}

function genderLabel(g?: string) {
  if (!g) return '-';
  const v = g.toLowerCase();
  if (['male', 'm', '남', '남성'].includes(v)) return '남성';
  if (['female', 'f', '여', '여성'].includes(v)) return '여성';
  return g;
}

function ageLabel(p: UserProfile) {
  const y = p.yearOfBirth ?? p.legalBirthYear;
  if (!y) return '-';
  return `${y}년생 · ${new Date().getFullYear() - y}세`;
}

function regionLabel(p: UserProfile) {
  if (!p.city && !p.district) return '-';
  return `${p.city ?? ''}${p.district ? ` ${p.district}` : ''}`.trim();
}

/** Mask a legal name, keeping only the first character: 홍길동 → 홍○○, 김민 → 김○. */
function maskName(name?: string | null) {
  if (!name) return name ?? undefined;
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed[0] + '○'.repeat(trimmed.length - 1);
}

export default function UserDetailClient({ id }: { id: string }) {
  const { user: adminUser, role, can } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nameRevealed, setNameRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [modal, setModal] = useState<'block' | 'unblock' | 'suspend' | 'activate' | 'delete' | 'grantFounding' | null>(null);
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const [dmToast, setDmToast] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [grantResult, setGrantResult] = useState<{
    foundingNumber: number | null;
    trialEnd: string | null;
    action: string;
    assignedNow: boolean;
  } | null>(null);

  useEffect(() => {
    getUser(id).then((p) => {
      setProfile(p);
      setLoading(false);
    });
    getUserActivity(id).then((a) => {
      setActivity(a);
      setActivityLoading(false);
    }).catch(() => setActivityLoading(false));
  }, [id]);

  const handleAction = async () => {
    if (!profile || !adminUser) return;
    setActing(true);
    try {
      if (modal === 'block') {
        await blockUser(profile.id, reason, adminUser.uid);
        setProfile((p) => p ? { ...p, isBlacklisted: true, accountStatus: 'blocked', blacklistReason: reason } : p);
      } else if (modal === 'unblock') {
        await unblockUser(profile.id);
        setProfile((p) => p ? { ...p, isBlacklisted: false, accountStatus: 'active' } : p);
      } else if (modal === 'suspend') {
        await updateUserStatus(profile.id, 'suspended');
        setProfile((p) => p ? { ...p, accountStatus: 'suspended' } : p);
      } else if (modal === 'activate') {
        await updateUserStatus(profile.id, 'active');
        setProfile((p) => p ? { ...p, accountStatus: 'active', isBlacklisted: false } : p);
      }
      setModal(null);
      setReason('');
    } finally {
      setActing(false);
    }
  };

  const handleGrantFounding = async () => {
    if (!profile) return;
    setActing(true);
    try {
      const res = await fetch('/api/backend/grant-founding-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id }),
      });
      const data = await res.json() as {
        error?: string;
        founding_member_number?: number | null;
        trial_end?: string | null;
        trial_action?: string;
        assigned_now?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `서버 오류 (${res.status})`);
      }
      setGrantResult({
        foundingNumber: data.founding_member_number ?? null,
        trialEnd: data.trial_end ?? null,
        action: data.trial_action ?? 'unknown',
        assignedNow: data.assigned_now ?? false,
      });
      // Reflect the new badge on the open profile so the operator sees it
      // without a page refresh. The backend has already mirrored to Firestore.
      setProfile((p) =>
        p
          ? {
              ...p,
              founding_member_number:
                data.founding_member_number ?? p.founding_member_number,
              subscription_tier:
                data.trial_action === 'granted_full' ||
                data.trial_action === 'extended'
                  ? 'PREMIUM'
                  : p.subscription_tier,
            }
          : p,
      );
    } catch (err: unknown) {
      alert(`부여 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (!profile) return;
    setActing(true);
    try {
      const res = await fetch('/api/backend/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id }),
      });
      if (!res.ok) {
        let message = `서버 오류 (${res.status})`;
        try {
          const data = await res.json() as { error?: string };
          message = data.error ?? message;
        } catch { /* response was not JSON */ }
        throw new Error(message);
      }
      setModal(null);
      setDeleteConfirmText('');
      router.push('/dashboard/users');
    } catch (err: unknown) {
      alert(`삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActing(false);
    }
  };

  // Reveal the full legal name once, writing a PII-access audit record. The
  // name stays masked (홍○○) until an operator explicitly asks to see it.
  const revealIdentity = async () => {
    if (nameRevealed) return;
    setNameRevealed(true);
    if (!adminUser || !profile) return;
    try {
      await logIdentityPiiAccess({
        viewerUid: adminUser.uid,
        viewerEmail: adminUser.email ?? null,
        viewerRole: role ?? null,
        targetUserId: profile.id,
        fields: ['legalName'],
      });
    } catch (err) {
      // Non-blocking: don't trap the operator if the log write fails.
      console.error('PII access log failed', err);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!profile) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-4xl mb-2">🔍</p>
      <p>사용자를 찾을 수 없습니다.</p>
    </div>
  );

  const isBlocked = profile.isBlacklisted || profile.accountStatus === 'blocked';
  const isSuspended = profile.accountStatus === 'suspended';
  // Legal name is masked (홍○○) until an operator reveals it via revealIdentity.
  const legalNameDisplay = nameRevealed ? profile.legalName : maskName(profile.legalName);

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        ← 목록으로
      </button>

      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-start gap-5">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photoUrl}
              alt={profile.displayName || ''}
              className="w-20 h-20 rounded-2xl object-cover flex-shrink-0 border border-gray-100"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-green-100 flex items-center justify-center text-3xl font-bold text-green-700 flex-shrink-0">
              {profile.displayName?.[0] || '?'}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{profile.displayName || '이름 없음'}</h1>
              {isBlocked && <Badge variant="red">차단됨</Badge>}
              {isSuspended && <Badge variant="orange">정지됨</Badge>}
              {!isBlocked && !isSuspended && <Badge variant="green">활성</Badge>}
              {profile.isAdmin && <Badge variant="blue">관리자</Badge>}
              {profile.founding_member_number != null && (
                <Badge variant="blue">창립 #{profile.founding_member_number}</Badge>
              )}
              {profile.subscription_tier === 'PREMIUM' && (
                <Badge variant="green">Premium</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1 font-mono">{profile.id}</p>
            {profile.legalName && (
              <p className="text-sm text-gray-700 mt-1 flex items-center gap-2 flex-wrap">
                <span>
                  실명 <span className="font-semibold">{legalNameDisplay}</span>
                  {profile.legalBirthYear ? ` · ${profile.legalBirthYear}년생` : ''}
                  {profile.identityVerified ? ' · ✓ 본인인증' : ''}
                </span>
                {!nameRevealed && (
                  <button
                    onClick={revealIdentity}
                    className="text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
                    title="실명 전체를 표시합니다. 이 열람은 감사 로그에 기록됩니다."
                  >
                    🔒 실명 보기
                  </button>
                )}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-1">
              {profile.city}{profile.district ? `, ${profile.district}` : ''} ·{' '}
              {profile.yearOfBirth ? `${new Date().getFullYear() - profile.yearOfBirth}세` : '나이 미상'}
              {profile.email ? ` · ${profile.email}` : ''}
            </p>
            {profile.about && (
              <p className="text-sm text-gray-700 mt-2 italic">&ldquo;{profile.about}&rdquo;</p>
            )}
          </div>

          {/* Action Buttons — manageUsers only */}
          {can('manageUsers') && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setDmModalOpen(true)}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium"
              >
                메시지 보내기
              </button>
              {isBlocked ? (
                <button
                  onClick={() => setModal('unblock')}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium"
                >
                  차단 해제
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setModal('block')}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium"
                  >
                    사용자 차단
                  </button>
                  {!isSuspended ? (
                    <button
                      onClick={() => setModal('suspend')}
                      className="px-4 py-2 text-sm bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-medium"
                    >
                      정지
                    </button>
                  ) : (
                    <button
                      onClick={() => setModal('activate')}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium"
                    >
                      활성화
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => { setGrantResult(null); setModal('grantFounding'); }}
                disabled={!profile.identityVerified}
                title={
                  !profile.identityVerified
                    ? 'NICE 본인인증을 마친 사용자만 부여 가능'
                    : profile.founding_member_number != null
                      ? `현재 #${profile.founding_member_number} — 다시 호출하면 trial 갱신`
                      : '창립 회원 번호(1..500) + 6개월 Premium trial 부여'
                }
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {profile.founding_member_number != null
                  ? 'Trial 갱신'
                  : '창립 회원 부여'}
              </button>
              <button
                onClick={() => { setDeleteConfirmText(''); setModal('delete'); }}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-xl hover:bg-black font-medium"
              >
                계정 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">기본 정보</h2>
          <InfoRow label="실명" value={legalNameDisplay} />
          <InfoRow label="표시 이름" value={profile.displayName} />
          <InfoRow label="이메일" value={profile.email} />
          <InfoRow label="성별" value={genderLabel(profile.gender)} />
          <InfoRow label="생년 / 나이" value={ageLabel(profile)} />
          <InfoRow label="지역" value={regionLabel(profile)} />
          <InfoRow label="가입일" value={formatDate(profile.createdAt)} />
          <InfoRow label="마지막 활동" value={formatDate(profile.lastActiveAt)} />
          <InfoRow label="정보 수정일" value={formatDate(profile.updatedAt)} />
          <InfoRow label="앱 버전" value={profile.appVersion} />
          <InfoRow label="FCM 알림" value={profile.notificationEnabled ? '활성화' : '비활성화'} />
          <InfoRow label="FCM 토큰" value={profile.fcmToken ? '등록됨' : '없음'} />
          <InfoRow label="가입 인증(verified)" value={profile.verified ? '✅ 완료' : '❌ 미완료'} />
          <InfoRow label="관리자" value={profile.isAdmin ? '예' : '아니오'} />
          <InfoRow label="구독 등급" value={profile.subscription_tier || 'FREE'} />
          <InfoRow
            label="창립 회원 번호"
            value={profile.founding_member_number != null ? `#${profile.founding_member_number}` : '-'}
          />
        </div>

        {/* Identity / NICE verification */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">본인인증 (NICE)</h2>
          <InfoRow label="인증 여부" value={profile.identityVerified ? '✅ 인증됨' : '❌ 미인증'} />
          <InfoRow label="인증 상태" value={profile.identityVerificationStatus} />
          <InfoRow label="인증 일시" value={formatDate(profile.identityVerifiedAt)} />
          <InfoRow label="실명" value={legalNameDisplay} />
          <InfoRow label="법적 생년" value={profile.legalBirthYear} />
          <InfoRow label="성별" value={genderLabel(profile.gender)} />
        </div>

        {/* Interests */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">관심사 & 의도</h2>
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-2">관심사</p>
            <div className="flex flex-wrap gap-1.5">
              {(profile.interests || []).length === 0 ? (
                <span className="text-sm text-gray-400">없음</span>
              ) : (
                profile.interests!.map((i) => (
                  <span key={i} className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100">
                    {i}
                  </span>
                ))
              )}
            </div>
          </div>
          <InfoRow label="목적" value={profile.intent === 'friendship' ? '우정' : profile.intent || '-'} />
        </div>

        {/* Security & Status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">보안 & 상태</h2>
          <InfoRow label="계정 상태" value={profile.accountStatus || 'active'} />
          <InfoRow label="블랙리스트" value={profile.isBlacklisted ? '⚠️ 예' : '아니오'} />
          {profile.blacklistReason && <InfoRow label="차단 사유" value={profile.blacklistReason} />}
          {profile.blacklistedAt && <InfoRow label="차단 일시" value={formatDate(profile.blacklistedAt)} />}
          {profile.blacklistedBy && <InfoRow label="차단 처리자" value={profile.blacklistedBy} />}
          <InfoRow label="위험 점수" value={profile.riskScore ?? 0} />
          <InfoRow label="신고 횟수" value={profile.reportCount ?? 0} />
          <InfoRow label="의심 메시지 수" value={profile.suspiciousMessageCount ?? 0} />
          <InfoRow label="로맨스 사기 횟수" value={profile.romanceScamCount ?? 0} />
          <InfoRow label="성매매 유인 횟수" value={profile.sexualSolicitationCount ?? 0} />
          <InfoRow label="행동 이상 점수(vBeh)" value={profile.vBehScore ?? 0} />
        </div>

        {/* Accessibility */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">접근성 설정</h2>
          <InfoRow label="글씨 크기" value={profile.accessibility?.fontSize || '-'} />
          <InfoRow label="큰 텍스트" value={profile.accessibility?.largeTextMode ? '활성화' : '비활성화'} />
          <InfoRow label="음성 안내" value={profile.accessibility?.voiceGuidanceEnabled ? '활성화' : '비활성화'} />
          <InfoRow label="고대비 모드" value={profile.accessibility?.highContrastMode ? '활성화' : '비활성화'} />
          <InfoRow label="손떨림 모드" value={profile.accessibility?.tremorModeEnabled ? '✅ 활성화' : '비활성화'} />
        </div>

        {/* Activity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">활동 현황</h2>
          {activityLoading ? (
            <div className="flex items-center justify-center py-6 text-gray-400 text-sm gap-2">
              <span className="animate-spin">⏳</span> 불러오는 중...
            </div>
          ) : activity ? (
            <>
              {/* Primary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <ActivityStat label="참여 모임" value={activity.circlesJoined} icon="🌿" />
                <ActivityStat label="보낸 웨이브" value={activity.wavesSent} icon="👋" />
                <ActivityStat label="받은 웨이브" value={activity.wavesReceived} icon="💌" />
                <ActivityStat label="대화 수" value={activity.conversationsCount} icon="💬" />
              </div>

              {/* Wave / conversation health breakdown */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-y-2 text-sm">
                <div className="flex justify-between col-span-1 gap-2 border-b border-gray-100 pb-2 sm:border-0 sm:pb-0">
                  <span className="text-gray-500">대기 중 웨이브 (발신)</span>
                  <span className={`font-semibold ${activity.pendingWavesSent > 0 ? 'text-yellow-600' : 'text-gray-700'}`}>
                    {activity.pendingWavesSent}
                  </span>
                </div>
                <div className="flex justify-between col-span-1 gap-2 border-b border-gray-100 pb-2 sm:border-0 sm:pb-0">
                  <span className="text-gray-500">대기 중 웨이브 (수신)</span>
                  <span className={`font-semibold ${activity.pendingWavesReceived > 0 ? 'text-yellow-600' : 'text-gray-700'}`}>
                    {activity.pendingWavesReceived}
                  </span>
                </div>
                <div className="flex justify-between col-span-2 sm:col-span-1 gap-2">
                  <span className="text-gray-500">차단 포함 대화</span>
                  <span className={`font-semibold ${activity.blockedConversations > 0 ? 'text-red-500' : 'text-gray-700'}`}>
                    {activity.blockedConversations}
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {(activity.pendingWavesSent > 0 || activity.pendingWavesReceived > 0) && (
                <p className="text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2 mb-3">
                  ⚠️ 미수락 웨이브가 있습니다. 이 계정을 차단하면 해당 웨이브가 자동으로 삭제됩니다.
                </p>
              )}
              {activity.blockedConversations > 0 && (
                <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
                  🚫 차단된 참여자가 포함된 대화가 있습니다. 앱에서 차단 안내 메시지가 표시됩니다.
                </p>
              )}

              {/* Circle chips */}
              {activity.circleNames.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">참여 모임 목록</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activity.circleNames.map((name) => (
                      <span
                        key={name}
                        className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">활동 데이터를 불러올 수 없습니다.</p>
          )}
        </div>
      </div>

      {/* Action Modal */}
      <Modal
        isOpen={!!modal && modal !== 'delete'}
        onClose={() => { setModal(null); setReason(''); }}
        title={
          modal === 'block' ? '사용자 차단' :
          modal === 'unblock' ? '차단 해제' :
          modal === 'suspend' ? '사용자 정지' : '계정 활성화'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>{profile.displayName}</strong> 계정을{' '}
            {modal === 'block' ? '차단하시겠습니까?' :
             modal === 'unblock' ? '차단 해제하시겠습니까?' :
             modal === 'suspend' ? '정지하시겠습니까?' : '활성화하시겠습니까?'}
          </p>
          {(modal === 'block' || modal === 'suspend') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="처리 사유를 입력하세요..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setModal(null); setReason(''); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleAction}
              disabled={acting}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                modal === 'block' ? 'bg-red-600 hover:bg-red-700' :
                modal === 'suspend' ? 'bg-orange-500 hover:bg-orange-600' :
                'bg-green-600 hover:bg-green-700'
              }`}
            >
              {acting ? '처리 중...' : '확인'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={modal === 'delete'}
        onClose={() => { setModal(null); setDeleteConfirmText(''); }}
        title="계정 영구 삭제"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-800 mb-1">⚠️ 이 작업은 되돌릴 수 없습니다</p>
            <p className="text-sm text-red-700">
              Firebase Auth, Cloud SQL, Firestore에서 <strong>{profile.displayName}</strong> 계정이
              완전히 삭제됩니다.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              확인을 위해 사용자 ID를 입력하세요
            </label>
            <p className="text-xs text-gray-500 font-mono mb-2">{profile.id}</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="사용자 ID 입력..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setModal(null); setDeleteConfirmText(''); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={acting || deleteConfirmText !== profile.id}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gray-900 hover:bg-black transition-colors disabled:opacity-40"
            >
              {acting ? '삭제 중...' : '영구 삭제'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Send DM Modal */}
      <SendMessageModal
        isOpen={dmModalOpen}
        onClose={() => setDmModalOpen(false)}
        targetUser={{
          id: profile.id,
          displayName: profile.displayName,
          city: profile.city,
          yearOfBirth: profile.yearOfBirth,
        }}
        onSent={({ chatWriteStatus, pushStatus, error: err }) => {
          const chatPart =
            chatWriteStatus === 'written' ? '💬 채팅에 저장' : '⚠️ 채팅 저장 실패';
          const pushPart =
            pushStatus === 'delivered'
              ? '· 🔔 푸시 도착'
              : pushStatus === 'skipped'
                ? '· 푸시 건너뜀'
                : '· 🔔 푸시 실패';
          const errPart = err ? ` — ${err.slice(0, 120)}` : '';
          setDmToast(`${chatPart} ${pushPart}${errPart}`.trim());
          setTimeout(() => setDmToast(null), 8000);
        }}
      />

      {/* Toast for DM result */}
      {dmToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-lg text-sm max-w-md">
          {dmToast}
        </div>
      )}

      {/* Founding-member grant Modal */}
      <Modal
        isOpen={modal === 'grantFounding'}
        onClose={() => { setModal(null); setGrantResult(null); }}
        title={
          profile.founding_member_number != null
            ? '창립 회원 trial 갱신'
            : '창립 회원 부여'
        }
      >
        <div className="space-y-4">
          {grantResult ? (
            // After-action result view
            <>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-1.5">
                <p className="text-sm font-semibold text-indigo-900">
                  {grantResult.action === 'cap_reached'
                    ? '⚠️ 창립 회원 정원 도달'
                    : grantResult.assignedNow
                      ? `🎉 창립 #${grantResult.foundingNumber} 부여 완료`
                      : `ℹ️ 이미 #${grantResult.foundingNumber} — trial만 처리`}
                </p>
                <p className="text-xs text-indigo-800">
                  처리 결과: <span className="font-mono">{grantResult.action}</span>
                </p>
                {grantResult.trialEnd && (
                  <p className="text-xs text-indigo-800">
                    Trial 종료: {new Date(grantResult.trialEnd).toLocaleString('ko-KR')}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Postgres + Firestore 모두 반영되었습니다. 사용자 앱은 다음 새로고침에서 변경을 봅니다.
              </p>
              <button
                onClick={() => { setModal(null); setGrantResult(null); }}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gray-900 hover:bg-black"
              >
                확인
              </button>
            </>
          ) : (
            // Pre-action confirmation view
            <>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-indigo-900 mb-1">
                  {profile.founding_member_number != null
                    ? `현재 창립 #${profile.founding_member_number} 보유 중`
                    : '창립 회원 슬롯 1개 소비'}
                </p>
                <p className="text-sm text-indigo-800 leading-relaxed">
                  {profile.founding_member_number != null ? (
                    <>
                      이미 부여된 번호는 그대로 유지되고, 6개월 Premium trial이 <strong>현재 시각 + 180일</strong>로 갱신됩니다.
                      기존 trial이 더 오래 남아있으면 변경되지 않습니다.
                    </>
                  ) : (
                    <>
                      <strong>{profile.displayName}</strong>에게 1..500 중 다음 번호와 <strong>6개월 Premium trial</strong>이 부여됩니다.
                      Trial 시작 시점은 <strong>현재 시각</strong> 기준이며, NICE 인증 시점이 아닙니다 (out-of-band 백필).
                    </>
                  )}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                NICE 인증 완료 시점: {profile.identityVerifiedAt ? formatDate(profile.identityVerifiedAt) : '-'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleGrantFounding}
                  disabled={acting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {acting
                    ? '처리 중...'
                    : profile.founding_member_number != null
                      ? 'Trial 갱신'
                      : '부여하기'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

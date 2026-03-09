'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, blockUser, unblockUser, updateUserStatus } from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { UserProfile } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';

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

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleString('ko-KR');
}

export default function UserDetailClient({ id }: { id: string }) {
  const { user: adminUser, can } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'block' | 'unblock' | 'suspend' | 'activate' | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getUser(id).then((p) => {
      setProfile(p);
      setLoading(false);
    });
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

  if (loading) return <LoadingSpinner />;
  if (!profile) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-4xl mb-2">🔍</p>
      <p>사용자를 찾을 수 없습니다.</p>
    </div>
  );

  const isBlocked = profile.isBlacklisted || profile.accountStatus === 'blocked';
  const isSuspended = profile.accountStatus === 'suspended';

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
          <div className="w-20 h-20 rounded-2xl bg-green-100 flex items-center justify-center text-3xl font-bold text-green-700 flex-shrink-0">
            {profile.displayName?.[0] || '?'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{profile.displayName || '이름 없음'}</h1>
              {isBlocked && <Badge variant="red">차단됨</Badge>}
              {isSuspended && <Badge variant="orange">정지됨</Badge>}
              {!isBlocked && !isSuspended && <Badge variant="green">활성</Badge>}
              {profile.isAdmin && <Badge variant="blue">관리자</Badge>}
            </div>
            <p className="text-sm text-gray-500 mt-1 font-mono">{profile.id}</p>
            <p className="text-sm text-gray-500 mt-1">
              {profile.city}{profile.district ? `, ${profile.district}` : ''} ·{' '}
              {profile.yearOfBirth ? `${new Date().getFullYear() - profile.yearOfBirth}세` : '나이 미상'}
            </p>
            {profile.about && (
              <p className="text-sm text-gray-700 mt-2 italic">"{profile.about}"</p>
            )}
          </div>

          {/* Action Buttons — manageUsers only */}
          {can('manageUsers') && (
            <div className="flex flex-col gap-2">
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
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">기본 정보</h2>
          <InfoRow label="가입일" value={formatDate(profile.createdAt)} />
          <InfoRow label="마지막 활동" value={formatDate(profile.lastActiveAt)} />
          <InfoRow label="앱 버전" value={profile.appVersion} />
          <InfoRow label="FCM 알림" value={profile.notificationEnabled ? '활성화' : '비활성화'} />
          <InfoRow label="인증 완료" value={profile.verified ? '✅ 완료' : '❌ 미완료'} />
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
          <InfoRow label="신고 횟수" value={profile.reportCount ?? 0} />
          <InfoRow label="의심 메시지 수" value={profile.suspiciousMessageCount ?? 0} />
        </div>

        {/* Accessibility */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">접근성 설정</h2>
          <InfoRow label="글씨 크기" value={(profile as any).accessibility?.fontSize || '-'} />
          <InfoRow label="큰 텍스트" value={(profile as any).accessibility?.largeTextMode ? '활성화' : '비활성화'} />
          <InfoRow label="음성 안내" value={(profile as any).accessibility?.voiceGuidanceEnabled ? '활성화' : '비활성화'} />
          <InfoRow label="고대비 모드" value={(profile as any).accessibility?.highContrastMode ? '활성화' : '비활성화'} />
          <InfoRow label="손떨림 모드" value={(profile as any).accessibility?.tremorModeEnabled ? '✅ 활성화' : '비활성화'} />
        </div>
      </div>

      {/* Action Modal */}
      <Modal
        isOpen={!!modal}
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
    </div>
  );
}

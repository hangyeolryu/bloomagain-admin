'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCircle, updateCircle, blockCircle, unblockCircle, deleteCircle,
  removeMemberFromCircle, getUsersByIds, getCircleEvents,
} from '@/lib/firestore';
import { useAuth } from '@/lib/auth-context';
import type { Circle, UserProfile, CircleEvent } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';

type Tab = 'info' | 'members' | 'events';

function formatDate(date?: Date, withTime = false) {
  if (!date) return '-';
  return withTime
    ? date.toLocaleString('ko-KR')
    : date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right max-w-[65%]">
        {value === undefined || value === null ? '-' : String(value)}
      </span>
    </div>
  );
}

export default function CircleDetailClient({ id }: { id: string }) {
  const { user: adminUser, role, can } = useAuth();
  const router = useRouter();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [events, setEvents] = useState<CircleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('info');

  // Modals
  const [blockModal, setBlockModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editMax, setEditMax] = useState('');
  const [acting, setActing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    getCircle(id).then((c) => {
      setCircle(c);
      setLoading(false);
    });
  }, [id]);

  // Load members when tab changes to members
  useEffect(() => {
    if (tab === 'members' && circle && members.length === 0) {
      setMembersLoading(true);
      getUsersByIds(circle.members || []).then((m) => {
        setMembers(m);
        setMembersLoading(false);
      });
    }
  }, [tab, circle]);

  // Load events when tab changes to events
  useEffect(() => {
    if (tab === 'events' && events.length === 0) {
      setEventsLoading(true);
      getCircleEvents(id).then((e) => {
        setEvents(e);
        setEventsLoading(false);
      });
    }
  }, [tab, id]);

  const openEdit = () => {
    if (!circle) return;
    setEditName(circle.name);
    setEditDesc(circle.description || '');
    setEditMax(String(circle.maxMembers || 12));
    setEditModal(true);
  };

  const handleEdit = async () => {
    if (!circle) return;
    setActing(true);
    try {
      const updates = {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        maxMembers: parseInt(editMax) || circle.maxMembers,
      };
      await updateCircle(circle.id, updates);
      setCircle((prev) => prev ? { ...prev, ...updates } : prev);
      setEditModal(false);
    } finally {
      setActing(false);
    }
  };

  const handleBlock = async () => {
    if (!circle || !adminUser) return;
    setActing(true);
    try {
      await blockCircle(circle.id, blockReason, adminUser.uid);
      setCircle((prev) => prev ? { ...prev, isBlocked: true, status: 'blocked', blockedReason: blockReason } : prev);
      setBlockModal(false);
      setBlockReason('');
    } finally {
      setActing(false);
    }
  };

  const handleUnblock = async () => {
    if (!circle) return;
    setActing(true);
    try {
      await unblockCircle(circle.id);
      setCircle((prev) => prev ? { ...prev, isBlocked: false, status: 'active' } : prev);
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (!circle) return;
    if (!confirm(`"${circle.name}" 모임을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setActing(true);
    try {
      await deleteCircle(circle.id);
      router.replace('/dashboard/circles');
    } finally {
      setActing(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!circle) return;
    if (!confirm('이 멤버를 모임에서 제거하시겠습니까?')) return;
    setRemovingId(userId);
    try {
      await removeMemberFromCircle(circle.id, userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      setCircle((prev) => prev ? {
        ...prev,
        members: (prev.members || []).filter((uid) => uid !== userId),
        memberCount: Math.max(0, (prev.memberCount ?? prev.members?.length ?? 0) - 1),
      } : prev);
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!circle) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-4xl mb-2">🔍</p>
      <p>모임을 찾을 수 없습니다.</p>
    </div>
  );

  const memberCount = circle.memberCount ?? (circle.members || []).length;

  return (
    <div className="max-w-4xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        ← 목록으로
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 ${
            circle.isBlocked ? 'bg-red-50' : 'bg-green-100'
          }`}>
            {circle.isBlocked ? '🚫' : '🌿'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-gray-900">{circle.name}</h1>
              {circle.isBlocked
                ? <Badge variant="red">차단됨</Badge>
                : <Badge variant="green">활성</Badge>
              }
            </div>
            <p className="text-sm text-gray-500">
              {circle.city}{circle.district ? `, ${circle.district}` : ''} · 👥 {memberCount}/{circle.maxMembers ?? 12}명
            </p>
            <p className="text-xs text-gray-400 mt-1 font-mono">{circle.id}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {can('manageCircles') && (
              <>
                <button
                  onClick={openEdit}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium"
                >
                  수정
                </button>
                {circle.isBlocked ? (
                  <button
                    onClick={handleUnblock}
                    disabled={acting}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium disabled:opacity-50"
                  >
                    차단 해제
                  </button>
                ) : (
                  <button
                    onClick={() => setBlockModal(true)}
                    className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium"
                  >
                    차단
                  </button>
                )}
              </>
            )}
            {role === 'super_admin' && (
              <button
                onClick={handleDelete}
                disabled={acting}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50"
              >
                삭제
              </button>
            )}
          </div>
        </div>

        {circle.isBlocked && circle.blockedReason && (
          <div className="mt-4 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-sm text-red-700">
            차단 사유: {circle.blockedReason}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {(['info', 'members', 'events'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'info' ? '정보' : t === 'members' ? `멤버 (${memberCount})` : `이벤트`}
          </button>
        ))}
      </div>

      {/* Info Tab */}
      {tab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">기본 정보</h2>
            <InfoRow label="이름" value={circle.name} />
            <InfoRow label="도시" value={circle.city || '-'} />
            <InfoRow label="구역" value={circle.district || '-'} />
            <InfoRow label="최대 인원" value={`${circle.maxMembers ?? 12}명`} />
            <InfoRow label="현재 멤버" value={`${memberCount}명`} />
            <InfoRow label="생성일" value={formatDate(circle.createdAt)} />
            <InfoRow label="최근 수정" value={formatDate(circle.updatedAt)} />
            <div className="flex justify-between py-2.5 border-b border-gray-50">
              <span className="text-sm text-gray-500">생성자 UID</span>
              {circle.createdBy ? (
                can('viewUsers') ? (
                  <a
                    href={`/dashboard/users/view?id=${circle.createdBy}`}
                    className="text-sm text-green-600 hover:underline font-medium font-mono text-right max-w-[65%] truncate"
                    title={circle.createdBy}
                  >
                    {circle.createdBy.slice(0, 16)}…
                  </a>
                ) : (
                  <span className="text-sm text-gray-900 font-mono">{circle.createdBy.slice(0, 16)}…</span>
                )
              ) : (
                <span className="text-sm text-gray-900">-</span>
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">설명 & 관심사</h2>
            {circle.description ? (
              <p className="text-sm text-gray-700 mb-4 leading-relaxed">{circle.description}</p>
            ) : (
              <p className="text-sm text-gray-400 mb-4 italic">설명 없음</p>
            )}
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">관심사</p>
            <div className="flex flex-wrap gap-1.5">
              {(circle.interests || []).length === 0 ? (
                <span className="text-sm text-gray-400">없음</span>
              ) : (
                circle.interests!.map((i) => (
                  <span key={i} className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100">
                    {i}
                  </span>
                ))
              )}
            </div>
            {circle.isBlocked && (
              <div className="mt-4">
                <InfoRow label="차단일" value={formatDate(circle.blockedAt, true)} />
                <InfoRow label="차단 사유" value={circle.blockedReason} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Members Tab */}
      {tab === 'members' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {membersLoading ? (
            <div className="py-12"><LoadingSpinner /></div>
          ) : members.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">👥</p>
              <p>멤버 없음</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">멤버</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">마지막 활동</th>
                    {can('manageCircles') && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">작업</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {members.map((m) => {
                    const isCreator = m.id === circle.createdBy;
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 flex-shrink-0">
                              {m.displayName?.[0] || '?'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-gray-900">{m.displayName || '이름 없음'}</p>
                                {isCreator && (
                                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">방장</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 font-mono">{m.id.slice(0, 12)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {m.isBlacklisted
                            ? <Badge variant="red">차단됨</Badge>
                            : m.accountStatus === 'suspended'
                            ? <Badge variant="orange">정지됨</Badge>
                            : <Badge variant="green">활성</Badge>
                          }
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {formatDate(m.lastActiveAt, false)}
                        </td>
                        {can('manageCircles') && (
                          <td className="px-5 py-3">
                            {!isCreator && (
                              <button
                                onClick={() => handleRemoveMember(m.id)}
                                disabled={removingId === m.id}
                                className="text-xs text-red-600 hover:underline font-medium disabled:opacity-50"
                              >
                                {removingId === m.id ? '처리 중...' : '제거'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
                {members.length}명 표시 (Firestore에서 조회된 프로필 기준)
              </div>
            </>
          )}
        </div>
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {eventsLoading ? (
            <div className="py-12"><LoadingSpinner /></div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">📅</p>
              <p>이벤트 없음</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {events.map((ev) => (
                <div key={ev.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 mb-1">{ev.title}</p>
                      {ev.description && (
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{ev.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        {ev.startAt && (
                          <span>📅 {formatDate(ev.startAt, true)}</span>
                        )}
                        {ev.location && <span>📍 {ev.location}</span>}
                        <span>
                          👥 {ev.attendeeCount ?? (ev.attendees || []).length}
                          {ev.maxAttendees ? `/${ev.maxAttendees}명` : '명 참여'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
                {events.length}개 이벤트
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <Modal isOpen={editModal} onClose={() => setEditModal(false)} title="모임 정보 수정">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">모임 이름</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">최대 인원</label>
            <input
              type="number"
              min={1}
              max={50}
              value={editMax}
              onChange={(e) => setEditMax(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setEditModal(false)}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleEdit}
              disabled={acting || !editName.trim()}
              className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
            >
              {acting ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Block Modal */}
      <Modal isOpen={blockModal} onClose={() => { setBlockModal(false); setBlockReason(''); }} title="모임 차단">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>{circle.name}</strong> 모임을 차단하시겠습니까? 멤버들이 모임에 접근할 수 없게 됩니다.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">차단 사유</label>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="차단 사유를 입력하세요..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setBlockModal(false); setBlockReason(''); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleBlock}
              disabled={acting}
              className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
            >
              {acting ? '처리 중...' : '차단'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

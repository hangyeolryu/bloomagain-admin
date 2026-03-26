'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { getUsers, blockUser, unblockUser, updateUserStatus } from '@/lib/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import type { UserProfile, AccountStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Header from '@/components/layout/Header';

const PAGE_SIZE = 30;

function getStatusBadge(user: UserProfile) {
  if (user.isBlacklisted) return <Badge variant="red">차단됨</Badge>;
  if (user.accountStatus === 'blocked') return <Badge variant="red">차단됨</Badge>;
  if (user.accountStatus === 'suspended') return <Badge variant="orange">정지됨</Badge>;
  if (user.accountStatus === 'restricted') return <Badge variant="yellow">제한됨</Badge>;
  return <Badge variant="green">활성</Badge>;
}

function formatAge(yearOfBirth?: number) {
  if (!yearOfBirth) return '-';
  return `${new Date().getFullYear() - yearOfBirth}세`;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function UsersPage() {
  const { user: adminUser } = useAuth();
  const [allUsers, setAllUsers]         = useState<UserProfile[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(false);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionModal, setActionModal]   = useState<{ user: UserProfile; type: 'block' | 'unblock' | 'suspend' } | null>(null);
  const [reason, setReason]             = useState('');
  const [acting, setActing]             = useState(false);

  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Pre-select status filter from URL param (e.g. ?status=blocked from dashboard card)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status');
    if (s) setStatusFilter(s);
  }, []);

  // ── Load more (stable ref so IntersectionObserver doesn't need to reconnect) ─
  const loadMoreRef = useRef<() => void>(() => {});

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const { items, lastDoc } = await getUsers(PAGE_SIZE, lastDocRef.current);
      lastDocRef.current = lastDoc;
      setAllUsers((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  // Keep ref in sync so the observer always calls the latest version
  loadMoreRef.current = loadMore;

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    getUsers(PAGE_SIZE).then(({ items, lastDoc }) => {
      setAllUsers(items);
      lastDocRef.current = lastDoc;
      setHasMore(items.length === PAGE_SIZE);
      setLoading(false);
    });
  }, []);

  // ── IntersectionObserver (set up once) ────────────────────────────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAction = async () => {
    if (!actionModal || !adminUser) return;
    setActing(true);
    try {
      if (actionModal.type === 'block') {
        await blockUser(actionModal.user.id, reason, adminUser.uid);
      } else if (actionModal.type === 'unblock') {
        await unblockUser(actionModal.user.id);
      } else if (actionModal.type === 'suspend') {
        await updateUserStatus(actionModal.user.id, 'suspended');
      }
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === actionModal.user.id
            ? {
                ...u,
                accountStatus: (actionModal.type === 'unblock' ? 'active' : actionModal.type === 'block' ? 'blocked' : 'suspended') as AccountStatus,
                isBlacklisted: actionModal.type === 'block',
              }
            : u
        )
      );
      setActionModal(null);
      setReason('');
    } finally {
      setActing(false);
    }
  };

  // ── Derived filtered list (client-side, on loaded data) ───────────────────
  const filtered = allUsers.filter((u) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !u.displayName?.toLowerCase().includes(q) &&
        !u.legalName?.toLowerCase().includes(q) &&
        !u.city?.toLowerCase().includes(q) &&
        !u.id.toLowerCase().includes(q)
      ) return false;
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'verified') {
        if (!u.identityVerified) return false;
      } else if (statusFilter === 'unverified') {
        if (u.identityVerified) return false;
      } else if (statusFilter === 'blocked') {
        if (!u.isBlacklisted && u.accountStatus !== 'blocked') return false;
      } else {
        if ((u.accountStatus || 'active') !== statusFilter) return false;
      }
    }
    return true;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <Header
        title="사용자 관리"
        subtitle={`로드된 ${allUsers.length}명 중 ${filtered.length}명 표시`}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="이름, 도시, UID 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="all">전체 상태</option>
          <option value="active">활성</option>
          <option value="suspended">정지됨</option>
          <option value="restricted">제한됨</option>
          <option value="blocked">차단됨</option>
          <option value="verified">본인인증 완료</option>
          <option value="unverified">본인인증 미완료</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">사용자</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">법적 이름 / 본인인증</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">나이/지역</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">관심사</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">가입일</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    검색 결과 없음
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 flex-shrink-0">
                          {u.displayName?.[0] || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{u.displayName || '이름 없음'}</p>
                          <p className="text-xs text-gray-400 font-mono">{u.id.slice(0, 10)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {u.identityVerified ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-gray-900">{u.legalName ?? '-'}</span>
                            <span title="NICE 본인인증 완료" className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                              ✓ 인증
                            </span>
                          </div>
                          {u.legalBirthYear && (
                            <p className="text-xs text-gray-400 mt-0.5">{u.legalBirthYear}년생</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">미인증</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatAge(u.yearOfBirth)} / {u.city || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {(u.interests || []).slice(0, 2).map((i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{i}</span>
                        ))}
                        {(u.interests || []).length > 2 && (
                          <span className="text-xs text-gray-400">+{u.interests!.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(u)}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(u.createdAt)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/users/view?id=${u.id}`}
                          className="text-xs text-green-600 hover:underline font-medium"
                        >
                          상세
                        </Link>
                        {u.isBlacklisted || u.accountStatus === 'blocked' ? (
                          <button
                            onClick={() => setActionModal({ user: u, type: 'unblock' })}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            차단 해제
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setActionModal({ user: u, type: 'suspend' })}
                              className="text-xs text-orange-600 hover:underline font-medium"
                            >
                              정지
                            </button>
                            <button
                              onClick={() => setActionModal({ user: u, type: 'block' })}
                              className="text-xs text-red-600 hover:underline font-medium"
                            >
                              차단
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: scroll sentinel + loading state */}
        <div className="px-6 py-3 border-t border-gray-50 text-xs text-gray-400 flex items-center justify-between">
          <span>{filtered.length}명 표시 중 (로드된 {allUsers.length}명)</span>
          {loadingMore && <span className="text-green-600 animate-pulse">불러오는 중...</span>}
          {!hasMore && allUsers.length > 0 && <span>전체 로드 완료</span>}
        </div>
      </div>

      {/* IntersectionObserver sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Action Modal */}
      <Modal
        isOpen={!!actionModal}
        onClose={() => { setActionModal(null); setReason(''); }}
        title={
          actionModal?.type === 'block' ? '사용자 차단' :
          actionModal?.type === 'unblock' ? '차단 해제' : '사용자 정지'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>{actionModal?.user.displayName}</strong> 사용자를{' '}
            {actionModal?.type === 'block' ? '차단하시겠습니까?' :
             actionModal?.type === 'unblock' ? '차단 해제하시겠습니까?' : '정지하시겠습니까?'}
          </p>
          {actionModal?.type !== 'unblock' && (
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
              onClick={() => { setActionModal(null); setReason(''); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleAction}
              disabled={acting}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${
                actionModal?.type === 'unblock'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : actionModal?.type === 'block'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-orange-500 hover:bg-orange-600'
              } disabled:opacity-50`}
            >
              {acting ? '처리 중...' : '확인'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

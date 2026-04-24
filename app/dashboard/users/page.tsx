'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getUsers, blockUser, unblockUser, updateUserStatus } from '@/lib/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import type { UserProfile, AccountStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Header from '@/components/layout/Header';

const PAGE_SIZE = 30;

// ── PostgreSQL status per user ────────────────────────────────────────────────
interface PgStatus {
  exists: boolean;
  account_status?: string;
  subscription_tier?: string;
}

type PgStatusMap = Record<string, PgStatus>;

interface BackfillPayload {
  userId: string;
  username: string;
  email?: string;
  accountStatus?: string;
  verified?: boolean;
  verifiedName?: string;
  yearOfBirth?: number;
  verifiedAt?: string;   // ISO string
  aiTrainingOptIn?: boolean;
}

/** True if Firestore reflects a completed NICE / identity check (fields may be written partially). */
function isIdentityVerified(u: UserProfile): boolean {
  if (u.identityVerified) return true;
  if (u.identityVerificationStatus === 'verified') return true;
  if (u.identityVerifiedAt) return true;
  return false;
}

function buildBackfillPayload(u: UserProfile): BackfillPayload {
  const payload: BackfillPayload = {
    userId: u.id,
    // Prefer verified legal name, fall back to displayName, then uid
    username: u.legalName || u.displayName || u.id,
    ...(u.email ? { email: u.email } : {}),
    accountStatus: u.accountStatus ?? 'active',
    verified: isIdentityVerified(u),
    ...(u.legalName         ? { verifiedName:    u.legalName }                       : {}),
    ...(u.legalBirthYear    ? { yearOfBirth:      u.legalBirthYear }                 : {}),
    ...(u.identityVerifiedAt ? { verifiedAt:      u.identityVerifiedAt.toISOString() } : {}),
  };
  return payload;
}

async function checkUsersInBackend(userIds: string[]): Promise<PgStatusMap> {
  if (!userIds.length) return {};
  const res = await fetch('/api/backend/check-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_ids: userIds }),
  });
  if (!res.ok) return {};
  return res.json();
}

async function backfillUserInBackend(payload: BackfillPayload): Promise<boolean> {
  const res = await fetch('/api/backend/admin-backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

interface BatchRegisterResult {
  registered: string[];
  already_existed: string[];
  failed: Array<{ userId: string; error: string }>;
}

async function batchBackfillUsersInBackend(
  users: BackfillPayload[]
): Promise<BatchRegisterResult> {
  const res = await fetch('/api/backend/batch-admin-backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users }),
  });
  if (!res.ok) return { registered: [], already_existed: [], failed: [] };
  return res.json();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getStatusBadge(user: UserProfile) {
  if (user.isBlacklisted) return <Badge variant="red">차단됨</Badge>;
  if (user.accountStatus === 'blocked') return <Badge variant="red">차단됨</Badge>;
  if (user.accountStatus === 'suspended') return <Badge variant="orange">정지됨</Badge>;
  if (user.accountStatus === 'restricted') return <Badge variant="yellow">제한됨</Badge>;
  return <Badge variant="green">활성</Badge>;
}

function PgBadge({ status, onRegister }: { status: PgStatus | undefined; onRegister: () => void }) {
  if (!status) {
    return <span className="text-xs text-gray-300 animate-pulse">확인 중…</span>;
  }
  if (status.exists) {
    const tier = status.subscription_tier;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full w-fit">
          <span>DB ✓</span>
        </span>
        {tier && tier !== 'FREE' && (
          <span className="inline-flex text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full w-fit">
            {tier}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full w-fit">
        미등록
      </span>
      <button
        onClick={onRegister}
        className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded-full font-medium transition-colors w-fit"
      >
        등록
      </button>
    </div>
  );
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
  const router = useRouter();
  const [allUsers, setAllUsers]         = useState<UserProfile[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(false);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionModal, setActionModal]   = useState<{ user: UserProfile; type: 'block' | 'unblock' | 'suspend' } | null>(null);
  const [reason, setReason]             = useState('');
  const [acting, setActing]             = useState(false);

  // ── PostgreSQL status ──────────────────────────────────────────────────────
  // null  = not yet fetched for this uid
  // PgStatus = fetched result
  const [pgStatus, setPgStatus]         = useState<PgStatusMap>({});
  const [pgChecking, setPgChecking]     = useState(false);
  const [bulkRegistering, setBulkRegistering] = useState(false);
  // Track which UIDs we've already sent to batch-check so we don't re-fetch on render.
  const checkedUidsRef = useRef<Set<string>>(new Set());

  const lastDocRef  = useRef<QueryDocumentSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Pre-select status filter from URL param (e.g. ?status=blocked from dashboard card)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status');
    if (s) setStatusFilter(s);
  }, []);

  // ── Batch-check new users against backend ────────────────────────────────
  const checkNewUsers = useCallback(async (users: UserProfile[]) => {
    const unchecked = users.filter((u) => !checkedUidsRef.current.has(u.id));
    if (!unchecked.length) return;
    unchecked.forEach((u) => checkedUidsRef.current.add(u.id));
    setPgChecking(true);
    try {
      const result = await checkUsersInBackend(unchecked.map((u) => u.id));
      setPgStatus((prev) => ({ ...prev, ...result }));
    } finally {
      setPgChecking(false);
    }
  }, []);

  // ── Load more ─────────────────────────────────────────────────────────────
  const loadMoreRef = useRef<() => void>(() => {});
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const { items, lastDoc } = await getUsers(PAGE_SIZE, lastDocRef.current);
      lastDocRef.current = lastDoc;
      setAllUsers((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      await checkNewUsers(items);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, checkNewUsers]);
  loadMoreRef.current = loadMore;

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    getUsers(PAGE_SIZE).then(async ({ items, lastDoc }) => {
      setAllUsers(items);
      lastDocRef.current = lastDoc;
      setHasMore(items.length === PAGE_SIZE);
      setLoading(false);
      await checkNewUsers(items);
    });
  }, [checkNewUsers]);

  // ── IntersectionObserver ──────────────────────────────────────────────────
  // Must run after initial load: while `loading` is true we only render a spinner,
  // so the sentinel is not mounted on the first effect pass ([] deps would never attach).
  useEffect(() => {
    if (loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  // ── Register single user in backend ──────────────────────────────────────
  const handleRegisterUser = async (u: UserProfile) => {
    const ok = await backfillUserInBackend(buildBackfillPayload(u));
    if (ok) {
      setPgStatus((prev) => ({
        ...prev,
        [u.id]: {
          exists: true,
          account_status: u.accountStatus ?? 'active',
          subscription_tier: 'FREE',
        },
      }));
    }
  };

  // ── Bulk-register all missing users in the current loaded batch ───────────
  // Uses a single batch endpoint (no N parallel requests → no rate-limit issues).
  const missingUsers = allUsers.filter((u) => pgStatus[u.id]?.exists === false);
  const handleBulkRegister = async () => {
    if (!missingUsers.length) return;
    setBulkRegistering(true);
    try {
      const payload = missingUsers.map(buildBackfillPayload);
      const result = await batchBackfillUsersInBackend(payload);
      // Mark all successfully registered or already-existed users as present.
      const nowPresent = new Set([...result.registered, ...result.already_existed]);
      setPgStatus((prev) => {
        const next = { ...prev };
        for (const uid of nowPresent) {
          const u = missingUsers.find((x) => x.id === uid);
          next[uid] = {
            exists: true,
            account_status: u?.accountStatus ?? 'active',
            subscription_tier: 'FREE',
          };
        }
        return next;
      });
    } finally {
      setBulkRegistering(false);
    }
  };

  // ── Re-check all loaded users (manual refresh) ───────────────────────────
  const handleRecheck = async () => {
    checkedUidsRef.current.clear();
    setPgStatus({});
    await checkNewUsers(allUsers);
  };

  // ── Moderation actions ────────────────────────────────────────────────────
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

  // ── Derived filtered list ─────────────────────────────────────────────────
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
        if (!isIdentityVerified(u)) return false;
      } else if (statusFilter === 'unverified') {
        if (isIdentityVerified(u)) return false;
      } else if (statusFilter === 'blocked') {
        if (!u.isBlacklisted && u.accountStatus !== 'blocked') return false;
      } else if (statusFilter === 'pg_missing') {
        if (pgStatus[u.id]?.exists !== false) return false;
      } else {
        if ((u.accountStatus || 'active') !== statusFilter) return false;
      }
    }
    return true;
  });

  if (loading) return <LoadingSpinner />;

  const checkedCount  = Object.keys(pgStatus).length;
  const missingCount  = missingUsers.length;

  return (
    <div>
      <Header
        title="사용자 관리"
        subtitle={`로드된 ${allUsers.length}명 중 ${filtered.length}명 표시`}
      />

      {/* PostgreSQL status banner */}
      {checkedCount > 0 && missingCount > 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <span className="text-base">⚠️</span>
            <span>
              <strong>{missingCount}명</strong>이 PostgreSQL에 미등록 상태입니다
              {checkedCount < allUsers.length && ` (${checkedCount}명 확인 완료)`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkRegister}
              disabled={bulkRegistering}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {bulkRegistering ? '등록 중…' : `미등록 ${missingCount}명 모두 등록`}
            </button>
          </div>
        </div>
      )}

      {/* DB sync info bar */}
      {checkedCount > 0 && missingCount === 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm text-emerald-700">
            ✓ 로드된 {checkedCount}명 전원 PostgreSQL에 등록됨
          </span>
          <button
            onClick={handleRecheck}
            disabled={pgChecking}
            className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
          >
            {pgChecking ? '확인 중…' : '새로 고침'}
          </button>
        </div>
      )}

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
          <option value="pg_missing">⚠ PostgreSQL 미등록</option>
        </select>
        <button
          onClick={handleRecheck}
          disabled={pgChecking}
          title="PostgreSQL 상태 재확인"
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {pgChecking ? 'DB 확인 중…' : 'DB 재확인'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">사용자</th>
                <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">법적 이름</th>
                <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">나이/지역</th>
                <th className="hidden lg:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">관심사</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">DB</th>
                <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">가입일</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    검색 결과 없음
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/users/view?id=${u.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 flex-shrink-0">
                          {u.displayName?.[0] || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm leading-tight">{u.displayName || '이름 없음'}</p>
                          <p className="text-xs text-gray-400 font-mono">{u.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-2.5">
                      {isIdentityVerified(u) ? (
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-gray-900">{u.legalName ?? '-'}</span>
                            <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">✓</span>
                          </div>
                          {u.legalBirthYear && (
                            <p className="text-xs text-gray-400">{u.legalBirthYear}년생</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">미인증</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-2.5 text-xs text-gray-600">
                      {formatAge(u.yearOfBirth)} / {u.city || '-'}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(u.interests || []).slice(0, 2).map((i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{i}</span>
                        ))}
                        {(u.interests || []).length > 2 && (
                          <span className="text-xs text-gray-400">+{u.interests!.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{getStatusBadge(u)}</td>
                    <td className="hidden sm:table-cell px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <PgBadge
                        status={pgStatus[u.id]}
                        onRegister={() => handleRegisterUser(u)}
                      />
                    </td>
                    <td className="hidden md:table-cell px-4 py-2.5 text-xs text-gray-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/users/view?id=${u.id}`}
                          className="text-xs text-green-600 hover:underline font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          상세
                        </Link>
                        {u.isBlacklisted || u.accountStatus === 'blocked' ? (
                          <button
                            onClick={() => setActionModal({ user: u, type: 'unblock' })}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            해제
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

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-50 text-xs text-gray-400 flex items-center justify-between">
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

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUsers, blockUser, unblockUser, updateUserStatus, getUserActivitySummaries, type UserSortKey, type UserActivitySummary } from '@/lib/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import Toast, { type ToastState } from '@/components/ui/Toast';
import type { UserProfile, AccountStatus } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Header from '@/components/layout/Header';
import { versionStatus, VERSION_STATUS_DOT, VERSION_STATUS_TEXT, VERSION_STATUS_LABEL, LATEST_APP_VERSION, normalizePlatform, platformFromAppAgent, PLATFORM_EMOJI, PLATFORM_LABEL } from '@/lib/app-version';
import { activityTier, activityRatio, ACTIVITY_TIER_META } from '@/lib/activity-heat';

const PAGE_SIZE = 30;

// ── PostgreSQL status per user ────────────────────────────────────────────────
interface PgStatus {
  exists: boolean;
  account_status?: string;
  subscription_tier?: string;
  founding_member_number?: number | null;
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

function formatAge(yearOfBirth?: number) {
  if (!yearOfBirth) return '-';
  return `${new Date().getFullYear() - yearOfBirth}세`;
}

function formatDate(date?: Date) {
  if (!date) return '-';
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}

function formatGender(gender?: string) {
  if (gender === 'male') return '남';
  if (gender === 'female') return '여';
  return '-';
}

/** Compact relative-time formatter for the "마지막 접속" column. Falls back to
 *  absolute date for anything over ~30 days so the admin can spot truly
 *  dormant users at a glance without doing mental math. */
function formatRelativeTime(date?: Date) {
  if (!date) return '-';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return formatDate(date);
}

const ACTIVITY_WINDOW_DAYS = 30;

/**
 * 30일 활동 온도계. 활동일 수로 색을 정하고, 막대로 30일 중 몇 칸인지 보여준다.
 * 세션 수(하트비트)는 곁들이는 정보라 회색으로 눌러 둔다 — 색의 근거는 활동일뿐.
 */
function ActivityHeat({ summary }: { summary?: UserActivitySummary }) {
  const days = summary?.activeDays ?? 0;
  const tier = summary ? activityTier(days, ACTIVITY_WINDOW_DAYS) : 'none';
  const meta = ACTIVITY_TIER_META[tier];
  const pct  = Math.round(activityRatio(days, ACTIVITY_WINDOW_DAYS) * 100);

  return (
    <span
      className="inline-flex flex-col gap-1 min-w-[84px]"
      title={
        summary
          ? `${meta.label} — 최근 ${ACTIVITY_WINDOW_DAYS}일 중 ${days}일 접속 · 세션 ${summary.heartbeats}회(근사치)`
          : '활동 기록 없음 — 안 왔다는 뜻이 아니라 하트비트가 안 잡힌 것'
      }
    >
      <span className={`inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 text-xs leading-none ${meta.pillClass}`}>
        <span className="font-bold tabular-nums">{summary ? days : '-'}</span>
        <span className="text-[10px] opacity-70">일</span>
        {summary && (
          <span className="text-[10px] opacity-60 tabular-nums">· {summary.heartbeats}회</span>
        )}
      </span>
      <span className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
        <span className={`block h-full rounded-full ${meta.barClass}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/**
 * 앱 버전 한 칸. 이모지로 플랫폼(iOS/안드로이드), 점 색으로 최신/구버전/테스트빌드.
 * 값 출처는 users.appVersion(하트비트가 갱신) → 없으면 users.device.appVersion.
 * 플랫폼은 device.platform이 없으면 appAgent 괄호에서 뽑는다(둘 다 같은 시점에
 * 쓰이지만 옛 문서엔 한쪽만 있는 경우가 있다).
 */
function AppVersionCell({ user }: { user: UserProfile }) {
  const version = user.appVersion ?? user.device?.appVersion;
  const build   = user.buildNumber ?? user.device?.buildNumber;
  const status  = versionStatus(version);
  const dev     = user.device;

  const fromDevice = normalizePlatform(dev?.platform);
  const platform   = fromDevice === 'unknown' ? platformFromAppAgent(user.appAgent) : fromDevice;

  const detail = [
    PLATFORM_LABEL[platform],
    version ? `${version}${build ? `+${build}` : ''}` : '버전 기록 없음',
    VERSION_STATUS_LABEL[status].label,
    [dev?.model, dev?.osVersion].filter(Boolean).join(' · '),
  ].filter(Boolean).join(' — ');

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={detail}>
      <span className="text-[13px] leading-none flex-shrink-0" role="img" aria-label={PLATFORM_LABEL[platform]}>
        {PLATFORM_EMOJI[platform]}
      </span>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${VERSION_STATUS_DOT[status]}`} />
      <span className={`tabular-nums ${VERSION_STATUS_TEXT[status]}`}>{version ?? '-'}</span>
    </span>
  );
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
  // Server-side sort. Changing this resets the cursor and reloads page 1 —
  // mixing rows fetched under different orderings would scramble the
  // infinite-scroll order.
  const [sortBy, setSortBy]             = useState<UserSortKey>('createdAt');
  // 기본은 본인인증 완료자만(서버 필터). 미인증까지 봐야 할 때만 체크를 푼다.
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [actionModal, setActionModal]   = useState<{ user: UserProfile; type: 'block' | 'unblock' | 'suspend' } | null>(null);
  const [reason, setReason]             = useState('');
  const [acting, setActing]             = useState(false);
  const [toast, setToast]               = useState<ToastState | null>(null);

  // 최근 30일 활동 요약(uid → 활동일·하트비트). 페이지네이션과 무관하게
  // 한 번만 불러온다 — collectionGroup 윈도우 쿼리 한 방이라 행마다
  // 서브컬렉션을 긁는 것보다 훨씬 싸다.
  const [activity, setActivity] = useState<Record<string, UserActivitySummary>>({});
  useEffect(() => {
    getUserActivitySummaries(30).then(setActivity);
  }, []);

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
      const { items, lastDoc } = await getUsers(PAGE_SIZE, lastDocRef.current, sortBy, verifiedOnly);
      lastDocRef.current = lastDoc;
      setAllUsers((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      await checkNewUsers(items);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, checkNewUsers, sortBy, verifiedOnly]);
  loadMoreRef.current = loadMore;

  // ── Initial load + sort change ────────────────────────────────────────────
  // Re-runs whenever sortBy flips. Resets the cursor + list so we don't
  // interleave rows from a previous ordering with the new one (would scramble
  // the infinite-scroll order and double-show some users).
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    lastDocRef.current = null;
    setAllUsers([]);
    getUsers(PAGE_SIZE, undefined, sortBy, verifiedOnly)
      .then(async ({ items, lastDoc }) => {
        setAllUsers(items);
        lastDocRef.current = lastDoc;
        setHasMore(items.length === PAGE_SIZE);
        setLoading(false);
        await checkNewUsers(items);
      })
      .catch((e) => {
        // 인증자 필터는 복합 인덱스가 필요하다 — 없으면 여기로 떨어지고,
        // 메시지 안에 콘솔 생성 링크가 들어 있다. 0건으로 위장하지 않는다.
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [checkNewUsers, sortBy, verifiedOnly]);

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
        const { warnings } = await blockUser(actionModal.user.id, reason, adminUser.uid);
        setToast(warnings.length
          ? { kind: 'warning', title: '차단은 됐지만 후처리가 일부 실패했어요',
              details: warnings.map((w) => `${w.label}: ${w.message}`) }
          : { kind: 'success', title: '차단하고 정리까지 마쳤어요' });
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
        !u.district?.toLowerCase().includes(q) &&
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
      <Toast toast={toast} onClose={() => setToast(null)} />
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
        {/* 모바일에서 컨트롤 하나가 한 줄씩 다 먹지 않게 — 좁으면 감싸며 흐른다 */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white cursor-pointer whitespace-nowrap select-none"
          title="기본은 본인인증 완료 회원만 서버에서 필터해 불러옵니다"
        >
          <input
            type="checkbox"
            checked={!verifiedOnly}
            onChange={(e) => setVerifiedOnly(!e.target.checked)}
            className="accent-green-600"
          />
          <span className="text-gray-600">미인증 포함</span>
        </label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            // 서버가 인증자만 주고 있는데 '미인증'을 고르면 영원히 빈 목록 —
            // 이 조합은 함정이라 필터를 자동으로 풀어준다.
            if (e.target.value === 'unverified') setVerifiedOnly(false);
          }}
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
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as UserSortKey)}
          title="정렬 기준 — 변경하면 목록이 처음부터 다시 로드됩니다"
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="createdAt">가입일 (최신순)</option>
          <option value="lastActiveAt">마지막 접속 (최근순)</option>
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
      </div>

      {loadError && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">목록을 불러오지 못했어요</p>
          <p className="mt-1 break-all whitespace-pre-wrap font-mono text-xs text-amber-700">{loadError}</p>
          {loadError.match(/https?:\/\/\S+/) && (
            <a
              href={loadError.match(/https?:\/\/\S+/)![0]}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-amber-900 underline"
            >
              인덱스 만들러 가기 →
            </a>
          )}
        </div>
      )}

      {/* Table (md+) / Card list (mobile) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* 모바일: 열을 숨겨 이름·상태만 남던 테이블 대신, 한 사람이 한 장으로
            읽히는 카드 목록. 데이터는 같은 filtered를 그대로 쓴다. */}
        <div className="md:hidden divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">검색 결과 없음</p>
          ) : (
            filtered.map((u) => (
              <div
                key={u.id}
                className="px-4 py-3 active:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/dashboard/users/view?id=${u.id}`)}
              >
                <div className="flex items-center gap-3">
                  {u.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.photoUrl}
                      alt={u.displayName || '프로필'}
                      className="w-11 h-11 rounded-full object-cover flex-shrink-0 bg-green-100"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center text-base font-bold text-green-700 flex-shrink-0">
                      {u.displayName?.[0] || '?'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{u.displayName || '이름 없음'}</span>
                      {pgStatus[u.id]?.founding_member_number != null && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full tabular-nums">
                          #{String(pgStatus[u.id].founding_member_number).padStart(3, '0')}
                        </span>
                      )}
                      {getStatusBadge(u)}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {formatAge(u.yearOfBirth)} {formatGender(u.gender)} / {[u.city, u.district].filter(Boolean).join(' ') || '-'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400 pl-14 flex-wrap">
                  <span>가입 {formatDate(u.createdAt)}</span>
                  <span>접속 {formatRelativeTime(u.lastActiveAt)}</span>
                  <span className="text-[11px]"><AppVersionCell user={u} /></span>
                </div>
                <div className="mt-1.5 pl-14">
                  <ActivityHeat summary={activity[u.id]} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">사용자</th>
                <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">법적 이름</th>
                <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" title="창립회원 가입 번호 (PostgreSQL)">창립</th>
                <th className="hidden sm:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">나이·성별/지역</th>
                <th className="hidden lg:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">자기소개</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => setSortBy('createdAt')}
                    className={
                      'hover:text-gray-900 transition-colors ' +
                      (sortBy === 'createdAt' ? 'text-green-700 font-bold' : '')
                    }
                  >
                    가입일{sortBy === 'createdAt' ? ' ↓' : ''}
                  </button>
                </th>
                <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" title="최근 30일 — 앱을 연 날 수 · 세션 수(30분 하트비트 합, 근사치). 색은 활동일 기준: 빨강(이탈 위험) → 주황 → 노랑 → 초록 → 보라(거의 매일)">
                  30일 활동
                </th>
                <th className="hidden lg:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" title={`마지막 접속 시점의 플랫폼과 앱 버전. 🍎=iOS · 🤖=안드로이드 · 🌐=웹/데스크톱 · ❔=기록 없음. 점 색은 초록=최신(${LATEST_APP_VERSION}) · 주황=구버전 · 파랑=테스트 빌드 · 회색=기록 없음`}>
                  앱 버전
                </th>
                <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => setSortBy('lastActiveAt')}
                    className={
                      'hover:text-gray-900 transition-colors ' +
                      (sortBy === 'lastActiveAt' ? 'text-green-700 font-bold' : '')
                    }
                  >
                    마지막 접속{sortBy === 'lastActiveAt' ? ' ↓' : ''}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
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
                        {u.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.photoUrl}
                            alt={u.displayName || '프로필'}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-green-100"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 flex-shrink-0">
                            {u.displayName?.[0] || '?'}
                          </div>
                        )}
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
                    <td className="hidden sm:table-cell px-4 py-2.5">
                      {pgStatus[u.id]?.founding_member_number != null ? (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full tabular-nums">
                          #{String(pgStatus[u.id].founding_member_number).padStart(3, '0')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                      {formatAge(u.yearOfBirth)} {formatGender(u.gender)} / {[u.city, u.district].filter(Boolean).join(' ') || '-'}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-2.5 max-w-xs">
                      {u.about ? (
                        <p className="text-xs text-gray-600 line-clamp-2" title={u.about}>{u.about}</p>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{getStatusBadge(u)}</td>
                    <td className="hidden md:table-cell px-4 py-2.5 text-xs text-gray-500">{formatDate(u.createdAt)}</td>
                    <td className="hidden md:table-cell px-4 py-2.5 text-xs whitespace-nowrap">
                      <ActivityHeat summary={activity[u.id]} />
                    </td>
                    <td className="hidden lg:table-cell px-4 py-2.5 text-xs">
                      <AppVersionCell user={u} />
                    </td>
                    <td
                      className="hidden md:table-cell px-4 py-2.5 text-xs text-gray-500"
                      title={u.lastActiveAt ? u.lastActiveAt.toLocaleString('ko-KR') : undefined}
                    >
                      {formatRelativeTime(u.lastActiveAt)}
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

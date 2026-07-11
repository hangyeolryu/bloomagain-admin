import {
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  startAfter,
  updateDoc,
  Timestamp,
  onSnapshot,
  QuerySnapshot,
  QueryDocumentSnapshot,
  DocumentData,
  arrayRemove,
  arrayUnion,
  increment,
  documentId,
  getCountFromServer,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

// Cursor-based pagination result
export type PaginatedResult<T> = {
  items: T[];
  lastDoc: QueryDocumentSnapshot | null;
};
import { db } from './firebase';
import type { AdminRole, UserProfile, Circle, CircleEvent, Report, AdminAlert, SuspiciousMessage, DashboardStats, UserActivity, Announcement, AnnouncementType, Wave, Conversation, DeleteRequest, DeleteRequestStatus, SupportInquiry, SupportInquiryStatus, StreetInterview } from '@/types';

// ─── Admin Account Management ────────────────────────────────────────────────

export interface AdminRecord {
  email: string;
  role: AdminRole;
  addedBy: string;
  addedAt: Date;
  active: boolean;
  displayName?: string;
}

export async function getAdmins(): Promise<AdminRecord[]> {
  const snap = await getDocs(collection(db, 'admins'));
  return snap.docs.map((d) => ({
    email: d.id,
    role: 'viewer' as AdminRole,
    ...d.data(),
    addedAt: toDate(d.data().addedAt) ?? new Date(),
  })) as AdminRecord[];
}

export async function addAdmin(email: string, role: AdminRole, addedByEmail: string, displayName?: string) {
  const key = email.toLowerCase().trim();
  await setDoc(doc(db, 'admins', key), {
    email: key,
    role,
    addedBy: addedByEmail,
    addedAt: Timestamp.now(),
    active: true,
    ...(displayName ? { displayName } : {}),
  });
}

export async function updateAdminRole(email: string, role: AdminRole) {
  await updateDoc(doc(db, 'admins', email.toLowerCase()), { role });
}

export async function deactivateAdmin(email: string) {
  await updateDoc(doc(db, 'admins', email.toLowerCase()), { active: false });
}

export async function reactivateAdmin(email: string) {
  await updateDoc(doc(db, 'admins', email.toLowerCase()), { active: true });
}

export async function removeAdmin(email: string) {
  await deleteDoc(doc(db, 'admins', email.toLowerCase()));
}

function toDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val.toDate();
  if (val instanceof Date) return val;
  return undefined;
}

/**
 * Sort options exposed to the user-management UI. Each maps directly to a
 * Firestore field on the `users` doc; both fields are written by the
 * Flutter client (see firebase_service.dart for the lastActiveAt update
 * path triggered by app foregrounding).
 */
export type UserSortKey = 'createdAt' | 'lastActiveAt';

// CRIT 1: legalName / legalBirthYear / sosContacts live in the owner-only
// users/{uid}/private/identity doc — root copies were removed by the
// deleteRoot backfill (2026-07-04) and 3.0.5 clients stop writing them
// entirely. Admins read the private doc via the isAdmin collectionGroup
// rule. Overlay it (private-preferred, root-fallback) so 실명 keeps showing
// in the users list and detail views.
async function overlayPrivatePii<T extends { id: string }>(u: T): Promise<T> {
  try {
    const snap = await getDoc(doc(db, 'users', u.id, 'private', 'identity'));
    if (!snap.exists()) return u;
    const p = snap.data();
    return {
      ...u,
      ...(p.legalName ? { legalName: p.legalName } : {}),
      ...(p.legalBirthYear ? { legalBirthYear: p.legalBirthYear } : {}),
      ...(Array.isArray(p.sosContacts) && p.sosContacts.length
        ? { sosContacts: p.sosContacts }
        : {}),
    };
  } catch {
    // Rules denial / transient error — show the root-only view rather than fail.
    return u;
  }
}

export async function getUsers(
  pageSize = 30,
  cursor?: QueryDocumentSnapshot,
  sortBy: UserSortKey = 'createdAt',
): Promise<PaginatedResult<UserProfile>> {
  // Single-field orderBy keeps the index requirement minimal — Firestore
  // builds a single-field index on every field by default, so changing
  // sort dimensions doesn't require deploying composite indexes.
  //
  // Caveat: Firestore's orderBy EXCLUDES documents missing the field.
  // - sortBy='createdAt': old hand-crafted user docs without createdAt
  //   won't appear (rare; predates sign-up timestamping).
  // - sortBy='lastActiveAt': users who've never opened the app since the
  //   lastActiveAt write path was added won't appear. This is usually
  //   the desired behavior for a "최근 활동순" view (we don't want
  //   inactive ghosts at the top), but it's worth knowing.
  const q = query(
    collection(db, 'users'),
    orderBy(sortBy, 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: toDate(d.data().createdAt),
    updatedAt: toDate(d.data().updatedAt),
    lastActiveAt: toDate(d.data().lastActiveAt),
    blacklistedAt: toDate(d.data().blacklistedAt),
    identityVerifiedAt: toDate(d.data().identityVerifiedAt),
  })) as UserProfile[];
  return {
    // One private/identity read per row (page of ~30) — acceptable at
    // current scale; revisit with a server-side join if pages grow.
    items: await Promise.all(items.map(overlayPrivatePii)),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

/**
 * 공식 어드민 계정 uid — 모든 어드민 발신 대화가 이 계정으로 모인다.
 * functions/index.js getOfficialAdminUid와 같은 규칙:
 * app_config/official_account.uid 우선, 폴백은 가장 오래된 비리뷰어 관리자.
 * (app_config 읽기는 firestore.rules의 admin read 허용 필요 — 규칙 미배포로
 * 읽기가 거부되면 조용히 폴백을 탄다.)
 */
export async function getOfficialAdminUid(): Promise<string | null> {
  try {
    const cfg = await getDoc(doc(db, 'app_config', 'official_account'));
    const uid = cfg.exists() ? (cfg.data().uid as string | undefined) : undefined;
    if (uid) return uid;
  } catch {
    /* rules 미배포 등 — 폴백으로 진행 */
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('isAdmin', '==', true)),
    );
    const candidates = snap.docs
      .filter((d) => d.data().isReviewerAccount !== true)
      .sort(
        (a, b) =>
          (toDate(a.data().createdAt)?.getTime() ?? 0) -
          (toDate(b.data().createdAt)?.getTime() ?? 0),
      );
    return candidates[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function getUser(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return overlayPrivatePii({
    id: snap.id,
    ...snap.data(),
    createdAt: toDate(snap.data().createdAt),
    updatedAt: toDate(snap.data().updatedAt),
    lastActiveAt: toDate(snap.data().lastActiveAt),
    identityVerifiedAt: toDate(snap.data().identityVerifiedAt),
  } as UserProfile);
}

export async function updateUserStatus(uid: string, status: string) {
  await updateDoc(doc(db, 'users', uid), { accountStatus: status, updatedAt: Timestamp.now() });
}

/**
 * Append a tamper-evident audit record when an admin reveals a user's identity
 * PII (실명 등). Writes to the append-only `admin_pii_access_logs` collection —
 * Firestore rules allow create-only (no client update/delete) and require
 * viewerUid == request.auth.uid, so an operator can't forge another admin's id
 * or erase their own access. Reviewed out-of-band (Firebase console / backend).
 *
 * Best-effort: never throws to the caller — a logging hiccup must not block the
 * operator, but failures are surfaced to the console for monitoring.
 */
export async function logIdentityPiiAccess(params: {
  viewerUid: string;
  viewerEmail: string | null;
  viewerRole: string | null;
  targetUserId: string;
  fields: string[];
}): Promise<void> {
  await addDoc(collection(db, 'admin_pii_access_logs'), {
    viewerUid: params.viewerUid,
    viewerEmail: params.viewerEmail,
    viewerRole: params.viewerRole,
    targetUserId: params.targetUserId,
    fields: params.fields,
    action: 'reveal_identity',
    viewedAt: serverTimestamp(),
  });
}

export async function blockUser(uid: string, reason: string, adminUid: string) {
  // 1. Block the user account
  await updateDoc(doc(db, 'users', uid), {
    isBlacklisted: true,
    blacklistedAt: Timestamp.now(),
    blacklistReason: reason,
    blacklistedBy: adminUid,
    accountStatus: 'blocked',
    updatedAt: Timestamp.now(),
  });

  // 2. Delete pending waves (both sent and received) that haven't been accepted yet.
  //    Accepted waves already have a conversationId — leave those intact.
  try {
    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(query(collection(db, 'waves'), where('fromUserId', '==', uid))),
      getDocs(query(collection(db, 'waves'), where('toUserId',   '==', uid))),
    ]);
    const pendingWaves = [
      ...sentSnap.docs.filter((d) => !d.data().conversationId),
      ...receivedSnap.docs.filter((d) => !d.data().conversationId),
    ];
    await Promise.all(pendingWaves.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.warn('[blockUser] wave cleanup failed:', e);
  }

  // 3. Mark active conversations so the Flutter app can show "차단된 사용자" UI.
  //    We write blockedParticipants: [uid] onto each conversation — never delete
  //    conversations as they may hold moderation-relevant message history.
  try {
    const convSnap = await getDocs(
      query(collection(db, 'conversations'), where('participants', 'array-contains', uid))
    );
    await Promise.all(
      convSnap.docs.map((d) =>
        updateDoc(d.ref, { blockedParticipants: arrayUnion(uid) })
      )
    );
  } catch (e) {
    console.warn('[blockUser] conversation flag failed:', e);
  }
}

export async function unblockUser(uid: string) {
  await updateDoc(doc(db, 'users', uid), {
    isBlacklisted: false,
    blacklistedAt: null,
    blacklistReason: null,
    blacklistedBy: null,
    accountStatus: 'active',
    updatedAt: Timestamp.now(),
  });
}

export async function getCircles(
  pageSize = 24,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<Circle>> {
  const q = query(
    collection(db, 'circles'),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: toDate(d.data().createdAt),
      updatedAt: toDate(d.data().updatedAt),
    })) as Circle[],
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

export async function getCircle(id: string): Promise<Circle | null> {
  const snap = await getDoc(doc(db, 'circles', id));
  if (!snap.exists()) return null;
  return {
    id: snap.id,
    ...snap.data(),
    createdAt: toDate(snap.data().createdAt),
    updatedAt: toDate(snap.data().updatedAt),
    blockedAt: toDate(snap.data().blockedAt),
  } as Circle;
}

export async function updateCircle(id: string, data: Partial<Pick<Circle, 'name' | 'description' | 'maxMembers'>>) {
  await updateDoc(doc(db, 'circles', id), { ...data, updatedAt: Timestamp.now() });
}

export async function blockCircle(id: string, reason: string, adminUid: string) {
  await updateDoc(doc(db, 'circles', id), {
    isBlocked: true,
    blockedAt: Timestamp.now(),
    blockedReason: reason,
    blockedBy: adminUid,
    status: 'blocked',
    updatedAt: Timestamp.now(),
  });
}

export async function unblockCircle(id: string) {
  await updateDoc(doc(db, 'circles', id), {
    isBlocked: false,
    blockedAt: null,
    blockedReason: null,
    blockedBy: null,
    status: 'active',
    updatedAt: Timestamp.now(),
  });
}

export async function deleteCircle(id: string) {
  // Cascade-delete subcollections BEFORE the root doc so a mid-flight
  // failure leaves something we can retry, not an orphaned subcollection
  // with no parent. Firestore doesn't natively cascade — every layer of
  // the tree has to be walked explicitly.
  //
  // Tree:
  //   circles/{id}
  //     └─ posts/{pid}
  //          └─ comments/{cid}    (leaf)
  //
  // Without this, posts from a deleted circle keep surfacing in the
  // mobile app's collectionGroup('posts') feed as "탈퇴한 회원" style
  // ghosts forever — same class of bug as orphan user posts.

  const circleRef = doc(db, 'circles', id);
  const postsSnap = await getDocs(collection(circleRef, 'posts'));

  // Delete each post's comments subcollection first (leaf level).
  // Comments per post are typically small; one .get() per post is fine.
  for (const postDoc of postsSnap.docs) {
    const commentsSnap = await getDocs(collection(postDoc.ref, 'comments'));
    if (commentsSnap.docs.length > 0) {
      // 400 per batch — Firestore caps at 500, leaving slack for retries.
      let batch = writeBatch(db);
      let count = 0;
      for (const c of commentsSnap.docs) {
        batch.delete(c.ref);
        count += 1;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }
  }

  // Then delete the posts themselves, batched.
  if (postsSnap.docs.length > 0) {
    let batch = writeBatch(db);
    let count = 0;
    for (const p of postsSnap.docs) {
      batch.delete(p.ref);
      count += 1;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }

  // Root doc last.
  await deleteDoc(circleRef);
}

export async function removeMemberFromCircle(circleId: string, userId: string) {
  await updateDoc(doc(db, 'circles', circleId), {
    members: arrayRemove(userId),
    memberCount: increment(-1),
    updatedAt: Timestamp.now(),
  });
}

export async function getUsersByIds(uids: string[]): Promise<UserProfile[]> {
  if (uids.length === 0) return [];
  const results: UserProfile[] = [];
  for (let i = 0; i < uids.length; i += 10) {
    const batch = uids.slice(i, i + 10);
    const q = query(collection(db, 'users'), where(documentId(), 'in', batch));
    const snap = await getDocs(q);
    results.push(...snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: toDate(d.data().createdAt),
      lastActiveAt: toDate(d.data().lastActiveAt),
    })) as UserProfile[]);
  }
  return results;
}

export async function getCircleEvents(circleId: string): Promise<CircleEvent[]> {
  const q = query(
    collection(db, 'events'),
    where('circleId', '==', circleId),
    orderBy('startAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    startAt: toDate(d.data().startAt),
    endAt: toDate(d.data().endAt),
    createdAt: toDate(d.data().createdAt),
  })) as CircleEvent[];
}

export async function getReports(
  statusFilter?: string,
  pageSize = 30,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<Report>> {
  const q = query(
    collection(db, 'reports'),
    ...(statusFilter && statusFilter !== 'all' ? [where('status', '==', statusFilter)] : []),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: toDate(d.data().createdAt),
      resolvedAt: toDate(d.data().resolvedAt),
    })) as Report[],
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

export async function resolveReport(reportId: string, resolution: string, adminUid: string) {
  await updateDoc(doc(db, 'reports', reportId), {
    status: 'resolved',
    resolution,
    resolvedBy: adminUid,
    resolvedAt: Timestamp.now(),
  });
}

export async function dismissReport(reportId: string, adminUid: string) {
  await updateDoc(doc(db, 'reports', reportId), {
    status: 'dismissed',
    resolvedBy: adminUid,
    resolvedAt: Timestamp.now(),
  });
}

export async function getAdminAlerts(
  pageSize = 20,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<AdminAlert>> {
  const q = query(
    collection(db, 'admin_alerts'),
    orderBy('timestamp', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      timestamp: toDate(d.data().timestamp),
    })) as AdminAlert[],
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

export async function resolveAlert(alertId: string, note?: string, adminUid?: string) {
  await updateDoc(doc(db, 'admin_alerts', alertId), {
    resolved: true,
    resolvedAt: Timestamp.now(),
    ...(adminUid ? { resolvedBy: adminUid } : {}),
    ...(note?.trim() ? { resolvedNote: note.trim() } : {}),
  });
}

export async function deleteAlert(alertId: string) {
  await deleteDoc(doc(db, 'admin_alerts', alertId));
}

// ─── Sync Failures (DLQ from firestore_sync.py retries) ─────────────────────

export interface SyncFailureRecord {
  id: string;
  user_id: string;
  error: string;
  doc_data?: Record<string, unknown>;
  failed_at: Date | undefined;
}

export async function getSyncFailures(
  pageSize = 30,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<SyncFailureRecord>> {
  const q = query(
    collection(db, 'sync_failures'),
    orderBy('failed_at', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        user_id: (data.user_id as string) ?? '',
        error: (data.error as string) ?? '',
        doc_data: data.doc_data as Record<string, unknown> | undefined,
        failed_at: toDate(data.failed_at),
      };
    }),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

export async function dismissSyncFailure(id: string) {
  await deleteDoc(doc(db, 'sync_failures', id));
}

// ─── District Density (written hourly by /operations/district-density) ──────

export interface DistrictDensityRecord {
  id: string;
  city: string;
  district: string | null;
  user_count: number;
  circle_count: number;
  event_count_30d: number;
  aggregated_at: Date | undefined;
}

export async function getDistrictDensity(): Promise<DistrictDensityRecord[]> {
  const snap = await getDocs(
    query(collection(db, 'district_density'), limit(500)),
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        city: (data.city as string) ?? '',
        district: (data.district as string | null) ?? null,
        user_count: (data.user_count as number) ?? 0,
        circle_count: (data.circle_count as number) ?? 0,
        event_count_30d: (data.event_count_30d as number) ?? 0,
        aggregated_at: toDate(data.aggregated_at),
      };
    })
    // Sort by user_count desc so cold-start deserts show at the bottom
    .sort((a, b) => b.user_count - a.user_count);
}

export async function getSuspiciousMessages(
  pageSize = 30,
  source?: string,  // e.g. 'message' | 'circle' | 'profile_image'
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<SuspiciousMessage>> {
  const q = query(
    collection(db, 'suspicious_messages'),
    ...(source ? [where('source', '==', source)] : []),
    orderBy('timestamp', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      timestamp: toDate(d.data().timestamp),
    })) as SuspiciousMessage[],
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

export function subscribeToAlerts(
  callback: (alerts: AdminAlert[]) => void
): () => void {
  const q = query(
    collection(db, 'admin_alerts'),
    where('resolved', '==', false),
    orderBy('timestamp', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
    const alerts = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      timestamp: toDate(d.data().timestamp),
    })) as AdminAlert[];
    callback(alerts);
  });
}

// ─── Announcements ────────────────────────────────────────────────────────────

function toAnnouncement(id: string, data: DocumentData): Announcement {
  return {
    id,
    title: data.title ?? '',
    body: data.body ?? '',
    type: (data.type ?? 'info') as AnnouncementType,
    isActive: data.isActive ?? false,
    isPinned: data.isPinned ?? false,
    ctaText: data.ctaText ?? undefined,
    ctaRoute: data.ctaRoute ?? undefined,
    createdBy: data.createdBy ?? '',
    createdAt: toDate(data.createdAt) ?? new Date(),
    expiresAt: toDate(data.expiresAt) ?? undefined,
  };
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const snap = await getDocs(
    query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => toAnnouncement(d.id, d.data()));
}

export async function createAnnouncement(
  data: Omit<Announcement, 'id' | 'createdAt'>,
  adminEmail: string
): Promise<string> {
  const ref = await addDoc(collection(db, 'announcements'), {
    title: data.title,
    body: data.body,
    type: data.type,
    isActive: data.isActive,
    isPinned: data.isPinned,
    createdBy: adminEmail,
    createdAt: Timestamp.now(),
    ...(data.ctaText ? { ctaText: data.ctaText } : {}),
    ...(data.ctaRoute ? { ctaRoute: data.ctaRoute } : {}),
    ...(data.expiresAt ? { expiresAt: Timestamp.fromDate(data.expiresAt) } : {}),
  });
  return ref.id;
}

export async function updateAnnouncement(
  id: string,
  updates: Partial<Omit<Announcement, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> {
  const payload: Record<string, unknown> = { ...updates };
  if (updates.expiresAt !== undefined) {
    payload.expiresAt = updates.expiresAt
      ? Timestamp.fromDate(updates.expiresAt)
      : null;
  }
  await updateDoc(doc(db, 'announcements', id), payload);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(doc(db, 'announcements', id));
}

export async function toggleAnnouncementActive(
  id: string,
  isActive: boolean
): Promise<void> {
  await updateDoc(doc(db, 'announcements', id), { isActive });
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

async function safeCount(q: Parameters<typeof getCountFromServer>[0], label: string): Promise<number> {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    console.warn(`[getDashboardStats] count failed for "${label}":`, e);
    return 0;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Core user list — always needed for active/blocked split
  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs.map((d) => d.data());

  // All remaining counts run in parallel; each fails gracefully to 0
  const [
    totalCircles,
    pendingReports,
    unresolvedAlerts,
    newUsersThisWeek,
    newUsersThisMonth,
    activeUsersThisWeek,
    totalWaves,
    totalConversations,
    pendingDeleteRequests,
  ] = await Promise.all([
    safeCount(collection(db, 'circles'), 'circles'),
    safeCount(query(collection(db, 'reports'), where('status', '==', 'pending')), 'pending reports'),
    safeCount(query(collection(db, 'admin_alerts'), where('resolved', '==', false)), 'unresolved alerts'),
    safeCount(query(collection(db, 'users'), where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))), 'new users 7d'),
    safeCount(query(collection(db, 'users'), where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))), 'new users 30d'),
    safeCount(query(collection(db, 'users'), where('lastActiveAt', '>=', Timestamp.fromDate(sevenDaysAgo))), 'active users 7d'),
    safeCount(collection(db, 'waves'), 'waves'),
    safeCount(collection(db, 'conversations'), 'conversations'),
    safeCount(query(collection(db, 'delete_requests'), where('status', '==', 'pending')), 'pending delete requests'),
  ]);

  return {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.accountStatus === 'active' || !u.accountStatus).length,
    blockedUsers: users.filter((u) => u.isBlacklisted || u.accountStatus === 'blocked').length,
    pendingReports,
    unresolvedAlerts,
    totalCircles,
    newUsersThisWeek,
    newUsersThisMonth,
    activeUsersThisWeek,
    totalWaves,
    totalConversations,
    pendingDeleteRequests,
  };
}

// ─── User Activity ─────────────────────────────────────────────────────────────

export async function getUserActivity(uid: string): Promise<UserActivity> {
  // ── Exact server-side counts (no document transfer, no cap) ──────────────
  const [
    wavesSentCount,
    wavesReceivedCount,
    conversationsCount,
    blockedConversationsCount,
  ] = await Promise.all([
    getCountFromServer(query(collection(db, 'waves'), where('fromUserId', '==', uid))),
    getCountFromServer(query(collection(db, 'waves'), where('toUserId',   '==', uid))),
    getCountFromServer(query(collection(db, 'conversations'), where('participants',        'array-contains', uid))),
    getCountFromServer(query(collection(db, 'conversations'), where('blockedParticipants', 'array-contains', uid))),
  ]);

  // ── getDocs only for data that needs field inspection ────────────────────
  // Circles: need names → getDocs (circles per user are naturally small)
  // Pending waves: need to check absence of conversationId on each doc.
  //   Firestore cannot query "field does not exist", so we fetch only the
  //   minimal projection needed. Real-world pending wave counts are small
  //   (users rarely have hundreds of unaccepted waves), so limit(500) is safe
  //   and far above any realistic ceiling for pending-only waves.
  const [circlesSnap, pendingSentSnap, pendingReceivedSnap] = await Promise.all([
    getDocs(query(collection(db, 'circles'), where('members', 'array-contains', uid))),
    getDocs(query(collection(db, 'waves'), where('fromUserId', '==', uid), limit(500))),
    getDocs(query(collection(db, 'waves'), where('toUserId',   '==', uid), limit(500))),
  ]);

  const pendingWavesSent     = pendingSentSnap.docs.filter((d) => !d.data().conversationId).length;
  const pendingWavesReceived = pendingReceivedSnap.docs.filter((d) => !d.data().conversationId).length;

  return {
    circlesJoined: circlesSnap.size,
    circleNames: circlesSnap.docs
      .map((d) => (d.data().name as string) ?? '')
      .filter(Boolean),
    wavesSent:           wavesSentCount.data().count,
    wavesReceived:       wavesReceivedCount.data().count,
    pendingWavesSent,
    pendingWavesReceived,
    conversationsCount:  conversationsCount.data().count,
    blockedConversations: blockedConversationsCount.data().count,
  };
}

// ─── 결큐 per-user progress ──────────────────────────────────────────────────

export interface UserGyeolQAnswer {
  questionId: number;
  selectedOptionId: string;
  answeredAt: string | null; // ISO string as stored by the app
  tags: string[];
}

export interface UserGyeolQ {
  total: number;
  gatePassed: boolean;   // 3+ answers → 결큐 게이트 통과
  moimEligible: boolean; // 7+ answers → 자동 결모임 후보 자격
  lastAnsweredAt: string | null;
  answers: UserGyeolQAnswer[]; // newest first
  allTags: string[];
}

export async function getUserGyeolQ(uid: string): Promise<UserGyeolQ> {
  const snap = await getDocs(collection(db, 'users', uid, 'dailyQuestions'));
  const answers: UserGyeolQAnswer[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      questionId: Number(data.questionId ?? d.id),
      selectedOptionId: String(data.selectedOptionId ?? ''),
      answeredAt: typeof data.answeredAt === 'string' ? data.answeredAt : null,
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    };
  });
  answers.sort((a, b) => (b.answeredAt ?? '').localeCompare(a.answeredAt ?? ''));
  const tagSet = new Set<string>();
  answers.forEach((a) => a.tags.forEach((t) => tagSet.add(t)));
  return {
    total: answers.length,
    gatePassed: answers.length >= 3,
    moimEligible: answers.length >= 7,
    lastAnsweredAt: answers[0]?.answeredAt ?? null,
    answers,
    allTags: [...tagSet],
  };
}

// ─── Waves ────────────────────────────────────────────────────────────────────

export async function getWaves(
  pageSize = 30,
  statusFilter?: 'pending' | 'accepted' | 'declined',
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<Wave>> {
  const constraints = [
    ...(statusFilter ? [where('status', '==', statusFilter)] : []),
    orderBy('sentAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const q = query(collection(db, 'waves'), ...constraints);
  const snap = await getDocs(q);
  const items: Wave[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      fromUserId: data.fromUserId,
      toUserId: data.toUserId,
      message: data.message ?? undefined,
      status: data.status ?? 'pending',
      isRead: data.isRead ?? false,
      isResponded: data.isResponded ?? false,
      sentAt: data.sentAt?.toDate?.() ?? undefined,
      respondedAt: data.respondedAt?.toDate?.() ?? undefined,
      response: data.response ?? undefined,
      conversationId: data.conversationId ?? undefined,
    } as Wave;
  });
  return { items, lastDoc: snap.docs[snap.docs.length - 1] ?? null };
}

// ─── Conversations ─────────────────────────────────────────────────────────────

export async function getConversations(
  pageSize = 30,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<Conversation>> {
  const q = query(
    collection(db, 'conversations'),
    orderBy('lastMessageAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  const items: Conversation[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      participants: data.participants ?? [],
      lastMessage: data.lastMessage ?? undefined,
      lastMessageAt: data.lastMessageAt?.toDate?.() ?? undefined,
      createdAt: data.createdAt?.toDate?.() ?? undefined,
      conversationType: data.conversationType ?? 'direct',
      isActive: data.isActive ?? true,
      blockedParticipants: data.blockedParticipants ?? [],
    } as Conversation;
  });
  return { items, lastDoc: snap.docs[snap.docs.length - 1] ?? null };
}

// ─── Delete Requests ──────────────────────────────────────────────────────────

export async function submitDeleteRequest(data: {
  name: string;
  contactInfo: string;
  reason?: string;
}): Promise<void> {
  await addDoc(collection(db, 'delete_requests'), {
    name: data.name,
    contactInfo: data.contactInfo,
    reason: data.reason ?? '',
    status: 'pending',
    requestedAt: Timestamp.now(),
  });
}

export async function getDeleteRequests(
  statusFilter?: DeleteRequestStatus,
  pageSize = 30,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<DeleteRequest>> {
  const constraints = [
    ...(statusFilter ? [where('status', '==', statusFilter)] : []),
    orderBy('requestedAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const q = query(collection(db, 'delete_requests'), ...constraints);
  const snap = await getDocs(q);
  const items: DeleteRequest[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      contactInfo: data.contactInfo,
      reason: data.reason ?? undefined,
      status: data.status ?? 'pending',
      requestedAt: data.requestedAt?.toDate?.() ?? undefined,
      processedAt: data.processedAt?.toDate?.() ?? undefined,
      processedBy: data.processedBy ?? undefined,
      note: data.note ?? undefined,
    } as DeleteRequest;
  });
  return { items, lastDoc: snap.docs[snap.docs.length - 1] ?? null };
}

export async function resolveDeleteRequest(
  id: string,
  status: 'completed' | 'cancelled',
  processedBy: string,
  note?: string,
): Promise<void> {
  await updateDoc(doc(db, 'delete_requests', id), {
    status,
    processedAt: Timestamp.now(),
    processedBy,
    ...(note ? { note } : {}),
  });
}

// ─── Support Inquiries ────────────────────────────────────────────────────────

export async function getSupportInquiries(
  statusFilter?: SupportInquiryStatus,
  pageSize = 30,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<SupportInquiry>> {
  const constraints = [
    ...(statusFilter ? [where('status', '==', statusFilter)] : []),
    orderBy('submittedAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const q = query(collection(db, 'support_inquiries'), ...constraints);
  const snap = await getDocs(q);
  const items: SupportInquiry[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name ?? '',
      contact: data.contact ?? data.email ?? '',
      category: data.category ?? undefined,
      message: data.message ?? '',
      status: data.status ?? 'pending',
      submittedAt: data.submittedAt?.toDate?.() ?? undefined,
      resolvedAt: data.resolvedAt?.toDate?.() ?? undefined,
      resolvedBy: data.resolvedBy ?? undefined,
      note: data.note ?? undefined,
      userId: data.userId ?? undefined,
    } as SupportInquiry;
  });
  return { items, lastDoc: snap.docs[snap.docs.length - 1] ?? null };
}

export async function resolveSupportInquiry(
  id: string,
  status: 'in_progress' | 'resolved',
  resolvedBy: string,
  note?: string,
): Promise<void> {
  await updateDoc(doc(db, 'support_inquiries', id), {
    status,
    ...(status === 'resolved' ? { resolvedAt: Timestamp.now(), resolvedBy } : {}),
    ...(note ? { note } : {}),
  });
}

// ─── Street Interviews (field marketing) ───────────────────────────────────
// Added 2026-05-16 for the May trip. The interviewer fills out a 7-question
// form on mobile, hits save, the form resets, on to the next person.

/**
 * Persist a single interview. Throws on permission failure so the UI shows
 * a banner — silent drops would be invisible to the field interviewer.
 */
export async function saveStreetInterview(
  data: Omit<StreetInterview, 'id' | 'conductedAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'street_interviews'), {
    ...data,
    conductedAt: Timestamp.now(),
  });
  return ref.id;
}

/**
 * Recent interviews — used on the form page so the interviewer sees their
 * count for the day and the last few entries (a confidence check that
 * saves are actually landing). Limited to 20 to keep mobile fast.
 */
export async function getRecentStreetInterviews(
  max: number = 20,
): Promise<StreetInterview[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'street_interviews'),
        orderBy('conductedAt', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        conductedAt: toDate(data.conductedAt) ?? undefined,
        location: data.location ?? 'other',
        interviewer: data.interviewer ?? '',
        ageBand: data.ageBand ?? 'unknown',
        gender: data.gender ?? 'undisclosed',
        region: data.region ?? 'unknown',
        knowsHobbyApps: data.knowsHobbyApps ?? 'unsure',
        appsKnown: Array.isArray(data.appsKnown) ? data.appsKnown : [],
        nonUseReasons: Array.isArray(data.nonUseReasons) ? data.nonUseReasons : [],
        willingnessToUse: data.willingnessToUse ?? 'somewhat',
        desiredFeatures: Array.isArray(data.desiredFeatures) ? data.desiredFeatures : [],
        freeText: data.freeText ?? undefined,
        createdBy: data.createdBy ?? '',
      } as StreetInterview;
    });
  } catch (e) {
    console.warn('[getRecentStreetInterviews] failed:', e);
    return [];
  }
}

/**
 * Quick aggregate stats for the form page header — total count today and
 * lifetime. Used as a progress / motivation indicator for the interviewer.
 */
export async function getStreetInterviewStats(): Promise<{
  total: number;
  today: number;
  thisWeek: number;
}> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [total, today, thisWeek] = await Promise.all([
    safeCount(collection(db, 'street_interviews'), 'interviews_total'),
    safeCount(
      query(
        collection(db, 'street_interviews'),
        where('conductedAt', '>=', Timestamp.fromDate(startOfDay)),
      ),
      'interviews_today',
    ),
    safeCount(
      query(
        collection(db, 'street_interviews'),
        where('conductedAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
      ),
      'interviews_7d',
    ),
  ]);
  return { total, today, thisWeek };
}

// ─── Matching Monitoring Dashboard ──────────────────────────────────────────
// Stats for the /dashboard/matching page added 2026-05-15.
// Surfaces the entire wave-funnel (matched → wave sent → accepted →
// conversation) plus per-user activity so we can see whether free + Plus
// users are actually engaging with matching, not just receiving 200 OK
// responses from the backend.

export interface MatchingStats {
  // Wave funnel
  totalWaves: number;
  pendingWaves: number;
  acceptedWaves: number;
  declinedWaves: number;
  // Derived
  acceptanceRate: number;          // accepted / (accepted + declined)
  responseRate: number;            // (accepted + declined) / totalWaves
  conversationStartRate: number;   // conversations / acceptedWaves
  // Conversation
  totalConversations: number;
  conversationsLast7d: number;
  // Wave throughput
  wavesLast24h: number;
  wavesLast7d: number;
  // Top active senders (anonymized — first 8 chars of UID)
  topSenders: Array<{ uidPrefix: string; count: number }>;
  topReceivers: Array<{ uidPrefix: string; count: number }>;
  // Match candidate coverage — % of users that have an embedding (= eligible
  // to appear in someone's match list)
  usersWithEmbedding: number;
  totalUsers: number;
}

/**
 * Compute wave-funnel + conversation stats. Pulls waves and conversations
 * collections directly (no aggregate-only counts — we need to bucket by
 * status). For ~10K waves this is fine; above that, push these into BigQuery
 * scheduled views and cache the result.
 */
export async function getMatchingStats(): Promise<MatchingStats> {
  const now = new Date();
  const oneDayAgo = Timestamp.fromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const sevenDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

  // Pull waves once; bucket client-side. status counts + funnel + top
  // senders/receivers all derive from this single read.
  const wavesSnap = await getDocs(collection(db, 'waves'));
  let totalWaves = 0;
  let pending = 0;
  let accepted = 0;
  let declined = 0;
  let wavesLast24h = 0;
  let wavesLast7d = 0;
  const senderCount = new Map<string, number>();
  const receiverCount = new Map<string, number>();

  for (const d of wavesSnap.docs) {
    const w = d.data();
    totalWaves++;
    const status = (w.status as string | undefined) ?? 'pending';
    if (status === 'pending') pending++;
    else if (status === 'accepted') accepted++;
    else if (status === 'declined') declined++;

    const sent = w.sentAt as Timestamp | undefined;
    if (sent) {
      if (sent.toMillis() >= oneDayAgo.toMillis()) wavesLast24h++;
      if (sent.toMillis() >= sevenDaysAgo.toMillis()) wavesLast7d++;
    }

    const from = (w.fromUserId as string | undefined) ?? '';
    const to = (w.toUserId as string | undefined) ?? '';
    if (from) senderCount.set(from, (senderCount.get(from) ?? 0) + 1);
    if (to) receiverCount.set(to, (receiverCount.get(to) ?? 0) + 1);
  }

  // Conversations
  const [totalConvosCount, convosLast7dCount] = await Promise.all([
    safeCount(collection(db, 'conversations'), 'conversations'),
    safeCount(
      query(
        collection(db, 'conversations'),
        where('createdAt', '>=', sevenDaysAgo),
      ),
      'conversations_7d',
    ),
  ]);

  // Embedding coverage — how many users could realistically appear in match
  // results today (their tag/profile has been processed by the Cloud Function
  // and synced to backend pgvector).
  const usersSnap = await getDocs(collection(db, 'users'));
  let usersWithEmbedding = 0;
  for (const d of usersSnap.docs) {
    const data = d.data();
    if (Array.isArray(data.embedding) && data.embedding.length > 0) {
      usersWithEmbedding++;
    }
  }

  // Derived ratios — guard against divide-by-zero so empty datasets show 0,
  // not NaN.
  const acceptanceDenom = accepted + declined;
  const acceptanceRate =
    acceptanceDenom > 0 ? Math.round((accepted / acceptanceDenom) * 100) : 0;
  const responseRate =
    totalWaves > 0 ? Math.round((acceptanceDenom / totalWaves) * 100) : 0;
  const conversationStartRate =
    accepted > 0 ? Math.round((totalConvosCount / accepted) * 100) : 0;

  // Anonymize top sender/receiver UIDs — admin doesn't need to see who, just
  // the distribution shape (concentrated few power users vs even spread).
  const topSenders = Array.from(senderCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid, count]) => ({ uidPrefix: uid.slice(0, 8), count }));
  const topReceivers = Array.from(receiverCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid, count]) => ({ uidPrefix: uid.slice(0, 8), count }));

  return {
    totalWaves,
    pendingWaves: pending,
    acceptedWaves: accepted,
    declinedWaves: declined,
    acceptanceRate,
    responseRate,
    conversationStartRate,
    totalConversations: totalConvosCount,
    conversationsLast7d: convosLast7dCount,
    wavesLast24h,
    wavesLast7d,
    topSenders,
    topReceivers,
    usersWithEmbedding,
    totalUsers: usersSnap.size,
  };
}

// ─── Data Collection Dashboard ───────────────────────────────────────────────
// Stats for the /dashboard/data-collection page added 2026-05-13.
// Reads Firestore aggregates only (no Postgres) and is intentionally cheap to
// call — uses getCountFromServer for top-level counts so the page can refresh
// without pulling thousands of docs.

export interface DataCollectionStats {
  // High-level
  totalUsers: number;
  usersWithTags: number;            // users.dailyQuestionTags non-empty
  usersWithEmbedding: number;       // users.embedding non-empty
  usersAtDailyCap: number;          // users that hit today's 8 answers
  // Daily Question
  totalDailyAnswers: number;        // collectionGroup('dailyQuestions') count
  todaysDailyAnswers: number;       // dailyAnswerCountDate == today
  avgAnswersPerUser: number;
  // Mini Pulse
  totalMiniPulseResponses: number;  // collectionGroup('mini_pulses') count
  miniPulsesWithLonelyHigh: number; // tags contains lonely_high
  // Tag distribution (top 15)
  topTags: Array<{ tag: string; count: number }>;
  // Daily Question category distribution
  categoryCounts: Record<string, number>;
  // ── 결큐 인사이트 (2026-07-10 추가) ──
  // 답변 깊이 — 결 게이트(3답)·결모임 자격(7답) 기준선이 제품 임계값과 일치
  gateEligible: number;             // 답변 ≥ 3 사용자 (결 게이트 통과)
  moimEligible: number;             // 답변 ≥ 7 사용자 (결모임 조립 자격)
  depthBuckets: Array<{ label: string; count: number }>;
  // 최근 14일 일별 답변 수 (오래된 날 → 오늘 순)
  dailyTrend: Array<{ date: string; count: number }>;
  // 질문별 응답 분포 — 답변 수 상위 질문의 선택지 쏠림 확인용
  questionStats: Array<{ id: string; total: number; options: Record<string, number> }>;
  // 온보딩 "어디서 알게 되셨어요?" 응답 집계 (users/*/analytics_milestones)
  acquisitionChannels: Array<{ channel: string; count: number }>;
  acquisitionAnswered: number;      // 응답한 사용자 수 (스킵 제외)
}

/**
 * Compute Firestore-side data-collection metrics. Heavy on reads — should be
 * called sparingly (typical: once per admin page view). For production scale,
 * back this with BigQuery aggregations and cache; for now Firestore direct is
 * accurate and fast enough for the first ~10k users.
 */
export async function getDataCollectionStats(): Promise<DataCollectionStats> {
  // 1) Pull all user docs once. We need to inspect dailyQuestionTags arrays,
  //    which getCountFromServer can't filter on, so a single bulk read is
  //    actually cheaper than several aggregate queries with limits.
  const usersSnap = await getDocs(collection(db, 'users'));
  const todayKey = (() => {
    const d = new Date();
    const y = d.getFullYear().toString().padStart(4, '0');
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  const tagCounter = new Map<string, number>();
  let usersWithTags = 0;
  let usersWithEmbedding = 0;
  let usersAtDailyCap = 0;
  let todaysDailyAnswers = 0;

  for (const d of usersSnap.docs) {
    const data = d.data();
    const tags = (data.dailyQuestionTags as unknown[] | undefined)?.filter(
      (x): x is string => typeof x === 'string',
    ) ?? [];
    if (tags.length > 0) usersWithTags++;
    for (const t of tags) tagCounter.set(t, (tagCounter.get(t) ?? 0) + 1);
    if (Array.isArray(data.embedding) && data.embedding.length > 0) {
      usersWithEmbedding++;
    }
    if (
      typeof data.dailyAnswerCountDate === 'string' &&
      data.dailyAnswerCountDate === todayKey &&
      typeof data.dailyAnswerCount === 'number'
    ) {
      todaysDailyAnswers += data.dailyAnswerCount;
      if (data.dailyAnswerCount >= 8) usersAtDailyCap++;
    }
  }

  // 2) 결큐 답변 전체를 collectionGroup으로 한 번에 읽는다. 카운트만 뽑던
  //    이전 방식과 달리 문서를 다 가져오는 이유: 일별 추이·답변 깊이·질문별
  //    선택지 분포가 전부 개별 답변에서만 나온다. 문서가 작아(4필드) 수천
  //    건까지는 한 페이지 로드로 충분. (규칙: {path=**}/dailyQuestions admin
  //    read — 2026-07-10 추가. 그 전엔 permission-denied로 조용히 0이었다.)
  let totalDailyAnswers = 0;
  const perUserAnswers = new Map<string, number>();
  const trendCounter = new Map<string, number>();
  const questionCounter = new Map<string, { total: number; options: Record<string, number> }>();
  try {
    const cg = collectionGroup(db, 'dailyQuestions');
    const snap = await getDocs(cg);
    for (const d of snap.docs) {
      // 경로: users/{uid}/dailyQuestions/{qid} — 루트 /dailyQuestions(질문
      // 정의) 문서도 같은 collectionGroup에 걸리므로 depth로 걸러낸다.
      const segs = d.ref.path.split('/');
      if (segs.length !== 4 || segs[0] !== 'users') continue;
      totalDailyAnswers++;
      const uid = segs[1];
      perUserAnswers.set(uid, (perUserAnswers.get(uid) ?? 0) + 1);
      const data = d.data();
      const answeredAt = typeof data.answeredAt === 'string' ? data.answeredAt.slice(0, 10) : null;
      if (answeredAt) trendCounter.set(answeredAt, (trendCounter.get(answeredAt) ?? 0) + 1);
      const qid = String(data.questionId ?? d.id);
      const opt = typeof data.selectedOptionId === 'string' ? data.selectedOptionId : '?';
      const q = questionCounter.get(qid) ?? { total: 0, options: {} };
      q.total++;
      q.options[opt] = (q.options[opt] ?? 0) + 1;
      questionCounter.set(qid, q);
    }
  } catch (e) {
    console.warn('[data-collection] dailyQuestions fetch failed:', e);
  }

  // 답변 깊이 버킷 — 제품 임계값(게이트 3 / 결모임 7)에 맞춘 경계
  let gateEligible = 0;
  let moimEligible = 0;
  const bucketDefs: Array<{ label: string; min: number; max: number }> = [
    { label: '1~2', min: 1, max: 2 },
    { label: '3~6 (게이트 통과)', min: 3, max: 6 },
    { label: '7~19 (결모임 자격)', min: 7, max: 19 },
    { label: '20+', min: 20, max: Infinity },
  ];
  const bucketCounts = bucketDefs.map(() => 0);
  for (const n of perUserAnswers.values()) {
    if (n >= 3) gateEligible++;
    if (n >= 7) moimEligible++;
    const i = bucketDefs.findIndex((b) => n >= b.min && n <= b.max);
    if (i >= 0) bucketCounts[i]++;
  }
  const answeredUsers = perUserAnswers.size;
  const depthBuckets = [
    { label: '0 (미참여)', count: Math.max(0, usersSnap.size - answeredUsers) },
    ...bucketDefs.map((b, i) => ({ label: b.label, count: bucketCounts[i] })),
  ];

  // 최근 14일 추이 (빈 날은 0으로 채움)
  const dailyTrend: Array<{ date: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dailyTrend.push({ date: key, count: trendCounter.get(key) ?? 0 });
  }

  // 질문별 응답 분포 — 답변 수 상위 20개
  const questionStats = Array.from(questionCounter.entries())
    .map(([id, v]) => ({ id, total: v.total, options: v.options }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // 3-b) 온보딩 가입 경로 — users/*/analytics_milestones/milestones 의
  //      acquisition_channel. 스킵한 사용자는 문서가 없거나 필드가 없다.
  const acqCounter = new Map<string, number>();
  let acquisitionAnswered = 0;
  try {
    const cg = collectionGroup(db, 'analytics_milestones');
    const snap = await getDocs(cg);
    for (const d of snap.docs) {
      const ch = d.data().acquisition_channel;
      if (typeof ch === 'string' && ch.trim()) {
        acquisitionAnswered++;
        acqCounter.set(ch, (acqCounter.get(ch) ?? 0) + 1);
      }
    }
  } catch (e) {
    console.warn('[data-collection] acquisition fetch failed:', e);
  }
  const acquisitionChannels = Array.from(acqCounter.entries())
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);

  const totalMiniPulseResponses = await (async () => {
    try {
      const cg = collectionGroup(db, 'mini_pulses');
      const snap = await getCountFromServer(cg);
      return snap.data().count;
    } catch (e) {
      console.warn('[data-collection] mini_pulses count failed:', e);
      return 0;
    }
  })();

  // 3) Mini Pulse with lonely_high tag — sample the most recent 200 docs to
  //    avoid loading everything. Good enough for a dashboard signal.
  let miniPulsesWithLonelyHigh = 0;
  try {
    const cg = collectionGroup(db, 'mini_pulses');
    const recent = await getDocs(query(cg, orderBy('completedAt', 'desc'), limit(200)));
    for (const d of recent.docs) {
      const tags = (d.data().tags as unknown[] | undefined)?.filter(
        (x): x is string => typeof x === 'string',
      ) ?? [];
      if (tags.includes('lonely_high')) miniPulsesWithLonelyHigh++;
    }
  } catch (e) {
    console.warn('[data-collection] mini pulse tag sample failed:', e);
  }

  // 4) Daily Question category counts — derived from the bundled questions
  //    JSON via tag prefix. We don't actually fetch the JSON here; instead the
  //    UI maps the well-known categories. The counter below is for tag→bucket
  //    cross-reference if we ever want to do per-category answer counts.
  const categoryCounts: Record<string, number> = {
    '성향 - 외향성': 0,
    '성향 - 친화성': 0,
    '성향 - 성실성': 0,
    '성향 - 개방성': 0,
    '성향 - 정서안정': 0,
    '문화': 0,
    '트렌드': 0,
    '정서': 0,
    '취향': 0,
    '상태/관계': 0,
  };
  // Map common tag prefixes to category buckets so the bar chart has signal.
  for (const [tag, count] of tagCounter) {
    if (tag.startsWith('e_')) categoryCounts['성향 - 외향성'] += count;
    else if (tag.startsWith('a_')) categoryCounts['성향 - 친화성'] += count;
    else if (tag.startsWith('c_')) categoryCounts['성향 - 성실성'] += count;
    else if (tag.startsWith('o_')) categoryCounts['성향 - 개방성'] += count;
    else if (tag.startsWith('n_')) categoryCounts['성향 - 정서안정'] += count;
    else if (
      tag === 'jung_deep' || tag === 'wide_social' || tag === 'nunchi_high' ||
      tag === 'heung' || tag === 'jeong_calm' || tag === 'peer_only' ||
      tag === 'multi_gen' || tag === 'caregiver_active' || tag === 'sns_active'
    ) categoryCounts['문화'] += count;
    else if (
      tag.startsWith('yold_') || tag.startsWith('self_') ||
      tag === 'pleasure_first' || tag === 'health_first' ||
      tag === 'digital_explorer' || tag === 'digital_help_seek' ||
      tag === 'tech_curious' || tag === 'active_learner' ||
      tag === 'depth_lover' || tag === 'breadth_explorer'
    ) categoryCounts['트렌드'] += count;
    else if (
      tag === 'lonely_high' || tag === 'socially_satisfied' ||
      tag === 'mildly_lonely' || tag.startsWith('meaning_') ||
      tag === 'flow_high' || tag === 'slow_time'
    ) categoryCounts['정서'] += count;
    else if (
      tag === 'morning_person' || tag === 'night_owl' ||
      tag === 'voice_call' || tag === 'text_based' ||
      tag === 'foodie' || tag === 'guided_tour' || tag === 'free_travel'
    ) categoryCounts['취향'] += count;
    else if (tag.startsWith('status_') || tag.startsWith('friend_') || tag === 'activity_friend') {
      categoryCounts['상태/관계'] += count;
    }
  }

  const topTags = Array.from(tagCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalUsers: usersSnap.size,
    usersWithTags,
    usersWithEmbedding,
    usersAtDailyCap,
    totalDailyAnswers,
    todaysDailyAnswers,
    avgAnswersPerUser:
      usersWithTags > 0 ? Math.round((totalDailyAnswers / usersWithTags) * 10) / 10 : 0,
    totalMiniPulseResponses,
    miniPulsesWithLonelyHigh,
    topTags,
    categoryCounts,
    gateEligible,
    moimEligible,
    depthBuckets,
    dailyTrend,
    questionStats,
    acquisitionChannels,
    acquisitionAnswered,
  };
}

// ─── Onboarding Funnel ──────────────────────────────────────────────────────
// Track where users drop off during onboarding.
//
// Terms-agreement consents live in the backend Postgres (not Firestore), so
// the pre-NICE step boundary isn't observable here — use the GA4 funnel
// (`onboarding_page_view` events) for that resolution. This function buckets
// users by the *Firestore-visible* state, which is plenty for "who got
// stuck mid-flow and never came back".

export type OnboardingStage =
  | 'signed_up'           // Firestore doc exists, no NICE, no profile
  | 'nice_done'           // identityVerified + legalName, but profile blank
  | 'profile_partial'     // some profile fields but missing name OR interests
  | 'completed';          // displayName + (interests OR city) — usable account

/**
 * 왜 이 사람이 signed_up 단계에서 멈췄는지 *추정*. Firestore에 인증 시도
 * 자체가 로깅되지 않아서 확정은 아니고 신호 조합:
 *
 * - failed_recorded: identityVerificationStatus === 'failed' 명시적 기록
 *   (지금은 안 쓰지만 미래 대비 필드가 있음)
 * - likely_attempted: 가입 후 앱을 여러 번 열었음 — NICE 실패나 중간 이탈
 *   가능성 높음. lastActiveAt이 createdAt 대비 상당히 늦음 (>10분).
 * - never_attempted_signal: 가입 직후 lastActiveAt이 거의 안 움직였음 —
 *   본인인증 화면 보고 바로 껐거나 시도 안 함.
 * - unknown: lastActiveAt 자체가 없어서 판단 불가.
 *
 * Phase 2 (Cloud Function attempt logging)이 들어오면 이 필드는 실제 시도
 * 기록으로 교체됩니다.
 */
export type OnboardingAttemptHint =
  | 'failed_recorded'      // FastAPI가 verification_attempts에 명시적 실패 기록
  | 'likely_attempted'     // 확정 attempt 없지만 lastActiveAt이 시도 흔적 시사
  | 'never_attempted_signal' // 확정 attempt 없고 lastActiveAt 정지 → 시도 안 함
  | 'unknown';

/**
 * Backend FastAPI 가 verification_attempts 컬렉션에 기록한 한 사용자의
 * 가장 최근 시도 상태. `attempts_lookup` map으로 uid → 요약 을 미리
 * 계산해서 각 dropoff 에 병합합니다.
 */
export interface VerificationAttemptSummary {
  lastStage: 'init' | 'callback' | null;
  lastStatus: 'started' | 'success' | 'failure' | null;
  lastErrorReason: string | null;
  lastAt: Date | null;
  attemptCount: number;    // init + callback 총 이벤트 수
  failureCount: number;    // status='failure'만
}

export interface OnboardingDeviceInfo {
  platform?: string; // 'iOS' | 'Android' | ...
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface OnboardingDropoff {
  uid: string;
  displayName?: string;
  email?: string;
  stage: OnboardingStage;
  createdAt?: Date;
  updatedAt?: Date;
  lastActiveAt?: Date;
  daysSinceCreated: number;
  minutesSinceLastActive?: number;
  device?: OnboardingDeviceInfo;
  identityVerificationStatus?: string;
  // signed_up 단계에서만 의미 있음 — 왜 인증 못했는지 추정 or 확정.
  attemptHint?: OnboardingAttemptHint;
  // FastAPI가 남긴 실제 시도 기록 요약. 있으면 확정 사유, 없으면 attemptHint 로 추정.
  attemptSummary?: VerificationAttemptSummary;
}

export interface OnboardingFunnel {
  totalSignedUp: number;
  bySignedUp: number;
  byNiceDone: number;
  byProfilePartial: number;
  byCompleted: number;
  // % of total at each stage (sum = 100)
  pctSignedUp: number;
  pctNiceDone: number;
  pctProfilePartial: number;
  pctCompleted: number;
  // Drop-offs created in last 7 days who never completed — sorted oldest
  // first so we surface the longest-stalled people on top.
  recentDropoffs: OnboardingDropoff[];
}

/**
 * 최근 N일 verification_attempts를 pull해서 uid → summary map으로 접음.
 * 컬렉션이 없거나 read 실패해도 빈 map을 리턴 (호출자는 fallback heuristic 사용).
 * lastAt 기준으로 각 uid의 가장 최근 이벤트를 보존.
 */
async function loadRecentAttemptSummaries(
  days: number
): Promise<Map<string, VerificationAttemptSummary>> {
  const summary = new Map<string, VerificationAttemptSummary>();
  const from = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  try {
    const q = query(collection(db, 'verification_attempts'), where('createdAt', '>=', from));
    const snap = await getDocs(q);
    for (const doc of snap.docs) {
      const d = doc.data();
      const uid = d.uid as string | undefined;
      if (!uid) continue;
      const at = (d.createdAt as Timestamp | undefined)?.toDate?.() ?? null;
      const cur = summary.get(uid) ?? {
        lastStage: null,
        lastStatus: null,
        lastErrorReason: null,
        lastAt: null,
        attemptCount: 0,
        failureCount: 0,
      };
      cur.attemptCount++;
      if (d.status === 'failure') cur.failureCount++;
      if (!cur.lastAt || (at && at > cur.lastAt)) {
        cur.lastStage = d.stage ?? null;
        cur.lastStatus = d.status ?? null;
        cur.lastErrorReason = d.errorReason ?? null;
        cur.lastAt = at;
      }
      summary.set(uid, cur);
    }
  } catch (e) {
    // Collection may not exist yet (before backend deploy), or read may fail.
    // Return empty map — the caller falls back to lastActiveAt heuristic.
    console.warn('[loadRecentAttemptSummaries] failed:', e);
  }
  return summary;
}

function classifyOnboardingStage(u: UserProfile): OnboardingStage {
  const niceDone =
    u.identityVerified === true || !!u.identityVerifiedAt || !!u.legalName;
  const hasName = !!u.displayName && u.displayName.trim().length > 0;
  const hasProfileBits = !!u.city || (u.interests && u.interests.length > 0);

  if (!niceDone) return 'signed_up';
  if (!hasName) return 'profile_partial';
  if (!hasProfileBits) return 'profile_partial';
  return 'completed';
}

export async function getOnboardingFunnel(): Promise<OnboardingFunnel> {
  const usersSnap = await getDocs(collection(db, 'users'));
  const total = usersSnap.size;

  let signedUp = 0;
  let niceDone = 0;
  let profilePartial = 0;
  let completed = 0;
  const recentDropoffs: OnboardingDropoff[] = [];

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Backend가 verification_attempts에 남긴 지난 30일 시도들을 미리 pull해서
  // uid별 요약. 30일 창은 미완료 사용자가 그 이전에 시도했다가 최근 재접속했을
  // 케이스도 커버. 컬렉션이 없거나 read 실패해도 attemptSummary 없이 진행.
  const attemptsSummary = await loadRecentAttemptSummaries(30);

  for (const d of usersSnap.docs) {
    const data = d.data();
    const profile: UserProfile = {
      id: d.id,
      displayName: data.displayName ?? '',
      email: data.email,
      identityVerified: data.identityVerified,
      identityVerificationStatus: data.identityVerificationStatus,
      identityVerifiedAt: data.identityVerifiedAt?.toDate?.(),
      legalName: data.legalName,
      city: data.city,
      district: data.district,
      interests: data.interests,
      createdAt: data.createdAt?.toDate?.(),
      updatedAt: data.updatedAt?.toDate?.(),
    };

    const stage = classifyOnboardingStage(profile);
    if (stage === 'signed_up') signedUp++;
    else if (stage === 'nice_done') niceDone++;
    else if (stage === 'profile_partial') profilePartial++;
    else completed++;

    // Surface non-completed users who signed up in the last week.
    if (stage !== 'completed' && profile.createdAt) {
      const createdAtMs = profile.createdAt.getTime();
      if (createdAtMs >= sevenDaysAgo) {
        const lastActiveAt = (data.lastActiveAt as Timestamp | undefined)?.toDate?.();
        const minutesSinceLastActive = lastActiveAt
          ? Math.floor((Date.now() - lastActiveAt.getTime()) / (60 * 1000))
          : undefined;

        // Device extraction. Flutter app writes `users.device: DeviceInfo`
        // (see lib/models/device_info.dart) — we keep the shape flexible in
        // case older accounts have differently named fields.
        const rawDevice = data.device ?? {};
        const device: OnboardingDeviceInfo | undefined =
          rawDevice.platform || rawDevice.model || rawDevice.osVersion || rawDevice.appVersion
            ? {
                platform: rawDevice.platform,
                model: rawDevice.model,
                osVersion: rawDevice.osVersion,
                appVersion: rawDevice.appVersion,
              }
            : undefined;

        // Attempt hint — signed_up 단계에서만 의미. 우선순위:
        //   1) verification_attempts 컬렉션에 실패 기록 있으면 확정 사유
        //   2) users.identityVerificationStatus === 'failed'
        //   3) lastActiveAt 기반 heuristic (backend 로깅 없던 시절 유저 커버)
        const attemptSummary = attemptsSummary.get(profile.id);
        let attemptHint: OnboardingAttemptHint | undefined;
        if (stage === 'signed_up') {
          if (
            attemptSummary?.lastStatus === 'failure' ||
            profile.identityVerificationStatus === 'failed'
          ) {
            attemptHint = 'failed_recorded';
          } else if (attemptSummary?.lastStatus === 'started') {
            // Backend가 init 성공 로그 남겼는데 callback 성공 로그 없음 = 사용자가
            // NICE 페이지 열고 완료 못하고 이탈. 시도는 확정 됨.
            attemptHint = 'likely_attempted';
          } else if (lastActiveAt) {
            const gapMs = lastActiveAt.getTime() - createdAtMs;
            if (gapMs > 10 * 60 * 1000) attemptHint = 'likely_attempted';
            else attemptHint = 'never_attempted_signal';
          } else {
            attemptHint = 'unknown';
          }
        }

        recentDropoffs.push({
          uid: profile.id,
          displayName: profile.displayName,
          email: profile.email,
          stage,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          lastActiveAt,
          daysSinceCreated: Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000)),
          minutesSinceLastActive,
          device,
          identityVerificationStatus: profile.identityVerificationStatus,
          attemptHint,
          attemptSummary,
        });
      }
    }
  }

  // Oldest first — longest-stalled people are the most actionable
  // ("they've been stuck for 6 days, time to reach out").
  recentDropoffs.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  return {
    totalSignedUp: total,
    bySignedUp: signedUp,
    byNiceDone: niceDone,
    byProfilePartial: profilePartial,
    byCompleted: completed,
    pctSignedUp: pct(signedUp),
    pctNiceDone: pct(niceDone),
    pctProfilePartial: pct(profilePartial),
    pctCompleted: pct(completed),
    recentDropoffs,
  };
}

// ─── Overview Dashboard — Engagement + Device + Signup Trend ─────────────────
// Combined stats used by /dashboard/stats. Each field can also be recomputed
// from other helpers, but bundling into one read keeps the overview page snappy
// and makes cache invariants (all pulled from a single users snapshot) obvious.

export interface DeviceMix {
  ios: number;
  android: number;
  web: number;
  unknown: number;
}

export interface EngagementRollup {
  totalUsers: number;
  dau: number;           // active in last 24h based on lastActiveAt heartbeat
  wau: number;           // last 7d
  mau: number;           // last 30d
  stickiness: number;    // DAU / MAU as a percentage — DAU >20% of MAU is healthy senior comm
  newLast24h: number;    // users.createdAt in last 24h
  newLast7d: number;
  newLast30d: number;
}

export interface SignupTrendPoint {
  date: string; // YYYY-MM-DD, local Asia/Seoul-ish (uses server local — admin is single-user)
  count: number;
}

/**
 * User-doc based engagement snapshot. All metrics come from `lastActiveAt` (a
 * 30-min throttled heartbeat written from the Flutter app foreground) and
 * `createdAt`, so DAU here means "unique users whose most recent foreground
 * fell in the window". For per-day historical DAU with cross-day multi-count,
 * we'd need a session log — GA4 has this but Firestore doesn't; the snapshot
 * DAU is the honest number we can derive without extra instrumentation.
 */
export async function getEngagementRollup(): Promise<EngagementRollup> {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const snap = await getDocs(collection(db, 'users'));
  let dau = 0;
  let wau = 0;
  let mau = 0;
  let newLast24h = 0;
  let newLast7d = 0;
  let newLast30d = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const lastActive = (data.lastActiveAt as Timestamp | undefined)?.toMillis();
    if (lastActive !== undefined) {
      if (lastActive >= dayAgo) dau++;
      if (lastActive >= weekAgo) wau++;
      if (lastActive >= monthAgo) mau++;
    }
    const created = (data.createdAt as Timestamp | undefined)?.toMillis();
    if (created !== undefined) {
      if (created >= dayAgo) newLast24h++;
      if (created >= weekAgo) newLast7d++;
      if (created >= monthAgo) newLast30d++;
    }
  }

  const stickiness = mau > 0 ? Math.round((dau / mau) * 100) : 0;

  return {
    totalUsers: snap.size,
    dau,
    wau,
    mau,
    stickiness,
    newLast24h,
    newLast7d,
    newLast30d,
  };
}

/**
 * iOS/Android/Web split from `users.device.platform`. Users without a
 * recorded device (very early accounts, web-first testers) land in `unknown`.
 */
export async function getDeviceMix(): Promise<DeviceMix> {
  const snap = await getDocs(collection(db, 'users'));
  const mix: DeviceMix = { ios: 0, android: 0, web: 0, unknown: 0 };
  for (const d of snap.docs) {
    const platform = String(d.data().device?.platform ?? '').toLowerCase();
    if (platform.includes('ios')) mix.ios++;
    else if (platform.includes('android')) mix.android++;
    else if (platform.includes('web')) mix.web++;
    else mix.unknown++;
  }
  return mix;
}

/**
 * New-signup daily trend for the last N days. Bucketed by `createdAt` in
 * the browser's local timezone. Zero-filled so the chart always shows the
 * full window, not just days with signups.
 */
export async function getSignupTrend(days: number): Promise<SignupTrendPoint[]> {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  const fromTs = Timestamp.fromDate(from);

  const q = query(collection(db, 'users'), where('createdAt', '>=', fromTs));
  const snap = await getDocs(q);

  const bucket = new Map<string, number>();
  // Zero-fill so every day in the window has an entry.
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    bucket.set(toDateKey(d), 0);
  }
  snap.forEach((doc) => {
    const ts = doc.data().createdAt as Timestamp | undefined;
    if (!ts) return;
    const key = toDateKey(ts.toDate());
    if (bucket.has(key)) bucket.set(key, (bucket.get(key) ?? 0) + 1);
  });

  return Array.from(bucket.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Activity Patterns (from users/{uid}/activity_daily) ─────────────────────
// Flutter AnalyticsService writes a per-day rollup doc per user with the
// hours-active set + per-action counters. Aggregating them gives us the
// "when do our users open the app" and "what do they do when they're in"
// signals — the two questions that drive push timing + product priority.

export interface PeakHourPoint {
  hour: number; // 0-23
  count: number; // unique users active during that hour (across window)
}

export interface EngagementBuckets {
  // Each bucket counts distinct users whose top action in the window falls
  // there. Ordered least → most engaged so the visual reads left-to-right.
  visitOnly: number;      // opened app, no other tracked action
  waveSender: number;     // sent at least one wave
  conversationOpener: number; // opened a chat but hasn't sent yet
  messageSender: number;  // sent at least one message (deepest engagement)
}

export interface ActivityPatterns {
  windowDays: number;
  totalActiveUsers: number;  // distinct users with any activity_daily doc in window
  peakHours: PeakHourPoint[];
  engagementBuckets: EngagementBuckets;
  // "sessions" ≈ heartbeatCount summed across the window; not a true session
  // count (heartbeat is 30-min throttled) but a decent proxy for time-in-app.
  avgHeartbeatsPerUser: number;
}

function yyyymmdd(d: Date): string {
  return (
    d.getFullYear().toString().padStart(4, '0') +
    (d.getMonth() + 1).toString().padStart(2, '0') +
    d.getDate().toString().padStart(2, '0')
  );
}

/**
 * Aggregate the last N days of `activity_daily` docs across all users.
 * Firestore collection-group query with a single string-range filter on
 * `dayKey` runs without a composite index. Returns zeroed defaults on
 * failure so the page still renders while data is accumulating.
 */
export async function getActivityPatterns(
  days: number,
): Promise<ActivityPatterns> {
  const fromKey = yyyymmdd(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  const hourCounts = new Array<number>(24).fill(0);
  const uidsInWindow = new Set<string>();
  const uidsWithHour = new Array<Set<string>>(24)
    .fill(null as unknown as Set<string>)
    .map(() => new Set<string>());

  const bucketUsers = {
    messageSender: new Set<string>(),
    conversationOpener: new Set<string>(),
    waveSender: new Set<string>(),
    visitOnly: new Set<string>(),
  };
  let totalHeartbeats = 0;

  try {
    const q = query(
      collectionGroup(db, 'activity_daily'),
      where('dayKey', '>=', fromKey),
    );
    const snap = await getDocs(q);
    for (const doc of snap.docs) {
      // Parent path: users/{uid}/activity_daily/{yyyymmdd}
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      uidsInWindow.add(uid);

      const data = doc.data();
      const hoursActive = Array.isArray(data.hoursActive) ? data.hoursActive : [];
      for (const raw of hoursActive) {
        const h = Number(raw);
        if (Number.isInteger(h) && h >= 0 && h < 24) {
          uidsWithHour[h].add(uid);
        }
      }

      const heartbeats = Number(data.heartbeatCount ?? 0);
      if (Number.isFinite(heartbeats)) totalHeartbeats += heartbeats;

      // Bucket the user at their highest engagement tier. A single user with
      // both waves and messages counts once as "messageSender" (the highest).
      const messages = Number(data.messagesSent ?? 0);
      const conversations = Number(data.conversationsOpened ?? 0);
      const waves = Number(data.wavesSent ?? 0);
      if (messages > 0) bucketUsers.messageSender.add(uid);
      else if (conversations > 0) bucketUsers.conversationOpener.add(uid);
      else if (waves > 0) bucketUsers.waveSender.add(uid);
    }
  } catch (e) {
    console.warn('[getActivityPatterns] failed:', e);
    return {
      windowDays: days,
      totalActiveUsers: 0,
      peakHours: hourCounts.map((_, hour) => ({ hour, count: 0 })),
      engagementBuckets: {
        visitOnly: 0,
        waveSender: 0,
        conversationOpener: 0,
        messageSender: 0,
      },
      avgHeartbeatsPerUser: 0,
    };
  }

  for (let h = 0; h < 24; h++) hourCounts[h] = uidsWithHour[h].size;

  // Visit-only bucket = active user not caught by any deeper tier.
  for (const uid of uidsInWindow) {
    if (
      !bucketUsers.messageSender.has(uid) &&
      !bucketUsers.conversationOpener.has(uid) &&
      !bucketUsers.waveSender.has(uid)
    ) {
      bucketUsers.visitOnly.add(uid);
    }
  }

  return {
    windowDays: days,
    totalActiveUsers: uidsInWindow.size,
    peakHours: hourCounts.map((count, hour) => ({ hour, count })),
    engagementBuckets: {
      visitOnly: bucketUsers.visitOnly.size,
      waveSender: bucketUsers.waveSender.size,
      conversationOpener: bucketUsers.conversationOpener.size,
      messageSender: bucketUsers.messageSender.size,
    },
    avgHeartbeatsPerUser:
      uidsInWindow.size > 0
        ? Math.round((totalHeartbeats / uidsInWindow.size) * 10) / 10
        : 0,
  };
}

// ─── Data Maintenance — Orphan Post Sweep ────────────────────────────────────
//
// `users/{uid}/posts` is a subcollection. The mobile app's public "내 주변에서"
// feed uses a collectionGroup('posts') query, so any post whose parent user
// doc was deleted without cascading the subcollection leaks through and
// renders as "탈퇴한 회원". Going forward, governance_service.delete_account()
// in the backend deletes the posts subcollection before the root user doc,
// so new orphans don't accumulate — this sweep cleans up pre-existing
// orphans from Firebase Console deletes, auth-only deletions, and older
// code paths.

export interface OrphanPostSweepResult {
  scanned: number;
  orphans: number;
  deleted: number;
  errors: number;
  /** Sample of orphan post paths (capped to a small number for UI display). */
  sample: Array<{ uid: string; postId: string; createdAt?: Date | null }>;
  /** Walltime in ms. */
  elapsedMs: number;
}

interface SweepOptions {
  /** If true, count + collect samples but do NOT delete. */
  dryRun: boolean;
  /** Stop after this many posts scanned. 0 = no limit. Default 0. */
  maxScan?: number;
  /** Sample posts to include in result (for UI). Default 10. */
  sampleSize?: number;
}

/**
 * Scan every `users/*\/posts` doc and delete those whose parent user doc no
 * longer exists. Per-uid existence is cached so a user with hundreds of
 * orphan posts costs only one extra Firestore read.
 *
 * Batches deletes 400 at a time (Firestore caps at 500/batch, leaving slack
 * for retries). Idempotent — safe to re-run.
 */
export async function sweepOrphanPosts(
  options: SweepOptions
): Promise<OrphanPostSweepResult> {
  const { dryRun, maxScan = 0, sampleSize = 10 } = options;
  const started = Date.now();

  const parentExistsCache = new Map<string, boolean>();
  const sample: OrphanPostSweepResult['sample'] = [];
  const result: OrphanPostSweepResult = {
    scanned: 0,
    orphans: 0,
    deleted: 0,
    errors: 0,
    sample,
    elapsedMs: 0,
  };

  // Read ALL posts via collectionGroup. For our scale (early product, low
  // thousands of posts) this is well within Firestore's read budget; if we
  // ever cross into the tens-of-thousands range we'd switch to a paged
  // cursor approach. Today the simple version wins.
  const snap = await getDocs(collectionGroup(db, 'posts'));

  // Queue of refs to delete; flushed in 400-doc batches.
  let pendingBatch = writeBatch(db);
  let pendingCount = 0;

  const flushBatch = async () => {
    if (pendingCount === 0) return;
    try {
      await pendingBatch.commit();
      result.deleted += pendingCount;
    } catch (err) {
      console.error('[sweepOrphanPosts] batch commit failed', err);
      result.errors += pendingCount;
    }
    pendingBatch = writeBatch(db);
    pendingCount = 0;
  };

  for (const postDoc of snap.docs) {
    if (maxScan > 0 && result.scanned >= maxScan) break;
    result.scanned += 1;

    try {
      const userRef = postDoc.ref.parent.parent;
      // Defensive: collectionGroup could in principle match a top-level
      // "posts" collection or some `circles/{cid}/posts` we don't own.
      // Constrain strictly to `users/{uid}/posts` to avoid any cross-
      // collection collateral damage.
      if (!userRef || userRef.parent.id !== 'users') continue;

      const uid = userRef.id;
      if (!parentExistsCache.has(uid)) {
        const userSnap = await getDoc(userRef);
        parentExistsCache.set(uid, userSnap.exists());
      }
      if (parentExistsCache.get(uid)) continue; // parent alive → keep

      result.orphans += 1;
      if (sample.length < sampleSize) {
        const data = postDoc.data() as Record<string, unknown>;
        const createdAtRaw = data.createdAt as Timestamp | undefined;
        sample.push({
          uid,
          postId: postDoc.id,
          createdAt: createdAtRaw ? createdAtRaw.toDate() : null,
        });
      }

      if (!dryRun) {
        pendingBatch.delete(postDoc.ref);
        pendingCount += 1;
        if (pendingCount >= 400) {
          await flushBatch();
        }
      }
    } catch (err) {
      result.errors += 1;
      console.error('[sweepOrphanPosts] error on post', postDoc.ref.path, err);
    }
  }

  if (!dryRun) {
    await flushBatch();
  }

  result.elapsedMs = Date.now() - started;
  return result;
}

/**
 * Same pattern as sweepOrphanPosts but for `circles/{cid}/posts` whose parent
 * circle doc no longer exists. Going forward, deleteCircle() above cascades
 * properly; this cleans up posts from circles deleted before that fix
 * landed (or via Firebase Console / older code paths).
 *
 * Also deletes each post's `comments` subcollection — those are leaves of
 * the same dead branch.
 */
export async function sweepOrphanCirclePosts(
  options: SweepOptions
): Promise<OrphanPostSweepResult> {
  const { dryRun, maxScan = 0, sampleSize = 10 } = options;
  const started = Date.now();

  const parentExistsCache = new Map<string, boolean>();
  const sample: OrphanPostSweepResult['sample'] = [];
  const result: OrphanPostSweepResult = {
    scanned: 0,
    orphans: 0,
    deleted: 0,
    errors: 0,
    sample,
    elapsedMs: 0,
  };

  const snap = await getDocs(collectionGroup(db, 'posts'));

  let pendingBatch = writeBatch(db);
  let pendingCount = 0;

  const flushBatch = async () => {
    if (pendingCount === 0) return;
    try {
      await pendingBatch.commit();
      result.deleted += pendingCount;
    } catch (err) {
      console.error('[sweepOrphanCirclePosts] batch commit failed', err);
      result.errors += pendingCount;
    }
    pendingBatch = writeBatch(db);
    pendingCount = 0;
  };

  for (const postDoc of snap.docs) {
    if (maxScan > 0 && result.scanned >= maxScan) break;
    result.scanned += 1;

    try {
      const parentRef = postDoc.ref.parent.parent;
      // Only consider posts whose immediate parent is `circles/{cid}` —
      // ignore `users/{uid}/posts` which is the other sweep's domain.
      if (!parentRef || parentRef.parent.id !== 'circles') continue;

      const cid = parentRef.id;
      if (!parentExistsCache.has(cid)) {
        const circleSnap = await getDoc(parentRef);
        parentExistsCache.set(cid, circleSnap.exists());
      }
      if (parentExistsCache.get(cid)) continue;

      result.orphans += 1;
      if (sample.length < sampleSize) {
        const data = postDoc.data() as Record<string, unknown>;
        const createdAtRaw = data.createdAt as Timestamp | undefined;
        sample.push({
          uid: cid, // reuse the field — UI labels it generically
          postId: postDoc.id,
          createdAt: createdAtRaw ? createdAtRaw.toDate() : null,
        });
      }

      if (!dryRun) {
        // Delete this orphan post's comments subcollection first, then
        // the post itself. Comments per post are small; reading them
        // inline is fine.
        const commentsSnap = await getDocs(
          collection(postDoc.ref, 'comments')
        );
        for (const c of commentsSnap.docs) {
          pendingBatch.delete(c.ref);
          pendingCount += 1;
          if (pendingCount >= 400) await flushBatch();
        }

        pendingBatch.delete(postDoc.ref);
        pendingCount += 1;
        if (pendingCount >= 400) await flushBatch();
      }
    } catch (err) {
      result.errors += 1;
      console.error(
        '[sweepOrphanCirclePosts] error on post',
        postDoc.ref.path,
        err
      );
    }
  }

  if (!dryRun) await flushBatch();

  result.elapsedMs = Date.now() - started;
  return result;
}

// ─── 결 유형 테스트 (무가입) 이벤트 집계 ────────────────────────────────────
//
// 마케팅 웹(tita-app.com/gyeol)의 무가입 결 유형 테스트 이벤트를 백엔드가
// `gyeol_test_events` 컬렉션에 적재한다(익명 — 개인식별정보 없음). 여기서
// 집계해 대시보드에 "몇 명·어떤 유형·어디서·다운 전환"을 보여준다.
//
// 규모 주의: 클라이언트에서 최근 N건만 읽어 집계한다(현재 2000건 캡). 초기
// 볼륨엔 충분. 커지면 백엔드 집계 엔드포인트로 이관.

export interface GyeolStats {
  totals: { start: number; complete: number; share: number; download: number };
  completionRate: number; // complete / start
  downloadRate: number; // download / complete
  typeDistribution: { type: string; count: number }[]; // completes 기준, 내림차순
  bySource: { source: string; count: number }[]; // completes 기준, 내림차순
  genderDistribution: { gender: string; count: number }[]; // completes 기준 (f/m/na)
  comfortDistribution: { comfort: string; count: number }[]; // completes 기준 (same/any/opp)
  femaleShare: number; // f / (f+m), 성비 핵심 지표 (na 제외)
  daily: { date: string; start: number; complete: number }[]; // 최근 14일
  recent: { createdAt?: Date; phase: string; type: string | null; source: string | null }[];
  capped: boolean; // 2000건 캡에 걸렸는지
}

export const GYEOL_GENDER_LABELS: Record<string, string> = {
  f: '여성', m: '남성', na: '선택 안 함',
};
export const GYEOL_COMFORT_LABELS: Record<string, string> = {
  same: '동성 친구가 편해요', any: '상관없어요, 결만 맞으면', opp: '이성 친구도 좋아요',
};

const GYEOL_TYPE_NAMES: Record<string, string> = {
  FDP: '다정한 정원사', FDL: '따뜻한 즉흥파', FBP: '동네 분위기 메이커',
  FBL: '흥 많은 마당발', SDP: '조용한 진심', SDL: '느긋한 사색가',
  SBP: '선을 지키는 다정', SBL: '편안한 산책 친구',
};

export function gyeolTypeLabel(code: string | null): string {
  if (!code) return '—';
  return GYEOL_TYPE_NAMES[code] ? `${GYEOL_TYPE_NAMES[code]} (${code})` : code;
}

export async function getGyeolStats(): Promise<GyeolStats> {
  const CAP = 2000;
  const snap = await getDocs(
    query(collection(db, 'gyeol_test_events'), orderBy('createdAt', 'desc'), limit(CAP))
  );

  const totals = { start: 0, complete: 0, share: 0, download: 0 };
  const typeCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();
  const genderCount = new Map<string, number>();
  const comfortCount = new Map<string, number>();
  const dayMap = new Map<string, { start: number; complete: number }>();
  const recent: GyeolStats['recent'] = [];

  snap.forEach((d) => {
    const data = d.data() as DocumentData;
    const phase = String(data.phase ?? '');
    if (phase in totals) totals[phase as keyof typeof totals] += 1;

    const type = (data.gyeolType ?? null) as string | null;
    const source = (data.source ?? null) as string | null;
    const gender = (data.gender ?? null) as string | null;
    const comfort = (data.comfort ?? null) as string | null;
    const createdAt = toDate(data.createdAt);

    if (phase === 'complete') {
      if (type) typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
      const s = source || '(직접/알수없음)';
      sourceCount.set(s, (sourceCount.get(s) ?? 0) + 1);
      if (gender) genderCount.set(gender, (genderCount.get(gender) ?? 0) + 1);
      if (comfort) comfortCount.set(comfort, (comfortCount.get(comfort) ?? 0) + 1);
    }
    if ((phase === 'start' || phase === 'complete') && createdAt) {
      const key = createdAt.toISOString().slice(0, 10);
      const row = dayMap.get(key) ?? { start: 0, complete: 0 };
      if (phase === 'start') row.start += 1;
      else row.complete += 1;
      dayMap.set(key, row);
    }
    if (recent.length < 40) {
      recent.push({ createdAt, phase, type, source });
    }
  });

  const typeDistribution = [...typeCount.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const bySource = [...sourceCount.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
  // 유형 순서 고정(f, any, opp / f, m, na)으로 뒀다면 좋지만, 단순 내림차순으로.
  const genderDistribution = [...genderCount.entries()]
    .map(([gender, count]) => ({ gender, count }))
    .sort((a, b) => b.count - a.count);
  const comfortDistribution = [...comfortCount.entries()]
    .map(([comfort, count]) => ({ comfort, count }))
    .sort((a, b) => b.count - a.count);
  const fCount = genderCount.get('f') ?? 0;
  const mCount = genderCount.get('m') ?? 0;
  const femaleShare = fCount + mCount > 0 ? fCount / (fCount + mCount) : 0;
  const daily = [...dayMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  return {
    totals,
    completionRate: totals.start ? totals.complete / totals.start : 0,
    downloadRate: totals.complete ? totals.download / totals.complete : 0,
    typeDistribution,
    bySource,
    genderDistribution,
    comfortDistribution,
    femaleShare,
    daily,
    recent,
    capped: snap.size >= CAP,
  };
}

// ─── 티타임 가격 스모크 테스트 ─────────────────────────────────────────
// 마케팅 웹 /titatime 방문자를 가격 암(free/9900/19000)에 랜덤 배정하고
// "이 자리 신청하기" 클릭(=지불 의사의 행동 신호)을 backend가
// `titatime_events`에 적재한다. 여기서 암별 view→apply 전환을 집계 —
// "45+가 유료 티타임에 신청할까"를 인터뷰가 아니라 행동으로 읽는 실험.

export interface TitatimeStats {
  totals: { view: number; apply: number; download: number };
  byArm: {
    arm: string;
    views: number;
    applies: number;
    downloads: number;
    applyRate: number; // applies / views
  }[];
  byDistrict: { district: string; applies: number }[];
  recent: {
    createdAt?: Date;
    phase: string;
    arm: string | null;
    district: string | null;
    source: string | null;
  }[];
  capped: boolean;
}

export const TITATIME_ARM_LABELS: Record<string, string> = {
  free: '무료 (첫 모임)', '9900': '9,900원', '19000': '19,000원',
};

export async function getTitatimeStats(): Promise<TitatimeStats> {
  const CAP = 2000;
  const snap = await getDocs(
    query(collection(db, 'titatime_events'), orderBy('createdAt', 'desc'), limit(CAP))
  );

  const totals = { view: 0, apply: 0, download: 0 };
  const armMap = new Map<string, { views: number; applies: number; downloads: number }>();
  const districtCount = new Map<string, number>();
  const recent: TitatimeStats['recent'] = [];

  snap.forEach((d) => {
    const data = d.data() as DocumentData;
    const phase = String(data.phase ?? '');
    if (phase in totals) totals[phase as keyof typeof totals] += 1;

    const arm = (data.priceArm ?? null) as string | null;
    const district = (data.district ?? null) as string | null;
    const source = (data.source ?? null) as string | null;
    const createdAt = toDate(data.createdAt);

    if (arm) {
      const row = armMap.get(arm) ?? { views: 0, applies: 0, downloads: 0 };
      if (phase === 'view') row.views += 1;
      else if (phase === 'apply') row.applies += 1;
      else if (phase === 'download') row.downloads += 1;
      armMap.set(arm, row);
    }
    if (phase === 'apply' && district) {
      districtCount.set(district, (districtCount.get(district) ?? 0) + 1);
    }
    if (recent.length < 40) {
      recent.push({ createdAt, phase, arm, district, source });
    }
  });

  const byArm = [...armMap.entries()]
    .map(([arm, v]) => ({
      ...v,
      arm,
      applyRate: v.views > 0 ? v.applies / v.views : 0,
    }))
    // 무료 → 저가 → 고가 순으로 고정 (지불의사 계단이 한눈에 보이게)
    .sort((a, b) => {
      const order = ['free', '9900', '19000'];
      const ia = order.indexOf(a.arm);
      const ib = order.indexOf(b.arm);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  const byDistrict = [...districtCount.entries()]
    .map(([district, applies]) => ({ district, applies }))
    .sort((a, b) => b.applies - a.applies);

  return { totals, byArm, byDistrict, recent, capped: snap.size >= CAP };
}

// ── 자동 결모임 — 자리표 수요 · 제안 성사 현황 ─────────────────────────────
// 데이터: users/*/gyeol_moim_tickets (collectionGroup, 어드민 read 룰) +
// gyeol_moim_proposals (backend /moim/assemble이 생성, Cloud Function이
// 수락 집계·방 생성). 성립 안 되는 만남 자리표는 그대로 동네 수요 지도.

export interface MoimStats {
  tickets: {
    total: number;
    active: number;
    paused: number;
    chat: number; // active 중 대화 자리
    meet: number; // active 중 만나는 자리
    thisWeek: number; // active 중 '이번 주 안엔'
  };
  meetDemand: { district: string; count: number; couple: number }[];
  topicDemand: { topic: string; count: number }[];
  proposals: {
    total: number;
    proposed: number;
    roomCreated: number;
    expired: number;
    notFormed: number;
    inviteAcceptRate: number | null; // 응답 슬롯 중 수락 비율
    responseRate: number | null; // 초대 슬롯 중 응답 비율
    avgMinPair: number | null; // 방 생성된 제안의 평균 minPair (캘리브레이션)
  };
  recentProposals: {
    createdAt: Date | null;
    type: string;
    district: string | null;
    members: number;
    accepted: number;
    responded: number;
    status: string;
    minPair: number | null;
  }[];
  // 최근 등록된 자리표 — 누가·뭘·언제 (등록자 이름/uid 포함)
  recentTickets: {
    uid: string;
    displayName: string;
    type: string; // 'chat' | 'meet'
    active: boolean;
    party: string | null; // meet만: solo/couple
    district: string | null;
    timeSlots: string[];
    topics: string[];
    urgency: string;
    createdAt: Date | null;
  }[];
  capped: boolean;
}

export async function getMoimStats(): Promise<MoimStats> {
  const CAP = 2000;

  const ticketSnap = await getDocs(
    query(collectionGroup(db, 'gyeol_moim_tickets'), limit(CAP))
  );
  const tickets = { total: 0, active: 0, paused: 0, chat: 0, meet: 0, thisWeek: 0 };
  const districtCount = new Map<string, { count: number; couple: number }>();
  const topicCount = new Map<string, number>();
  // 자리표 문서 경로: users/{uid}/gyeol_moim_tickets/{id} → 부모의 부모가 등록자.
  const ticketRows: {
    uid: string;
    data: DocumentData;
    createdAt: Date | null;
  }[] = [];
  ticketSnap.forEach((d) => {
    const t = d.data() as DocumentData;
    tickets.total += 1;
    const uid = d.ref.parent.parent?.id ?? '(알 수 없음)';
    ticketRows.push({ uid, data: t, createdAt: toDate(t.createdAt) ?? null });
    if (t.active !== true) {
      tickets.paused += 1;
      return;
    }
    tickets.active += 1;
    if (t.type === 'meet') {
      tickets.meet += 1;
      const district = String(t.district ?? '(동네 미설정)');
      const row = districtCount.get(district) ?? { count: 0, couple: 0 };
      row.count += 1;
      if (t.party === 'couple') row.couple += 1;
      districtCount.set(district, row);
    } else {
      tickets.chat += 1;
    }
    if (t.urgency === 'this_week') tickets.thisWeek += 1;
    for (const topic of (t.topics as string[] | undefined) ?? []) {
      topicCount.set(topic, (topicCount.get(topic) ?? 0) + 1);
    }
  });

  // 최근 등록순 상위 40장의 등록자 이름을 한 번에 조회 (중복 uid 제거).
  ticketRows.sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  const recentSlice = ticketRows.slice(0, 40);
  const nameByUid = new Map<string, string>();
  await Promise.all(
    [...new Set(recentSlice.map((r) => r.uid))].map(async (uid) => {
      if (uid === '(알 수 없음)') return;
      try {
        const u = await getDoc(doc(db, 'users', uid));
        nameByUid.set(uid, (u.data()?.displayName as string) || '(이름 없음)');
      } catch {
        nameByUid.set(uid, '(조회 실패)');
      }
    }),
  );
  const recentTickets: MoimStats['recentTickets'] = recentSlice.map((r) => {
    const t = r.data;
    return {
      uid: r.uid,
      displayName: nameByUid.get(r.uid) ?? '(이름 없음)',
      type: String(t.type ?? 'chat'),
      active: t.active === true,
      party: (t.party as string | null) ?? null,
      district: (t.districtName as string | null) ?? (t.district as string | null) ?? null,
      timeSlots: (t.timeSlots as string[] | undefined) ?? [],
      topics: (t.topics as string[] | undefined) ?? [],
      urgency: String(t.urgency ?? 'anytime'),
      createdAt: r.createdAt,
    };
  });

  const proposalSnap = await getDocs(
    query(collection(db, 'gyeol_moim_proposals'), orderBy('createdAt', 'desc'), limit(CAP))
  );
  const proposals = {
    total: 0, proposed: 0, roomCreated: 0, expired: 0, notFormed: 0,
    inviteAcceptRate: null as number | null,
    responseRate: null as number | null,
    avgMinPair: null as number | null,
  };
  let slots = 0;
  let responded = 0;
  let accepted = 0;
  let minPairSum = 0;
  let minPairN = 0;
  const recentProposals: MoimStats['recentProposals'] = [];
  proposalSnap.forEach((d) => {
    const p = d.data() as DocumentData;
    proposals.total += 1;
    const status = String(p.status ?? 'proposed');
    if (status === 'proposed') proposals.proposed += 1;
    else if (status === 'room_created') proposals.roomCreated += 1;
    else if (status === 'expired') proposals.expired += 1;
    else if (status === 'not_formed') proposals.notFormed += 1;

    const members = (p.members as string[] | undefined) ?? [];
    const accepts = (p.accepts as Record<string, boolean> | undefined) ?? {};
    const respondedHere = Object.keys(accepts).length;
    const acceptedHere = Object.values(accepts).filter((v) => v === true).length;
    slots += members.length;
    responded += respondedHere;
    accepted += acceptedHere;

    const minPair = typeof p.scores?.minPair === 'number' ? p.scores.minPair : null;
    if (status === 'room_created' && minPair !== null) {
      minPairSum += minPair;
      minPairN += 1;
    }
    if (recentProposals.length < 40) {
      recentProposals.push({
        createdAt: toDate(p.createdAt) ?? null,
        type: String(p.type ?? 'chat'),
        district: (p.district as string | null) ?? null,
        members: members.length,
        accepted: acceptedHere,
        responded: respondedHere,
        status,
        minPair,
      });
    }
  });
  proposals.responseRate = slots > 0 ? responded / slots : null;
  proposals.inviteAcceptRate = responded > 0 ? accepted / responded : null;
  proposals.avgMinPair = minPairN > 0 ? minPairSum / minPairN : null;

  const meetDemand = [...districtCount.entries()]
    .map(([district, v]) => ({ district, ...v }))
    .sort((a, b) => b.count - a.count);
  const topicDemand = [...topicCount.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

  return {
    tickets,
    meetDemand,
    topicDemand,
    proposals,
    recentProposals,
    recentTickets,
    capped: ticketSnap.size >= CAP || proposalSnap.size >= CAP,
  };
}

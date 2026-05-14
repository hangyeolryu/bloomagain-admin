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
} from 'firebase/firestore';

// Cursor-based pagination result
export type PaginatedResult<T> = {
  items: T[];
  lastDoc: QueryDocumentSnapshot | null;
};
import { db } from './firebase';
import type { AdminRole, UserProfile, Circle, CircleEvent, Report, AdminAlert, SuspiciousMessage, DashboardStats, UserActivity, Announcement, AnnouncementType, Wave, Conversation, DeleteRequest, DeleteRequestStatus, SupportInquiry, SupportInquiryStatus } from '@/types';

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

export async function getUsers(
  pageSize = 30,
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<UserProfile>> {
  const q = query(
    collection(db, 'users'),
    orderBy('__name__'),
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
      lastActiveAt: toDate(d.data().lastActiveAt),
      blacklistedAt: toDate(d.data().blacklistedAt),
      identityVerifiedAt: toDate(d.data().identityVerifiedAt),
    })) as UserProfile[],
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

export async function getUser(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return {
    id: snap.id,
    ...snap.data(),
    createdAt: toDate(snap.data().createdAt),
    updatedAt: toDate(snap.data().updatedAt),
    lastActiveAt: toDate(snap.data().lastActiveAt),
    identityVerifiedAt: toDate(snap.data().identityVerifiedAt),
  } as UserProfile;
}

export async function updateUserStatus(uid: string, status: string) {
  await updateDoc(doc(db, 'users', uid), { accountStatus: status, updatedAt: Timestamp.now() });
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
  await deleteDoc(doc(db, 'circles', id));
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

  // 2) Aggregate counts via collectionGroup. These are O(1) reads — they only
  //    return the count, not the docs. Both indexes must exist (Firebase will
  //    surface a console error with the create-index URL if not).
  const [totalDailyAnswers, totalMiniPulseResponses] = await Promise.all([
    safeCount(collection(db, 'users'), '__placeholder__').then(async () => {
      // Use collectionGroup for daily answers
      try {
        const cg = collectionGroup(db, 'dailyQuestions');
        const snap = await getCountFromServer(cg);
        return snap.data().count;
      } catch (e) {
        console.warn('[data-collection] dailyQuestions count failed:', e);
        return 0;
      }
    }),
    (async () => {
      try {
        const cg = collectionGroup(db, 'mini_pulses');
        const snap = await getCountFromServer(cg);
        return snap.data().count;
      } catch (e) {
        console.warn('[data-collection] mini_pulses count failed:', e);
        return 0;
      }
    })(),
  ]);

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
  };
}

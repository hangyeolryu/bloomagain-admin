import {
  collection,
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

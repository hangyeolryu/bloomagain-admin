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
  updateDoc,
  Timestamp,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  arrayRemove,
  increment,
  documentId,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AdminRole, UserProfile, Circle, CircleEvent, Report, AdminAlert, SuspiciousMessage, DashboardStats, Announcement, AnnouncementType } from '@/types';

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

export async function getUsers(limitCount = 200): Promise<UserProfile[]> {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: toDate(d.data().createdAt),
    updatedAt: toDate(d.data().updatedAt),
    lastActiveAt: toDate(d.data().lastActiveAt),
    blacklistedAt: toDate(d.data().blacklistedAt),
  })) as UserProfile[];
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
  } as UserProfile;
}

export async function updateUserStatus(uid: string, status: string) {
  await updateDoc(doc(db, 'users', uid), { accountStatus: status, updatedAt: Timestamp.now() });
}

export async function blockUser(uid: string, reason: string, adminUid: string) {
  await updateDoc(doc(db, 'users', uid), {
    isBlacklisted: true,
    blacklistedAt: Timestamp.now(),
    blacklistReason: reason,
    blacklistedBy: adminUid,
    accountStatus: 'blocked',
    updatedAt: Timestamp.now(),
  });
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

export async function getCircles(limitCount = 100): Promise<Circle[]> {
  const q = query(collection(db, 'circles'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: toDate(d.data().createdAt),
    updatedAt: toDate(d.data().updatedAt),
  })) as Circle[];
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

export async function getReports(statusFilter?: string): Promise<Report[]> {
  let q;
  if (statusFilter && statusFilter !== 'all') {
    q = query(
      collection(db, 'reports'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
  } else {
    q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: toDate(d.data().createdAt),
    resolvedAt: toDate(d.data().resolvedAt),
  })) as Report[];
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

export async function getAdminAlerts(limitCount = 50): Promise<AdminAlert[]> {
  const q = query(
    collection(db, 'admin_alerts'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    timestamp: toDate(d.data().timestamp),
  })) as AdminAlert[];
}

export async function resolveAlert(alertId: string) {
  await updateDoc(doc(db, 'admin_alerts', alertId), { resolved: true });
}

export async function getSuspiciousMessages(limitCount = 50): Promise<SuspiciousMessage[]> {
  const q = query(
    collection(db, 'suspicious_messages'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    timestamp: toDate(d.data().timestamp),
  })) as SuspiciousMessage[];
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const [usersSnap, circlesSnap, reportsSnap, alertsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'circles')),
    getDocs(query(collection(db, 'reports'), where('status', '==', 'pending'))),
    getDocs(query(collection(db, 'admin_alerts'), where('resolved', '==', false))),
  ]);

  const users = usersSnap.docs.map((d) => d.data());
  return {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.accountStatus === 'active' || !u.accountStatus).length,
    blockedUsers: users.filter((u) => u.isBlacklisted || u.accountStatus === 'blocked').length,
    pendingReports: reportsSnap.size,
    unresolvedAlerts: alertsSnap.size,
    totalCircles: circlesSnap.size,
  };
}

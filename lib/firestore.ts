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

// ─── 티타임(고정 슬롯) 예약 명단 ─────────────────────────────────────────────
// 앱의 teatime_signup_sheet가 teatime_signups/{eventId}__{uid}에 쓴다.
// 누가 오는지 명단을 보고 장소 확정·문자 안내에 쓴다.
export interface TeatimeSignup {
  id: string;
  eventId: string;
  uid: string;
  name?: string;
  region?: string;
  gender?: string;
  status?: string;
  createdAt?: Date;
}

export async function getTeatimeSignups(): Promise<TeatimeSignup[]> {
  const snap = await getDocs(collection(db, 'teatime_signups'));
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        eventId: (x.eventId as string) ?? '',
        uid: (x.uid as string) ?? '',
        name: x.name as string | undefined,
        region: x.region as string | undefined,
        gender: x.gender as string | undefined,
        status: (x.status as string) ?? 'requested',
        createdAt: toDate(x.createdAt),
      };
    })
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
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

/**
 * Audit an operator opening a member-only 결(moim) group room to read its
 * conversation content. Same append-only `admin_pii_access_logs` collection as
 * identity reveals — operators are not participants of these rooms, so every
 * content view is logged (who, when, which room, whose messages). Disclosed in
 * the privacy policy (안전 보호 및 서비스 품질 개선 목적, 접근 기록됨).
 *
 * Best-effort: never throws — a logging hiccup must not block the operator.
 */
export async function logMoimRoomAccess(params: {
  viewerUid: string;
  viewerEmail: string | null;
  viewerRole: string | null;
  conversationId: string;
  participantUids: string[];
}): Promise<void> {
  await addDoc(collection(db, 'admin_pii_access_logs'), {
    viewerUid: params.viewerUid,
    viewerEmail: params.viewerEmail,
    viewerRole: params.viewerRole,
    conversationId: params.conversationId,
    participantUids: params.participantUids,
    action: 'view_moim_room',
    viewedAt: serverTimestamp(),
  });
}

/**
 * 계정 차단 + 후처리(대기 웨이브 삭제, 진행 대화에 차단 표시).
 *
 * 차단 자체(1)는 실패하면 throw하지만, 후처리(2·3)는 실패해도 차단을 되돌리지
 * 않는다 — 차단이 걸린 게 더 중요하다. 다만 조용히 넘기면 관리자는 "정리까지
 * 다 됐다"고 믿게 되므로, 실패를 돌려주어 호출부가 토스트로 알린다.
 * (남은 웨이브·표시 안 된 대화는 사람이 직접 확인해야 한다.)
 */
export async function blockUser(
  uid: string,
  reason: string,
  adminUid: string,
): Promise<{ warnings: Array<{ label: string; message: string }> }> {
  const warnings: Array<{ label: string; message: string }> = [];
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
    warnings.push({
      label: '대기 중 웨이브 삭제',
      message: e instanceof Error ? e.message : String(e),
    });
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
    warnings.push({
      label: '진행 중 대화에 차단 표시',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return { warnings };
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
  // 'message' | 'circle' | 'profile_image' | 'client_filter' …
  // 배열을 주면 여러 소스를 한 번에 본다(같은 복합 인덱스로 동작).
  source?: string | string[],
  cursor?: QueryDocumentSnapshot,
): Promise<PaginatedResult<SuspiciousMessage>> {
  const sourceFilter = Array.isArray(source)
    ? [where('source', 'in', source)]
    : source
      ? [where('source', '==', source)]
      : [];
  const q = query(
    collection(db, 'suspicious_messages'),
    ...sourceFilter,
    orderBy('timestamp', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  return {
    items: snap.docs.map((d) => {
      const x = d.data();
      return {
        ...x,
        id: d.id,
        // 본문 필드 이름이 쓰는 쪽마다 다르다 — 서버(analyzeMessage)는 content,
        // 앱의 클라 필터(recordClientDecision)는 message. 맞춰 읽지 않으면
        // 클라가 막은 건이 본문 없이 빈 줄로 뜬다(2026-08-01 확인).
        content: x.content ?? x.message ?? '',
        timestamp: toDate(x.timestamp),
      };
    }) as SuspiciousMessage[],
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

// ─── 안전 센터 통합 집계 ──────────────────────────────────────────────────────
// 신뢰·안전의 4개 표면을 한 번에: 처리 필요한 큐(신고 pending·알림 unresolved)의
// 건수+상위, 최근 활동 로그(의심 메시지·보안 이벤트). /dashboard/safety 랜딩용.
export interface SafetyOverview {
  pendingReports: number;
  unresolvedAlerts: number;
  topReports: Report[];
  topAlerts: AdminAlert[];
  recentMessages: SuspiciousMessage[];
  recentSecurity: {
    id: string;
    action: string;
    userId?: string;
    reason?: string;
    createdAt?: Date;
  }[];
}

export async function getSafetyOverview(): Promise<SafetyOverview> {
  const [pendingReports, unresolvedAlerts, reportsRes, alertsRes, msgsRes, secItems] =
    await Promise.all([
      safeCount(
        query(collection(db, 'reports'), where('status', '==', 'pending')),
        'pending reports',
      ),
      safeCount(
        query(collection(db, 'admin_alerts'), where('resolved', '==', false)),
        'unresolved alerts',
      ),
      getReports('pending', 5),
      getAdminAlerts(5),
      getSuspiciousMessages(5),
      (async () => {
        // 고위험 보안 이벤트(계정 잠금 L3·그림자 차단 L2)만 최근순 5건.
        // action+orderBy 복합 인덱스를 피하려 최근 25건에서 클라이언트 필터.
        try {
          const snap = await getDocs(
            query(
              collection(db, 'interaction_logs'),
              orderBy('created_at', 'desc'),
              limit(25),
            ),
          );
          return snap.docs
            .map((d) => {
              const r = d.data() as Record<string, unknown>;
              const ts = (r.created_at ?? r.createdAt) as
                | { toDate?: () => Date }
                | undefined;
              return {
                id: d.id,
                action: String(r.action ?? ''),
                userId: (r.user_id as string) ?? (r.userId as string) ?? undefined,
                reason: (r.reason as string) ?? undefined,
                createdAt: ts?.toDate?.() ?? undefined,
              };
            })
            .filter((e) => e.action === 'account_lock' || e.action === 'shadow_ban')
            .slice(0, 5);
        } catch {
          return [];
        }
      })(),
    ]);

  return {
    pendingReports,
    unresolvedAlerts,
    topReports: reportsRes.items,
    topAlerts: alertsRes.items.filter((a) => !a.resolved).slice(0, 5),
    recentMessages: msgsRes.items,
    recentSecurity: secItems,
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

/**
 * 카운트 집계. 실패해도 0을 돌려 페이지를 죽이지 않되, [sink]에 실패를 담아
 * 화면(StatWarnings)까지 올린다 — 0과 "못 셌음"이 구분되어야 한다.
 */
async function safeCount(
  q: Parameters<typeof getCountFromServer>[0],
  label: string,
  sink?: Array<{ label: string; message: string }>,
): Promise<number> {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    console.warn(`[getDashboardStats] count failed for "${label}":`, e);
    sink?.push({ label, message: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // 실패한 카운트를 모아 대시보드 상단에 띄운다(조용한 0 방지).
  const warnings: DashboardStats['warnings'] = [];
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
    safeCount(collection(db, 'circles'), 'circles', warnings),
    safeCount(query(collection(db, 'reports'), where('status', '==', 'pending')), 'pending reports', warnings),
    safeCount(query(collection(db, 'admin_alerts'), where('resolved', '==', false)), 'unresolved alerts', warnings),
    safeCount(query(collection(db, 'users'), where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))), 'new users 7d', warnings),
    safeCount(query(collection(db, 'users'), where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))), 'new users 30d', warnings),
    safeCount(query(collection(db, 'users'), where('lastActiveAt', '>=', Timestamp.fromDate(sevenDaysAgo))), 'active users 7d', warnings),
    safeCount(collection(db, 'waves'), 'waves', warnings),
    safeCount(collection(db, 'conversations'), 'conversations', warnings),
    safeCount(query(collection(db, 'delete_requests'), where('status', '==', 'pending')), 'pending delete requests', warnings),
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
    warnings,
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
  usersCompletedProfile: number;    // 온보딩 'completed' — NICE + displayName + (city|interests). 참여율 분모.
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
  // 부분 실패 목록. 집계 하나가 죽어도 페이지 전체를 죽이지는 않지만, 조용히
  // 0을 보여주면 안 된다 — 화면 상단에 그대로 띄운다.
  //
  // ⚠️ 2026-06~07: users/*/analytics_milestones 룰 누락으로 가입경로 집계가
  // permission-denied였는데, 이 자리가 console.warn뿐이라 6주간 "응답 0명"으로만
  // 보였다(245명분 유실). 새 집계를 추가할 때도 반드시 warnings에 담을 것.
  warnings: Array<{ label: string; message: string }>;
  // 온보딩 "어디서 알게 되셨어요?" 응답 집계 (users/*/analytics_milestones)
  acquisitionChannels: Array<{ channel: string; count: number }>;
  acquisitionAnswered: number;      // 응답한 사용자 수 (스킵 제외)
  // 원격 문항 뱅크 런타임 상태 — 하드코딩 대신 실제 gyeolQuestionBank 컬렉션에서
  // 읽는다. 문서가 있으면 앱이 번들 위에 오버레이 적용 중(활성).
  remoteQuestionBank: { total: number; retired: number };
}

/**
 * Compute Firestore-side data-collection metrics. Heavy on reads — should be
 * called sparingly (typical: once per admin page view). For production scale,
 * back this with BigQuery aggregations and cache; for now Firestore direct is
 * accurate and fast enough for the first ~10k users.
 */
export async function getDataCollectionStats(): Promise<DataCollectionStats> {
  // 집계별 부분 실패를 모아 화면까지 올린다. console.warn만 남기면 permission-
  // denied나 인덱스 누락이 "0명"과 구분되지 않는다(2026-06 가입경로 사고).
  const warnings: DataCollectionStats['warnings'] = [];
  const noteFailure = (label: string, e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[data-collection] ${label} failed:`, e);
    warnings.push({ label, message });
  };

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
  let usersCompletedProfile = 0;
  let usersWithTags = 0;
  let usersWithEmbedding = 0;
  let usersAtDailyCap = 0;
  let todaysDailyAnswers = 0;

  for (const d of usersSnap.docs) {
    const data = d.data();
    // 프로필 셋업 완료 = 온보딩 'completed' 단계 (참여율 등 engagement 지표의
    // 올바른 분모 — 가입만 하고 온보딩 안 끝낸 사람을 분모에서 제외).
    if (classifyOnboardingStage(data as UserProfile) === 'completed') usersCompletedProfile++;
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
    noteFailure('결큐 답변 집계', e);
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
    noteFailure('가입 경로 집계', e);
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
      noteFailure('미니펄스 응답 수', e);
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
    noteFailure('미니펄스 태그 표본', e);
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

  // 원격 문항 뱅크 실측 — 문서 수 + 은퇴 수. 앱은 이 컬렉션이 비어있지 않으면
  // 번들 위에 오버레이(retired 제외)를 적용하므로, total>0 = 원격화 '활성'.
  let remoteQuestionBank = { total: 0, retired: 0 };
  try {
    const snap = await getDocs(collection(db, 'gyeolQuestionBank'));
    let retired = 0;
    for (const d of snap.docs) if (d.data().retired === true) retired++;
    remoteQuestionBank = { total: snap.size, retired };
  } catch (e) {
    noteFailure('원격 질문 뱅크', e);
  }

  return {
    totalUsers: usersSnap.size,
    usersCompletedProfile,
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
    remoteQuestionBank,
    warnings,
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
  // 앱(클라이언트) 계측 — users 문서에 직접 쓴 실제 진행/실패 사유.
  // 백엔드 콜백이 없는 조용한 실패(PASS 리턴 실패 등)를 이게 잡는다.
  //   verificationStage: intro_viewed|started|failed|abandoned|verified|blocked
  //   verificationFailReason: 앱이 잡은 실제 실패 사유 (확정)
  //   verificationAttempts: started 횟수
  //   verificationBlockReason: recordNiceBlocked 사유 — underage|nice_failed|
  //     duplicate_identity. 실패 토스트가 뜰 때마다 앱이 저장한다.
  //   blockedYearOfBirth: 연령 미달(underage) 차단 시 NICE가 준 출생연도.
  verificationStage?: string;
  verificationFailReason?: string;
  verificationAttempts?: number;
  verificationBlockReason?: string;
  blockedYearOfBirth?: number;
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
  // 본인인증 '안'에서 어디까지 갔나 — 미인증자만, 계측이 붙은 창(가입 30일 내)에서.
  // 전체 퍼널은 "가입 → NICE 완료"까지만 보여줘서, 정작 제일 큰 누수인
  // NICE 단계 내부가 안 보였다(미인증 127명 중 117명이 시도조차 안 함, 2026-08-02).
  niceStages: { key: string; label: string; count: number }[];
  // 계측이 실제로 닿은 비율 — 이 숫자를 모르면 위 분해를 과신하게 된다.
  niceStageCovered: number;
  niceStageTotal: number;
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
  // 앱 계측(verificationStage)이 실제로 붙은 시점. 그 전 가입자는 기록이 없는
  // 게 정상이라, 분해에 섞으면 "기록 없음"만 커져 아무 것도 못 읽는다.
  const instrumentedSince = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const niceStageCount: Record<string, number> = {};
  let niceStageCovered = 0;
  let niceStageTotal = 0;

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

    // 본인인증 단계 분해 — 아직 인증 안 된 사람만, 계측이 붙은 뒤 가입자만.
    // 그 전 가입자는 기록이 없는 게 당연해서 섞으면 "기록 없음"이 부풀려진다.
    if (data.identityVerified !== true && profile.createdAt
        && profile.createdAt.getTime() >= instrumentedSince) {
      niceStageTotal++;
      const st = (data.verificationStage as string | undefined) ?? '';
      if (st) niceStageCovered++;
      const key = st || 'no_record';
      niceStageCount[key] = (niceStageCount[key] ?? 0) + 1;
    }

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
        // 앱(클라이언트) 계측 — 백엔드 콜백이 없는 조용한 실패까지 잡는 확정 신호.
        const verificationStage = data.verificationStage as string | undefined;
        const verificationFailReason =
          data.verificationFailReason as string | undefined;
        const verificationAttempts =
          typeof data.verificationAttempts === 'number'
            ? data.verificationAttempts
            : undefined;
        // 실패/차단 토스트가 뜰 때마다 앱이 저장한 사유(recordNiceBlocked).
        const verificationBlockReason =
          data.verificationBlockReason as string | undefined;
        const blockedYearOfBirth =
          typeof data.blockedYearOfBirth === 'number'
            ? data.blockedYearOfBirth
            : undefined;

        const attemptSummary = attemptsSummary.get(profile.id);
        let attemptHint: OnboardingAttemptHint | undefined;
        if (stage === 'signed_up') {
          if (
            verificationStage === 'failed' ||
            verificationStage === 'blocked' ||
            verificationBlockReason != null ||
            attemptSummary?.lastStatus === 'failure' ||
            profile.identityVerificationStatus === 'failed'
          ) {
            // 앱이 실패/차단을 명시 기록했으면 확정.
            // (verificationFailReason / verificationBlockReason 이 사유)
            attemptHint = 'failed_recorded';
          } else if (
            verificationStage === 'started' ||
            verificationStage === 'abandoned' ||
            attemptSummary?.lastStatus === 'started'
          ) {
            // Backend init 로그 or 앱이 started/abandoned 기록 = NICE 열고 이탈.
            // 시도는 확정 됨.
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
          verificationStage,
          verificationFailReason,
          verificationAttempts,
          verificationBlockReason,
          blockedYearOfBirth,
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
    // 사람이 읽을 순서로 — 흐름을 따라간다. 0인 단계는 화면에서 접는다.
    niceStages: [
      {key: 'no_record', label: '기록 없음'},
      {key: 'intro_viewed', label: '안내만 보고 나감'},
      {key: 'started', label: '시작했는데 안 끝남'},
      {key: 'failed', label: '실패'},
      {key: 'blocked', label: '차단(연령 미달 등)'},
      {key: 'abandoned', label: '중간 이탈'},
    ].map((x) => ({...x, count: niceStageCount[x.key] ?? 0})),
    niceStageCovered,
    niceStageTotal,
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
  totalUsers: number;    // 가입 완료(본인인증 통과) 회원 수 — 로그인만 한 사람 제외
  totalSignups: number;  // (참고) users 문서 총 수 = 로그인만 한 사람 포함
  dau: number;           // active in last 24h based on lastActiveAt heartbeat
  wau: number;           // last 7d
  mau: number;           // last 30d
  stickiness: number;    // DAU / MAU as a percentage — DAU >20% of MAU is healthy senior comm
  newLast24h: number;    // 최근 24h 가입 완료(본인인증) 회원
  newLast7d: number;
  newLast30d: number;
  // 회원(본인인증 완료) 구성
  gender: { female: number; male: number; unknown: number };
  ageBuckets: { label: string; count: number }[];
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

  const curYear = new Date().getFullYear();
  const ageBucket = (age: number): string => {
    if (age < 45) return '45세 미만';
    if (age <= 49) return '45–49';
    if (age <= 54) return '50–54';
    if (age <= 59) return '55–59';
    if (age <= 64) return '60–64';
    if (age <= 69) return '65–69';
    return '70+';
  };

  const snap = await getDocs(collection(db, 'users'));
  let verified = 0;
  let dau = 0;
  let wau = 0;
  let mau = 0;
  let newLast24h = 0;
  let newLast7d = 0;
  let newLast30d = 0;
  const gender = { female: 0, male: 0, unknown: 0 };
  const ageCounts: Record<string, number> = {};

  for (const d of snap.docs) {
    const data = d.data();
    // 가입 완료 = 본인인증 통과. 로그인만 한 사람(가입만 함)은 모든 지표에서 제외.
    const isVerified = data.identityVerified === true;
    if (!isVerified) continue;
    verified++;

    const lastActive = (data.lastActiveAt as Timestamp | undefined)?.toMillis();
    if (lastActive !== undefined) {
      if (lastActive >= dayAgo) dau++;
      if (lastActive >= weekAgo) wau++;
      if (lastActive >= monthAgo) mau++;
    }

    // 신규 가입도 '완료' 기준(createdAt 근사).
    const created = (data.createdAt as Timestamp | undefined)?.toMillis();
    if (created !== undefined) {
      if (created >= dayAgo) newLast24h++;
      if (created >= weekAgo) newLast7d++;
      if (created >= monthAgo) newLast30d++;
    }

    // 성별
    const g = String(data.gender ?? '').trim().toLowerCase();
    if (['f', 'female', '여', '여성'].includes(g)) gender.female++;
    else if (['m', 'male', '남', '남성'].includes(g)) gender.male++;
    else gender.unknown++;

    // 나이(생년)
    const yob = Number(data.yearOfBirth ?? data.birthYear ?? data.birthyear);
    if (yob && yob > 1900 && yob < curYear) {
      const b = ageBucket(curYear - yob);
      ageCounts[b] = (ageCounts[b] ?? 0) + 1;
    } else {
      ageCounts['미상'] = (ageCounts['미상'] ?? 0) + 1;
    }
  }

  const ORDER = ['45세 미만', '45–49', '50–54', '55–59', '60–64', '65–69', '70+', '미상'];
  const ageBuckets = ORDER
    .map((label) => ({ label, count: ageCounts[label] ?? 0 }))
    .filter((b) => b.count > 0);

  const stickiness = mau > 0 ? Math.round((dau / mau) * 100) : 0;

  return {
    totalUsers: verified,
    totalSignups: snap.size,
    dau,
    wau,
    mau,
    stickiness,
    newLast24h,
    newLast7d,
    newLast30d,
    gender,
    ageBuckets,
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
    if (d.data().identityVerified !== true) continue; // 가입 완료 회원만
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
    const data = doc.data();
    if (data.identityVerified !== true) return; // 가입 완료 회원만
    const ts = data.createdAt as Timestamp | undefined;
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
  // 쿼리 실패 시(예: collectionGroup 인덱스 없음) 원문 에러 메시지.
  // Firestore가 인덱스 생성 링크를 여기 담아줘서 UI에서 그대로 노출한다.
  error?: string;
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
    // dayKey 범위로 윈도우만 읽는다(효율). collectionGroup 범위 쿼리라
    // firestore.indexes.json의 fieldOverrides(activity_daily.dayKey,
    // COLLECTION_GROUP ASC) 인덱스가 필요하다 — 없으면 FAILED_PRECONDITION.
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
      error: e instanceof Error ? e.message : String(e),
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

// ─── Onboarding / Activation Funnel — "0일차 이탈" ───────────────────────────
//
// 탈퇴 설문은 계정을 '정식 삭제'한 사람만 잡는다. 대부분의 0일차 이탈은
// 삭제도 안 하고 그냥 다시 안 여는 사람이라 설문엔 안 보인다. 이 퍼널은
// 행동 데이터로 그들을 드러낸다:
//   가입 → 결큐 첫 답변(≥1) → 게이트 통과(≥3, 사람이 보임) → 재방문(다른 날 접속)
// 신호 출처:
//   - 가입: users.createdAt
//   - 답변: users/{uid}/dailyQuestions 문서 수 (isAdmin read 허용)
//   - 재방문: users/{uid}/activity_daily 의 dayKey 집합에 가입일보다 뒤 날짜 有

export interface ActivationFunnel {
  windowDays: number;
  signups: number;
  answered1: number;   // 결큐 1개 이상 답함
  gateCleared: number; // 3개 이상 = 사람 리스트 잠금 해제
  returnedEligible: number; // 어제까지 가입(재방문 기회가 있었던 사람)
  returned: number;         // 가입일 이후 다른 날 접속
  // 최근 14일 일별 코호트
  daily: {
    date: string;
    signups: number;
    answered1: number;
    gateCleared: number;
    eligible: number;
    returned: number;
  }[];
  // 실패한 집계. activity_daily 쿼리가 죽으면 returned가 조용히 0이 되어
  // "아무도 안 돌아왔다"로 읽힌다 — 그 둘은 반드시 구분되어야 한다.
  warnings: Array<{ label: string; message: string }>;
}

export async function getActivationFunnel(
  windowDays = 30,
): Promise<ActivationFunnel> {
  const warnings: ActivationFunnel['warnings'] = [];
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const fromKey = yyyymmdd(cutoff);
  const todayKey = yyyymmdd(new Date());

  // 1) 코호트: 최근 windowDays 가입자 (createdAt 단일 필드 range+orderBy = 인덱스 불필요)
  const usersSnap = await getDocs(query(
    collection(db, 'users'),
    where('createdAt', '>=', Timestamp.fromDate(cutoff)),
    orderBy('createdAt', 'desc'),
    limit(1000),
  ));
  const cohort = usersSnap.docs
    .map((d) => ({ uid: d.id, createdAt: toDate(d.data().createdAt) }))
    .filter((u): u is { uid: string; createdAt: Date } => !!u.createdAt);

  // 2) 재방문: activity_daily 를 collectionGroup 으로 한 번에 → uid별 활동 날짜 집합
  const activeDays = new Map<string, Set<string>>();
  try {
    const actSnap = await getDocs(query(
      collectionGroup(db, 'activity_daily'),
      where('dayKey', '>=', fromKey),
    ));
    for (const doc of actSnap.docs) {
      const uid = doc.ref.parent.parent?.id;
      const dayKey = String(doc.data().dayKey ?? '');
      if (!uid || !dayKey) continue;
      (activeDays.get(uid) ?? activeDays.set(uid, new Set()).get(uid)!).add(dayKey);
    }
  } catch (e) {
    console.warn('[getActivationFunnel] activity_daily failed:', e);
    warnings.push({
      label: '재방문(활동일) 집계',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  // 3) 답변 수: 유저별 dailyQuestions 카운트 (collectionGroup 권한 이슈 회피 위해
  //    유저별 getCountFromServer, 25개씩 병렬)
  const answerCounts = new Map<string, number>();
  const CHUNK = 25;
  for (let i = 0; i < cohort.length; i += CHUNK) {
    const slice = cohort.slice(i, i + CHUNK);
    await Promise.all(slice.map(async (u) => {
      try {
        const c = await getCountFromServer(
          collection(db, 'users', u.uid, 'dailyQuestions'),
        );
        answerCounts.set(u.uid, c.data().count);
      } catch {
        answerCounts.set(u.uid, 0);
      }
    }));
  }

  // 4) 집계 (+ 일별 코호트)
  const dayAgg = new Map<string, {
    signups: number; answered1: number; gateCleared: number;
    eligible: number; returned: number;
  }>();
  let signups = 0, answered1 = 0, gateCleared = 0, returnedEligible = 0, returned = 0;
  for (const u of cohort) {
    const signupKey = yyyymmdd(u.createdAt);
    const ans = answerCounts.get(u.uid) ?? 0;
    const days = activeDays.get(u.uid) ?? new Set<string>();
    const didReturn = [...days].some((k) => k > signupKey);
    const eligible = signupKey < todayKey; // 재방문 기회가 있었나

    signups++;
    if (ans >= 1) answered1++;
    if (ans >= 3) gateCleared++;
    if (eligible) {
      returnedEligible++;
      if (didReturn) returned++;
    }

    const row = dayAgg.get(signupKey) ?? {
      signups: 0, answered1: 0, gateCleared: 0, eligible: 0, returned: 0,
    };
    row.signups++;
    if (ans >= 1) row.answered1++;
    if (ans >= 3) row.gateCleared++;
    if (eligible) { row.eligible++; if (didReturn) row.returned++; }
    dayAgg.set(signupKey, row);
  }

  const daily = [...dayAgg.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 14)
    .map(([date, r]) => ({ date, ...r }));

  return {
    windowDays, signups, answered1, gateCleared,
    returnedEligible, returned, daily, warnings,
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

export interface OrphanTicketSweepResult {
  scanned: number;
  orphans: number;
  deleted: number;
  errors: number;
  /** Sample of orphan ticket paths (capped for UI display). */
  sample: Array<{ uid: string; ticketId: string; type?: string; createdAt?: Date | null }>;
  elapsedMs: number;
}

/**
 * Scan every `users/*\/gyeol_moim_tickets` doc and delete those whose parent
 * user doc no longer exists (탈퇴로 삭제됨) or is marked isDeleted. Same
 * pattern as sweepOrphanPosts — per-uid validity is cached, deletes batch
 * 400 at a time, idempotent (safe to re-run).
 *
 * Going forward the backend delete_account cascades gyeol_moim_tickets, so
 * this only cleans pre-existing orphans (Firebase Console deletes, older
 * code paths).
 */
export async function sweepOrphanTickets(
  options: SweepOptions
): Promise<OrphanTicketSweepResult> {
  const { dryRun, maxScan = 0, sampleSize = 10 } = options;
  const started = Date.now();

  const parentValidCache = new Map<string, boolean>(); // uid → 유효 회원인가
  const sample: OrphanTicketSweepResult['sample'] = [];
  const result: OrphanTicketSweepResult = {
    scanned: 0,
    orphans: 0,
    deleted: 0,
    errors: 0,
    sample,
    elapsedMs: 0,
  };

  const snap = await getDocs(collectionGroup(db, 'gyeol_moim_tickets'));

  let pendingBatch = writeBatch(db);
  let pendingCount = 0;
  const flushBatch = async () => {
    if (pendingCount === 0) return;
    try {
      await pendingBatch.commit();
      result.deleted += pendingCount;
    } catch (err) {
      console.error('[sweepOrphanTickets] batch commit failed', err);
      result.errors += pendingCount;
    }
    pendingBatch = writeBatch(db);
    pendingCount = 0;
  };

  for (const ticketDoc of snap.docs) {
    if (maxScan > 0 && result.scanned >= maxScan) break;
    result.scanned += 1;

    try {
      const userRef = ticketDoc.ref.parent.parent;
      // 엄격히 users/{uid}/gyeol_moim_tickets만 — 다른 컬렉션 오손 방지.
      if (!userRef || userRef.parent.id !== 'users') continue;

      const uid = userRef.id;
      if (!parentValidCache.has(uid)) {
        const userSnap = await getDoc(userRef);
        const valid = userSnap.exists() && userSnap.data()?.isDeleted !== true;
        parentValidCache.set(uid, valid);
      }
      if (parentValidCache.get(uid)) continue; // 유효 회원 → 유지

      result.orphans += 1;
      if (sample.length < sampleSize) {
        const data = ticketDoc.data() as Record<string, unknown>;
        const createdAtRaw = data.createdAt as Timestamp | undefined;
        sample.push({
          uid,
          ticketId: ticketDoc.id,
          type: (data.type as string) ?? undefined,
          createdAt: createdAtRaw ? createdAtRaw.toDate() : null,
        });
      }

      if (!dryRun) {
        pendingBatch.delete(ticketDoc.ref);
        pendingCount += 1;
        if (pendingCount >= 400) {
          await flushBatch();
        }
      }
    } catch (err) {
      result.errors += 1;
      console.error('[sweepOrphanTickets] error on ticket', ticketDoc.ref.path, err);
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
  totals: { start: number; complete: number; share: number; download: number; intro_download: number };
  // 다운클릭 스토어별 집계 (download + intro_download 이벤트의 store 필드 기준)
  downloadStores: { ios: number; android: number };
  completionRate: number; // complete / start
  downloadRate: number; // download / complete
  typeDistribution: { type: string; count: number }[]; // completes 기준, 내림차순
  bySource: { source: string; count: number }[]; // completes 기준, 내림차순
  genderDistribution: { gender: string; count: number }[]; // completes 기준 (f/m/na)
  comfortDistribution: { comfort: string; count: number }[]; // completes 기준 (same/any/opp)
  femaleShare: number; // f / (f+m), 성비 핵심 지표 (na 제외)
  // 다운로드 직전 나이 자기선택 게이트 응답 분포 (age_gate 이벤트).
  ageBandDistribution: { band: string; count: number }[]; // under45/45-54/55-64/65plus, 고정 순서
  ageAnswered: number; // 게이트 응답 총수 (분모)
  underAgeShare: number; // under45 / 전체응답 — 광고가 데려온 45미만 비율(핵심 낭비 지표)
  daily: { date: string; start: number; complete: number }[]; // 최근 14일
  recent: { createdAt?: Date; phase: string; type: string | null; source: string | null }[];
  // 세션(사람) 단위 재구성 — sessionId 있으면 정확, 없으면 유입원+시간창 추정.
  sessionFunnel: { total: number; completed: number; downloaded: number };
  // 다운클릭한 사람들 심층 — "다운까지 간 사람들이 뭘 원하나" + 세그먼트별 전환율.
  downloadInsight: {
    clickers: number; // 다운클릭 세션 수
    completed: number; // 완료 세션 수 (전환율 분모)
    inAppClickers: number; // 인앱 브라우저에서 다운클릭한 세션 수
    inAppKnown: number; // inApp 값이 기록된 다운클릭 세션 수 (분모)
    inAppShare: number; // inApp 비율 (inAppClickers / inAppKnown)
    gender: { f: number; m: number; na: number }; // 다운클릭자 성별
    comfort: { same: number; any: number; opp: number }; // 다운클릭자 누구와
    types: { type: string; count: number }[]; // 다운클릭자 결 유형 top
    sources: { source: string; count: number }[]; // 다운클릭자 유입원 top
    convOverall: number; // 완료→다운 전환율
    convByGender: { f: number; m: number }; // 성별별 완료→다운 전환율
    convByComfort: { same: number; any: number; opp: number }; // 누구와별 전환율
  };
  sessions: {
    source: string;
    type: string | null;
    furthest: 'start' | 'complete' | 'download';
    startedAt?: Date;
    gender: string | null; // f/m/na — 세션에서 관측된 값
    comfort: string | null; // same/any/opp
  }[]; // 최근 세션 여정 (표시용)
  capped: boolean; // 2000건 캡에 걸렸는지
}

export const GYEOL_GENDER_LABELS: Record<string, string> = {
  f: '여성', m: '남성', na: '선택 안 함',
};
export const GYEOL_AGE_LABELS: Record<string, string> = {
  under45: '만 45세 미만', '45-54': '45–54세', '55-64': '55–64세', '65plus': '65세 이상',
};

// ─── 니즈 설문 ("요즘 나에게 필요한 것" — /needs, 5060 광고 퍼널) ────────────
// 겉은 테스트, 속은 수요 설문. situation(자녀독립·이혼·사별·은퇴)=세그먼트,
// activity=모임 주제 수요, worry=광고 첫 줄 각도. 컬렉션: needs_survey_events.

export interface NeedsStats {
  totals: { start: number; complete: number; download: number; share: number };
  completionRate: number; // complete / start
  downloadRate: number; // download / complete
  timeuse: { key: string; count: number }[]; // ⭐ 실태(지금 그 시간을 뭘로 채우나)
  situation: { key: string; count: number }[]; // ⭐ 삶의 변화 세그먼트
  activity: { key: string; count: number }[]; // ⭐ 하고 싶은 것
  worry: { key: string; count: number }[]; // ⭐ 걱정 (광고 각도)
  person: { key: string; count: number }[];
  gender: { key: string; count: number }[];
  funnel: { key: string; count: number }[];
  moment: { key: string; count: number }[];
  ageBand: { key: string; count: number }[];
  // 질문별 도달 세션 수(answer 이벤트 기반) — 어느 질문에서 관두는지.
  stepFunnel: { step: number; label: string; reached: number; abandonedHere: number }[];
  // 누적(집계 기준 변경 전 포함) — 타일 옆에 참고로 표기
  allTotals: { start: number; complete: number; download: number; share: number };
  underAgeShare: number;
  bySource: { source: string; count: number }[];
  // 광고 소재별 성적 — 세션 단위. 2026-08-05에 utm_campaign/content/term
  // 수집을 붙였다. 그 전 세션은 값이 없어 '(태그 이전)'으로 묶인다.
  //
  // 성별을 같이 보는 이유: 쓰레드 유입 완주자 9명이 전원 남성이었다. 채널이
  // 좋아 보였던 게 아니라 남성이 이 퍼널을 잘 통과하는 것이었고, 여성 타겟
  // 광고와 나란히 놓고 비교하면 안 되는 숫자였다(2026-08-05).
  byCreative: {
    source: string; campaign: string; content: string; term: string;
    arrivals: number; q1Abandoned: number; completed: number; downloaded: number;
    women: number; men: number;
  }[];
  // "또는, 직접 쓸게요" 원문 — 보기 밖 수요 발굴의 재료 (최신순).
  customTexts: { dim: string; text: string; createdAt?: Date }[];
  // 설문 건너뛰고 앱만 받는 우회로(2026-08-01 도입). 첫 질문에서 78%가 떠나는데
  // 그때까지 받을 데가 없어서 뚫었다. 열어본 사람 / 실제로 스토어로 나간 사람.
  skip: { open: number; download: number };
  // 나날의 현황 (KST 기준, 오래된 → 최신). 누적 숫자만 보면 소재를 바꾸거나
  // 화면을 고친 날 무슨 일이 있었는지가 평균에 묻힌다.
  //
  // 추가 읽기는 없다 — 질문별 퍼널 때문에 이미 통째로 읽어 둔 스냅샷에서 센다.
  daily: NeedsDay[];
  // 첫 질문 교체 전/후/되돌린 뒤. 라벨이 시기마다 달라 한 표에 못 겹친다.
  //
  // reverted가 따로 필요한 이유: 질문은 '교체 전'과 같지만 조건이 다르다.
  // 앱 받기 버튼 승격(8/4 18:20)과 광고 CTA 변경이 살아 있어서, before와
  // reverted를 견주면 **질문 말고 그 둘의 효과**가 보인다.
  swap: { before: NeedsSwapEra; after: NeedsSwapEra; reverted: NeedsSwapEra };
  // 사람 아닌 접속으로 걸러낸 세션 수(UA 기준, 2026-08-05~ 기록분만).
  excludedNonHuman: number;
  // 랜딩별 성적. 아래 다른 표들은 전부 /needs만 센다 — 여기서만 둘을 견준다.
  byVariant: {
    variant: string; label: string; arrivals: number; q1Abandoned: number;
    completed: number; downloaded: number;
  }[];
  // 캡에 걸리면 스냅샷의 가장 오래된 날은 하루치가 다 안 들어온다. 그 날짜를
  // 넘겨 화면에서 잘라낸다 — 반쪽 숫자를 온전한 것처럼 보여주면 안 된다.
  dailyPartialFrom: string | null;
  capped: boolean;
}

// 첫 질문 교체 — 2026-08-04 18:55 KST 배포(웹 36563c7).
// "그 시간을 어떻게 보내세요?"(보기 다섯 중 넷이 자기 고백) → "요즘 어떤 시기를
// 지나고 계세요?"(사실 확인). 도착의 58%가 첫 질문에서 아무것도 안 누르고
// 나가던 걸 고치려는 변경이다.
export const NEEDS_Q_SWAP_AT = new Date('2026-08-04T09:55:00Z');
const Q_SWAP_AT = NEEDS_Q_SWAP_AT.getTime();

// 되돌린 시각. 실험은 여기서 끝났다 — 첫 질문 이탈 56.5% → 70.4%
// (시간대 맞춰도 58.0% → 70.4%, z=2.77 p=0.0056), 완주율 11.0% → 5.6%.
// 시간대도 광고 CTA 변경도 원인이 아니었다(교체 직후 구간부터 이미 69%).
//
// 이 시각 이후 세션은 다시 옛 순서라 '교체 후'에 섞으면 안 된다. 창을 닫아
// 카드가 끝난 실험의 기록으로 남게 한다.
export const NEEDS_Q_REVERT_AT = new Date('2026-08-05T00:35:00Z'); // 09:35 KST
const Q_REVERT_AT = NEEDS_Q_REVERT_AT.getTime();

// 질문 순서 라벨 — 웹 QUESTIONS 순서와 일치해야 한다.
// step은 숫자로만 저장돼서, 교체 전 이벤트의 step 0은 '시간 사용'이고 교체 후는
// '삶의 변화'다. 그래서 라벨을 시기별로 따로 둔다 — 한 벌로 두면 서로 다른
// 질문을 같은 줄에 놓고 견주게 된다.
export const NEEDS_STEP_LABELS = [
  '1. 시간을 어떻게 보내나', '2. 누가 있었으면 순간', '3. 삶의 변화',
  '4. 하고 싶은 것', '5. 편한 사람', '6. 걱정',
  '7. 온라인 vs 만나서', '8. 성별', '9. 연령',
];
// 실험 구간(2026-08-04 18:55 ~ 08-05 09:35)에만 쓰인 순서.
export const NEEDS_STEP_LABELS_SWAPPED = [
  '1. 삶의 변화', '2. 누가 있었으면 순간', '3. 시간을 어떻게 보내나',
  '4. 하고 싶은 것', '5. 편한 사람', '6. 걱정',
  '7. 온라인 vs 만나서', '8. 성별', '9. 연령',
];

export interface NeedsSwapEra {
  title: string; // '교체 전' / '교체 후'
  firstQuestion: string; // 그때 첫 화면에 있던 질문
  base: number; // 도착 세션
  q1Abandoned: number; // 첫 질문에서 아무것도 안 누르고 나감
  complete: number;
  download: number; // 설문 완주 + 건너뛰기 합
  funnel: { step: number; label: string; reached: number; abandonedHere: number }[];
}

export interface NeedsDay {
  day: string; // YYYY-MM-DD (KST)
  start: number;
  complete: number;
  download: number;
  share: number;
  skipOpen: number;
  skipDownload: number;
}

export const NEEDS_LABELS: Record<string, string> = {
  // timeuse (실태)
  tv: 'TV·유튜브', solo_out: '혼자 산책·운동', hobby_alone: '혼자 취미',
  with_people: '친구·모임 만나며', drift: '그냥 흘러가요',
  // situation
  empty_nest: '자녀 독립 (빈 둥지)', spouse_diff: '배우자와 결이 다름', divorce: '이혼 후 새 출발', bereave: '사별',
  retire: '은퇴·일 쉼', no_change: '큰 변화 없음',
  // activity
  walk: '동네 산책', tea: '차 한잔·맛집', culture: '전시·공연 나들이',
  exercise: '운동·등산', travel: '같이 여행', hobby: '취미·배움', chat: '편한 수다',
  // worry
  scam: '사기·이상한 사람', awkward: '어색함', time: '시간 부담', none: '딱히 없음',
  // person — 2026-08-04에 결큐·앱과 같은 축(same/any/opp)으로 통일했다.
  // calm·lively는 그 전 응답이라 라벨을 남긴다(지우면 옛 데이터가 코드로 뜬다).
  same: '동성 친구가 편해요', any: '상관없어요, 결만 맞으면', opp: '이성 친구도 좋아요',
  calm: '조용한 분 (~8/4 폐지)', lively: '활발한 분 (~8/4 폐지)',
  // funnel
  online: '온라인 대화 먼저', offline: '만나서 얼굴 보고',
  // moment
  meal: '맛집 발견했을 때', meal_alone: '혼자 밥 먹을 때', talk: '얘기하고 싶을 때',
  goodnews: '좋은 일 알릴 데 없을 때', sick: '몸이 아픈 날', weekend: '주말·연휴가 길 때',
  // 성별 (결큐와 동일 코드)
  f: '여성', m: '남성', na: '말하지 않음',
  // 연령 5살 밴드 (굵은 밴드는 GYEOL_AGE_LABELS 폴백)
  '45-49': '45–49세', '50-54': '50–54세', '55-59': '55–59세', '60-64': '60–64세',
  // 공통 — "또는, 직접 쓸게요"
  other: '✏️ 직접 입력',
};

export const NEEDS_DIM_LABELS: Record<string, string> = {
  timeuse: '시간을 보내는 법',
  moment: "'누가 있었으면' 순간", situation: '삶의 변화', activity: '하고 싶은 것',
  person: '편한 사람', worry: '걱정', funnel: '온라인/만남',
};

export async function getNeedsStats(): Promise<NeedsStats> {
  // 이벤트 한 벌을 통째로 읽어 다 세던 방식은 응답이 쌓이자 무너졌다. answer·
  // abandon이 완주의 15배라, 상한에 걸리면 잘려 나가는 건 정작 제일 귀한
  // complete다(2026-08-01 기준 94건 중 10건이 이미 안 보였다).
  //
  // 그래서 셋으로 나눈다.
  //   1) 합계 — 서버 집계(count)라 상한도 오차도 없다.
  //   2) 응답 분포 — complete만 따로 읽어 잘릴 일이 없다.
  //   3) 질문별 퍼널 — 세션을 재구성해야 해서 원본이 필요하다. 여기만 상한.
  const CAP = 8000;
  const col = collection(db, 'needs_survey_events');

  const phases = ['start', 'complete', 'download', 'share', 'skip_open', 'skip_download'] as const;
  const counted = await Promise.all(phases.map(async (p) => {
    const agg = await getCountFromServer(query(col, where('phase', '==', p)));
    return [p, agg.data().count] as const;
  }));
  const counts0 = Object.fromEntries(counted) as Record<typeof phases[number], number>;
  const totals = {
    start: counts0.start, complete: counts0.complete,
    download: counts0.download, share: counts0.share,
  };
  const skip = { open: counts0.skip_open, download: counts0.skip_download };

  const compSnap = await getDocs(
    query(col, where('phase', '==', 'complete'), orderBy('createdAt', 'desc'), limit(2000))
  );

  const snap = await getDocs(
    query(col, orderBy('createdAt', 'desc'), limit(CAP))
  );

  const dims = ['timeuse', 'situation', 'activity', 'worry', 'person', 'gender', 'funnel', 'moment', 'ageBand'] as const;
  const counts: Record<string, Map<string, number>> = {};
  dims.forEach((d) => { counts[d] = new Map(); });
  const sourceCount = new Map<string, number>();
  const customTexts: NeedsStats['customTexts'] = [];
  // 질문별 이탈: answer 이벤트의 세션별 최대 step. start만 있고 answer 없는
  // 세션은 Q1도 못 넘긴 것.
  const startSids = new Set<string>();
  const maxStepBySid = new Map<string, number>();
  // 정확 집계 시점(7/28 14:19 KST) = 인트로 제거 + 프리로드 팬텀 차단 배포.
  // 이전 start는 의미가 섞여(버튼클릭/도착/팬텀) 지표에서 제외한다.
  const CLEAN_SINCE = new Date('2026-07-28T05:20:00Z').getTime();
  const eraStartSids = new Set<string>();
  const eraTotals = { start: 0, complete: 0, download: 0, share: 0 };
  // abandon: 세션별 "나갈 때 보던 질문" (답변으로 이어졌으면 무시)
  const abandonStepBySid = new Map<string, number>();
  // 소재별 성적 — 세션 단위로 모은다(이벤트 단위로 세면 한 사람이 여러 번 세진다).
  type CreativeSess = {
    source: string; campaign: string; content: string; term: string;
    gender: string | null; completed: boolean; downloaded: boolean;
  };
  const creativeBySid = new Map<string, CreativeSess>();

  // 사람 아닌 접속 — 서버가 User-Agent로 분류해 남긴 값(2026-08-05~).
  // 그 전 이벤트엔 필드가 없어 판정 불가라 사람으로 둔다(없는 걸 봇으로
  // 몰면 과거 지표가 통째로 흔들린다).
  //
  // 광고 URL을 바꾼 직후 한 시간에 Windows 데스크톱 122건이 몰려 '첫 질문
  // 이탈 94%'가 찍혔던 게 이걸 만든 계기다. 우리 광고는 인스타 모바일
  // 여성 45+ 대상이라 그 트래픽은 사람일 수가 없었다.
  const nonHumanSids = new Set<string>();

  // 랜딩별 성적. /needs(9문항)와 /enjoy(3문항)는 문항 수도 목적도 달라
  // 기존 표들을 그대로 섞으면 둘 다 못 읽는다. 그래서 아래 집계는 전부
  // **/needs만** 세고, 두 랜딩 비교는 이 표 하나로 따로 낸다.
  //
  // variant가 없는(=기존) 이벤트는 /needs다.
  const VARIANT_LABELS: Record<string, string> = {
    needs: '/needs · 9문항',
    enjoy: '/enjoy · 3문항 (밝은판)',
  };
  type VarRow = {
    variant: string; label: string; arrivals: number; q1Abandoned: number;
    completed: number; downloaded: number;
  };
  // 랜딩을 가리지 않고 모으는 집합. /needs 전용 집합(eraStartSids 등)은
  // 조기 반환 아래에 있어 /enjoy 세션을 못 담는다.
  const anyStartSids = new Set<string>();
  const anyAnswerSids = new Set<string>();
  const varSess = new Map<string, {
    variant: string; completed: boolean; downloaded: boolean;
  }>();

  // UA 기록이 붙기 전(2026-08-05 15시 배포) 구간을 위한 소급 판정.
  //
  // 오염 구간의 신호가 깨끗하게 갈렸다:
  //     hyd 0~3초  25건 · 인앱 88% · Q1 답함 12%   ← 사람
  //     hyd 10초+  44건 · 인앱  5% · Q1 답함  0%   ← 44명 전원이 아무것도
  //                                                  안 눌렀다. 사람이면
  //                                                  나올 수 없는 숫자다.
  //
  // hyd_ms는 로딩 속도가 아니라 '화면에 실제로 보이기까지'다. 10초 넘게
  // 백그라운드에 있다가 보인 건 미리 열어두고 안 본 접속이다.
  //
  // 인앱은 빼지 않는다 — Meta 인앱 브라우저는 광고를 띄울 때 랜딩을 미리
  // 로드하므로, 그걸 나중에 눌러 연 진짜 사람도 hyd가 크게 나온다.
  //
  // 되돌린 시각부터만 적용한다. 그 전 구간은 hyd가 700ms대라 어차피 안
  // 걸리지만, 이미 읽으신 과거 숫자를 소급해서 바꾸지 않으려는 뜻이 더 크다.
  const FALLBACK_SINCE = Date.parse('2026-08-05T00:35:00Z');
  const FALLBACK_HYD_MS = 10000;
  const hydBySid = new Map<string, number>();
  const inAppBySid = new Map<string, boolean>();
  const hasUaBySid = new Set<string>();

  // 첫 질문 교체(2026-08-04 18:55 KST) 전후를 가르는 선. 세션은 시작 시각으로
  // 한쪽에 붙인다 — 교체 순간에 걸친 세션을 이벤트마다 쪼개면 어느 쪽 숫자도
  // 안 맞는다.
  const swapFirstAtBySid = new Map<string, number>();
  const swapTotals = {
    before: { complete: 0, download: 0 },
    after: { complete: 0, download: 0 },
    reverted: { complete: 0, download: 0 },
  };
  // 나날의 현황 — 같은 스냅샷을 한 번 더 훑는 대신 여기서 같이 센다.
  const dayMap = new Map<string, NeedsDay>();
  const DAY_KEYS: Record<string, keyof NeedsDay> = {
    start: 'start', complete: 'complete', download: 'download',
    share: 'share', skip_open: 'skipOpen', skip_download: 'skipDownload',
  };
  let oldestAt = Infinity;
  const kstDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

  snap.forEach((d) => {
    const x = d.data() as DocumentData;
    const phase = String(x.phase ?? '');
    const sid = (x.sessionId as string) || d.id;
    const at = toDate(x.createdAt)?.getTime() ?? 0;
    const variant = typeof x.variant === 'string' && x.variant ? x.variant : 'needs';

    // 사람/봇 판정은 랜딩과 무관하게 모든 이벤트에서 모은다. 아래 /needs
    // 조기 반환 밑에 두면 /enjoy 이벤트가 판정을 못 받아 봇이 그대로 샌다
    // (실제로 그랬다 — /enjoy 첫 9건 중 6건이 데스크톱인데 안 걸러졌다).
    if (typeof x.ua === 'string' && x.ua) hasUaBySid.add(sid);
    if (x.uaBot === true || x.uaDesktop === true) nonHumanSids.add(sid);
    if (phase === 'start' && typeof x.hydMs === 'number') hydBySid.set(sid, x.hydMs);
    if (typeof x.inApp === 'boolean') inAppBySid.set(sid, x.inApp);
    // 랜딩별로도 start/answer 유무를 알아야 '이탈만 찍힌 세션'을 뺄 수 있다.
    if (at >= CLEAN_SINCE) {
      if (phase === 'start') anyStartSids.add(sid);
      if (phase === 'answer') anyAnswerSids.add(sid);
    }

    if (at >= CLEAN_SINCE) {
      let vs = varSess.get(sid);
      if (!vs) {
        vs = { variant, completed: false, downloaded: false };
        varSess.set(sid, vs);
      }
      if (variant !== 'needs') vs.variant = variant;
      if (phase === 'complete') vs.completed = true;
      if (phase === 'download' || phase === 'skip_download') vs.downloaded = true;
    }

    // 아래 집계는 전부 /needs 전용이다. 다른 랜딩이 섞이면 어제까지의 숫자와
    // 이어지지 않아 "왜 갑자기 늘었지"가 된다.
    if (variant !== 'needs') return;

    if (at >= CLEAN_SINCE && phase in eraTotals) {
      eraTotals[phase as keyof typeof eraTotals] += 1;
    }
    const dayField = DAY_KEYS[phase];
    if (at > 0 && dayField) {
      if (at < oldestAt) oldestAt = at;
      const key = kstDay(at);
      let row = dayMap.get(key);
      if (!row) {
        row = { day: key, start: 0, complete: 0, download: 0, share: 0, skipOpen: 0, skipDownload: 0 };
        dayMap.set(key, row);
      }
      (row[dayField] as number) += 1;
    }
    if (phase === 'start') {
      startSids.add(sid);
      if (at >= CLEAN_SINCE) eraStartSids.add(sid);
    }
    if (phase === 'answer' && typeof x.step === 'number' && at >= CLEAN_SINCE) {
      maxStepBySid.set(sid, Math.max(maxStepBySid.get(sid) ?? -1, x.step));
    }
    if (phase === 'abandon' && typeof x.step === 'number' && at >= CLEAN_SINCE) {
      abandonStepBySid.set(sid, x.step);
    }
    if (at >= CLEAN_SINCE) {
      let cs = creativeBySid.get(sid);
      if (!cs) {
        cs = { source: '(태그없음)', campaign: '', content: '', term: '',
          gender: null, completed: false, downloaded: false };
        creativeBySid.set(sid, cs);
      }
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
      if (str(x.source)) cs.source = str(x.source);
      if (str(x.campaign)) cs.campaign = str(x.campaign);
      if (str(x.content)) cs.content = str(x.content);
      if (str(x.term)) cs.term = str(x.term);
      if (str(x.gender)) cs.gender = str(x.gender);
      if (phase === 'complete') cs.completed = true;
      if (phase === 'download' || phase === 'skip_download') cs.downloaded = true;
    }

    // 세션의 가장 이른 시각 — 교체 전/후를 가를 기준.
    if (at >= CLEAN_SINCE && (phase === 'start' || phase === 'answer' || phase === 'abandon')) {
      const prev = swapFirstAtBySid.get(sid);
      if (prev === undefined || at < prev) swapFirstAtBySid.set(sid, at);
    }
    if (at >= CLEAN_SINCE) {
      const side = at >= Q_REVERT_AT
        ? swapTotals.reverted
        : at >= Q_SWAP_AT
          ? swapTotals.after
          : swapTotals.before;
      if (phase === 'complete') side.complete += 1;
      if (phase === 'download' || phase === 'skip_download') side.download += 1;
    }
  });

  // 답 분포는 complete 기준 — 그 한 건에 아홉 답이 다 실려 있다.
  // answer 이벤트도 같은 필드를 들고 다녀서, 섞어 세면 한 사람이 여러 번 세진다.
  compSnap.forEach((d) => {
    const x = d.data() as DocumentData;
    for (const dim of dims) {
      const v = x[dim];
      if (typeof v === 'string' && v) {
        counts[dim].set(v, (counts[dim].get(v) ?? 0) + 1);
      }
      // "직접 입력" 원문 수집 (momentText 등) — 보기 밖 수요의 원석.
      const txt = x[`${dim}Text`];
      if (typeof txt === 'string' && txt.trim() && customTexts.length < 100) {
        customTexts.push({ dim, text: txt.trim(), createdAt: toDate(x.createdAt) });
      }
    }
    const s = (x.source as string) || '(직접/알수없음)';
    sourceCount.set(s, (sourceCount.get(s) ?? 0) + 1);
  });

  const toArr = (m: Map<string, number>) =>
    [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const ageTotal = [...counts.ageBand.values()].reduce((a, b) => a + b, 0);

  // 질문별 퍼널을 세션 집합 하나에서 만든다. 교체 전/후로 각각 부르면 같은
  // 코드로 두 벌이 나온다.
  const buildFunnel = (labels: string[], sids: Set<string>) => {
    const rows = labels.map((label, i) => {
      let reached = 0;
      sids.forEach((sid) => { if ((maxStepBySid.get(sid) ?? -1) >= i) reached += 1; });
      // 이 질문을 "보다가" 나간 세션 — 이후 답변으로 이어졌으면(복귀) 제외.
      let abandonedHere = 0;
      sids.forEach((sid) => {
        if (abandonStepBySid.get(sid) === i && (maxStepBySid.get(sid) ?? -1) < i) {
          abandonedHere += 1;
        }
      });
      return { step: i, label, reached, abandonedHere };
    });
    // 기준선: '시작' 세션 — Q1 전에 나간 사람이 여기서 보인다.
    rows.unshift({ step: -1, label: '도착 (실제 본)', reached: sids.size, abandonedHere: 0 });
    return rows;
  };

  // answer는 있는데 start가 유실(네트워크)된 세션도 기준선에 포함한다.
  // start 없이 abandon만 있는 세션은 도착으로 세지 않는다.
  //
  // start는 화면에 **보일 때만** 쏘게 돼 있는데(프리로드 팬텀 차단), abandon은
  // pagehide에서 무조건 쏜다. 그래서 한 번도 보이지 않은 페이지가 "도착해서
  // 첫 질문에 이탈"로 잡혔다. 계측 자체의 구멍이다.
  //
  // 평소엔 3%라 티가 안 났는데(교체 전 1134건 중 35건), 광고 URL을 바꾼 뒤
  // 검사 트래픽이 몰린 구간에선 30%까지 올라 지표를 통째로 왜곡했다.
  //
  // answer가 하나라도 있으면 남긴다 — 그건 start가 네트워크로 유실된 진짜
  // 사람이다.
  const abandonOnlySids = new Set<string>();
  abandonStepBySid.forEach((_, sid) => {
    if (eraStartSids.has(sid)) return;
    if (maxStepBySid.has(sid)) return;
    abandonOnlySids.add(sid);
  });

  // hyd(화면에 실제로 보이기까지)가 비정상적으로 크고 인앱도 아닌 세션은
  // 사람이 아니다. 미리 열어두고 안 본 접속 — URL 검사기가 그렇게 움직인다.
  //
  // UA가 있어도 적용한다. 처음엔 "UA가 있으면 그게 진실"이라며 건너뛰었는데,
  // 검사기가 iPhone/Android UA를 달고 오면 그대로 샜다. 실제로 /enjoy 첫
  // 트래픽에서 hyd 23.7초·23.6초짜리 둘이 '사람'으로 남았다(정상 구간은 700ms대).
  //
  // 인앱은 뺀다 — Meta 인앱 브라우저는 광고를 띄울 때 랜딩을 미리 로드하므로,
  // 그걸 나중에 눌러 연 진짜 사람도 hyd가 크게 나온다.
  const allSeen = new Set([...hydBySid.keys(), ...anyStartSids]);
  allSeen.forEach((sid) => {
    if (nonHumanSids.has(sid)) return;
    const hyd = hydBySid.get(sid);
    if (hyd === undefined || hyd < FALLBACK_HYD_MS) return;
    if (inAppBySid.get(sid) === true) return;
    nonHumanSids.add(sid);
  });

  const allSids = new Set([...eraStartSids, ...maxStepBySid.keys(), ...abandonStepBySid.keys()]);
  // 사람 아닌 세션은 퍼널·비교에서 뺀다. 몇 건을 뺐는지는 화면에 남긴다 —
  // 조용히 빼면 "어제보다 왜 줄었지"가 된다.
  abandonOnlySids.forEach((sid) => nonHumanSids.add(sid));
  const excludedNonHuman = [...allSids].filter((sid) => nonHumanSids.has(sid)).length;
  nonHumanSids.forEach((sid) => allSids.delete(sid));
  const beforeSids = new Set<string>();
  const afterSids = new Set<string>();
  const revertedSids = new Set<string>();
  allSids.forEach((sid) => {
    const at = swapFirstAtBySid.get(sid);
    if (at === undefined) return;
    if (at >= Q_REVERT_AT) revertedSids.add(sid);
    else if (at >= Q_SWAP_AT) afterSids.add(sid);
    else beforeSids.add(sid);
  });

  const stepFunnel = buildFunnel(NEEDS_STEP_LABELS, allSids);

  const era = (
    title: string, firstQuestion: string, sids: Set<string>,
    labels: string[], tot: { complete: number; download: number },
  ): NeedsSwapEra => {
    const funnel = buildFunnel(labels, sids);
    return {
      title, firstQuestion,
      base: sids.size,
      q1Abandoned: funnel.find((f) => f.step === 0)?.abandonedHere ?? 0,
      complete: tot.complete,
      download: tot.download,
      funnel,
    };
  };
  const swap = {
    before: era('교체 전 (~8/4 18:55)', '그 시간을 어떻게 보내세요?',
      beforeSids, NEEDS_STEP_LABELS, swapTotals.before),
    after: era('교체 후 (8/4 18:55 ~ 8/5 09:35, 종료)',
      '요즘 어떤 시기를 지나고 계세요?', afterSids,
      NEEDS_STEP_LABELS_SWAPPED, swapTotals.after),
    reverted: era('되돌린 뒤 (8/5 09:35 ~ 지금)',
      '그 시간을 어떻게 보내세요?', revertedSids,
      NEEDS_STEP_LABELS, swapTotals.reverted),
  };

  // 소재별 집계. 태그를 붙이기 전 세션은 campaign/content가 비어 있어
  // '(태그 이전)' 한 줄로 뭉친다 — 없는 값을 있는 척 쪼개지 않는다.
  const cmap = new Map<string, NeedsStats['byCreative'][number]>();
  creativeBySid.forEach((cs, sid) => {
    if (nonHumanSids.has(sid)) return;
    const tagged = cs.campaign || cs.content || cs.term;
    const key = [cs.source, tagged ? cs.campaign : '(태그 이전)', cs.content, cs.term].join('\u0000');
    let row = cmap.get(key);
    if (!row) {
      row = { source: cs.source, campaign: tagged ? cs.campaign : '(태그 이전)',
        content: cs.content, term: cs.term,
        arrivals: 0, q1Abandoned: 0, completed: 0, downloaded: 0, women: 0, men: 0 };
      cmap.set(key, row);
    }
    row.arrivals += 1;
    if (abandonStepBySid.get(sid) === 0 && (maxStepBySid.get(sid) ?? -1) < 0) row.q1Abandoned += 1;
    if (cs.completed) row.completed += 1;
    if (cs.downloaded) row.downloaded += 1;
    if (cs.gender === 'f') row.women += 1;
    if (cs.gender === 'm') row.men += 1;
  });
  const byCreative = [...cmap.values()].sort((a, b) => b.arrivals - a.arrivals).slice(0, 40);

  // 랜딩별 집계 — 사람 아닌 세션은 여기서도 뺀다.
  const vmap = new Map<string, VarRow>();
  varSess.forEach((vs, sid) => {
    if (nonHumanSids.has(sid)) return;
    // start도 answer도 없이 abandon만 찍힌 세션은 화면에 뜬 적이 없다.
    // /needs와 같은 규칙을 여기에도 적용한다.
    if (!anyStartSids.has(sid) && !anyAnswerSids.has(sid)) return;
    let row = vmap.get(vs.variant);
    if (!row) {
      row = {
        variant: vs.variant,
        label: VARIANT_LABELS[vs.variant] ?? vs.variant,
        arrivals: 0, q1Abandoned: 0, completed: 0, downloaded: 0,
      };
      vmap.set(vs.variant, row);
    }
    row.arrivals += 1;
    if (abandonStepBySid.get(sid) === 0 && (maxStepBySid.get(sid) ?? -1) < 0) {
      row.q1Abandoned += 1;
    }
    if (vs.completed) row.completed += 1;
    if (vs.downloaded) row.downloaded += 1;
  });
  const byVariant = [...vmap.values()].sort((a, b) => b.arrivals - a.arrivals);

  // 캡에 걸렸을 때만 잘라낸다. 안 걸렸으면 가장 오래된 날이 곧 데이터의
  // 시작이라 그 하루는 온전하다.
  const dailyPartialFrom = snap.size >= CAP && Number.isFinite(oldestAt) ? kstDay(oldestAt) : null;
  const daily = [...dayMap.values()]
    .filter((r) => !dailyPartialFrom || r.day > dailyPartialFrom)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-21); // 화면은 14일을 쓰고, 나머지 7일은 직전 주 비교용

  return {
    // 상단 타일은 정확 집계(7/28 14:19 KST) 이후만 — 그 전 start는 의미가
    // 섞인 숫자라 버린다. 응답 분포는 전체 complete 기준 유지.
    totals: eraTotals,
    allTotals: totals,
    completionRate: eraTotals.start ? eraTotals.complete / eraTotals.start : 0,
    downloadRate: eraTotals.complete ? eraTotals.download / eraTotals.complete : 0,
    timeuse: toArr(counts.timeuse),
    situation: toArr(counts.situation),
    activity: toArr(counts.activity),
    worry: toArr(counts.worry),
    person: toArr(counts.person),
    gender: toArr(counts.gender),
    funnel: toArr(counts.funnel),
    moment: toArr(counts.moment),
    ageBand: toArr(counts.ageBand),
    stepFunnel,
    underAgeShare: ageTotal ? (counts.ageBand.get('under45') ?? 0) / ageTotal : 0,
    byCreative,
    byVariant,
    excludedNonHuman,
    bySource: [...sourceCount.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    customTexts,
    skip,
    daily,
    dailyPartialFrom,
    swap,
    // 상한에 걸리면 퍼널만 최근 구간 기준이 된다(합계·분포는 영향 없음).
    capped: snap.size >= CAP,
  };
}
export const GYEOL_COMFORT_LABELS: Record<string, string> = {
  same: '동성 친구가 편해요', any: '상관없어요, 결만 맞으면', opp: '이성 친구도 좋아요',
};

const GYEOL_TYPE_NAMES: Record<string, string> = {
  FDP: '다정한 정원사', FDL: '따뜻한 즉흥파', FBP: '동네 분위기 메이커',
  FBL: '흥 많은 마당발', SDP: '조용한 진심', SDL: '느긋한 사색가',
  SBP: '선을 지키는 다정', SBL: '편안한 산책 친구',
};

// 4글자 코드(기본유형+기질, 예: SDLW)를 3글자 기본유형(SDL)으로 접는다.
// 같은 유형이 기질별로 갈려 집계가 두 줄로 쪼개지는 걸 막는다.
export function baseGyeolType(code: string | null): string | null {
  if (!code) return code;
  if (code.length >= 4 && GYEOL_TYPE_NAMES[code.slice(0, 3)]) return code.slice(0, 3);
  return code;
}

export function gyeolTypeLabel(code: string | null): string {
  if (!code) return '—';
  const base = baseGyeolType(code) ?? code;
  return GYEOL_TYPE_NAMES[base] ? `${GYEOL_TYPE_NAMES[base]} (${base})` : code;
}

export async function getGyeolStats(): Promise<GyeolStats> {
  const CAP = 2000;
  const snap = await getDocs(
    query(collection(db, 'gyeol_test_events'), orderBy('createdAt', 'desc'), limit(CAP))
  );

  // intro_download = 인트로에서 테스트 건너뛰고 바로 앱 받기 클릭. RANK에 없어
  // 세션 여정(시작→완료→다운)엔 안 섞이고, 여기 totals로만 별도 집계된다.
  const totals = { start: 0, complete: 0, share: 0, download: 0, intro_download: 0 };
  const downloadStores = { ios: 0, android: 0 };
  const typeCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();
  const genderCount = new Map<string, number>();
  const comfortCount = new Map<string, number>();
  // 다운로드 직전 나이 자기선택 게이트 응답(age_gate 이벤트의 ageBand).
  // under45 = 만 45세 미만(설치 전 차단). 광고가 데려온 45미만 비율 = 핵심 누수 지표.
  const ageBandCount = new Map<string, number>();
  const dayMap = new Map<string, { start: number; complete: number }>();
  const recent: GyeolStats['recent'] = [];
  // 세션 재구성용 원본 이벤트 수집 (시간순 정렬은 아래에서).
  const events: { sessionId: string | null; phase: string; type: string | null; source: string | null; gender: string | null; comfort: string | null; inApp: boolean | null; createdAt?: Date }[] = [];

  snap.forEach((d) => {
    const data = d.data() as DocumentData;
    const phase = String(data.phase ?? '');
    if (phase in totals) totals[phase as keyof typeof totals] += 1;

    // 다운 클릭 스토어별 집계 (download·intro_download 이벤트의 store)
    if (phase === 'download' || phase === 'intro_download') {
      const st = String(data.store ?? '');
      if (st === 'ios' || st === 'android') downloadStores[st] += 1;
    }

    // 나이 자기선택 게이트 응답 집계 (age_gate 이벤트의 ageBand)
    if (phase === 'age_gate') {
      const ab = String(data.ageBand ?? '');
      if (ab === 'under45' || ab === '45-54' || ab === '55-64' || ab === '65plus') {
        ageBandCount.set(ab, (ageBandCount.get(ab) ?? 0) + 1);
      }
    }

    const type = (data.gyeolType ?? null) as string | null;
    const source = (data.source ?? null) as string | null;
    const gender = (data.gender ?? null) as string | null;
    const comfort = (data.comfort ?? null) as string | null;
    const sessionId = (data.sessionId ?? null) as string | null;
    const inApp = (typeof data.inApp === 'boolean' ? data.inApp : null) as boolean | null;
    const createdAt = toDate(data.createdAt);
    events.push({ sessionId, phase, type, source, gender, comfort, inApp, createdAt });

    if (phase === 'complete') {
      const bt = baseGyeolType(type);
      if (bt) typeCount.set(bt, (typeCount.get(bt) ?? 0) + 1);
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

  // ── 세션(사람) 단위 재구성 ────────────────────────────────────────────────
  // sessionId가 있으면 그걸로 정확히 묶고, 없으면(레거시) 유입원 계열 + 20분
  // 시간창으로 추정한다. 'start'는 항상 새 세션을 연다. 완료/공유/다운은 같은
  // 계열의 최근 열린 세션에 붙인다(없거나 시간창 초과면 새 세션 = start 유실).
  type Sess = { source: string | null; type: string | null; furthest: number; startedAt?: Date; lastAt?: Date; gender?: string | null; comfort?: string | null; inApp?: boolean | null };
  const RANK: Record<string, number> = { start: 1, complete: 2, share: 2, download: 3 };
  const famOf = (s: string | null): string => {
    const x = (s ?? '').toLowerCase();
    if (x.includes('threads')) return 'threads';
    if (x === 'ig' || x.includes('instagram')) return 'instagram';
    if (x === 'fb' || x.includes('facebook')) return 'facebook';
    if (x.includes('tita-app')) return 'direct';
    return x || 'direct';
  };
  const WINDOW = 20 * 60 * 1000; // 20분
  const sessBySid = new Map<string, Sess>();
  const openByFam = new Map<string, Sess>();
  const allSessions: Sess[] = [];
  const asc = events
    .filter((e) => e.createdAt)
    .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  for (const e of asc) {
    const rank = RANK[e.phase] ?? 0;
    if (!rank) continue;
    let sess: Sess | undefined;
    if (e.sessionId) {
      sess = sessBySid.get(e.sessionId);
      if (!sess) {
        sess = { source: e.source, type: null, furthest: 0 };
        sessBySid.set(e.sessionId, sess);
        allSessions.push(sess);
      }
    } else {
      const fam = famOf(e.source);
      const open = openByFam.get(fam);
      if (
        e.phase !== 'start' &&
        open &&
        open.lastAt &&
        e.createdAt!.getTime() - open.lastAt.getTime() <= WINDOW
      ) {
        sess = open;
      } else {
        sess = { source: e.source, type: null, furthest: 0 };
        openByFam.set(fam, sess);
        allSessions.push(sess);
      }
    }
    if (rank > sess.furthest) sess.furthest = rank;
    if (e.type && !sess.type) sess.type = e.type;
    if (e.gender && !sess.gender) sess.gender = e.gender;
    if (e.comfort && !sess.comfort) sess.comfort = e.comfort;
    if (e.inApp != null && sess.inApp == null) sess.inApp = e.inApp;
    if (e.phase === 'start' && !sess.startedAt) sess.startedAt = e.createdAt;
    if (!sess.source && e.source) sess.source = e.source;
    sess.lastAt = e.createdAt;
  }
  const sessionFunnel = {
    total: allSessions.length,
    completed: allSessions.filter((s) => s.furthest >= 2).length,
    downloaded: allSessions.filter((s) => s.furthest >= 3).length,
  };

  // ── 다운클릭 심층 — 완료 이상 세션을 세그먼트로 쪼개 "뭘 원하는 사람이 다운까지
  //    가나 / 어느 세그먼트가 다운 전환이 낮나"를 본다.
  const complSess = allSessions.filter((s) => s.furthest >= 2);
  const dlSess = allSessions.filter((s) => s.furthest >= 3);
  const gSplit = (arr: Sess[]) => {
    let f = 0, m = 0, na = 0;
    for (const s of arr) { if (s.gender === 'f') f++; else if (s.gender === 'm') m++; else na++; }
    return { f, m, na };
  };
  const cSplit = (arr: Sess[]) => {
    let same = 0, any = 0, opp = 0;
    for (const s of arr) { if (s.comfort === 'same') same++; else if (s.comfort === 'any') any++; else if (s.comfort === 'opp') opp++; }
    return { same, any, opp };
  };
  const rate = (num: number, den: number) => (den > 0 ? num / den : 0);
  const dlGender = gSplit(dlSess);
  const compGender = gSplit(complSess);
  const dlComfort = cSplit(dlSess);
  const compComfort = cSplit(complSess);
  const dlTypeCount = new Map<string, number>();
  const dlSourceCount = new Map<string, number>();
  for (const s of dlSess) {
    const bt = baseGyeolType(s.type ?? null);
    if (bt) dlTypeCount.set(bt, (dlTypeCount.get(bt) ?? 0) + 1);
    const src = s.source || '(직접/알수없음)';
    dlSourceCount.set(src, (dlSourceCount.get(src) ?? 0) + 1);
  }
  // 인앱 브라우저(인스타·페북·카톡 등)에서 다운클릭한 비율 — 스토어 핸드오프가
  // 깨지는 "클릭했는데 설치 안 됨" 누수의 대표 원인. inApp 값이 있는 세션만 분모.
  const dlInAppKnown = dlSess.filter((s) => s.inApp != null);
  const dlInApp = dlInAppKnown.filter((s) => s.inApp === true).length;

  const downloadInsight = {
    clickers: dlSess.length,
    completed: complSess.length,
    inAppClickers: dlInApp,
    inAppKnown: dlInAppKnown.length,
    inAppShare: rate(dlInApp, dlInAppKnown.length),
    gender: dlGender,
    comfort: dlComfort,
    types: [...dlTypeCount.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    sources: [...dlSourceCount.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    convOverall: rate(dlSess.length, complSess.length),
    convByGender: { f: rate(dlGender.f, compGender.f), m: rate(dlGender.m, compGender.m) },
    convByComfort: {
      same: rate(dlComfort.same, compComfort.same),
      any: rate(dlComfort.any, compComfort.any),
      opp: rate(dlComfort.opp, compComfort.opp),
    },
  };
  const furthestLabel = (f: number): 'start' | 'complete' | 'download' =>
    f >= 3 ? 'download' : f >= 2 ? 'complete' : 'start';
  const sessions = allSessions
    .map((s) => ({
      source: s.source ?? '—',
      type: s.type,
      furthest: furthestLabel(s.furthest),
      startedAt: s.startedAt ?? s.lastAt,
      gender: s.gender ?? null,
      comfort: s.comfort ?? null,
    }))
    .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))
    .slice(0, 50);

  // 나이 밴드 분포 — 고정 순서(젊은→많은)로. underAgeShare = 45미만/전체응답 =
  // "광고가 데려온 트래픽 중 얼마가 애초에 가입 불가인가"(핵심 낭비 지표).
  const AGE_ORDER = ['under45', '45-54', '55-64', '65plus'];
  const ageAnswered = [...ageBandCount.values()].reduce((a, b) => a + b, 0);
  const ageBandDistribution = AGE_ORDER
    .map((band) => ({ band, count: ageBandCount.get(band) ?? 0 }))
    .filter((x) => x.count > 0);
  const underAgeShare = ageAnswered
    ? (ageBandCount.get('under45') ?? 0) / ageAnswered
    : 0;

  return {
    totals,
    downloadStores,
    completionRate: totals.start ? totals.complete / totals.start : 0,
    downloadRate: totals.complete ? totals.download / totals.complete : 0,
    typeDistribution,
    bySource,
    genderDistribution,
    comfortDistribution,
    femaleShare,
    ageBandDistribution,
    ageAnswered,
    underAgeShare,
    daily,
    recent,
    sessionFunnel,
    downloadInsight,
    sessions,
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
    roomsAlive: number; // 방 생성 중 멤버가 실제로 대화한 방 (시스템 메시지 외)
    roomsSilent: number; // 방 생성됐지만 아무도 말 안 한 '빈 방'
  };
  recentProposals: {
    createdAt: Date | null;
    type: string;
    district: string | null;
    members: number;
    memberNames: string[]; // 자동 조립된 조합 — 누가 묶였나 (파운더가 눈으로 검토)
    accepted: number;
    responded: number;
    status: string;
    minPair: number | null;
    // 방이 생성된 제안(room_created)의 대화 진행 상황:
    conversationId: string | null;
    memberMsgs: number | null; // 시스템 메시지 제외, 멤버가 실제로 보낸 메시지 수
    lastMessageAt: Date | null; // 방의 마지막 활동
    alive: boolean | null; // 멤버가 한 마디라도 했으면 true (빈 방 아님)
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
    gender: string;
    createdAt: Date | null;
  }[];
  capped: boolean;
}

export async function getMoimStats(): Promise<MoimStats> {
  const CAP = 2000;

  // 리뷰어·관리자 계정의 테스트 자리표는 실제 수요가 아니므로 집계에서 제외.
  // (백엔드 /moim/assemble도 동일하게 조립 대상에서 뺀다.)
  const excludedUids = new Set<string>();
  try {
    const [revSnap, admSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('isReviewerAccount', '==', true))),
      getDocs(query(collection(db, 'users'), where('isAdmin', '==', true))),
    ]);
    revSnap.forEach((d) => excludedUids.add(d.id));
    admSnap.forEach((d) => excludedUids.add(d.id));
  } catch {
    /* 조회 실패 시 제외 없이 진행 — 통계가 비는 것보다 낫다 */
  }

  const ticketSnap = await getDocs(
    query(collectionGroup(db, 'gyeol_moim_tickets'), limit(CAP))
  );
  // 자리표 문서 경로: users/{uid}/gyeol_moim_tickets/{id} → 부모의 부모가 등록자.
  // 1단계: 전부 수집만 하고 집계는 미룬다 (등록자가 아직 유효한 회원인지
  // 확인한 뒤에 센다 — 탈퇴하면 유저 문서가 삭제돼 자리표가 '고아'로 남는다).
  const ticketRows: {
    uid: string;
    data: DocumentData;
    createdAt: Date | null;
  }[] = [];
  ticketSnap.forEach((d) => {
    const t = d.data() as DocumentData;
    const uid = d.ref.parent.parent?.id ?? '(알 수 없음)';
    if (excludedUids.has(uid)) return; // 리뷰어·관리자 테스트 자리표 제외
    ticketRows.push({ uid, data: t, createdAt: toDate(t.createdAt) ?? null });
  });

  // 등록자 문서를 한 번에 조회 — 탈퇴(문서 삭제=고아)·isDeleted·정지 계정의
  // 자리표를 통계·편성에서 제외한다. 이름도 여기서 함께 얻어 재사용한다.
  const BAD_STATUS = new Set([
    'suspended', 'suspended_pending_review', 'restricted', 'blocked',
    'locked', 'shadow_ban', 'shadow_banned', 'blacklisted',
  ]);
  const ownerInfo = new Map<string, { valid: boolean; name: string; gender: string }>();
  await Promise.all(
    [...new Set(ticketRows.map((r) => r.uid))].map(async (uid) => {
      if (uid === '(알 수 없음)') {
        ownerInfo.set(uid, { valid: false, name: '(알 수 없음)', gender: '' });
        return;
      }
      try {
        const u = await getDoc(doc(db, 'users', uid));
        const data = u.data();
        const valid =
          u.exists() &&
          data?.isDeleted !== true &&
          !BAD_STATUS.has((data?.accountStatus as string) ?? '');
        ownerInfo.set(uid, {
          valid,
          name: (data?.displayName as string) || '(탈퇴한 회원)',
          gender: (data?.gender as string) ?? '',
        });
      } catch {
        ownerInfo.set(uid, { valid: false, name: '(조회 실패)', gender: '' });
      }
    }),
  );

  // 2단계: 유효한 등록자의 자리표만 집계 (탈퇴·삭제·정지 제외).
  const tickets = { total: 0, active: 0, paused: 0, chat: 0, meet: 0, thisWeek: 0 };
  const districtCount = new Map<string, { count: number; couple: number }>();
  const topicCount = new Map<string, number>();
  const validRows = ticketRows.filter((r) => ownerInfo.get(r.uid)?.valid);
  for (const r of validRows) {
    const t = r.data;
    tickets.total += 1;
    if (t.active !== true) {
      tickets.paused += 1;
      continue;
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
  }

  // 최근 등록순 상위 40장 (유효 자리표만).
  validRows.sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  const recentTickets: MoimStats['recentTickets'] = validRows.slice(0, 40).map((r) => {
    const t = r.data;
    return {
      uid: r.uid,
      displayName: ownerInfo.get(r.uid)?.name ?? '(이름 없음)',
      type: String(t.type ?? 'chat'),
      active: t.active === true,
      party: (t.party as string | null) ?? null,
      district: (t.districtName as string | null) ?? (t.district as string | null) ?? null,
      timeSlots: (t.timeSlots as string[] | undefined) ?? [],
      topics: (t.topics as string[] | undefined) ?? [],
      urgency: String(t.urgency ?? 'anytime'),
      gender: ownerInfo.get(r.uid)?.gender ?? '',
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
    roomsAlive: 0,
    roomsSilent: 0,
  };
  // 방 생성된 제안의 conversationId 전부 수집 — 아래에서 방마다 '실제 대화가
  // 오갔는지(빈 방인지)' 확인한다. 결의 성패는 방 생성이 아니라 '대화 시작'이다.
  const allRoomConvIds: string[] = [];
  let slots = 0;
  let responded = 0;
  let accepted = 0;
  let minPairSum = 0;
  let minPairN = 0;
  const recentProposals: MoimStats['recentProposals'] = [];
  const recentMemberUids: string[][] = []; // recentProposals와 인덱스 정렬
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
    const convId =
      status === 'room_created' ? ((p.conversationId as string | undefined) ?? null) : null;
    if (convId) allRoomConvIds.push(convId);
    if (recentProposals.length < 40) {
      recentMemberUids.push(members);
      recentProposals.push({
        createdAt: toDate(p.createdAt) ?? null,
        type: String(p.type ?? 'chat'),
        district: (p.district as string | null) ?? null,
        members: members.length,
        memberNames: [], // 아래에서 이름 해석
        accepted: acceptedHere,
        responded: respondedHere,
        status,
        minPair,
        conversationId: convId,
        memberMsgs: null, // 아래에서 방 상태 해석
        lastMessageAt: null,
        alive: null,
      });
    }
  });
  proposals.responseRate = slots > 0 ? responded / slots : null;
  proposals.inviteAcceptRate = responded > 0 ? accepted / responded : null;
  proposals.avgMinPair = minPairN > 0 ? minPairSum / minPairN : null;

  // 제안 멤버 이름 해석 — 자동 조립된 조합을 파운더가 눈으로 검토할 수 있게.
  // 자리표 등록자(ownerInfo) 이름을 재사용하고, 빠진 uid만 추가 조회한다.
  const nameOf = new Map<string, string>();
  ownerInfo.forEach((v, k) => nameOf.set(k, v.name));
  const missingMemberUids = [
    ...new Set(recentMemberUids.flat().filter((u) => !nameOf.has(u))),
  ];
  await Promise.all(
    missingMemberUids.map(async (uid) => {
      try {
        const u = await getDoc(doc(db, 'users', uid));
        nameOf.set(uid, (u.data()?.displayName as string) || '(탈퇴한 회원)');
      } catch {
        nameOf.set(uid, '(조회 실패)');
      }
    }),
  );
  recentProposals.forEach((p, i) => {
    p.memberNames = recentMemberUids[i].map((u) => nameOf.get(u) ?? '(?)');
  });

  // 방 생성된 제안의 '대화 진행 상황' — 방마다 시스템 메시지(senderId "")를 뺀
  // 멤버 실제 발화 수를 세어 '살아난 방'과 '빈 방'을 가른다. 결의 목표는 방 생성이
  // 아니라 대화다: 방만 열리고 아무도 말 안 하면 실패로 본다("빈 방 사망").
  const convHealth = new Map<string, { memberMsgs: number; lastMessageAt: Date | null }>();
  await Promise.all(
    [...new Set(allRoomConvIds)].map(async (cid) => {
      try {
        const [cs, cnt] = await Promise.all([
          getDoc(doc(db, 'conversations', cid)),
          getCountFromServer(
            query(collection(db, 'conversations', cid, 'messages'), where('senderId', '!=', '')),
          ),
        ]);
        convHealth.set(cid, {
          memberMsgs: cnt.data().count,
          lastMessageAt: toDate(cs.data()?.lastMessageAt) ?? null,
        });
      } catch {
        convHealth.set(cid, { memberMsgs: 0, lastMessageAt: null });
      }
    }),
  );
  for (const cid of allRoomConvIds) {
    if ((convHealth.get(cid)?.memberMsgs ?? 0) > 0) proposals.roomsAlive += 1;
    else proposals.roomsSilent += 1;
  }
  recentProposals.forEach((p) => {
    if (!p.conversationId) return;
    const h = convHealth.get(p.conversationId);
    if (!h) return;
    p.memberMsgs = h.memberMsgs;
    p.lastMessageAt = h.lastMessageAt;
    p.alive = h.memberMsgs > 0;
  });

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

// ── 전체 게시물(어드민) ──────────────────────────────────────────────────────
// users/{uid}/posts·circles/{cid}/posts·루트 posts 를 collectionGroup으로 한 번에.
export interface AdminPost {
  postId: string;
  authorUid: string;
  authorName: string;
  region: string | null; // 작성자 프로필의 동네(시·군·구) — 게시물엔 지역이 없다
  source: 'feed' | 'circle';
  content: string;
  imageUrl: string | null;
  likes: number;
  comments: number;
  createdAt: Date | null;
}

export async function getAllPosts(max = 300): Promise<AdminPost[]> {
  const snap = await getDocs(
    query(collectionGroup(db, 'posts'), orderBy('createdAt', 'desc'), limit(max)),
  );
  const raw = snap.docs.map((d) => {
    const p = d.data() as DocumentData;
    // 작성자: 게시물의 userId/authorId 우선(루트·서클 글), 없으면 부모 경로의
    // uid(users/{uid}/posts). 부모의 부모가 'circles'면 서클 글로 표시.
    const parentParent = d.ref.parent.parent;
    const authorUid =
      (p.userId as string) || (p.authorId as string) || parentParent?.id || '(알 수 없음)';
    const source: 'feed' | 'circle' =
      parentParent?.parent?.id === 'circles' ? 'circle' : 'feed';
    return { d, p, authorUid, source };
  });

  const uids = [...new Set(raw.map((r) => r.authorUid))];
  const info = new Map<string, { name: string; region: string | null }>();
  await Promise.all(
    uids.map(async (uid) => {
      if (uid === '(알 수 없음)') {
        info.set(uid, { name: '(알 수 없음)', region: null });
        return;
      }
      try {
        const u = await getDoc(doc(db, 'users', uid));
        const dd = u.data();
        const region =
          (dd?.district as string) || (dd?.city as string) || (dd?.region as string) || null;
        info.set(uid, { name: (dd?.displayName as string) || '(탈퇴한 회원)', region });
      } catch {
        info.set(uid, { name: '(조회 실패)', region: null });
      }
    }),
  );

  return raw.map(({ d, p, authorUid, source }) => {
    const likedBy = p.likedBy as string[] | undefined;
    const likes =
      typeof p.likes === 'number' ? p.likes : typeof p.likeCount === 'number' ? p.likeCount : likedBy?.length ?? 0;
    const comments =
      typeof p.comments === 'number'
        ? p.comments
        : typeof p.commentCount === 'number'
          ? p.commentCount
          : 0;
    return {
      postId: d.id,
      authorUid,
      authorName: info.get(authorUid)?.name ?? '(?)',
      region: info.get(authorUid)?.region ?? null,
      source,
      content: (p.content as string) ?? '',
      imageUrl: (p.imageUrl as string) ?? (p.image as string) ?? null,
      likes,
      comments,
      createdAt: toDate(p.createdAt) ?? null,
    };
  });
}

// ── 그룹 찻자리 방 목록(어드민, 메타데이터 전용) ──────────────────────────────
// 대화 '내용'이 아니라 활동 메타데이터(누가 몇 개 보냈나·읽음 여부·마지막 열람/대화
// 시각)만 본다. 내용을 안 읽으므로 열람 감사로그를 남기지 않는다. 수동 생성한 방도
// 여기 다 뜬다(제안 없이 만든 방은 결모임 '제안' 리스트엔 안 보이므로).
export interface MoimRoomMember {
  uid: string;
  name: string;
  spoke: number; // 이 방에서 보낸 메시지 수(내용은 안 읽고 카운트만)
  unread: number | null;
}
export interface AdminMoimRoom {
  conversationId: string;
  groupName: string;
  members: MoimRoomMember[];
  memberMsgTotal: number;
  createdAt: Date | null;
  lastMessageAt: Date | null;
  lastReadAt: Date | null; // 전역(누구인지는 모름) — '누군가 마지막으로 연 시각'
}

export async function getMoimRooms(max = 30): Promise<AdminMoimRoom[]> {
  // conversationType=='group' 단일 필드 쿼리(자동 인덱스). 정렬은 클라에서.
  const snap = await getDocs(
    query(collection(db, 'conversations'), where('conversationType', '==', 'group'), limit(200)),
  );
  const rows = snap.docs.map((d) => ({ id: d.id, c: d.data() as DocumentData }));
  rows.sort(
    (a, b) => (toDate(b.c.lastMessageAt)?.getTime() ?? 0) - (toDate(a.c.lastMessageAt)?.getTime() ?? 0),
  );
  const top = rows.slice(0, max);

  const allUids = [...new Set(top.flatMap((r) => (r.c.participants as string[]) ?? []))];
  const nameMap = new Map<string, string>();
  await Promise.all(
    allUids.map(async (uid) => {
      try {
        const u = await getDoc(doc(db, 'users', uid));
        nameMap.set(uid, (u.data()?.displayName as string) || '(탈퇴한 회원)');
      } catch {
        nameMap.set(uid, '(조회 실패)');
      }
    }),
  );

  return Promise.all(
    top.map(async ({ id, c }) => {
      const participants = (c.participants as string[]) ?? [];
      const unreadCounts = (c.unreadCounts as Record<string, number>) ?? {};
      const members = await Promise.all(
        participants.map(async (uid) => {
          let spoke = 0;
          try {
            // getCountFromServer = 서버 집계, 메시지 '내용'을 가져오지 않는다(메타데이터만).
            const cnt = await getCountFromServer(
              query(collection(db, 'conversations', id, 'messages'), where('senderId', '==', uid)),
            );
            spoke = cnt.data().count;
          } catch {
            /* 카운트 실패 시 0 */
          }
          return {
            uid,
            name: nameMap.get(uid) ?? '(?)',
            spoke,
            unread: typeof unreadCounts[uid] === 'number' ? unreadCounts[uid] : null,
          };
        }),
      );
      return {
        conversationId: id,
        groupName: (c.metadata?.groupName as string) || '결 그룹방',
        members,
        memberMsgTotal: members.reduce((s, m) => s + m.spoke, 0),
        createdAt: toDate(c.createdAt) ?? null,
        lastMessageAt: toDate(c.lastMessageAt) ?? null,
        lastReadAt: toDate(c.lastReadAt) ?? null,
      };
    }),
  );
}

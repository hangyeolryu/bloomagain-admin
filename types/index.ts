export type AccountStatus = 'active' | 'suspended' | 'restricted' | 'blocked';

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'viewer';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: '최고 관리자',
  admin: '관리자',
  moderator: '모더레이터',
  viewer: '뷰어',
};

export const ROLE_PERMISSIONS = {
  manageAdmins:   ['super_admin'],
  viewUsers:      ['super_admin', 'admin'],
  manageUsers:    ['super_admin', 'admin'],
  manageCircles:  ['super_admin', 'admin'],
  resolveReports: ['super_admin', 'admin', 'moderator'],
  resolveAlerts:  ['super_admin', 'admin', 'moderator'],
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS;

export function can(role: AdminRole | null, permission: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[permission] as readonly string[]).includes(role);
}

export interface UserProfile {
  id: string;
  displayName: string;
  email?: string;
  yearOfBirth?: number;
  city?: string;
  district?: string;
  interests?: string[];
  intent?: string;
  about?: string;
  photoUrl?: string;
  isAdmin?: boolean;
  isBlacklisted?: boolean;
  blacklistedAt?: Date;
  blacklistReason?: string;
  blacklistedBy?: string;
  accountStatus?: AccountStatus;
  createdAt?: Date;
  updatedAt?: Date;
  lastActiveAt?: Date;
  reportCount?: number;
  suspiciousMessageCount?: number;
  verified?: boolean;
  fcmToken?: string;
  notificationEnabled?: boolean;
  appVersion?: string;
  buildNumber?: string;
  /** "Tita/3.0.15+138 (iOS; iPhone 15 Pro; 17.4)" — 로그인 시점에 기록 */
  appAgent?: string;
  /** 앱이 users.device에 쓰는 기기 정보. lastSeen은 접속 하트비트로 갱신 */
  device?: {
    platform?: string;
    model?: string;
    osVersion?: string;
    appVersion?: string;
    buildNumber?: string;
    firstSeen?: string;
    lastSeen?: string;
  };
  // NICE identity verification
  identityVerified?: boolean;
  identityVerificationStatus?: 'verified' | 'pending' | 'failed' | string;
  identityVerifiedAt?: Date;
  legalName?: string;
  legalBirthYear?: number;
  // Launch-cohort badge + subscription (mirrored from Cloud SQL via the
  // FastAPI backend; snake_case to match the backend's Firestore writer).
  // founding_member_number is permanent once assigned (1..500); subscription_tier
  // reflects PREMIUM trial / paid / patron state, expiring automatically when
  // the backend's expires_at passes (no client-side cleanup needed).
  founding_member_number?: number;
  subscription_tier?: 'FREE' | 'PREMIUM';
  // Additional profile / safety fields present on the root user doc.
  gender?: string;
  riskScore?: number;
  romanceScamCount?: number;
  sexualSolicitationCount?: number;
  vBehScore?: number;
  accessibility?: {
    fontSize?: string;
    largeTextMode?: boolean;
    voiceGuidanceEnabled?: boolean;
    highContrastMode?: boolean;
    tremorModeEnabled?: boolean;
  };
}

export interface Circle {
  id: string;
  name: string;
  description?: string;
  interests?: string[];
  city?: string;
  district?: string;
  maxMembers?: number;
  memberCount?: number;
  members?: string[];
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
  imageUrl?: string;
  // Admin-managed fields
  status?: 'active' | 'blocked' | 'archived';
  isBlocked?: boolean;
  blockedAt?: Date;
  blockedReason?: string;
  blockedBy?: string;
}

export interface CircleEvent {
  id: string;
  circleId?: string;
  title: string;
  description?: string;
  location?: string;
  startAt?: Date;
  endAt?: Date;
  maxAttendees?: number;
  attendeeCount?: number;
  attendees?: string[];
  createdBy?: string;
  createdAt?: Date;
}

export interface Report {
  id: string;
  type: 'user' | 'circle';
  targetId: string;
  reportedBy: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
  /** LLM 처리 초안 — functions onReportCreated가 신고된 대화를 분석해 작성.
   *  참고용: 최종 조치는 어드민이 실행한다. */
  aiDraft?: {
    status: 'ready' | 'failed' | 'skipped';
    violation?: 'yes' | 'no' | 'unclear';
    severity?: 'low' | 'medium' | 'high';
    summary?: string;
    evidence?: string[];
    recommendation?: 'dismiss' | 'warn' | 'suspend' | 'monitor';
    recommendationReason?: string;
    note?: string;
  };
}

export interface AdminAlert {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  userId?: string;
  userDisplayName?: string;
  timestamp?: Date;
  resolved?: boolean;
  resolvedBy?: string;
  resolvedNote?: string;
  resolvedAt?: Date;
  reason?: string;
  detectedIssues?: string[];
  circleName?: string;
  circleId?: string;
  circleDescription?: string;
  imageUrl?: string;
  adultScore?: number;
  violenceScore?: number;
  // app_error fields
  errorContext?: string;
  platform?: string;
  /** 스택 상위 12프레임. 릴리스 빌드에서는 errorContext가 뭉개져(Riverpod은
   *  Consumer 계열이 전부 ConsumerStatefulElement를 쓴다) 이게 유일한 단서다. */
  stack?: string;
  /** 오류가 난 앱 버전(예: 3.1.6+1). 하루에도 몇 번씩 올리므로, 이게 없으면
   *  이미 고친 버그인지 방금 나간 빌드가 낸 건지 구분이 안 된다. */
  appVersion?: string;
}

export interface SuspiciousMessage {
  id: string;
  userId: string;
  content: string;
  reason: string;
  detectedIssues?: string[];
  action: 'blocked' | 'warning';
  source: string;
  timestamp?: Date;
}

export type AnnouncementType = 'info' | 'warning' | 'important';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  isActive: boolean;
  isPinned: boolean;
  ctaText?: string;
  ctaRoute?: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
}

export type WaveStatus = 'pending' | 'accepted' | 'declined';

export interface Wave {
  id: string;
  fromUserId: string;
  toUserId: string;
  message?: string;
  status: WaveStatus;
  isRead?: boolean;
  isResponded?: boolean;
  sentAt?: Date;
  respondedAt?: Date;
  response?: string;
  conversationId?: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageAt?: Date;
  createdAt?: Date;
  conversationType?: string;
  isActive?: boolean;
  blockedParticipants?: string[];
  suspiciousMessageCount?: number;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  pendingReports: number;
  unresolvedAlerts: number;
  totalCircles: number;
  // Growth & engagement
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeUsersThisWeek: number;
  totalWaves: number;
  totalConversations: number;
  pendingDeleteRequests: number;
  // 실패한 집계 — 조용히 0을 보여주지 않기 위해(StatWarnings 배너로 노출).
  // 권한/인덱스 문제와 "정말 0건"이 화면에서 구분되어야 한다.
  warnings: Array<{ label: string; message: string }>;
}

export type DeleteRequestStatus = 'pending' | 'completed' | 'cancelled';

export interface DeleteRequest {
  id: string;
  name: string;
  contactInfo: string; // email or phone
  reason?: string;
  status: DeleteRequestStatus;
  requestedAt?: Date;
  processedAt?: Date;
  processedBy?: string;
  note?: string;
}

export type SupportInquiryStatus = 'pending' | 'in_progress' | 'resolved';

export type SupportInquiryCategory =
  | 'account'
  | 'technical'
  | 'billing'
  | 'report'
  | 'other';

export const SUPPORT_CATEGORY_LABELS: Record<SupportInquiryCategory, string> = {
  account: '계정',
  technical: '기술 문제',
  billing: '결제',
  report: '신고',
  other: '기타',
};

export interface SupportInquiry {
  id: string;
  name: string;
  contact: string; // email or phone
  category?: SupportInquiryCategory;
  message: string;
  status: SupportInquiryStatus;
  submittedAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  note?: string;
  userId?: string;
}

export interface UserActivity {
  circlesJoined: number;
  circleNames: string[];
  wavesSent: number;
  wavesReceived: number;
  pendingWavesSent: number;
  pendingWavesReceived: number;
  conversationsCount: number;
  blockedConversations: number;
}


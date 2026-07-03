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

// ─── Street Interviews (길거리 인터뷰) ──────────────────────────────────────
// Structured data captured during in-person interviews on the 2026 May trip
// (and any future field marketing). Designed so a field interviewer can
// fill out a 7-question form on mobile in under 90 seconds — every answer
// is a radio or checkbox so they can answer while the respondent speaks,
// and the free-text note field is optional. Stored in Firestore at
// `street_interviews/{auto_id}` for later analytics.

/** Approximate age band — captured visually + by short question, not exact age. */
export type StreetInterviewAgeBand =
  | 'under_50'
  | '50s_early'  // 50-54
  | '50s_late'   // 55-59
  | '60s_early'  // 60-64
  | '60s_late'   // 65-69
  | '70_plus'
  | 'unknown';

export type StreetInterviewGender = 'female' | 'male' | 'undisclosed';

export type StreetInterviewRegion =
  | 'seoul'
  | 'gyeonggi_incheon'
  | 'other_metro'
  | 'rural'
  | 'unknown';

export type StreetInterviewLocation =
  // Pre-defined trip locations from cold_emails_may_trip.md so analytics can
  // bucket by neighborhood. "other" is a fallback for ad-hoc locations.
  | 'jongno'
  | 'jung_gu'
  | 'gangnam'
  | 'mapo_yongsan'
  | 'eunpyeong_seodaemun'
  | 'guro_yeongdeungpo'
  | 'jamsil_songpa'
  | 'gangdong'
  | 'suwon'
  | 'seongnam'
  | 'other';

export type AwarenessAnswer = 'yes' | 'no' | 'unsure';
export type WillingnessAnswer = 'very' | 'somewhat' | 'low' | 'no';

/** Single street-interview record. Stored at `street_interviews/{auto_id}`. */
export interface StreetInterview {
  id: string;

  // Interview metadata
  conductedAt?: Date;
  location: StreetInterviewLocation;
  interviewer: string; // email or short name — captured at sign-in time

  // Respondent demographics (visual / short Q)
  ageBand: StreetInterviewAgeBand;
  gender: StreetInterviewGender;
  region: StreetInterviewRegion;

  // Q1: 취미·모임 앱 들어봤어요?
  knowsHobbyApps: AwarenessAnswer;

  // Q2: 어떤 앱? (checkbox, multi) — only meaningful when knowsHobbyApps='yes'
  appsKnown: string[];

  // Q3: 사용 안 한 이유 (checkbox, multi)
  nonUseReasons: string[];

  // Q4: 사용 의향
  willingnessToUse: WillingnessAnswer;

  // Q5: 어떤 기능이 있으면 쓸 의향 (checkbox, multi)
  desiredFeatures: string[];

  // Q6: 자유 코멘트 (인터뷰어가 받아 적기)
  freeText?: string;

  // Internal — created by which admin uid (for filter)
  createdBy: string;
}

/** Checkbox option groups — kept here so the form and any future analytics
 * view share identical keys. Korean labels are display only. */
export const APPS_KNOWN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'somoim', label: '소모임' },
  { value: 'mundo', label: '문토' },
  { value: 'trevari', label: '트레바리' },
  { value: 'sinor', label: '시놀' },
  { value: 'danggeun_friend', label: '당근 친구' },
  { value: 'naver_band', label: '네이버 밴드' },
  { value: 'kakao_open_chat', label: '카카오 오픈채팅' },
  { value: 'other', label: '기타' },
  { value: 'none_known', label: '아는 앱 없음' },
];

export const NON_USE_REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'too_hard', label: '어려워서' },
  { value: 'safety_concern', label: '무서워서 (사기·스캠)' },
  { value: 'meeting_burden', label: '사람 만나는 게 부담' },
  { value: 'no_peers', label: '우리 또래가 없을 듯' },
  { value: 'currently_using', label: '쓰고 있음 (만족)' },
  { value: 'tried_but_dropped', label: '써봤는데 별로' },
  { value: 'already_have_circles', label: '기존 모임으로 충분' },
  { value: 'religious_community', label: '종교 모임이 있음' },
  { value: 'other', label: '기타' },
];

export const DESIRED_FEATURE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'safety_first', label: '안전 (사기 차단)' },
  { value: 'peer_age_only', label: '우리 또래만 가입' },
  { value: 'neighborhood_first', label: '동네 친구 우선' },
  { value: 'circle_recommendation', label: '맞는 모임 추천' },
  { value: 'one_on_one_friend', label: '1:1 친구 추천' },
  { value: 'identity_verified', label: '본인 인증된 사람만' },
  { value: 'simple_ui', label: '쉬운 화면 (큰 글씨)' },
  { value: 'offline_meetup_help', label: '오프라인 모임 안내' },
  { value: 'voice_supported', label: '음성으로 대화 가능' },
  { value: 'free_for_50plus', label: '50+는 무료' },
  { value: 'other', label: '기타' },
];

export const INTERVIEW_LOCATION_OPTIONS: Array<{
  value: StreetInterviewLocation;
  label: string;
}> = [
  { value: 'jongno', label: '종로' },
  { value: 'jung_gu', label: '중구' },
  { value: 'gangnam', label: '강남' },
  { value: 'mapo_yongsan', label: '마포·용산' },
  { value: 'eunpyeong_seodaemun', label: '은평·서대문' },
  { value: 'guro_yeongdeungpo', label: '구로·영등포' },
  { value: 'jamsil_songpa', label: '잠실·송파' },
  { value: 'gangdong', label: '강동' },
  { value: 'suwon', label: '수원' },
  { value: 'seongnam', label: '성남' },
  { value: 'other', label: '기타' },
];

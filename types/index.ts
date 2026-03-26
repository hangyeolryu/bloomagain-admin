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

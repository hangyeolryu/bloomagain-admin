/**
 * 앱 버전 비교 유틸 — "사용자들이 업데이트를 하고 있나"를 어드민에서 판단하기 위한 것.
 *
 * ⚠️ 릴리스할 때마다 LATEST_APP_VERSION을 올려야 한다. 여기가 단일 기준점이다.
 *
 * 데이터 주의: 2026-07-22 이전에는 `users.appVersion`이 **로그인 경로에서만**
 * 기록됐다(auth_service._updateUserSessionInfo). Firebase Auth가 세션을 유지하는
 * 재방문 유저는 앱을 계속 써도 값이 가입 당시 버전에 멈춰 있었다. 그날 하트비트
 * (AnalyticsService.touchLastActive)에서도 버전을 찍도록 고쳤으므로, 그 이후
 * 접속한 유저부터 실제 사용 버전이 반영된다. 그 전 기록은 과소평가로 읽어야 한다.
 */

/** 현재 스토어에 올라간 최신 버전. 릴리스마다 갱신할 것. */
export const LATEST_APP_VERSION = '3.2.4';

/** "3.0.15" → [3, 0, 15]. 숫자가 아닌 조각은 0으로 취급. */
function parts(v: string): number[] {
  return v
    .trim()
    .split('.')
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** a<b → -1, a==b → 0, a>b → 1. 자리수가 달라도 안전(짧은 쪽을 0으로 채움). */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export type VersionStatus = 'latest' | 'behind' | 'ahead' | 'unknown';

/** 유저 버전이 최신 대비 어디쯤인지. 값이 없으면 unknown. */
export function versionStatus(
  version?: string | null,
  latest: string = LATEST_APP_VERSION,
): VersionStatus {
  if (!version || !version.trim()) return 'unknown';
  const c = compareVersions(version, latest);
  if (c === 0) return 'latest';
  // 내부 테스트 빌드가 스토어보다 앞설 수 있어 ahead를 따로 둔다(경고 아님).
  return c < 0 ? 'behind' : 'ahead';
}

export const VERSION_STATUS_LABEL: Record<
  VersionStatus,
  { label: string; className: string }
> = {
  latest: { label: '최신', className: 'bg-green-100 text-green-700' },
  behind: { label: '구버전', className: 'bg-amber-100 text-amber-800' },
  ahead: { label: '테스트 빌드', className: 'bg-blue-100 text-blue-700' },
  unknown: { label: '기록 없음', className: 'bg-gray-100 text-gray-500' },
};

/**
 * 목록(users 테이블)용 압축 표기 — 배지를 행마다 붙이면 시끄러워서
 * 점 하나 + 버전 숫자만 쓴다. 색 의미는 VERSION_STATUS_LABEL과 동일.
 */
export const VERSION_STATUS_DOT: Record<VersionStatus, string> = {
  latest:  'bg-green-500',
  behind:  'bg-amber-500',
  ahead:   'bg-blue-500',
  unknown: 'bg-gray-300',
};

export const VERSION_STATUS_TEXT: Record<VersionStatus, string> = {
  latest:  'text-gray-700',
  behind:  'text-amber-700 font-semibold',
  ahead:   'text-blue-700',
  unknown: 'text-gray-300',
};

// ─── 플랫폼 ────────────────────────────────────────────────────────────────
//
// 앱은 users.device.platform에 'iOS' / 'Android'(대문자 시작)를 쓴다
// (notification_permission_service._getDeviceInfo). 다른 컬렉션(app_error 등)은
// 소문자 'ios'/'android'를 쓰므로 대소문자 구분 없이 받는다.

export type AppPlatform = 'ios' | 'android' | 'web' | 'unknown';

export function normalizePlatform(raw?: string | null): AppPlatform {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return 'ios';
  if (s.includes('android')) return 'android';
  // 웹/데스크톱은 실사용자가 아니라 대개 내부 테스트다. 한 칸에 몰아 둔다.
  if (s.includes('web') || s.includes('macos') || s.includes('windows') || s.includes('linux')) return 'web';
  return 'unknown';
}

/** appAgent "Tita/3.2.4+179 (iOS; iPhone 15 Pro; 17.4)" 의 괄호 첫 조각이 플랫폼. */
export function platformFromAppAgent(agent?: string | null): AppPlatform {
  if (!agent) return 'unknown';
  const m = /\(([^;)]+)/.exec(agent);
  return normalizePlatform(m?.[1]);
}

export const PLATFORM_EMOJI: Record<AppPlatform, string> = {
  ios:     '🍎',
  android: '🤖',
  web:     '🌐',
  unknown: '❔',
};

export const PLATFORM_LABEL: Record<AppPlatform, string> = {
  ios:     'iOS',
  android: 'Android',
  web:     '웹/데스크톱',
  unknown: '플랫폼 기록 없음',
};

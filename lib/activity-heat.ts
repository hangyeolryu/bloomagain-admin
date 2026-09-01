/**
 * "30일 활동"을 색으로 읽는 유틸 — 숫자만 늘어놓으면 목록에서 누가 붙어 있고
 * 누가 떠나는 중인지 눈에 안 들어온다. 리텐션 온도계로 바꾼다.
 *
 * 기준은 **활동일 수**(윈도우 안에 앱을 연 서로 다른 날). 하트비트(세션 근사치)는
 * 하루에 몰아 쓰는 사람 때문에 널뛰어서 온도 기준으로는 못 쓴다.
 *
 * 램프: 회색(기록 없음) → 빨강 → 주황 → 노랑 → 초록 → 보라(거의 매일).
 * 보라를 맨 위에 둔 건 '초록=정상'에서 한 칸 더 나간 헤비 유저를 따로 보기 위함.
 *
 * ⚠️ 활동일이 0인 것과 기록 자체가 없는 것은 다르다. activity_daily 문서가
 * 아예 없으면 (하트비트 도입 이전 유저·쿼리 실패) 'none'으로 떨어진다 —
 * "안 왔다"가 아니라 "모른다"로 읽어야 한다.
 */

export type ActivityTier = 'none' | 'dormant' | 'low' | 'mid' | 'high' | 'daily';

export interface ActivityTierMeta {
  /** 배지에 곁들이는 한 단어 설명 (title 속성용) */
  label: string;
  /** 알약(배경·글자·테두리) */
  pillClass: string;
  /** 채움 막대 */
  barClass: string;
}

/** 30일 윈도우 기준 임계값. 윈도우가 달라지면 비율로 환산해 쓴다. */
export function activityTier(activeDays: number, windowDays = 30): ActivityTier {
  if (!Number.isFinite(activeDays) || activeDays <= 0) return 'none';
  const r = activeDays / windowDays;
  if (r < 0.1) return 'dormant'; // 30일 중 1~2일
  if (r < 0.2) return 'low';     // 3~5일
  if (r < 0.45) return 'mid';    // 6~13일
  if (r < 0.7) return 'high';    // 14~20일
  return 'daily';                // 21일+
}

// Tailwind는 클래스 문자열을 정적으로 훑으므로 조립하지 말고 통문자열로 둔다.
export const ACTIVITY_TIER_META: Record<ActivityTier, ActivityTierMeta> = {
  none:    { label: '기록 없음',   pillClass: 'bg-gray-50 text-gray-400 border-gray-200',        barClass: 'bg-gray-200' },
  dormant: { label: '이탈 위험',   pillClass: 'bg-red-50 text-red-700 border-red-200',           barClass: 'bg-red-400' },
  low:     { label: '뜸함',        pillClass: 'bg-orange-50 text-orange-700 border-orange-200',  barClass: 'bg-orange-400' },
  mid:     { label: '보통',        pillClass: 'bg-yellow-50 text-yellow-800 border-yellow-300',  barClass: 'bg-yellow-400' },
  high:    { label: '활발',        pillClass: 'bg-green-50 text-green-700 border-green-200',     barClass: 'bg-green-500' },
  daily:   { label: '거의 매일',   pillClass: 'bg-violet-50 text-violet-700 border-violet-200',  barClass: 'bg-violet-500' },
};

/** 막대 채움 비율(0~1). 윈도우를 넘겨 찍힌 값도 1에서 자른다. */
export function activityRatio(activeDays: number, windowDays = 30): number {
  if (!Number.isFinite(activeDays) || activeDays <= 0) return 0;
  return Math.min(1, activeDays / windowDays);
}

/**
 * 백엔드 SessionIn이 받는 필드 전부 — 생성(POST)과 수정(PATCH)이 같은 목록을 쓴다.
 *
 * 둘이 갈라져 있어서 수정은 전부 통과시키는데 생성은 7개만 통과시켰다. 그래서
 * 회원 제안 승인으로 만든 초안에서 리더·조건이 조용히 사라졌고, 어드민 폼으로
 * 새 자리를 만들 때도 시간·장소·정원이 저장되지 않았다. 목록은 여기 한 군데만 둔다.
 */
export const SESSION_FIELDS = [
  // 기본
  'district', 'dateLabel', 'spotsLabel', 'status', 'description', 'published', 'sortOrder',
  // 언제·어디서
  'startAt', 'venue', 'mapUrl', 'lat', 'lng', 'region', 'city', 'needsVenue',
  // 무엇을 — 신청을 가르는 건 동네가 아니라 이것이다(2026-09-07 실측)
  'activity', 'topic',
  // 인원·조건
  'capacity', 'minToOpen', 'genderPref', 'agePref',
  'minBirthYear', 'maxBirthYear', 'excludeUids',
  // 겉모습·부가
  'cardTitle', 'cardColor', 'cardImageUrl', 'photoUrls',
  'costNote', 'linkUrl', 'linkLabel', 'leaderUid', 'leaderName',
] as const;

/**
 * 본인인증 중간 단계 기록.
 *
 * verification_attempts에 init/started와 callback/success 둘밖에 없어서, 못
 * 넘은 분들이 어디서 멈췄는지 알 수가 없었다(2026-08-23: 47명 중 36명이
 * "한 번 시작하고 안 돌아옴"으로만 남음). 그 사이를 채운다.
 *
 * 이 페이지는 로그인 없이 열리는 공개 페이지라 Firestore에 직접 못 쓴다.
 * 서버(Cloud Functions verifyStep)가 대신 받는다.
 *
 * 절대 인증 흐름을 막지 않는다 — 기다리지 않고, 실패해도 삼킨다. keepalive를
 * 쓰는 이유는 바로 다음 줄에서 NICE로 화면이 넘어가기 때문이다. 일반 fetch는
 * 그 순간 취소돼 'nice_submit'이 영영 안 남는다.
 */
const ENDPOINT =
  'https://asia-northeast3-bloomagain-korea.cloudfunctions.net/verifyStep';

export type VerifyStep =
  | 'page_open'
  | 'init_ok'
  | 'init_fail'
  | 'nice_submit'
  | 'callback_open'
  | 'callback_ok'
  | 'callback_fail';

export function logVerifyStep(step: VerifyStep, uid?: string | null, detail?: string) {
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, uid: uid ?? null, detail: detail ?? null }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 기록은 부가 정보다 */
  }
}

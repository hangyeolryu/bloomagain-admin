/**
 * NICE upstream proxy helpers.
 *
 * NICE_BACKEND_URL must point to the NICE-dedicated backend service origin.
 * Example: https://bloomagain-nice-backend-....run.app
 */
export function niceBackendBase(): string {
  const raw = process.env.NICE_BACKEND_URL?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

/**
 * 사람이 아닌 요청인가 — NICE 인증 세션은 건당 과금이라 미리 걸러야 한다.
 *
 * 2026-08-04에 발견: 지난 30일 /api/nice/init 189건 중 134건(71%)이 UA 끝에
 * `hmdsAgent`가 붙은 요청이었다. IP는 매번 다른 구글 대역(66.249.82.x),
 * referer는 실제 유저의 `/verify?uid=...`. 88개 uid를 따라다녔고 한 uid는
 * 30번 반복했다. 7/31 하루는 34건이 전부 이것이고 실제 사용자는 0명이었다.
 *
 * robots.txt는 이미 `Disallow: /`인데 지키지 않는다. 그래서 코드에서 막는다.
 *
 * 막는 게 증상 대응인 건 안다 — 저 URL이 어떻게 밖으로 새는지는 아직 못
 * 밝혔다. 다만 원인을 찾는 동안에도 과금과 세션 무효화는 계속되므로 먼저
 * 멈춘다. 실제 사용자의 웹뷰는 이 UA를 달 수 없다.
 */
export function isNonHumanNiceRequest(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /hmdsAgent/i.test(userAgent);
}

export function formatNiceUpstreamError(
  upstreamStatus: number,
  rawBody: string,
  pathSuffix: '/nice/init' | '/nice/result'
): string {
  let detail = 'Backend error';
  try {
    const parsed = JSON.parse(rawBody) as { detail?: unknown };
    const d = parsed.detail;
    if (typeof d === 'string') detail = d;
    else if (d != null) detail = JSON.stringify(d);
  } catch {
    if (rawBody.trim()) detail = rawBody.slice(0, 200);
  }

  if (upstreamStatus === 404) {
    return (
      `NICE backend 404 for POST ${pathSuffix}: ${detail}. ` +
      'Ensure NICE backend exposes this route under /nice/*.'
    );
  }
  return detail;
}

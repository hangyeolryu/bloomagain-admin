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
 * ⚠️ `hmdsAgent`가 붙은 요청을 봇으로 오인하지 말 것 — 2026-08-04에 그렇게
 * 판단해 차단했다가 안드로이드 본인인증을 통째로 막았다(약 20분).
 *
 * NICE 표준창이 인앱 웹뷰를 알아보려면 User-Agent 끝에 `hmdsAgent` 마커가
 * 있어야 해서 우리 앱이 **안드로이드에서 직접 그 UA를 설정한다**
 * (bloomagain-korea/lib/features/identity/nice_verification_webview.dart:129).
 * 없으면 NICE가 "PASS앱을 실행할 수 없는 환경입니다"를 띄우고 인증 결과가
 * 돌아오지 않는다.
 *
 * 서버 로그에 이 UA가 구글 IP(google-proxy-*.google.com)로 찍히는 것도
 * 정상이다 — 안드로이드 WebView 트래픽이 그 경로를 탄다. UA·IP만 보고
 * "크롤러"로 읽으면 안 된다. 실제 사용자다.
 */

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

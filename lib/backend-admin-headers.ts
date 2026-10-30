import { NextRequest, NextResponse } from 'next/server';

/**
 * Upstream headers for the backend's /api/v1/admin/* routes, which require the
 * tenant key, the internal key AND the operator's Firebase ID token (verified
 * against admins/{email} by the backend). The token is forwarded as-is from the
 * browser (see lib/admin-fetch.ts); without it the backend answers 401.
 */
export function backendAdminHeaders(
  request: NextRequest,
): { base: string; headers: Record<string, string> } | { error: NextResponse } {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const appId = process.env.BACKEND_APP_ID;
  const apiKey = process.env.BACKEND_API_KEY;
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!backendUrl) {
    return { error: NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 }) };
  }
  if (!internalKey) {
    return {
      error: NextResponse.json({ error: 'INTERNAL_API_KEY not configured on the admin server' }, { status: 500 }),
    };
  }
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  return {
    base: backendUrl.replace(/\/$/, ''),
    headers: {
      ...(appId ? { 'X-App-ID': appId } : {}),
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      'X-Internal-Api-Key': internalKey,
      Authorization: authorization,
    },
  };
}

import { NextRequest, NextResponse } from 'next/server';

/**
 * Upstream headers for every admin-only backend route (/admin/*, user backfill,
 * delete-user, founding grants, broadcast push, titatime sessions, metrics).
 * Sends the tenant key, the internal key AND the operator's Firebase ID token,
 * which the backend verifies against admins/{email} (and the role, where the
 * dashboard gates with can()). The token is forwarded as-is from the browser
 * (lib/admin-fetch.ts); without it we answer 401 here, so a request relayed
 * through these proxies can never reach the backend on the internal key alone.
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

/** Pass a backend response through: JSON body on success, `{ error: detail }` otherwise. */
export async function relayUpstream(upstream: Response): Promise<NextResponse> {
  const raw = await upstream.text();
  if (!upstream.ok) {
    let detail = `Backend error (${upstream.status})`;
    try { detail = (JSON.parse(raw) as { detail?: string }).detail ?? detail; } catch { /* not JSON */ }
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }
  return NextResponse.json(raw ? JSON.parse(raw) : {}, { status: upstream.status });
}

/** Proxy-level failure (network, bad env) → 500 with the message. */
export function proxyError(err: unknown): NextResponse {
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
}

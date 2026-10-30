import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders } from '@/lib/backend-admin-headers';

/**
 * GET /api/backend/conversations?limit=30&cursor=<millis>
 *
 * Proxies to FastAPI GET /api/v1/admin/conversations. The admin dashboard can't
 * read the `conversations` collection with the client SDK (participant-only
 * rules) and firebase-admin is disabled here, so reads go through the backend's
 * Firebase Admin SDK. Tenant creds stay server-side.
 */
export async function GET(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams({ limit: searchParams.get('limit') ?? '30' });
  const cursor = searchParams.get('cursor');
  if (cursor) qs.set('cursor', cursor);

  try {
    const upstream = await fetch(
      `${env.base}/api/v1/admin/conversations?${qs.toString()}`,
      {
        headers: env.headers,
        cache: 'no-store',
      },
    );
    const raw = await upstream.text();
    if (!upstream.ok) {
      let detail = 'Backend error';
      try { detail = (JSON.parse(raw) as { detail?: string }).detail ?? detail; } catch { /* not JSON */ }
      return NextResponse.json({ error: detail }, { status: upstream.status });
    }
    return NextResponse.json(JSON.parse(raw));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

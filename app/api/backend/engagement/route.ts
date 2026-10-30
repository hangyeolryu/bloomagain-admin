import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders } from '@/lib/backend-admin-headers';

/**
 * GET /api/backend/engagement?dormantDays=14
 *
 * Proxies to FastAPI GET /api/v1/admin/engagement. Same reason as the
 * conversations proxy — the client SDK can't read `conversations`/`messages`
 * and firebase-admin is disabled here, so the whole-membership scan runs
 * server-side. The backend caches for 5 minutes; this route is a thin pipe.
 */
export async function GET(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  const dormant = searchParams.get('dormantDays');
  if (dormant) qs.set('dormant_days', dormant);

  try {
    const upstream = await fetch(
      `${env.base}/api/v1/admin/engagement?${qs.toString()}`,
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

import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders } from '@/lib/backend-admin-headers';

/**
 * GET /api/backend/conversations/[id]/messages
 *
 * Proxies to FastAPI GET /api/v1/admin/conversations/{id}/messages — the
 * conversation's messages (oldest-first) plus its participants, read via the
 * backend's Firebase Admin SDK.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams({ limit: searchParams.get('limit') ?? '300' });

  try {
    const upstream = await fetch(
      `${env.base}/api/v1/admin/conversations/${encodeURIComponent(id)}/messages?${qs.toString()}`,
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

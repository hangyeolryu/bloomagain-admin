import { NextRequest, NextResponse } from 'next/server';

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
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const appId = process.env.BACKEND_APP_ID;
  const apiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    return NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams({ limit: searchParams.get('limit') ?? '300' });

  try {
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/admin/conversations/${encodeURIComponent(id)}/messages?${qs.toString()}`,
      {
        headers: {
          ...(appId ? { 'X-App-ID': appId } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
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

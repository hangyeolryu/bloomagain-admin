import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/backend/conversations/[id]/analyze
 *
 * Proxies to FastAPI POST /api/v1/admin/conversations/{id}/analyze — an
 * on-demand LLM analysis (summary + tone + risk signals) of the conversation.
 */
export async function POST(
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

  try {
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/admin/conversations/${encodeURIComponent(id)}/analyze`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

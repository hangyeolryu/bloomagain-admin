import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders } from '@/lib/backend-admin-headers';

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
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  const { id } = await params;

  try {
    const upstream = await fetch(
      `${env.base}/api/v1/admin/conversations/${encodeURIComponent(id)}/analyze`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...env.headers,
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

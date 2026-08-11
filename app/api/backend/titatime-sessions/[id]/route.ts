import { NextRequest, NextResponse } from 'next/server';

/**
 * 개별 티타임 세션 수정/삭제 프록시 → FastAPI /api/v1/titatime/sessions/{id}.
 *  - PATCH  : 부분 수정 (내부키)
 *  - DELETE : 삭제 (내부키)
 */

function readEnv() {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!backendUrl) {
    return { error: NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 }) };
  }
  if (!internalKey) {
    return {
      error: NextResponse.json(
        { error: 'INTERNAL_API_KEY not configured on the admin server' },
        { status: 500 },
      ),
    };
  }
  return { backendUrl: backendUrl.replace(/\/$/, ''), internalKey };
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = readEnv();
  if (env.error) return env.error;
  const { id } = await ctx.params;

  let payload: Record<string, unknown>;
  try {
    const json = await request.json();
    payload = {};
    // 보낸 필드만 전달 (부분 수정)
    for (const k of ['district', 'dateLabel', 'spotsLabel', 'status', 'description', 'published', 'sortOrder']) {
      if (k in json && json[k] !== undefined) payload[k] = json[k];
    }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${env.backendUrl}/api/v1/titatime/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': env.internalKey },
      body: JSON.stringify(payload),
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      let detail = `Backend error (${upstream.status})`;
      try { detail = (JSON.parse(raw) as { detail?: string }).detail ?? detail; } catch { /* not JSON */ }
      return NextResponse.json({ error: detail }, { status: upstream.status });
    }
    return NextResponse.json(JSON.parse(raw));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = readEnv();
  if (env.error) return env.error;
  const { id } = await ctx.params;

  try {
    const upstream = await fetch(`${env.backendUrl}/api/v1/titatime/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Internal-Api-Key': env.internalKey },
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      let detail = `Backend error (${upstream.status})`;
      try { detail = (JSON.parse(raw) as { detail?: string }).detail ?? detail; } catch { /* not JSON */ }
      return NextResponse.json({ error: detail }, { status: upstream.status });
    }
    return NextResponse.json(JSON.parse(raw));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_FIELDS } from '../fields';
import { backendAdminHeaders, proxyError, relayUpstream } from '@/lib/backend-admin-headers';

/**
 * 개별 티타임 세션 수정/삭제 프록시 → FastAPI /api/v1/titatime/sessions/{id}.
 *  - PATCH  : 부분 수정 (내부키 + 운영자 ID 토큰)
 *  - DELETE : 삭제 (내부키 + 운영자 ID 토큰)
 */

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;
  const { id } = await ctx.params;

  let payload: Record<string, unknown>;
  try {
    const json = await request.json();
    payload = {};
    // 보낸 필드만 전달 (부분 수정). 목록은 생성과 공유한다 — 갈라두면 또 어긋난다.
    for (const k of SESSION_FIELDS) {
      if (k in json && json[k] !== undefined) payload[k] = json[k];
    }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${env.base}/api/v1/titatime/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...env.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;
  const { id } = await ctx.params;

  try {
    const upstream = await fetch(`${env.base}/api/v1/titatime/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: env.headers,
    });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

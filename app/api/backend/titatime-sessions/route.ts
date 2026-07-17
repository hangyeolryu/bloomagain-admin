import { NextRequest, NextResponse } from 'next/server';

/**
 * 티타임 모집 세션 관리 프록시 → FastAPI /api/v1/titatime/sessions.
 *
 *  - GET  : 미공개 포함 전체 세션 (백엔드 /titatime/sessions/all, 내부키)
 *  - POST : 세션 생성 (백엔드 POST /titatime/sessions, 내부키)
 *
 * 웹 모집 페이지가 보여주는 "이번 주 자리"의 단일 출처(Firestore meetup_sessions)를
 * 어드민에서 세팅한다. 내부키(X-Internal-Api-Key, 서버 전용)로만 쓰기 가능 —
 * 앱에 실리는 테넌트 키로는 절대 세션을 못 만든다.
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

export async function GET() {
  const env = readEnv();
  if (env.error) return env.error;
  try {
    const upstream = await fetch(`${env.backendUrl}/api/v1/titatime/sessions/all`, {
      method: 'GET',
      headers: { 'X-Internal-Api-Key': env.internalKey },
      cache: 'no-store',
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

export async function POST(request: NextRequest) {
  const env = readEnv();
  if (env.error) return env.error;

  let payload: Record<string, unknown>;
  try {
    const json = await request.json();
    payload = {
      district: String(json.district ?? '').trim(),
      dateLabel: String(json.dateLabel ?? '').trim(),
      spotsLabel: String(json.spotsLabel ?? '').trim(),
      status: String(json.status ?? 'planning').trim(),
      description: json.description ? String(json.description).trim() : null,
      published: Boolean(json.published),
      sortOrder: Number.isFinite(json.sortOrder) ? Number(json.sortOrder) : 0,
    };
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${env.backendUrl}/api/v1/titatime/sessions`, {
      method: 'POST',
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

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/backend/dream-report?days=28
 *
 * → FastAPI GET /api/v1/dream/report. 리포트에 방문자·회원의 말(인용)이 들어가서
 * 백엔드는 내부키(X-Internal-Api-Key)로만 연다 — 앱에 실리는 테넌트 키로는 못 연다.
 * 내부키는 이 서버에만 있다(브라우저로 나가지 않음).
 */
export async function GET(request: NextRequest) {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!backendUrl) {
    return NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 });
  }
  if (!internalKey) {
    return NextResponse.json({ error: 'INTERNAL_API_KEY not configured on the admin server' }, { status: 500 });
  }
  const days = Number(new URL(request.url).searchParams.get('days') || 28);
  const safeDays = Number.isFinite(days) ? Math.min(90, Math.max(1, Math.round(days))) : 28;
  try {
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/dream/report?days=${safeDays}`,
      { headers: { 'X-Internal-Api-Key': internalKey }, cache: 'no-store' },
    );
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

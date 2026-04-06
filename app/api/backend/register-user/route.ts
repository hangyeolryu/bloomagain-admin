import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/backend/register-user
 *
 * Proxies to FastAPI POST /api/v1/user/register.
 * Accepts { userId, username, email? }.
 * Returns { created: boolean } — created=true when a new row was inserted.
 */
export async function POST(request: NextRequest) {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const appId      = process.env.BACKEND_APP_ID;
  const apiKey     = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    return NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/user/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appId  ? { 'X-App-ID':  appId  } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify(body),
      }
    );

    const raw = await upstream.text();
    if (!upstream.ok) {
      let detail = 'Backend error';
      try { detail = (JSON.parse(raw) as { detail?: string }).detail ?? detail; } catch { /* not JSON */ }
      return NextResponse.json({ error: detail }, { status: upstream.status });
    }
    // 201 = newly created, 200 = already existed
    return NextResponse.json({ created: upstream.status === 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

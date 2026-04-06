import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/backend/check-users
 *
 * Proxies to FastAPI POST /api/v1/user/batch-check.
 * Accepts { user_ids: string[] }, returns a map of uid → { exists, account_status?, subscription_tier? }.
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
      `${backendUrl.replace(/\/$/, '')}/api/v1/user/batch-check`,
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
    return NextResponse.json(JSON.parse(raw));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

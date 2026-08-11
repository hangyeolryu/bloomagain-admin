import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/backend/delete-user
 *
 * Proxies to FastAPI POST /api/v1/governance/admin-delete-user which removes
 * the user from Firebase Auth, Firestore, and PostgreSQL in one call.
 *
 * Body: { userId: string }
 */
export async function POST(request: NextRequest) {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const appId      = process.env.BACKEND_APP_ID;
  const apiKey     = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    return NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 });
  }

  let userId: string;
  try {
    ({ userId } = await request.json());
    if (!userId || typeof userId !== 'string') throw new Error('missing userId');
  } catch {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/governance/admin-delete-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appId  ? { 'X-App-ID':  appId  } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({ user_id: userId }),
      }
    );

    if (upstream.status === 204) {
      return NextResponse.json({ success: true });
    }

    const raw = await upstream.text();
    let detail = `Backend error (${upstream.status})`;
    try { detail = (JSON.parse(raw) as { detail?: string }).detail ?? detail; } catch { /* not JSON */ }
    return NextResponse.json({ error: detail }, { status: upstream.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

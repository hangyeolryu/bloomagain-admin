import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/backend/set-subscription
 *
 * Proxies to FastAPI POST /api/v1/user/{user_id}/admin-set-subscription.
 *
 * Body:
 *   {
 *     "userId":     "<firebase_uid>",
 *     "tier":       "PREMIUM" | "FREE",
 *     "expiresAt":  "2026-12-31T23:59:59Z"   // optional
 *   }
 *
 * The backend explicitly does NOT touch `users.founding_member_number`.
 * Use this for QA testing — granting Plus to a tester does not consume a
 * launch-cohort slot.
 */
export async function POST(request: NextRequest) {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const appId      = process.env.BACKEND_APP_ID;
  const apiKey     = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    return NextResponse.json(
      { error: 'BLOOMAGAIN_BACKEND_URL not configured' },
      { status: 500 },
    );
  }

  let payload: { userId?: string; tier?: string; expiresAt?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, tier, expiresAt } = payload;
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  const upperTier = (tier ?? '').toString().trim().toUpperCase();
  if (upperTier !== 'PREMIUM' && upperTier !== 'FREE') {
    return NextResponse.json(
      { error: "tier must be 'PREMIUM' or 'FREE'" },
      { status: 400 },
    );
  }

  const upstreamBody: Record<string, unknown> = { tier: upperTier };
  if (expiresAt) upstreamBody.expires_at = expiresAt;

  try {
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/user/${encodeURIComponent(userId)}/admin-set-subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appId  ? { 'X-App-ID':  appId  } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify(upstreamBody),
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

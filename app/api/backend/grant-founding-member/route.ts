import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/backend/grant-founding-member
 *
 * Proxies to FastAPI POST /api/v1/governance/admin-grant-founding-member which
 * assigns a launch-cohort founding_member_number (1..500) AND a 6-month free
 * Premium trial to a user who completed NICE verification before the founding
 * system was deployed (commit db9005e).
 *
 * Unlike /api/backend/set-subscription (which deliberately does NOT consume a
 * cohort slot for QA toggles), this endpoint DOES consume a slot. It is meant
 * for real users who would have received the badge automatically had the code
 * shipped earlier. Use sparingly — the 500-cap is permanent.
 *
 * Body
 * ----
 *   { "userId": "<firebase_uid>" }
 *
 * Response (forwarded from FastAPI, see AdminGrantFoundingMemberResponse)
 * ----------------------------------------------------------------------
 *   {
 *     "user_id":                "<firebase_uid>",
 *     "founding_member_number": 1-500 | null,    // null if cap reached
 *     "trial_end":              ISO8601 | null,
 *     "trial_action":           "granted_full" | "extended" | "preserved_longer"
 *                              | "preserved_perpetual" | "cap_reached",
 *     "assigned_now":           boolean,         // false on repeat calls
 *     "firestore_synced":       boolean
 *   }
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

  let userId: string;
  try {
    ({ userId } = await request.json());
    if (!userId || typeof userId !== 'string') throw new Error('missing userId');
  } catch {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/governance/admin-grant-founding-member`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appId  ? { 'X-App-ID':  appId  } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({ user_id: userId }),
      },
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

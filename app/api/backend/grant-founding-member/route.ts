import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders, proxyError, relayUpstream } from '@/lib/backend-admin-headers';

/**
 * POST /api/backend/grant-founding-member
 *
 * Proxies to FastAPI POST /api/v1/governance/admin-grant-founding-member which
 * assigns a launch-cohort founding_member_number (1..500) AND a 6-month free
 * Premium trial to a user who completed NICE verification before the founding
 * system was deployed (commit db9005e). This DOES consume a cohort slot — the
 * 500-cap is permanent, so use sparingly. Backend requires manageUsers.
 *
 * Body: { "userId": "<firebase_uid>" }
 *
 * Response (forwarded from FastAPI, see AdminGrantFoundingMemberResponse)
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
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  let userId: string;
  try {
    ({ userId } = await request.json());
    if (!userId || typeof userId !== 'string') throw new Error('missing userId');
  } catch {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${env.base}/api/v1/governance/admin-grant-founding-member`, {
      method: 'POST',
      headers: { ...env.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

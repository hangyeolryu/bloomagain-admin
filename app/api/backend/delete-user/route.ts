import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders, proxyError, relayUpstream } from '@/lib/backend-admin-headers';

/**
 * POST /api/backend/delete-user
 *
 * Proxies to FastAPI POST /api/v1/governance/admin-delete-user which removes
 * the user from Firebase Auth, Firestore, and PostgreSQL in one call.
 * Backend requires a dashboard admin with manageUsers.
 *
 * Body: { userId: string }
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
    const upstream = await fetch(`${env.base}/api/v1/governance/admin-delete-user`, {
      method: 'POST',
      headers: { ...env.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (upstream.status === 204) return NextResponse.json({ success: true });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

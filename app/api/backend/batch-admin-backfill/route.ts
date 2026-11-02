import { NextRequest } from 'next/server';
import { backendAdminHeaders, proxyError, relayUpstream } from '@/lib/backend-admin-headers';

/**
 * POST /api/backend/batch-admin-backfill
 *
 * Proxies to FastAPI POST /api/v1/user/batch-admin-backfill.
 * Upserts up to 100 users with all available Firestore fields.
 *
 * Body: { users: Array<{ userId, username, email?, accountStatus?,
 *                        verified?, verifiedName?, yearOfBirth?,
 *                        verifiedAt?, aiTrainingOptIn? }> }
 *
 * Returns { registered: string[], already_existed: string[], failed: Array<{userId, error}> }
 */
export async function POST(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  try {
    const body = await request.json();
    const upstream = await fetch(`${env.base}/api/v1/user/batch-admin-backfill`, {
      method: 'POST',
      headers: { ...env.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

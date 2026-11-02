import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders, proxyError, relayUpstream } from '@/lib/backend-admin-headers';

/**
 * POST /api/backend/broadcast-push
 *
 * Proxies to FastAPI POST /api/v1/operations/broadcast-push, which sends a
 * one-off FCM push to every user with an fcmToken.
 *
 * Backend requires X-Internal-Api-Key (never the tenant key, which ships in the
 * app) AND the signed-in operator's ID token checked against admins/{email} —
 * this proxy has no server-side auth of its own. See lib/backend-admin-headers.ts.
 *
 * Body: { title: string, body: string, type?: string }
 */

/** GET /api/backend/broadcast-push — recent broadcast history (newest first). */
export async function GET(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  try {
    const upstream = await fetch(`${env.base}/api/v1/operations/broadcast-push/history`, {
      method: 'GET',
      headers: env.headers,
      cache: 'no-store',
    });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

export async function POST(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  let payload: Record<string, unknown>;
  try {
    const json = await request.json();
    const title = String(json.title ?? '').trim();
    const body = String(json.body ?? '').trim();
    const type = json.type ? String(json.type).trim() : 'teatime';
    const dryRun = Boolean(json.dry_run);
    // Audience filters (all optional). Only forwarded when set.
    const onlyAdmins = Boolean(json.only_admins);
    const gender = json.gender ? String(json.gender).trim() : '';
    const region = json.region ? String(json.region).trim() : '';

    // dry_run only previews the audience, so title/body aren't required then.
    if (!dryRun && (!title || !body)) throw new Error('missing title/body');

    payload = {
      title,
      body,
      type,
      dry_run: dryRun,
      only_admins: onlyAdmins,
      ...(gender ? { gender } : {}),
      ...(region ? { region } : {}),
    };
  } catch {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${env.base}/api/v1/operations/broadcast-push`, {
      method: 'POST',
      headers: { ...env.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

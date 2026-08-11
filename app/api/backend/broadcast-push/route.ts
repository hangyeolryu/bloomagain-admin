import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/backend/broadcast-push
 *
 * Proxies to FastAPI POST /api/v1/operations/broadcast-push, which sends a
 * one-off FCM push to every user with an fcmToken.
 *
 * Guarded by X-Internal-Api-Key (server-only secret) — NOT the tenant key —
 * because the tenant key ships inside the mobile app and must never be able to
 * broadcast to all users. Set INTERNAL_API_KEY in the admin's server env to
 * the same value the backend uses.
 *
 * Body: { title: string, body: string, type?: string }
 */

function readEnv() {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!backendUrl) {
    return { error: NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 }) };
  }
  if (!internalKey) {
    return {
      error: NextResponse.json(
        { error: 'INTERNAL_API_KEY not configured on the admin server' },
        { status: 500 },
      ),
    };
  }
  return { backendUrl: backendUrl.replace(/\/$/, ''), internalKey };
}

/** GET /api/backend/broadcast-push — recent broadcast history (newest first). */
export async function GET() {
  const env = readEnv();
  if (env.error) return env.error;

  try {
    const upstream = await fetch(`${env.backendUrl}/api/v1/operations/broadcast-push/history`, {
      method: 'GET',
      headers: { 'X-Internal-Api-Key': env.internalKey },
      cache: 'no-store',
    });
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

export async function POST(request: NextRequest) {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!backendUrl) {
    return NextResponse.json({ error: 'BLOOMAGAIN_BACKEND_URL not configured' }, { status: 500 });
  }
  if (!internalKey) {
    return NextResponse.json(
      { error: 'INTERNAL_API_KEY not configured on the admin server' },
      { status: 500 },
    );
  }

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
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, '')}/api/v1/operations/broadcast-push`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': internalKey,
        },
        body: JSON.stringify(payload),
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

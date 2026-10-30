import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders } from '@/lib/backend-admin-headers';

/**
 * GET /api/admin/pipeline-status
 *
 * Server-side proxy to the backend's `/api/v1/admin/pipeline-status`. Surfaces
 * infra facts the admin dashboard can't probe directly (firebase-admin is
 * disabled here, so no GCP/BigQuery/Postgres access from the browser or SSR):
 * embedding-dim alignment, survey_responses table existence, alembic head, and
 * BigQuery freshness. Read-only. Needs the operator's ID token (adminFetch) —
 * the backend's /admin router checks admins/{email} on every route.
 */
export async function GET(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;
  const { base, headers } = env;

  try {
    const r = await fetch(`${base}/api/v1/admin/pipeline-status`, {
      headers,
      cache: 'no-store',
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `backend HTTP ${r.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json(await r.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 },
    );
  }
}

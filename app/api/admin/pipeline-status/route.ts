import { NextResponse } from 'next/server';

/**
 * GET /api/admin/pipeline-status
 *
 * Server-side proxy to the backend's `/api/v1/admin/pipeline-status` (tenant
 * auth). Surfaces infra facts the admin dashboard can't probe directly
 * (firebase-admin is disabled here, so no GCP/BigQuery/Postgres access from the
 * browser or SSR): embedding-dim alignment, survey_responses table existence,
 * alembic head, and BigQuery freshness. Read-only. Tenant key stays server-side.
 */
export async function GET() {
  const backendUrl = process.env.BLOOMAGAIN_BACKEND_URL;
  const appId = process.env.BACKEND_APP_ID;
  const apiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    return NextResponse.json(
      { error: 'BLOOMAGAIN_BACKEND_URL not configured' },
      { status: 500 },
    );
  }
  const base = backendUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {
    ...(appId ? { 'X-App-ID': appId } : {}),
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };

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

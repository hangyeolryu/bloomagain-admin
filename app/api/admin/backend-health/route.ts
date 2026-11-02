import { NextRequest, NextResponse } from 'next/server';
import { backendAdminHeaders } from '@/lib/backend-admin-headers';

/**
 * GET /api/admin/backend-health
 *
 * Aggregates backend `/api/v1/health` + `/api/v1/metrics` into one payload so
 * the admin health page can render with a single round-trip. /metrics requires
 * the internal key + the operator's ID token (backendAdminHeaders); /health is
 * public but gets the same headers.
 */
export async function GET(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;
  const { base, headers } = env;

  const t0 = Date.now();
  const [healthRes, metricsRes] = await Promise.allSettled([
    fetch(`${base}/api/v1/health`, {
      headers,
      cache: 'no-store',
    }),
    fetch(`${base}/api/v1/metrics`, {
      headers,
      cache: 'no-store',
    }),
  ]);
  const totalLatencyMs = Date.now() - t0;

  async function safeJson(r: PromiseSettledResult<Response>) {
    if (r.status !== 'fulfilled') return { ok: false, error: r.reason?.message ?? 'fetch failed' };
    if (!r.value.ok)
      return { ok: false, error: `HTTP ${r.value.status}`, status: r.value.status };
    try {
      return { ok: true, data: await r.value.json() };
    } catch {
      return { ok: false, error: 'invalid JSON' };
    }
  }

  const [health, metrics] = await Promise.all([
    safeJson(healthRes),
    safeJson(metricsRes),
  ]);

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    backend_url: base,
    round_trip_ms: totalLatencyMs,
    health,
    metrics,
  });
}

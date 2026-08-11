import { NextResponse } from 'next/server';

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
  const tenantHeaders: Record<string, string> = {
    ...(appId ? { 'X-App-ID': appId } : {}),
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };

  const t0 = Date.now();
  const [healthRes, metricsRes] = await Promise.allSettled([
    fetch(`${base}/api/v1/health`, { headers: tenantHeaders, cache: 'no-store' }),
    fetch(`${base}/api/v1/metrics`, { headers: tenantHeaders, cache: 'no-store' }),
  ]);
  const totalLatencyMs = Date.now() - t0;

  async function safeJson(r: PromiseSettledResult<Response>) {
    if (r.status !== 'fulfilled') return { ok: false, error: r.reason?.message ?? 'fetch failed' };
    if (!r.value.ok) return { ok: false, error: `HTTP ${r.value.status}`, status: r.value.status };
    try { return { ok: true, data: await r.value.json() }; } catch { return { ok: false, error: 'invalid JSON' }; }
  }

  const [health, metrics] = await Promise.all([safeJson(healthRes), safeJson(metricsRes)]);

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    backend_url: base,
    round_trip_ms: totalLatencyMs,
    health,
    metrics,
  });
}

/**
 * NICE upstream proxy helpers.
 *
 * NICE_BACKEND_URL must point to the NICE-dedicated backend service origin.
 * Example: https://bloomagain-nice-backend-....run.app
 */
export function niceBackendBase(): string {
  const raw = process.env.NICE_BACKEND_URL?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

export function formatNiceUpstreamError(
  upstreamStatus: number,
  rawBody: string,
  pathSuffix: '/nice/init' | '/nice/result'
): string {
  let detail = 'Backend error';
  try {
    const parsed = JSON.parse(rawBody) as { detail?: unknown };
    const d = parsed.detail;
    if (typeof d === 'string') detail = d;
    else if (d != null) detail = JSON.stringify(d);
  } catch {
    if (rawBody.trim()) detail = rawBody.slice(0, 200);
  }

  if (upstreamStatus === 404) {
    return (
      `NICE backend 404 for POST ${pathSuffix}: ${detail}. ` +
      'Ensure NICE backend exposes this route under /nice/*.'
    );
  }
  return detail;
}

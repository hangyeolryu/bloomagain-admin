import { NextRequest, NextResponse } from 'next/server';
import { formatNiceUpstreamError, niceBackendBase } from '@/lib/nice-upstream';

const MAIN_BACKEND_URL = (process.env.BLOOMAGAIN_BACKEND_URL ?? '').replace(/\/$/, '');
const BACKEND_APP_ID = process.env.BACKEND_APP_ID ?? '';
const BACKEND_API_KEY = process.env.BACKEND_API_KEY ?? '';

/**
 * POST /api/nice/result
 *
 * Thin proxy → NICE backend POST /nice/result.
 *
 * Legacy nice-backend returns {success, data:{ci,di,...}} without verification_token.
 * If verification_token is absent but data.ci is present, we call the main backend's
 * /api/v1/nice/store-result (API-key protected) to generate a one-time token.
 */
export async function POST(request: NextRequest) {
  const backendUrl = niceBackendBase();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'NICE_BACKEND_URL 환경 변수가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  try {
    const body = await request.text();

    const upstream = await fetch(`${backendUrl}/nice/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const raw = await upstream.text();

    if (!upstream.ok) {
      const error = formatNiceUpstreamError(upstream.status, raw, '/nice/result');
      return NextResponse.json({ error }, { status: upstream.status });
    }

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw);
    } catch {
      console.error('[/api/nice/result proxy] non-JSON success body:', raw.slice(0, 500));
      return NextResponse.json(
        { error: '백엔드가 JSON을 반환하지 않습니다.' },
        { status: 502 }
      );
    }

    // If upstream already returned verification_token, pass through as-is.
    if (json.verification_token) {
      return NextResponse.json(json);
    }

    // Legacy nice-backend: returns {success, data:{ci,di,...}} without verification_token.
    // Bridge: call main backend to store the result and get a one-time token.
    const data = json.data as Record<string, string> | undefined;
    if (json.success && data?.ci && MAIN_BACKEND_URL && BACKEND_API_KEY) {
      try {
        const storeResp = await fetch(`${MAIN_BACKEND_URL}/api/v1/nice/store-result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-ID': BACKEND_APP_ID,
            'X-API-Key': BACKEND_API_KEY,
          },
          body: JSON.stringify({
            ci: data.ci,
            di: data.di,
            name: data.name,
            birth_date: data.birth_date,
            mobile_no: data.mobile_no,
            gender: data.gender,
            nation_info: data.nation_info,
          }),
        });

        if (storeResp.ok) {
          const storeJson = await storeResp.json() as { verification_token?: string };
          if (storeJson.verification_token) {
            // Return merged response: original data + new verification_token.
            // Strip CI/DI from data before sending to client (server-side only).
            const safeData = { ...data };
            delete safeData.ci;
            delete safeData.di;
            return NextResponse.json({
              ...json,
              data: safeData,
              verification_token: storeJson.verification_token,
            });
          }
        } else {
          const errText = await storeResp.text();
          console.error('[/api/nice/result] store-result failed:', storeResp.status, errText.slice(0, 200));
        }
      } catch (storeErr) {
        console.error('[/api/nice/result] store-result error:', storeErr);
      }
    }

    // Fall through: return original response (verification_token will be null/missing).
    return NextResponse.json(json);
  } catch (err: unknown) {
    console.error('[/api/nice/result proxy]', err);
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

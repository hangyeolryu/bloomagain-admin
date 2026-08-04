import { NextRequest, NextResponse } from 'next/server';
import {
  formatNiceUpstreamError,
  isNonHumanNiceRequest,
  niceBackendBase,
} from '@/lib/nice-upstream';

/**
 * POST /api/nice/init
 *
 * Thin proxy → NICE backend POST /nice/init
 * The backend owns NICE credentials and all crypto logic.
 */
export async function POST(request: NextRequest) {
  // 사람이 아닌 요청은 업스트림에 가기 전에 끊는다 — 여기가 과금 지점이다.
  // 세는 건 계속한다(원인을 찾는 중이라 규모 추이를 봐야 한다).
  const ua = request.headers.get('user-agent');
  if (isNonHumanNiceRequest(ua)) {
    console.warn(
      `[/api/nice/init] blocked non-human request ua="${ua}" ` +
      `referer="${request.headers.get('referer') ?? ''}"`
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const backendUrl = niceBackendBase();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'NICE_BACKEND_URL 환경 변수가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  try {
    // Forward the request origin so the backend can build the correct return_url
    const body = await request.text();
    const origin = request.headers.get('origin') ?? '';

    const targetUrl = `${backendUrl}/nice/init`;
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(origin && { Origin: origin }),
      },
      // Pass through any body the client sent; default to empty init request
      body: body || JSON.stringify({}),
    });

    const raw = await upstream.text();
    console.log(`[/api/nice/init proxy] upstream ${upstream.status} from ${targetUrl}:`, raw.slice(0, 200));

    if (!upstream.ok) {
      const error = formatNiceUpstreamError(upstream.status, raw, '/nice/init');
      return NextResponse.json({ error }, { status: upstream.status });
    }

    try {
      return NextResponse.json(JSON.parse(raw));
    } catch {
      console.error('[/api/nice/init proxy] non-JSON response:', raw.slice(0, 500));
      return NextResponse.json({ error: `백엔드가 JSON을 반환하지 않았습니다: ${raw.slice(0, 100)}` }, { status: 502 });
    }
  } catch (err: unknown) {
    console.error('[/api/nice/init proxy] fetch error:', err);
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

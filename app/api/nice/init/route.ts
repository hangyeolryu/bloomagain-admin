import { NextRequest, NextResponse } from 'next/server';
import { formatNiceUpstreamError, niceBackendBase } from '@/lib/nice-upstream';

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
    const origin = request.headers.get('origin') ?? '';

    const targetUrl = `${backendUrl}/nice/init`;
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(origin && { Origin: origin }),
      },
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

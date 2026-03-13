import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/nice/result
 *
 * Thin proxy → FastAPI NICE backend POST /nice/result
 * The backend owns NICE credentials and all crypto logic.
 */
export async function POST(request: NextRequest) {
  const backendUrl = process.env.NICE_BACKEND_URL;
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

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data.detail ?? '백엔드 오류' },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[/api/nice/result proxy]', err);
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

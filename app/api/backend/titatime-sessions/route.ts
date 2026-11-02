import { NextRequest, NextResponse } from 'next/server';
import { SESSION_FIELDS } from './fields';
import { backendAdminHeaders, proxyError, relayUpstream } from '@/lib/backend-admin-headers';

/**
 * 티타임 모집 세션 관리 프록시 → FastAPI /api/v1/titatime/sessions.
 *
 *  - GET  : 미공개 포함 전체 세션 (백엔드 /titatime/sessions/all, 내부키)
 *  - POST : 세션 생성 (백엔드 POST /titatime/sessions, 내부키)
 *
 * 웹 모집 페이지가 보여주는 "이번 주 자리"의 단일 출처(Firestore meetup_sessions)를
 * 어드민에서 세팅한다. 백엔드는 내부키(X-Internal-Api-Key)와 로그인한 운영자의
 * ID 토큰(admins/{email} 확인)을 둘 다 요구한다 — 이 프록시엔 서버 쪽 인증이 없다.
 */

export async function GET(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;
  try {
    const upstream = await fetch(`${env.base}/api/v1/titatime/sessions/all`, {
      method: 'GET',
      headers: env.headers,
      cache: 'no-store',
    });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

export async function POST(request: NextRequest) {
  const env = backendAdminHeaders(request);
  if ('error' in env) return env.error;

  let payload: Record<string, unknown>;
  try {
    const json = await request.json();
    payload = {
      district: String(json.district ?? '').trim(),
      dateLabel: String(json.dateLabel ?? '').trim(),
      spotsLabel: String(json.spotsLabel ?? '').trim(),
      status: String(json.status ?? 'planning').trim(),
      description: json.description ? String(json.description).trim() : null,
      published: Boolean(json.published),
      sortOrder: Number.isFinite(json.sortOrder) ? Number(json.sortOrder) : 0,
    };
    // 나머지는 보낸 필드만 그대로. 위 일곱 개만 통과시키던 동안 시간·장소·정원·
    // 리더가 생성 때 조용히 사라졌다 — 수정(PATCH)에서 이미 한 번 고친 실수다.
    for (const k of SESSION_FIELDS) {
      if (k in payload) continue;
      if (k in json && json[k] !== undefined) payload[k] = json[k];
    }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${env.base}/api/v1/titatime/sessions`, {
      method: 'POST',
      headers: { ...env.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return relayUpstream(upstream);
  } catch (err: unknown) {
    return proxyError(err);
  }
}

'use client';

import { auth } from './firebase';

/**
 * fetch() for /api/* proxies that reach members' private data. Attaches the
 * signed-in operator's Firebase ID token so the backend can check admins/{email}
 * itself — the Next.js API routes have no server-side auth of their own, and
 * the dashboard's login gate only runs in the browser.
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return fetch(input, { ...init, headers });
}

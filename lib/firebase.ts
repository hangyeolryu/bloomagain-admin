import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialise only once; safe to call on both server and client because
// NEXT_PUBLIC_ vars are inlined at build time from .env.production.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db   = getFirestore(app);
// 자리 사진 업로드용. Storage 규칙이 seat_photos/{uid} 아래 본인 uid 경로만
// 쓰기를 허용하므로, 어드민도 자기 uid 아래에 올린다(규칙 변경 불필요).
export const storage = getStorage(app);

/** Call from a client component when you want GA; avoid top-level import so /verify WebViews do not load gtag. */
export function initFirebaseAnalytics() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return import('firebase/analytics').then(({ getAnalytics }) => getAnalytics(app));
}

export default app;

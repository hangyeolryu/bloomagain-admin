import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Single Firebase instance — bloomagain-korea project.
//
// Lazy init guard: Firebase cannot initialise during Next.js SSR prerendering
// without valid env vars. We defer getAuth/getFirestore to first client-side
// access via Proxy so static prerendering never calls initializeApp.

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function getApp(): FirebaseApp {
  if (getApps().length) return getApps()[0];
  return initializeApp(firebaseConfig);
}

let _auth: Auth | null = null;
let _db: Firestore | null = null;

export const auth: Auth = new Proxy({} as Auth, {
  get(_t, prop) {
    if (!_auth) _auth = getAuth(getApp());
    return (_auth as never)[prop as never];
  },
});

export const db: Firestore = new Proxy({} as Firestore, {
  get(_t, prop) {
    if (!_db) _db = getFirestore(getApp());
    return (_db as never)[prop as never];
  },
});

// Analytics is client-only and truly optional
export const analytics =
  typeof window !== 'undefined'
    ? import('firebase/analytics').then(({ getAnalytics }) => getAnalytics(getApp()))
    : null;

export default new Proxy({} as FirebaseApp, {
  get(_t, prop) { return (getApp() as never)[prop as never]; },
});

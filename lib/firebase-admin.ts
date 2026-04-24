import * as admin from 'firebase-admin';

// Initialise once (Next.js hot-reload safe).
// Uses Application Default Credentials on Cloud Run / Firebase Hosting.
// For local dev: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.
let initialised = false;
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  initialised = true;
} catch (err) {
  console.error('[firebase-admin] initializeApp failed:', err);
}

export const adminAuth      = initialised ? admin.auth()      : null;
export const adminFirestore = initialised ? admin.firestore() : null;

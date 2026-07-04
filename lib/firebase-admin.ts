// DISABLED (2026-07-01): firebase-admin is incompatible with this repo's
// Next.js 16 + Turbopack + Firebase Hosting SSR build pipeline. Marking it as
// external via `serverExternalPackages` fails at runtime because the deployed
// Cloud Run container has no node_modules, and letting Turbopack bundle it
// pollutes the shared server chunk with an external `firebase-admin-<hash>`
// require that breaks every route on cold start (see Cloud Run logs from
// 2026-07-01T10:36 / 10:43). All admin-side Firebase Admin operations must
// go through the FastAPI backend proxy pattern used by /api/backend/*, or
// through a Cloud Function callable, until we sort out a bundling story.
//
// The exports below are kept as null so old imports don't reference-error
// during transitional edits.

export const adminAuth = null;
export const adminFirestore = null;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bake server-side backend credentials into the server bundle at build time.
  // These are NOT exposed to the browser (no NEXT_PUBLIC_ prefix).
  // Required because Firebase Hosting's standalone Cloud Function doesn't load
  // .env.production at runtime — the values must be inlined during the build.
  env: {
    BLOOMAGAIN_BACKEND_URL: process.env.BLOOMAGAIN_BACKEND_URL ?? '',
    BACKEND_APP_ID: process.env.BACKEND_APP_ID ?? '',
    BACKEND_API_KEY: process.env.BACKEND_API_KEY ?? '',
    // FastAPI base URL for POST /nice/init and /nice/result (must be inlined for Firebase)
    NICE_BACKEND_URL: process.env.NICE_BACKEND_URL ?? '',
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

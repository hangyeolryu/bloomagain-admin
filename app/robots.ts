/**
 * Block all search-engine crawlers from the admin dashboard.
 *
 * This site (bloomagain-korea.web.app) is an internal CRM — every page
 * past /login is permission-gated, but we still don't want the login page,
 * delete-account endpoint, or any leaked route showing up in Google.
 *
 * Why robots.ts (dynamic) vs public/robots.txt (static)?
 *   - Idiomatic Next.js 16 App Router approach (metadata API).
 *   - Lives next to app/sitemap.ts (if we ever add one) and survives
 *     route restructuring without manually editing a static file.
 *
 * Defense-in-depth: app/layout.tsx ALSO sets `robots: { index: false }`
 * in metadata so the response includes an X-Robots-Tag noindex header —
 * robots.txt is a polite request that crawlers can ignore; the header is
 * advisory but more widely honored by ad-tech / archival bots.
 */
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}

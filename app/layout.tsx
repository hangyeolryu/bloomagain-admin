import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: '다시, 봄 관리자',
  description: 'Bloom Again Korea Admin CRM',
  // Defense-in-depth alongside app/robots.ts: emits
  // `<meta name="robots" content="noindex,nofollow,noarchive,...">` on every
  // page. Crawlers that ignore robots.txt (ad-tech, archive bots, some AI
  // scrapers) still honor this directive on the response itself.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

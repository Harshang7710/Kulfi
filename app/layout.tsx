import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import RouteBodyClass from '@/components/RouteBodyClass';
import { routeClass } from '@/lib/route-class';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Desi Mastaani Matka Kulfi',
    template: '%s · Desi Mastaani Matka Kulfi'
  },
  description: 'POS, inventory, and reporting workspace for Desi Mastaani Matka Kulfi franchise staff.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/logo.svg' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e83f46'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the CSP nonce opts this layout into per-request dynamic rendering so
  // Next.js can apply the middleware-generated nonce to its own inline scripts.
  const requestHeaders = await headers();
  void requestHeaders.get('x-nonce');
  const initialRouteClass = routeClass(requestHeaders.get('x-pathname') || '/');

  return (
    <html lang="en">
      <body className={initialRouteClass}>
        <RouteBodyClass />
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

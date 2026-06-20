import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/session';

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildCsp(nonce: string): string {
  // Next.js dev mode wraps modules with eval()-based devtools; blocking eval there
  // (no 'unsafe-eval') breaks client hydration entirely, which silently falls back
  // to native form submits and crashes Server Actions. Production bundles never use
  // eval, so this relaxation is dev-only.
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self'",
    "img-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
}

const AUTH_ROUTES = new Set(['/login', '/password-setup']);
const PUBLIC_ROUTES = new Set(['/', '/health', '/robots.txt', '/manifest.webmanifest']);

export async function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Exposed to the root layout so it can apply the route's body class during SSR,
  // avoiding a post-hydration layout shift (notably the fixed-shell POS screen).
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('Content-Security-Policy', csp);

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  const isProtectedRoute = !AUTH_ROUTES.has(pathname) && !PUBLIC_ROUTES.has(pathname);

  if (!session && isProtectedRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg).*)']
};

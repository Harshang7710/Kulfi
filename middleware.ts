import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/session';

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
}

const AUTH_ROUTES = new Set(['/login', '/password-setup']);

export async function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const isProtectedRoute = !isAuthRoute && pathname !== '/';

  if (!session && isProtectedRoute) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }

  // Note: "already logged in, redirect away from /login or /password-setup" is handled by
  // those pages via getCurrentUser() (DB-verified). Doing it here from the JWT alone could
  // loop for an inactive user whose token hasn't expired yet.

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|manifest.webmanifest).*)']
};

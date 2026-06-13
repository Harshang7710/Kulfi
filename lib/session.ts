import { SignJWT, jwtVerify } from 'jose';
import type { SessionPayload } from './types';

export const COOKIE_NAME = process.env.COOKIE_NAME || 'kulfi_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const DEV_JWT_SECRET = 'dev-only-change-this-secret';

function secretKey() {
  const configured = String(process.env.JWT_SECRET || '').trim();
  if (process.env.NODE_ENV === 'production' && (configured.length < 32 || configured === DEV_JWT_SECRET)) {
    throw new Error('JWT_SECRET must be a random string of at least 32 characters in production.');
  }
  return new TextEncoder().encode(configured || DEV_JWT_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ id: payload.id, role: payload.role, name: payload.name, email: payload.email, userId: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.id !== 'string' || typeof payload.role !== 'string') return null;
    return {
      id: payload.id,
      role: payload.role as SessionPayload['role'],
      name: String(payload.name || ''),
      email: String(payload.email || ''),
      userId: typeof payload.userId === 'string' ? payload.userId : undefined
    };
  } catch {
    return null;
  }
}

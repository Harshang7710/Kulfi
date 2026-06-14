import { SignJWT, jwtVerify } from 'jose';
import type { SessionPayload } from './types';

export const COOKIE_NAME = process.env.COOKIE_NAME || 'kulfi_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const DEV_JWT_SECRET = 'dev-only-change-this-secret';
// Known placeholder/example values that must never be accepted as a real secret —
// they ship in the repo (.env.example), so treating them as valid would let anyone
// forge sessions. Reject them and fall back to a per-deployment derived key.
const INSECURE_JWT_SECRETS = new Set([
  DEV_JWT_SECRET,
  'replace-with-a-long-random-secret-at-least-32-characters',
  'change-me',
  'changeme',
  'secret'
]);
const encoder = new TextEncoder();

async function derivedKey(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`kulfi-session-v1:${value}`));
  return new Uint8Array(digest);
}

async function secretKey(): Promise<Uint8Array> {
  const configured = String(process.env.JWT_SECRET || '').trim();
  if (configured && !INSECURE_JWT_SECRETS.has(configured)) {
    return configured.length >= 32 ? encoder.encode(configured) : derivedKey(configured);
  }

  // Legacy Vercel deployments only configured MongoDB. Derive a separate,
  // stable session key instead of falling back to a public production secret.
  const mongoSecret = String(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || '').trim();
  if (mongoSecret) return derivedKey(mongoSecret);

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required when no MongoDB connection secret is configured.');
  }
  return encoder.encode(DEV_JWT_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ id: payload.id, role: payload.role, name: payload.name, email: payload.email, userId: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(await secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await secretKey());
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

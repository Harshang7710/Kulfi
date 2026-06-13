import { cookies } from 'next/headers';
import { cache } from 'react';
import bcrypt from 'bcryptjs';
import { getCollections, objectId } from './db';
import { COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSession, verifySession } from './session';
import type { CurrentUser, SessionPayload } from './types';

export { verifySession } from './session';

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/'
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export function sessionPayloadFor(user: CurrentUser): SessionPayload {
  return { id: user.id, role: user.role, name: user.name, email: user.email, userId: user.userId };
}

/** DB-verified current user, re-fetched on every request. Wrapped in React's cache() so multiple calls within one render (layout + page header) share a single lookup. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  try {
    const { users } = await getCollections();
    const user = await users.findOne({ _id: objectId(payload.id), active: true }, { projection: { passwordHash: 0 } });
    if (!user) return null;
    return {
      id: String(user._id),
      _id: user._id,
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
      active: user.active
    };
  } catch {
    return null;
  }
});

/** Finds a user by email or userId (case-insensitive) and verifies their password. */
export async function login(identifier: string, password: string): Promise<CurrentUser | null> {
  const normalizedIdentifier = String(identifier || '').trim();
  const { users } = await getCollections();
  const user = await users.findOne({
    active: true,
    $or: [{ email: normalizedIdentifier }, { userId: normalizedIdentifier }]
  }, { collation: { locale: 'en', strength: 2 } });
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) return null;
  return {
    id: String(user._id),
    _id: user._id,
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}

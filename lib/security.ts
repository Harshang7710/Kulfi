import { getDb } from './db';

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 20;

interface LoginAttemptDoc {
  key: string;
  createdAt: Date;
}

/**
 * Sliding-window limiter backed by MongoDB so the limit is shared across every
 * serverless instance (an in-memory Map only protects whichever instance handled
 * the request). Fails open on DB errors — a flaky rate-limit store should degrade
 * brute-force protection, not take down login entirely.
 */
export async function checkLoginRateLimit(key: string): Promise<boolean> {
  try {
    const db = await getDb();
    const attempts = db.collection<LoginAttemptDoc>('login_attempts');
    const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MS);

    await attempts.insertOne({ key, createdAt: new Date() });
    const recentCount = await attempts.countDocuments({ key, createdAt: { $gt: windowStart } });

    return recentCount <= LOGIN_RATE_LIMIT_MAX;
  } catch (error) {
    console.error('[security] Login rate limit check failed, failing open', error);
    return true;
  }
}

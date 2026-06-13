import { databaseConfigSummary } from './db';

const DEV_JWT_SECRET = 'dev-only-change-this-secret';

/** Same checks as the previous Express src/security.js#validateEnv — fatal in production, warns in development. */
export function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET || '';
  const problems: string[] = [];

  if (!secret || secret === DEV_JWT_SECRET || secret.length < 32) {
    problems.push('JWT_SECRET must be set to a random string of at least 32 characters (not the default development value).');
  }
  if (!databaseConfigSummary().hasUri) {
    problems.push('MONGODB_URI (or MONGO_URI / DATABASE_URL) must be set.');
  }

  if (!problems.length) return;

  if (isProduction) {
    throw new Error(`Startup checks failed:\n- ${problems.join('\n- ')}`);
  }
  for (const problem of problems) {
    console.warn(`[startup] Warning: ${problem} Using an insecure default for local development only.`);
  }
}

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 20;
const loginAttempts = new Map<string, number[]>();

/**
 * In-memory sliding-window limiter mirroring the previous express-rate-limit config
 * (20 attempts / 15 minutes). Limitation: state resets on cold start and is not shared
 * across serverless instances.
 */
export function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;
  const recent = (loginAttempts.get(key) || []).filter((ts) => ts > windowStart);
  recent.push(now);
  loginAttempts.set(key, recent);
  return recent.length <= LOGIN_RATE_LIMIT_MAX;
}

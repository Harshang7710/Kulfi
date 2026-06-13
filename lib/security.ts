const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 20;
const loginAttempts = new Map<string, number[]>();

/**
 * Per-instance sliding-window limiter. Production deployments should replace this
 * with a shared store when traffic spans multiple serverless instances.
 */
export function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - LOGIN_RATE_LIMIT_WINDOW_MS;
  const recent = (loginAttempts.get(key) || []).filter((timestamp) => timestamp > windowStart);
  recent.push(now);
  loginAttempts.set(key, recent);
  return recent.length <= LOGIN_RATE_LIMIT_MAX;
}

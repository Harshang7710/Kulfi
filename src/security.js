const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { databaseConfigSummary } = require('./db');

const DEV_JWT_SECRET = 'dev-only-change-this-secret';
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;

function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET || '';
  const problems = [];

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

function csrfProtection(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: CSRF_COOKIE_MAX_AGE
    });
  }
  res.locals.csrfToken = token;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const submitted = req.body?._csrf;
    if (!submitted || submitted !== token) {
      const error = new Error('Your session expired or the form was submitted from a stale page. Please go back, refresh, and try again.');
      error.status = 403;
      return next(error);
    }
  }
  next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    const error = new Error('Too many login attempts. Please wait a few minutes and try again.');
    error.status = 429;
    next(error);
  }
});

module.exports = { validateEnv, csrfProtection, authLimiter };

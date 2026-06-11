const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { collections, objectId } = require('./db');

const COOKIE_NAME = process.env.COOKIE_NAME || 'kulfi_session';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret';

function signSession(user) {
  return jwt.sign({ id: String(user._id || user.id), role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
}

function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, signSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

async function currentUser(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await collections().users.findOne({ _id: objectId(payload.id), active: true }, { projection: { passwordHash: 0 } });
    return user ? { ...user, id: String(user._id) } : null;
  } catch {
    return null;
  }
}

async function attachUser(req, res, next) {
  try {
    req.user = await currentUser(req);
    res.locals.user = req.user;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (!roles.includes(req.user.role)) return res.redirect(req.user.role === 'owner' ? '/owner' : '/manager');
    next();
  };
}

async function login(email, password) {
  const normalizedEmail = String(email || '').trim();
  const user = await collections().users.findOne({ email: normalizedEmail, active: true }, { collation: { locale: 'en', strength: 2 } });
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) return null;
  return { _id: user._id, id: String(user._id), name: user.name, email: user.email, role: user.role, active: user.active };
}

module.exports = { attachUser, requireAuth, requireRole, login, setSessionCookie, clearSessionCookie };

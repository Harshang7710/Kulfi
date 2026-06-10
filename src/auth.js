const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const COOKIE_NAME = process.env.COOKIE_NAME || 'kulfi_session';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret';

function signSession(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
}
function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, signSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  });
}
function clearSessionCookie(res) { res.clearCookie(COOKIE_NAME); }
function currentUser(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id,name,email,role,active FROM users WHERE id=? AND active=1').get(payload.id);
    return user || null;
  } catch { return null; }
}
function attachUser(req, res, next) {
  req.user = currentUser(req);
  res.locals.user = req.user;
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (!roles.includes(req.user.role)) {
      return res.redirect(req.user.role === 'owner' ? '/owner' : '/manager');
    }
    next();
  };
}
function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(String(email || '').trim());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
}
module.exports = { attachUser, requireAuth, requireRole, login, setSessionCookie, clearSessionCookie };

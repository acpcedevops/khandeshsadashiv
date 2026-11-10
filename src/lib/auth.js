'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db');

const SESSION_DAYS = 30;

function hashPassword(password) {
  return bcrypt.hashSync(String(password), 12);
}

function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(String(password), hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: Number(user.id), role: user.role },
    config.jwtSecret,
    { expiresIn: `${SESSION_DAYS}d` }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, cookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
  });
}

async function findUserById(id) {
  const db = getDb();
  return db.get(
    `SELECT id, name, email, role, status, auto_publish, pen_name, bio, city, phone,
            avatar_url, social_json, email_verified, created_at
       FROM users WHERE id = ?`,
    [Number(id)]
  );
}

async function attachUser(req, res, next) {
  res.locals.currentUser = null;
  const token = req.cookies ? req.cookies[config.cookieName] : null;
  if (!token) return next();

  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    clearSessionCookie(res);
    return next();
  }

  const user = await findUserById(payload.sub);
  if (!user || user.status === 'suspended' || user.status === 'blocked') {
    clearSessionCookie(res);
    return next();
  }

  req.user = user;
  res.locals.currentUser = user;
  return next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(401).json({ ok: false, error: 'प्रवेश आवश्यक आहे.' });
  }
  const redirectTo = encodeURIComponent(req.originalUrl || '/dashboard');
  return res.redirect(`/login?next=${redirectTo}`);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return requireAuth(req, res, next);
    if (roles.includes(req.user.role)) return next();
    if (req.accepts(['html', 'json']) === 'json') {
      return res.status(403).json({ ok: false, error: 'या कृतीसाठी परवानगी नाही.' });
    }
    return res.status(403).render('errors/403', {
      pageTitle: 'प्रवेश नाकारला',
      bodyClass: '',
    });
  };
}

const requireAdmin = requireRole('owner', 'admin', 'editor');
const requireManager = requireRole('owner', 'admin');

function isAdmin(user) {
  return Boolean(user && ['owner', 'admin', 'editor'].includes(user.role));
}

function isManager(user) {
  return Boolean(user && ['owner', 'admin'].includes(user.role));
}

function isOwner(user) {
  return Boolean(user && user.role === 'owner');
}

function canEditPost(user, post) {
  if (!user || !post) return false;
  if (isAdmin(user)) return true;
  return Number(post.author_id) === Number(user.id);
}

function canModerate(user) {
  return isAdmin(user);
}

module.exports = {
  SESSION_DAYS,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  findUserById,
  attachUser,
  requireAuth,
  requireRole,
  requireAdmin,
  requireManager,
  isAdmin,
  isManager,
  isOwner,
  canEditPost,
  canModerate,
};

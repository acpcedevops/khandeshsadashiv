'use strict';

const crypto = require('node:crypto');
const config = require('../config');

const CSRF_COOKIE = 'dsw_csrf';

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfToken(req, res, next) {
  let token = req.cookies ? req.cookies[CSRF_COOKIE] : null;
  if (!token || typeof token !== 'string' || token.length < 32) {
    token = randomToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  req.csrfToken = token;
  res.locals.csrfToken = token;
  next();
}

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Multipart bodies are parsed by multer inside the route, after this
  // global middleware. Those routes re-run verifyCsrf after upload.
  if (!req.body && req.is('multipart/form-data')) return next();

  const cookieToken = req.cookies ? req.cookies[CSRF_COOKIE] : null;
  const bodyToken = req.body && (req.body._csrf || req.body.csrfToken);
  const headerToken = req.get('x-csrf-token');
  const supplied = bodyToken || headerToken;

  if (!cookieToken || !supplied || supplied !== cookieToken) {
    if (req.accepts(['html', 'json']) === 'json') {
      return res.status(403).json({ ok: false, error: 'सुरक्षा टोकन अवैध आहे. पान पुन्हा लोड करा.' });
    }
    return res.status(403).render('errors/403', {
      pageTitle: 'सुरक्षा त्रुटी',
      message: 'सुरक्षा टोकन अवैध किंवा कालबाह्य आहे. कृपया पान पुन्हा लोड करून पुन्हा प्रयत्न करा.',
      bodyClass: '',
    });
  }
  return next();
}

module.exports = { CSRF_COOKIE, csrfToken, verifyCsrf, randomToken };

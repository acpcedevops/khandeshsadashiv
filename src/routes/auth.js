'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { getDb } = require('../db');
const config = require('../config');
const {
  hashPassword,
  verifyPassword,
  signToken,
  setSessionCookie,
  clearSessionCookie,
} = require('../lib/auth');
const {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendMail,
} = require('../lib/email');
const { notifyStaff } = require('../lib/notifications');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'खूप प्रयत्न झाले आहेत. कृपया १५ मिनिटांनंतर प्रयत्न करा.',
});

function safeNext(value) {
  const next = String(value || '');
  if (next.startsWith('/') && !next.startsWith('//')) return next;
  return '/dashboard';
}

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ── Login ────────────────────────────────────────────────── */
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('auth/login', {
    pageTitle: 'प्रवेश',
    form: { email: '' },
    errors: {},
    next: safeNext(req.query.next),
  });
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const email = normaliseEmail(req.body.email);
    const password = String(req.body.password || '');
    const nextUrl = safeNext(req.body.next);

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).render('auth/login', {
        pageTitle: 'प्रवेश',
        form: { email },
        errors: { form: 'ईमेल किंवा पासवर्ड चुकीचा आहे.' },
        next: nextUrl,
      });
    }

    if (user.status === 'blocked' || user.status === 'suspended') {
      return res.status(403).render('auth/login', {
        pageTitle: 'प्रवेश',
        form: { email },
        errors: { form: 'हे खाते सध्या बंद आहे. कृपया प्रशासकाशी संपर्क साधा.' },
        next: nextUrl,
      });
    }

    setSessionCookie(res, signToken(user));
    res.flash('success', `स्वागत आहे, ${user.name}!`);

    if (['owner', 'admin', 'editor'].includes(user.role)) {
      return res.redirect(nextUrl === '/dashboard' ? '/admin' : nextUrl);
    }
    return res.redirect(nextUrl);
  } catch (error) {
    return next(error);
  }
});

/* ── Register ─────────────────────────────────────────────── */
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('auth/register', {
    pageTitle: 'लेखक नोंदणी',
    form: {},
    errors: {},
  });
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const name = String(req.body.name || '').trim();
    const email = normaliseEmail(req.body.email);
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');
    const city = String(req.body.city || '').trim();
    const phone = String(req.body.phone || '').trim();
    const penName = String(req.body.pen_name || '').trim();
    const bio = String(req.body.bio || '').trim();
    const errors = {};

    if (name.length < 2) errors.name = 'कृपया पूर्ण नाव लिहा.';
    if (!validateEmail(email)) errors.email = 'कृपया वैध ईमेल पत्ता लिहा.';
    if (password.length < 8) errors.password = 'पासवर्ड किमान ८ अक्षरांचा असावा.';
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'पासवर्डमध्ये अक्षर आणि अंक दोन्ही असावेत.';
    }
    if (password !== confirm) errors.confirm = 'दोन्ही पासवर्ड जुळत नाहीत.';
    if (bio.length > 1200) errors.bio = 'परिचय १२०० अक्षरांपेक्षा जास्त नसावा.';

    if (!errors.email) {
      const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) errors.email = 'या ईमेलवर आधीच खाते आहे. कृपया प्रवेश करा.';
    }

    if (Object.keys(errors).length) {
      return res.status(422).render('auth/register', {
        pageTitle: 'लेखक नोंदणी',
        form: { name, email, city, phone, pen_name: penName, bio },
        errors,
      });
    }

    const result = await db.run(
      `INSERT INTO users
        (name, email, password_hash, role, status, pen_name, bio, city, phone, email_verified)
       VALUES (?, ?, ?, 'contributor', 'pending', ?, ?, ?, ?, 1)`,
      [name, email, hashPassword(password), penName || null, bio || null, city || null, phone || null]
    );

    const user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);

    await notifyStaff(db, {
      type: 'user_pending',
      title: 'नवीन लेखक नोंदणी',
      body: `${name} (${email}) यांनी नोंदणी केली आहे. खाते मंजूर करा.`,
      link: '/admin/users',
    });

    await sendMail({
      to: email,
      subject: 'नोंदणी स्वीकारली — डॉ. सदाशिव सुर्यवंशी',
      text: `नमस्कार ${name},\n\nतुमची नोंदणी स्वीकारली गेली आहे. प्रशासकीय मंजुरीनंतर तुम्ही लेख आणि कविता सादर करू शकता.\n\n${config.siteUrl}/dashboard`,
      html: `<p>नमस्कार ${name},</p><p>तुमची नोंदणी स्वीकारली गेली आहे. प्रशासकीय मंजुरीनंतर तुम्ही लेख आणि कविता सादर करू शकता.</p><p><a href="${config.siteUrl}/dashboard">डॅशबोर्ड उघडा</a></p>`,
    });

    setSessionCookie(res, signToken(user));
    res.flash('success', 'नोंदणी यशस्वी! तुमचे खाते मंजुरीच्या प्रतीक्षेत आहे.');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
});

/* ── Logout ───────────────────────────────────────────────── */
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.flash('success', 'तुम्ही सुरक्षितपणे बाहेर पडलात.');
  res.redirect('/');
});

/* ── Email verification ───────────────────────────────────── */
router.get('/verify-email', async (req, res, next) => {
  try {
    const db = getDb();
    const token = String(req.query.token || '').trim();
    if (!token) {
      res.flash('error', 'पुष्टी दुवा अवैध आहे.');
      return res.redirect('/login');
    }
    const user = await db.get('SELECT * FROM users WHERE verify_token = ?', [token]);
    if (!user) {
      res.flash('error', 'हा पुष्टी दुवा कालबाह्य किंवा अवैध आहे.');
      return res.redirect('/login');
    }
    await db.run(
      "UPDATE users SET email_verified = 1, verify_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [user.id]
    );
    res.flash('success', 'तुमचा ईमेल पुष्टी झाला. धन्यवाद!');
    return res.redirect(req.user ? '/dashboard' : '/login');
  } catch (error) {
    return next(error);
  }
});

router.post('/resend-verification', authLimiter, async (req, res, next) => {
  try {
    if (!req.user) return res.redirect('/login');
    const db = getDb();
    if (Number(req.user.email_verified) === 1) {
      res.flash('info', 'तुमचा ईमेल आधीच पुष्टी झाला आहे.');
      return res.redirect('/dashboard');
    }
    const token = crypto.randomBytes(32).toString('hex');
    await db.run('UPDATE users SET verify_token = ? WHERE id = ?', [token, req.user.id]);
    await sendVerificationEmail(req.user, token);
    res.flash('success', 'पुष्टी ईमेल पाठवला आहे.');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
});

/* ── Forgot password ──────────────────────────────────────── */
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', {
    pageTitle: 'पासवर्ड विसरला?',
    errors: {},
    form: {},
  });
});

router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const email = normaliseEmail(req.body.email);
    const errors = {};

    if (!validateEmail(email)) errors.email = 'कृपया वैध ईमेल पत्ता लिहा.';

    if (Object.keys(errors).length) {
      return res.status(422).render('auth/forgot-password', {
        pageTitle: 'पासवर्ड विसरला?',
        errors,
        form: { email },
      });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [
        token, expires, user.id,
      ]);
      await sendPasswordResetEmail(user, token);
    }

    res.flash('success', 'जर हा ईमेल नोंदणीकृत असेल, तर पासवर्ड रीसेट दुवा पाठवला गेला आहे.');
    return res.redirect('/login');
  } catch (error) {
    return next(error);
  }
});

/* ── Reset password ───────────────────────────────────────── */
router.get('/reset-password', async (req, res, next) => {
  try {
    const db = getDb();
    const token = String(req.query.token || '').trim();
    const user = token
      ? await db.get('SELECT * FROM users WHERE reset_token = ?', [token])
      : null;
    const valid = Boolean(user && user.reset_expires && new Date(user.reset_expires) > new Date());

    if (!valid) {
      res.flash('error', 'पासवर्ड रीसेट दुवा कालबाह्य किंवा अवैध आहे.');
      return res.redirect('/forgot-password');
    }

    return res.render('auth/reset-password', {
      pageTitle: 'नवीन पासवर्ड',
      token,
      errors: {},
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');
    const user = token
      ? await db.get('SELECT * FROM users WHERE reset_token = ?', [token])
      : null;
    const valid = Boolean(user && user.reset_expires && new Date(user.reset_expires) > new Date());

    if (!valid) {
      res.flash('error', 'पासवर्ड रीसेट दुवा कालबाह्य किंवा अवैध आहे.');
      return res.redirect('/forgot-password');
    }

    const errors = {};
    if (password.length < 8) errors.password = 'पासवर्ड किमान ८ अक्षरांचा असावा.';
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'पासवर्डमध्ये अक्षर आणि अंक दोन्ही असावेत.';
    }
    if (password !== confirm) errors.confirm = 'दोन्ही पासवर्ड जुळत नाहीत.';

    if (Object.keys(errors).length) {
      return res.status(422).render('auth/reset-password', {
        pageTitle: 'नवीन पासवर्ड',
        token,
        errors,
      });
    }

    await db.run(
      `UPDATE users
          SET password_hash = ?, reset_token = NULL, reset_expires = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [hashPassword(password), user.id]
    );

    res.flash('success', 'तुमचा पासवर्ड बदलला गेला. आता प्रवेश करा.');
    return res.redirect('/login');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

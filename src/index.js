'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const config = require('./config');
const { initDb } = require('./db');
const { attachUser } = require('./lib/auth');
const { csrfToken, verifyCsrf } = require('./lib/csrf');
const { flash } = require('./lib/flash');
const { loadSettings } = require('./lib/settings');
const helpers = require('./lib/helpers');
const { startScheduler } = require('./lib/scheduler');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.google.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: config.isProd ? '7d' : 0,
  etag: true,
}));

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(csrfToken);
app.use(flash);
app.use(attachUser);
app.use(loadSettings);

app.use((req, res, next) => {
  res.locals.helpers = helpers;
  res.locals.pageTitle = res.locals.pageTitle || null;
  res.locals.metaDescription = res.locals.metaDescription || res.locals.settings['site.description'];
  res.locals.bodyClass = '';
  res.locals.currentUrl = req.originalUrl;
  res.locals.isProd = config.isProd;
  res.locals.uploadLimitMb = config.maxUploadMb;
  res.locals.supabaseConfigured = Boolean(config.supabaseUrl && config.supabaseServiceKey);
  next();
});

app.use(verifyCsrf);

app.use('/', publicRoutes.router);
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

/* ── 404 ──────────────────────────────────────────────────── */
app.use((req, res) => {
  // A logged-in user who mistypes an admin/dashboard URL should not hit a
  // dead-end 404 (e.g. after a stale login redirect) — send them to the
  // dashboard area instead.
  if (req.user && (req.path === '/admin' || req.path.startsWith('/admin/') ||
      req.path === '/dashboard' || req.path.startsWith('/dashboard/'))) {
    return res.redirect(req.path.startsWith('/admin') ? '/admin' : '/dashboard');
  }

  if (req.path.startsWith('/api') || req.accepts(['html', 'json']) === 'json') {
    return res.status(404).json({ ok: false, error: 'मार्ग सापडला नाही.' });
  }
  return res.status(404).render('errors/404', { pageTitle: 'पान सापडले नाही' });
});

/* ── Error handler ────────────────────────────────────────── */
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error('[error]', req.method, req.originalUrl, '-', error.message);
  if (!config.isProd && error.stack) console.error(error.stack);

  let status = error.status || 500;
  let message = config.isProd
    ? 'सर्व्हरवर काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.'
    : error.message;

  if (error instanceof multer.MulterError) {
    status = 400;
    message = error.code === 'LIMIT_FILE_SIZE'
      ? `फाइल ${config.maxUploadMb} MB पेक्षा मोठी आहे.`
      : 'फाइल अपलोड करताना त्रुटी आली.';
  }

  if (req.path.startsWith('/api') || req.accepts(['html', 'json']) === 'json') {
    return res.status(status).json({ ok: false, error: message });
  }

  return res.status(status).render('errors/500', {
    pageTitle: 'त्रुटी',
    message,
    status,
  });
});

async function start() {
  await initDb();
  startScheduler();

  const server = app.listen(config.port, () => {
    console.log('\n  डॉ. सदाशिव सुर्यवंशी — सुरू झाले');
    console.log(`  पत्ता: ${config.siteUrl}`);
    console.log(`  स्थानिक: http://localhost:${config.port}`);
    console.log(`  डेटाबेस: ${config.tursoUrl ? 'Turso (remote)' : 'SQLite (data/app.db)'}`);
    console.log(`  पर्यावरण: ${config.isProd ? 'production' : 'development'}\n`);
  });

  const shutdown = (signal) => {
    console.log(`\n[${signal}] सर्व्हर बंद होत आहे...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('सर्व्हर सुरू करता आला नाही:', error);
    process.exit(1);
  });
}

module.exports = { app, start };

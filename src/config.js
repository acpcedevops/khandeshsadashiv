require('dotenv').config();

const path = require('node:path');

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const siteUrl = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/$/, '');

const config = {
  isProd,
  port,
  siteUrl,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-please-32-chars-minimum',
  cookieName: 'dsw_session',

  tursoUrl: process.env.TURSO_DATABASE_URL || '',
  tursoToken: process.env.TURSO_AUTH_TOKEN || '',

  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseBucket: process.env.SUPABASE_BUCKET || 'media',

  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'onboarding@resend.dev',
  ownerEmail: process.env.OWNER_EMAIL || 'owner@example.com',

  seedOwnerEmail: process.env.SEED_OWNER_EMAIL || 'owner@example.com',
  seedOwnerPassword: process.env.SEED_OWNER_PASSWORD || 'Owner@12345',

  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 5),
  uploadDir: path.join(__dirname, '..', 'public', 'uploads'),

  contentLimits: {
    title: 90,
    excerpt: 220,
    body: 12000,
  },

  roles: ['owner', 'admin', 'editor', 'contributor', 'reader'],
  adminRoles: ['owner', 'admin', 'editor'],
};

if (isProd && config.jwtSecret.startsWith('dev-only')) {
  console.warn('[warn] JWT_SECRET is still the development default. Set a strong secret before going live.');
}
if (isProd && !config.tursoUrl) {
  console.warn('[warn] No TURSO_DATABASE_URL set. Production data will not persist on an ephemeral host.');
}

module.exports = config;

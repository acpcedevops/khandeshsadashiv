'use strict';

/**
 * Initialise a remote Turso database (schema + seed data) from this machine.
 *
 * Usage (PowerShell):
 *   $env:TURSO_DATABASE_URL="libsql://..."; $env:TURSO_AUTH_TOKEN="..."; node scripts/seed-remote.js
 *
 * This is optional: the deployed app also runs initDb() on its first request.
 * Running it beforehand makes the first page load fast instead of slow.
 */

require('dotenv').config();

const { initDb } = require('../src/db');

(async () => {
  const db = await initDb();
  const users = await db.get('SELECT COUNT(*) AS count FROM users');
  const posts = await db.get('SELECT COUNT(*) AS count FROM posts');
  const settings = await db.get('SELECT COUNT(*) AS count FROM settings');
  console.log(
    `Remote database ready (${db.kind}): ${users.count} users, ${posts.count} posts, ${settings.count} settings`
  );
})().catch((error) => {
  console.error('Database initialisation failed:', error);
  process.exit(1);
});

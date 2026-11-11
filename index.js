'use strict';

/**
 * Vercel entry point.
 *
 * Vercel detects this file because it requires `express`, and turns it into a
 * single serverless function that forwards every request path unchanged.
 *
 * The exported handler only makes sure the database schema/seed has finished
 * initialising before the real Express app handles the request. Exporting a
 * plain `(req, res)` function (instead of mounting the app with `app.use()`)
 * keeps the handler compatible with every Vercel Node.js runtime shape.
 */

// Required so Vercel's Express builder detects this file as the entrypoint.
require('express');

const { app } = require('./src/index');
const { initDb } = require('./src/db');

let ready = null;

function ensureReady() {
  if (!ready) {
    ready = initDb().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

module.exports = async function handler(req, res) {
  try {
    await ensureReady();
  } catch (error) {
    console.error('[vercel] database initialisation failed:', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(
      'Database initialisation failed. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN ' +
        'in the Vercel project environment variables.\n\n' +
        error.message
    );
    return;
  }

  return app(req, res);
};

'use strict';

const { app } = require('../src/index');
const { initDb } = require('../src/db');

let initPromise = null;

function ensureReady() {
  if (!initPromise) {
    initPromise = initDb().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
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

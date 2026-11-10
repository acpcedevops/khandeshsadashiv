'use strict';

/**
 * Vercel entry point.
 *
 * Vercel detects an Express app exported from this file and turns it into a
 * single serverless function, forwarding every request path unchanged.
 * The wrapper below only makes sure the database schema/seed has finished
 * initialising before Express handles the request.
 */

const express = require('express');
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

const server = express();
server.disable('x-powered-by');
server.set('trust proxy', 1);

server.use(async (req, res, next) => {
  try {
    await ensureReady();
    next();
  } catch (error) {
    console.error('[vercel] database initialisation failed:', error);
    res.status(500).type('text/plain; charset=utf-8').send(
      'Database initialisation failed. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN ' +
        'in the Vercel project environment variables.\n\n' +
        error.message
    );
  }
});

server.use(app);

module.exports = server;

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

let db = null;

function normaliseRow(row) {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out;
}

function createLocalAdapter() {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(__dirname, '..', '..', 'data', 'app.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL;');
  conn.exec('PRAGMA foreign_keys = ON;');

  return {
    kind: 'sqlite',
    async all(sql, args = []) {
      return conn.prepare(sql).all(...args).map(normaliseRow);
    },
    async get(sql, args = []) {
      const row = conn.prepare(sql).get(...args);
      return row ? normaliseRow(row) : null;
    },
    async run(sql, args = []) {
      const result = conn.prepare(sql).run(...args);
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async exec(sql) {
      conn.exec(sql);
    },
  };
}

function createTursoAdapter() {
  const { createClient } = require('@libsql/client/web');
  const url = config.tursoUrl.replace(/^libsql:\/\//, 'https://');
  const client = createClient({ url, authToken: config.tursoToken });

  return {
    kind: 'turso',
    async all(sql, args = []) {
      const rs = await client.execute({ sql, args });
      return rs.rows.map(normaliseRow);
    },
    async get(sql, args = []) {
      const rs = await client.execute({ sql, args });
      return rs.rows[0] ? normaliseRow(rs.rows[0]) : null;
    },
    async run(sql, args = []) {
      const rs = await client.execute({ sql, args });
      return {
        lastInsertRowid: Number(rs.lastInsertRowid),
        changes: Number(rs.rowsAffected),
      };
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    },
  };
}

async function initDb() {
  if (db) return db;
  db = config.tursoUrl ? createTursoAdapter() : createLocalAdapter();

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.exec(schema);

  const { seed } = require('./seed');
  await seed(db);

  return db;
}

function getDb() {
  if (!db) throw new Error('Database has not been initialised. Call initDb() first.');
  return db;
}

module.exports = { initDb, getDb };

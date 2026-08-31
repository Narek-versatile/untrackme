'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.UNTRACKME_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'untrackme.db'));

// WAL keeps reads fast while a write is in flight, and survives restarts.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    code       TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );

  INSERT OR IGNORE INTO counters (name, value) VALUES ('cleans', 0);
`);

const statements = {
  bumpCleans: db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'cleans'"),
  readCleans: db.prepare("SELECT value FROM counters WHERE name = 'cleans'"),
  insertLink: db.prepare('INSERT INTO links (code, url, created_at) VALUES (?, ?, ?)'),
  findByCode: db.prepare('SELECT url FROM links WHERE code = ?'),
  findByUrl: db.prepare('SELECT code FROM links WHERE url = ? LIMIT 1')
};

// No ambiguous glyphs: 0/O and 1/l/I are out, so a code read aloud stays a code.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CODE_LENGTH = 6;

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Count one cleaning run. Returns the new total. */
function recordClean() {
  statements.bumpCleans.run();
  return totalCleans();
}

function totalCleans() {
  const row = statements.readCleans.get();
  return row ? row.value : 0;
}

/**
 * Store a cleaned URL under a short code. The same URL always gets the same
 * code back, so repeat cleans do not fill the table with duplicates.
 */
function shorten(url) {
  const existing = statements.findByUrl.get(url);
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomCode();
    try {
      statements.insertLink.run(code, url, Date.now());
      return code;
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a short code');
}

function resolve(code) {
  const row = statements.findByCode.get(code);
  return row ? row.url : null;
}

module.exports = { db, recordClean, totalCleans, shorten, resolve, CODE_LENGTH, ALPHABET };

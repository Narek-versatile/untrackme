'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const { clean } = require('./src/clean');
const store = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://untrackme.narek.actcollege.am';

/**
 * Hosts allowed to appear in a short link. A short link has to point back at
 * whichever hostname the caller actually used, or a link shared from the
 * stand-in address would resolve to a domain that is not live yet. The list
 * is an allowlist so a forged Host header cannot mint a link to someone
 * else's origin.
 */
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS || 'untrackme.narek.actcollege.am')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
);

function originFor(req) {
  const host = String(req.get('host') || '').toLowerCase();
  const bare = host.replace(/:\d+$/, '');

  if (ALLOWED_HOSTS.has(bare)) {
    const proto = req.protocol === 'http' && bare !== 'localhost' ? 'https' : req.protocol;
    return `${proto}://${host}`;
  }

  // Local development, where the host is not worth allowlisting.
  if (bare === 'localhost' || bare === '127.0.0.1') return `http://${host}`;

  return PUBLIC_ORIGIN;
}

// Caddy terminates TLS, so trust its forwarded headers for client IPs.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '16kb' }));

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

/**
 * The cleaning API is open to any origin on purpose: a browser extension
 * calling `POST /clean` from a page context needs it, and the endpoint
 * accepts a URL and returns a URL. There is nothing per-user to protect.
 */
function cors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

const apiLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Wait a minute and try again.' }
});

// ---------------------------------------------------------------- API

app.options('/clean', cors);

app.post('/clean', cors, apiLimit, (req, res) => {
  const body = req.body || {};
  const result = clean(body.url);

  if (!result.ok) return res.status(400).json(result);

  const total = store.recordClean();

  const payload = {
    ok: true,
    original: result.original,
    cleaned: result.cleaned,
    removed: result.removed,
    kept: result.kept,
    changed: result.changed,
    total
  };

  if (body.shorten === true) {
    const code = store.shorten(result.cleaned);
    payload.code = code;
    payload.short = `${originFor(req)}/r/${code}`;
  }

  res.json(payload);
});

app.get('/api/stats', cors, (req, res) => {
  res.json({ ok: true, cleaned: store.totalCleans() });
});

// ---------------------------------------------------------------- Pages

/**
 * Pages carry absolute URLs in their canonical link and Open Graph tags, and
 * the site answers on more than one hostname while the real domain is being
 * set up. Rather than hard-code one origin and hand the other host a preview
 * pointing at a domain that does not resolve, the origin is substituted per
 * request. Templates are read once at boot.
 */
const PAGES = ['index', 'privacy', 'terms', '404'];
const templates = new Map();

for (const name of PAGES) {
  templates.set(name, fs.readFileSync(path.join(__dirname, 'public', `${name}.html`), 'utf8'));
}

function renderPage(name, req) {
  return templates.get(name).split('{{ORIGIN}}').join(originFor(req));
}

function sendPage(name, req, res, status = 200) {
  res
    .status(status)
    .type('html')
    .set('Cache-Control', 'no-cache')
    .send(renderPage(name, req));
}

app.get(['/', '/index.html'], (req, res) => sendPage('index', req, res));
app.get(['/privacy', '/privacy.html'], (req, res) => sendPage('privacy', req, res));
app.get(['/terms', '/terms.html'], (req, res) => sendPage('terms', req, res));

// ---------------------------------------------------------------- Redirect

app.get('/r/:code', (req, res, next) => {
  const { code } = req.params;
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return next();

  const url = store.resolve(code);
  if (!url) return sendPage('404', req, res, 404);

  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, url);
});

// ---------------------------------------------------------------- Static

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

app.use((req, res) => sendPage('404', req, res, 404));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Something broke on our side.' });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`untrackme listening on http://127.0.0.1:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
  });
}

module.exports = app;

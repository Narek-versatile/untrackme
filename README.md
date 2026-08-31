# UntrackMe

Paste a link, see which tracking parameters are attached to it, and get a clean
one back. Optionally shorten the result.

Live at **https://untrackme.narek.actcollege.am**

The point of difference is that it explains itself: every parameter it removes
is listed with what that parameter actually was, so the answer is auditable
rather than a black box that hands you a different URL.

- Strips campaign tags, click IDs, share fingerprints, affiliate and session
  codes, both by exact name and by prefix (`utm_*`, `mtm_*`, `pk_*`, ...).
- YouTube gets a stricter rule: on `/watch` only `v` survives, and `youtu.be`
  links keep no query string at all.
- Host exceptions stop it from breaking links that need a generic-looking
  parameter (a Google `q`, an Amazon `k`).
- No cookies, no analytics, no third-party requests. Fonts are self-hosted.

## Stack

| Piece      | Choice                                          |
| ---------- | ----------------------------------------------- |
| Backend    | Node.js 22 + Express 4                          |
| Database   | SQLite via `better-sqlite3`, WAL mode           |
| Process    | pm2, restarts on boot                           |
| Web server | Caddy, automatic Let's Encrypt certificate      |
| Frontend   | Static HTML, CSS and JS served by Express       |

No build step. The `public/` directory is shipped as written.

## API

The cleaning logic is one POST endpoint, open to every origin and requiring no
key, so a browser extension or a shell script can use exactly what the website
uses.

### `POST /clean`

```bash
curl -X POST https://untrackme.narek.actcollege.am/clean \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://youtu.be/dQw4w9WgXcQ?si=xY12ab","shorten":true}'
```

```json
{
  "ok": true,
  "original": "https://youtu.be/dQw4w9WgXcQ?si=xY12ab",
  "cleaned": "https://youtu.be/dQw4w9WgXcQ",
  "removed": [{ "key": "si", "value": "xY12ab", "reason": "Share fingerprint" }],
  "kept": [],
  "changed": true,
  "total": 1284,
  "code": "d4eB3p",
  "short": "https://untrackme.narek.actcollege.am/r/d4eB3p"
}
```

`shorten` is optional and defaults to false; without it, `code` and `short` are
omitted. `removed` and `kept` preserve the parameters' original order. `total`
is the public counter after this call. A bad URL returns HTTP 400 with
`{"ok": false, "error": "..."}`.

### `GET /api/stats`

```json
{ "ok": true, "cleaned": 1284 }
```

### `GET /r/<code>`

HTTP 302 to the cleaned URL, or 404 if the six-character code is unknown.

Rate limit across the API is 60 requests per minute per IP, counted in memory.

## Local development

```bash
npm install
npm run dev
```

Serves on http://127.0.0.1:3000 and writes `data/untrackme.db`, which is
gitignored. `npm test` runs the cleaning-rule suite (`node:test`, no
dependencies).

Environment variables, all optional:

| Variable             | Default                                     |
| -------------------- | ------------------------------------------- |
| `PORT`               | `3000`                                      |
| `PUBLIC_ORIGIN`      | `https://untrackme.narek.actcollege.am`     |
| `UNTRACKME_DATA_DIR` | `./data`                                    |
| `NODE_ENV`           | unset; `production` turns on asset caching  |

## Deployment

The server binds to `127.0.0.1` only. Caddy is the sole thing listening on 80
and 443, and it terminates TLS.

```bash
sudo bash deploy/setup.sh
```

Idempotent, so the same command is both the first install and every redeploy.
It installs Node, Caddy and pm2 if missing, syncs `/opt/untrackme` to
`origin/main`, installs production dependencies, runs the tests, reloads the
pm2 process, writes the Caddy config and reloads Caddy, then checks that the
app answers on port 3000.

### Where things live

| What              | Where                              |
| ----------------- | ---------------------------------- |
| Application       | `/opt/untrackme`                   |
| Database          | `/var/lib/untrackme/untrackme.db`  |
| Error logs        | `/var/log/untrackme/`              |
| pm2 process       | `untrackme`                        |
| Caddy config      | `/etc/caddy/Caddyfile`             |

The database sits outside the checkout on purpose: a redeploy resets the source
tree with `git reset --hard` and must not touch the counter or the short links.

### Operating it

```bash
pm2 restart untrackme          # restart the app
pm2 logs untrackme             # follow its output
pm2 status                     # is it up
systemctl reload caddy         # after editing /etc/caddy/Caddyfile
journalctl -u caddy -n 50      # certificate and proxy problems
```

To back up, copy `/var/lib/untrackme/`. That directory is the entire state.

### DNS

`untrackme.narek.actcollege.am` needs an A record pointing at the server. Caddy
requests the certificate over HTTP-01 on the first request to the domain, so
the record must resolve and ports 80 and 443 must be reachable before HTTPS
will work.

### nginx instead of Caddy

`deploy/nginx.conf` is provided for a host that already runs nginx. It needs
certbot run separately. Caddy is the supported path.

## Layout

```
server.js                 routes, static hosting, security headers
src/clean.js              the cleaning rules, no I/O, no dependencies
src/db.js                 SQLite schema, counter, short-code allocation
public/                   the site, served as-is
test/clean.test.js        cleaning-rule tests
deploy/setup.sh           provisioning and redeploy
deploy/Caddyfile          reverse proxy and TLS
deploy/ecosystem.config.cjs   pm2 process definition
deploy/nginx.conf         optional alternative to Caddy
```

## Adding a tracking parameter

Everything lives in `src/clean.js`.

- One parameter, one site: add it to `EXACT` with a short plain-language label.
  The label is shown to users, so write "Facebook click ID" rather than
  "tracker".
- A whole family: add a prefix to `PREFIXES`.
- A site that needs an allowlist rather than a blocklist: add an entry to
  `HOST_RULES`, as YouTube does.
- A site where a listed parameter is load-bearing: add it to `HOST_EXCEPTIONS`.

Add a case to `test/clean.test.js` alongside it. `deploy/setup.sh` runs the
suite and refuses to restart the app if it fails.

## Licence

MIT. See `LICENSE`.

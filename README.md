# UntrackMe

Paste a link, see which tracking parameters are attached to it, and get a clean
one back. Optionally shorten the result.

Live at **https://untrackme.narek.actcollege.am**

> **Temporary address.** Until that domain has a DNS record, the site is
> reachable at **https://109-94-170-160.sslip.io** instead. That address is a
> stand-in and is served `noindex`. See [TEMPORARY.md](TEMPORARY.md) for how to
> point the real domain at the server and remove the stand-in afterwards.

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
| `ALLOWED_HOSTS`      | `untrackme.narek.actcollege.am`             |
| `UNTRACKME_DATA_DIR` | `./data`                                    |
| `NODE_ENV`           | unset; `production` turns on asset caching  |

`ALLOWED_HOSTS` is the set of hostnames a short link may point at. The app uses
whichever of them served the request, so the same deployment can answer on more
than one name without handing anyone a link on the wrong one. A `Host` header
outside the list falls back to `PUBLIC_ORIGIN`.

Page templates are read once at boot, so an edit to a file in `public/` needs a
restart to show up. `npm run dev` restarts on change; in production `pm2 restart
untrackme` does it.

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

`untrackme.narek.actcollege.am` needs an A record pointing at `109.94.170.160`.
Caddy requests the certificate over HTTP-01 on the first request to the domain,
so the record must resolve and ports 80 and 443 must be reachable before HTTPS
will work. Full steps, including removing the temporary address, are in
[TEMPORARY.md](TEMPORARY.md).

### nginx instead of Caddy

`deploy/nginx.conf` is provided for a host that already runs nginx. It needs
certbot run separately. Caddy is the supported path.

## Discoverability and assets

`tools/make-images.js` regenerates the social preview and the favicon package.
It downloads the two font families to `tools/.fonts` on first run (gitignored)
and renders with resvg, so the output is reproducible rather than hand-drawn:

```bash
node tools/make-images.js
```

It writes `public/og.png` (1200x630), `favicon.ico`, `apple-touch-icon.png`,
`icon-192.png` and `icon-512.png`. The mark itself is `public/icon.svg`.

Every page carries a canonical link, Open Graph and Twitter card tags, and the
home page carries `WebApplication` JSON-LD. Those URLs are absolute and are
substituted per request, so previews resolve correctly on whichever hostname
served the page.

`public/robots.txt` allows everything except `/r/`, which is redirects rather
than content. `public/sitemap.xml` lists the three real pages and is referenced
from robots.txt. `public/site.webmanifest` makes the tool installable.

### Getting indexed

1. Point the domain at the server first. Nothing below works until
   `https://untrackme.narek.actcollege.am/` serves a 200 over HTTPS.
2. Add the property in [Google Search Console](https://search.google.com/search-console)
   as a URL prefix, verify by DNS TXT record in the same Route 53 zone, then
   submit `https://untrackme.narek.actcollege.am/sitemap.xml` under Sitemaps.
3. Use "URL Inspection" on the home page and request indexing to skip the
   queue.
4. Repeat in [Bing Webmaster Tools](https://www.bing.com/webmasters), which
   can import the Search Console property directly. Bing also feeds
   DuckDuckGo, Ecosia and Yahoo.
5. Confirm the preview renders with the
   [Facebook sharing debugger](https://developers.facebook.com/tools/debug/)
   and [LinkedIn post inspector](https://www.linkedin.com/post-inspector/).
   Both cache aggressively, so re-scrape after any change to `og.png`.
6. Check the structured data with the
   [Rich Results Test](https://search.google.com/test/rich-results).

Indexing takes days to weeks. A sitemap is an invitation, not a guarantee: the
thing that actually moves it is other sites linking to it.

## Accessibility

Audited with axe-core against WCAG 2.0/2.1/2.2 A and AA plus axe's
best-practice rules. All four pages pass with no violations in both light and
dark themes, and in the post-clean result state.

What that rests on, so it does not regress:

- Every text colour meets 4.5:1 against both the page and raised backgrounds.
  `--ink-faint` is at the limit in both themes; darkening it further in light
  or lightening it in dark is fine, the other direction is not.
- Removed and kept parameters are distinguished by a strikethrough and a text
  label as well as by colour, so the report does not depend on telling red
  from green.
- Interactive targets are at least 24px in their smaller dimension.
- `prefers-reduced-motion` removes the row reveal.
- The result region is `aria-live="polite"`, errors are `role="alert"`, and
  the two `nav` landmarks are labelled.

To re-run it, serve the site, then load `node_modules/axe-core/axe.min.js` in
the page and call `axe.run`.

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
tools/make-images.js      regenerates og.png and the favicon package
TEMPORARY.md              removing the stand-in address once DNS is live
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

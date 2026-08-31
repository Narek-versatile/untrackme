# Temporary stand-in address

**The site is currently reachable at a stand-in address because
`untrackme.narek.actcollege.am` has no DNS record yet.**

    https://109-94-170-160.sslip.io

`sslip.io` is wildcard DNS: any hostname of the form `<ip>.sslip.io` resolves
to that IP. That is enough for Let's Encrypt to issue a real certificate, so
the stand-in is genuine HTTPS and safe to share, with no DNS zone required.

It is served with `X-Robots-Tag: noindex, nofollow` so search engines never
index it and it cannot compete with the real domain for the same content.

---

## Step 1: create the DNS record

In Route 53, hosted zone `actcollege.am`:

| Field | Value                          |
| ----- | ------------------------------ |
| Name  | `untrackme.narek`              |
| Type  | `A`                            |
| Value | `109.94.170.160`               |
| TTL   | `300`                          |

Wait for it to resolve before going further:

```bash
dig +short untrackme.narek.actcollege.am @8.8.8.8
```

That must print `109.94.170.160`. Caddy is already configured for the real
domain and will request its certificate automatically within a minute or two
of the record going live, with no action needed.

Confirm HTTPS works on the real domain before removing anything:

```bash
curl -sI https://untrackme.narek.actcollege.am/ | head -3
```

## Step 2: remove the stand-in

Only after the command above returns `HTTP/2 200`. Four places, in this order.

### 1. `deploy/Caddyfile`

Delete the whole block between the `TEMPORARY PUBLIC ADDRESS` banner and
`END OF TEMPORARY BLOCK`, including both banners. Leave the `(common)`
snippet and the `untrackme.narek.actcollege.am` block alone.

### 2. `deploy/ecosystem.config.cjs`

Delete the `ALLOWED_HOSTS` entry and the comment above it. The code then falls
back to the real domain on its own, which is the correct value.

### 3. `README.md`

Delete the "Temporary address" section and the line under the title that
points at this file.

### 4. This file

```bash
git rm TEMPORARY.md
```

### Then redeploy

```bash
git add -A && git commit -m "Remove the temporary sslip.io address" && git push
ssh jarvis-root 'bash /opt/untrackme/deploy/setup.sh'
```

## Step 3: check nothing still points at the stand-in

```bash
grep -rn "sslip" --exclude-dir=node_modules --exclude-dir=.git .
```

Should return nothing. Then confirm the site and a short link both work on the
real domain:

```bash
curl -sI https://untrackme.narek.actcollege.am/ | head -1
curl -s -X POST https://untrackme.narek.actcollege.am/clean \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://youtu.be/dQw4w9WgXcQ?si=x","shorten":true}'
```

The `short` field in that response must start with
`https://untrackme.narek.actcollege.am/r/`.

## What happens to links already shared

Short codes are stored as cleaned target URLs, not as full short URLs, so
every `/r/<code>` created during the stand-in period keeps working on the real
domain. Only the hostname people were given changes. Anyone holding a
`https://109-94-170-160.sslip.io/r/...` link will get a connection error once
the block is removed, so if any of those were shared widely, reshare them
against the real domain first.

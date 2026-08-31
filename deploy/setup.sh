#!/usr/bin/env bash
#
# Provision UntrackMe on a fresh Ubuntu host. Safe to run more than once:
# every step checks before it acts, so a second run behaves as a redeploy.
#
#   sudo bash deploy/setup.sh
#
set -euo pipefail

REPO="https://github.com/Narek-versatile/untrackme.git"
APP_DIR="/opt/untrackme"
DATA_DIR="/var/lib/untrackme"
LOG_DIR="/var/log/untrackme"
DOMAIN="untrackme.narek.actcollege.am"
NODE_MAJOR=22

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

# ---------------------------------------------------------------- packages

log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  log "Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
else
  log "Node.js $(node -v) already present"
fi

if ! command -v caddy >/dev/null 2>&1; then
  log "Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
else
  log "Caddy $(caddy version | head -1) already present"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "pm2"
  npm install -g pm2 --silent
else
  log "pm2 $(pm2 -v) already present"
fi

# ---------------------------------------------------------------- the app

log "Source at ${APP_DIR}"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin
  git -C "$APP_DIR" reset --hard --quiet origin/main
else
  rm -rf "$APP_DIR"
  git clone --quiet "$REPO" "$APP_DIR"
fi

log "Dependencies"
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund

log "Data and log directories"
mkdir -p "$DATA_DIR" "$LOG_DIR"

log "Tests"
# The suite uses node:test only, so it runs against the production install.
npm test || { echo "Tests failed. Stopping before restart." >&2; exit 1; }

# ---------------------------------------------------------------- process

log "pm2"
pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.cjs" --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null

# ---------------------------------------------------------------- web server

log "Caddy config"
install -m 0644 "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy || systemctl restart caddy
systemctl enable caddy >/dev/null

# ---------------------------------------------------------------- check

log "Checking the app on 127.0.0.1:3000"
sleep 2
curl -fsS http://127.0.0.1:3000/api/stats && echo

cat <<MSG

Done.

  Site        https://${DOMAIN}
  App         ${APP_DIR}      (pm2 process "untrackme")
  Database    ${DATA_DIR}/untrackme.db
  Web server  /etc/caddy/Caddyfile

The certificate is issued by Caddy on the first request to the domain, so
give it a few seconds if the first load is slow. If it never arrives, check
that the A record for ${DOMAIN} resolves to this host and that ports 80 and
443 are open, then look at: journalctl -u caddy -n 50

MSG

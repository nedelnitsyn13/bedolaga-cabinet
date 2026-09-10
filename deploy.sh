#!/usr/bin/env bash
# Deploy the cabinet frontend: pull latest code, rebuild the Docker image,
# then copy the built static files out to the directory Caddy serves them
# from directly (see /etc/caddy/Caddyfile — `root * /srv/cabinet`; Caddy
# does NOT reverse_proxy to this container, so `docker compose up --build`
# alone never reaches production).
set -euo pipefail

SERVICE=cabinet-frontend
CONTAINER=cabinet_frontend
DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/cabinet}"

cd "$(dirname "$0")"

echo "==> git pull"
git pull

echo "==> docker compose build $SERVICE"
docker compose build "$SERVICE"

echo "==> docker compose up -d $SERVICE"
docker compose up -d "$SERVICE"

if [ -d "$DEPLOY_ROOT" ]; then
  backup="$DEPLOY_ROOT.bak.$(date +%s)"
  echo "==> backing up $DEPLOY_ROOT to $backup"
  cp -r "$DEPLOY_ROOT" "$backup"
fi

echo "==> copying build output to $DEPLOY_ROOT"
owner="$(stat -c '%U:%G' "$DEPLOY_ROOT" 2>/dev/null || true)"
docker cp "$CONTAINER:/usr/share/nginx/html/." "$DEPLOY_ROOT/"
if [ -n "${owner:-}" ]; then
  chown -R "$owner" "$DEPLOY_ROOT"
fi

echo "==> done. Caddy serves index.html with no-cache, so this takes effect immediately."

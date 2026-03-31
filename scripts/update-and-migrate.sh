#!/usr/bin/env bash
# Deploy meals-rmg on the server: pull latest code, migrate DB, build backend + frontend.
#
# Usage (from repo root on server):
#   bash scripts/update-and-migrate.sh
#
# Optional environment variables:
#   MEALS_GIT_BRANCH   — branch to pull (default: main)
#   MEALS_PM2_APP      — if set, runs: pm2 restart "$MEALS_PM2_APP" after builds
#
# Example:
#   MEALS_PM2_APP=meals-api bash scripts/update-and-migrate.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${MEALS_GIT_BRANCH:-main}"

cd "$ROOT_DIR"

echo "==> Git: fetch + pull --rebase origin/${BRANCH}"
git fetch origin
git pull --rebase origin "$BRANCH"

echo "==> Backend: install dependencies"
cd "$ROOT_DIR/backend"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Backend: Prisma migrate + generate"
npx prisma migrate deploy
npx prisma generate

echo "==> Backend: build (Nest)"
npm run build

echo "==> Frontend: install dependencies"
cd "$ROOT_DIR/frontend"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Frontend: build (Vite → dist/)"
npm run build

if [ -n "${MEALS_PM2_APP:-}" ]; then
  echo "==> PM2: restart ${MEALS_PM2_APP}"
  pm2 restart "$MEALS_PM2_APP"
fi

echo "==> Done. Point nginx → Node for /meals-rmg (see scripts/nginx-meals-rmg.snippet.conf). sudo nginx -t && sudo systemctl reload nginx"
echo "    Backend .env: MEALS_PUBLIC_PATH=/meals-rmg. Optional FRONTEND_DIST_PATH if frontend/dist is not next to backend in the repo."

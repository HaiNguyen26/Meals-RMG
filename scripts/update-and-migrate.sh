#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
git pull --rebase

cd "$ROOT_DIR/backend"
npx prisma migrate deploy


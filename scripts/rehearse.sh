#!/usr/bin/env bash
# One command before recording or submitting. Stops at the first failure.
set -euo pipefail
echo "== types"; npx tsc --noEmit
echo "== lint"; npx eslint src scripts tests
echo "== unit + mishearing"; npx vitest run
echo "== replay"; npx tsx scripts/replay.ts
echo "== build"; npx next build >/dev/null
echo "== e2e (mock)"; corepack pnpm test:e2e
if [ -s .env ]; then
  echo "== live reads"; npx tsx --env-file=.env scripts/live-rebuild.ts
  echo "== memory writes"; timeout 130 npx tsx --env-file=.env scripts/walrus-check.ts
fi
echo "rehearsal passed"

#!/usr/bin/env bash
# Quick shortcut to seed demo accounts + scenarios.
# Same as: cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed-demo-accounts.ts

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/apps/api"
set -a; . ./.env; set +a
exec npx tsx prisma/seed-demo-accounts.ts

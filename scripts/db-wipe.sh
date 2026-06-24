#!/usr/bin/env bash
# Wipe all DATA from an environment's database (keeps the schema / tables).
#
#   scripts/db-wipe.sh <env>      e.g.  scripts/db-wipe.sh prod
#
# A timestamped backup is written to .backups/ first (reversible). TRUNCATE …
# CASCADE empties every table in the public schema but leaves table structure
# intact, so the app keeps working against an empty DB (no re-migrate needed).
#
# NOTE: start.sh will NOT auto-seed PROD, so a wiped PROD stays empty until you
# promote data into it (scripts/db-copy.sh uat prod) or real users arrive.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/env-config.sh"

env_config "${1:-}" || { echo "用法：scripts/db-wipe.sh <env>  (prod|uat)"; exit 1; }
DB="$DB_NAME"
PSQL() { docker compose exec -T postgres psql -U authentik "$@"; }
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p .backups

echo "▸ 備份 $ENV_NAME ($DB) → .backups/${ENV_NAME}-before-wipe-${TS}.sql"
docker compose exec -T postgres pg_dump -U authentik "$DB" > ".backups/${ENV_NAME}-before-wipe-${TS}.sql"

echo "▸ 中斷其他連線"
PSQL -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid<>pg_backend_pid()" >/dev/null 2>&1 || true

echo "▸ TRUNCATE 所有 public table (保留 schema)…"
PSQL -d "$DB" -tAc "SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE;' FROM pg_tables WHERE schemaname='public'" \
  | PSQL -d "$DB" >/dev/null

N=$(PSQL -d "$DB" -tAc 'SELECT COUNT(*) FROM "Listing";' 2>/dev/null | tr -d '[:space:]')
echo "✓ $ENV_NAME ($DB) 已清空：listings=$N  (備份喺 .backups/)"

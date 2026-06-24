#!/usr/bin/env bash
# Copy one environment's database into another (full schema + data snapshot).
#
#   scripts/db-copy.sh <src-env> <dest-env>
#   e.g.  scripts/db-copy.sh prod uat     # migrate PROD data → UAT (for testing)
#         scripts/db-copy.sh uat  prod    # promote UAT → PROD (a "deploy")
#
# The DEST database is REPLACED. A timestamped backup of DEST is written to
# .backups/ first, so the operation is reversible (restore with:
#   docker compose exec -T postgres psql -U authentik -d <dbname> < .backups/<file>.sql
# after dropping/recreating that db).
#
# Stop the DEST environment's apps first (they hold DB connections):
#   ./stop.sh <dest-env>

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/env-config.sh"

SRC="${1:-}"; DEST="${2:-}"
env_config "$SRC"  || { echo "用法：scripts/db-copy.sh <src-env> <dest-env>"; exit 1; }
SRC_DB="$DB_NAME"
env_config "$DEST" || { echo "用法：scripts/db-copy.sh <src-env> <dest-env>"; exit 1; }
DEST_DB="$DB_NAME"
[[ "$SRC_DB" == "$DEST_DB" ]] && { echo "src 同 dest 唔可以一樣"; exit 1; }

PSQL() { docker compose exec -T postgres psql -U authentik "$@"; }
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p .backups

echo "▸ 備份 DEST ($DEST_DB) → .backups/${DEST}-before-copy-${TS}.sql"
docker compose exec -T postgres pg_dump -U authentik "$DEST_DB" > ".backups/${DEST}-before-copy-${TS}.sql" 2>/dev/null || \
  echo "  (DEST 可能未存在，略過備份)"

echo "▸ 中斷 $DEST_DB 連線 + 重建 (空)"
PSQL -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DEST_DB' AND pid<>pg_backend_pid()" >/dev/null 2>&1 || true
PSQL -d postgres -c "DROP DATABASE IF EXISTS \"$DEST_DB\"" >/dev/null
PSQL -d postgres -c "CREATE DATABASE \"$DEST_DB\"" >/dev/null

echo "▸ Copy $SRC_DB → $DEST_DB (schema + data)…"
docker compose exec -T postgres sh -c "pg_dump -U authentik '$SRC_DB' | psql -U authentik -d '$DEST_DB'" >/dev/null

SRC_N=$(PSQL -d "$SRC_DB"  -tAc 'SELECT COUNT(*) FROM "Listing";' 2>/dev/null | tr -d '[:space:]')
DEST_N=$(PSQL -d "$DEST_DB" -tAc 'SELECT COUNT(*) FROM "Listing";' 2>/dev/null | tr -d '[:space:]')
echo "✓ 完成：$SRC ($SRC_DB) listings=$SRC_N  →  $DEST ($DEST_DB) listings=$DEST_N"
echo "  重啟 DEST：./start.sh $DEST"

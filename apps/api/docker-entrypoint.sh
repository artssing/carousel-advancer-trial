#!/bin/sh
# API container 啟動流程：先同步 schema，再起 server。
# Schema SSOT = prisma db push（跟 CLAUDE.md，未轉 migrate 之前）。
# ⚠️ 上 cloud 前應改用 `prisma migrate deploy`（見 proposal Phase 3）。
set -e

if [ "${RUN_DB_PUSH:-0}" = "1" ]; then
  echo "[api-entrypoint] prisma db push (schema sync)…"
  npx prisma db push --schema=prisma/schema.prisma --accept-data-loss --skip-generate
else
  echo "[api-entrypoint] RUN_DB_PUSH!=1 → 跳過 schema sync"
fi

# ⚠️ 永不 auto-seed（founder ruling：PROD 保持 clean）。
# UAT reseed 由 n8n / 手動 script 處理，唔喺 entrypoint。

echo "[api-entrypoint] 啟動 API：$*"
exec "$@"

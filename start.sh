#!/usr/bin/env bash
# Authentik HK — start one environment (DB + API + 3 frontends)
#
# Run:   ./start.sh [prod|uat]      (default: prod)
# Both:  ./start.sh prod && ./start.sh uat   (run side-by-side, different ports)
# Logs:  .dev-logs/<env>-{api,consumer,authenticator,admin}.log
# Stop:  ./stop.sh [prod|uat|all]
#
# Environment topology (ports / DB) lives in scripts/env-config.sh (SSOT).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# shellcheck source=scripts/env-config.sh
source "$ROOT/scripts/env-config.sh"

ENV_ARG="${1:-prod}"
env_config "$ENV_ARG" || { echo "用法：./start.sh [prod|uat]"; exit 1; }

LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

G="\033[32m"; B="\033[34m"; Y="\033[33m"; D="\033[2m"; R="\033[0m"
say() { printf "${B}▸${R} [%s] %s\n" "$ENV_NAME" "$*"; }
ok()  { printf "${G}✓${R} [%s] %s\n" "$ENV_NAME" "$*"; }
warn(){ printf "${Y}!${R} [%s] %s\n" "$ENV_NAME" "$*"; }

# ── 0a. Docker daemon — auto-start Docker Desktop if needed ──────────────
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker 未安裝 — 請先裝 Docker Desktop: https://docs.docker.com/desktop/install/mac-install/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  say "Docker daemon 唔 running — 自動開 Docker Desktop…"
  open -a Docker 2>/dev/null || { warn "open -a Docker fail — 請手動開 Docker Desktop 再試"; exit 1; }
  for i in {1..90}; do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || { warn "等咗 90 秒 Docker 仍未 ready"; exit 1; }
  ok "Docker daemon ready"
fi

# ── 0b. Skip services whose port is already occupied ─────────────────────
SKIP_API=0; SKIP_CONSUMER=0; SKIP_AUTH=0; SKIP_ADMIN=0
check_port() { lsof -ti tcp:"$1" >/dev/null 2>&1; }
check_port "$API_PORT"      && { warn "Port $API_PORT (API) 已佔用 — 跳過";            SKIP_API=1; }
check_port "$CONSUMER_PORT" && { warn "Port $CONSUMER_PORT (Consumer) 已佔用 — 跳過";  SKIP_CONSUMER=1; }
check_port "$AUTH_PORT"     && { warn "Port $AUTH_PORT (Authenticator) 已佔用 — 跳過"; SKIP_AUTH=1; }
check_port "$ADMIN_PORT"    && { warn "Port $ADMIN_PORT (Admin) 已佔用 — 跳過";         SKIP_ADMIN=1; }

# ── 1. Postgres (shared container; one DB per env) ───────────────────────
say "啟動 Postgres…"
npm run db:up >/dev/null
for _ in {1..30}; do
  docker compose exec -T postgres pg_isready -U authentik >/dev/null 2>&1 && break
  sleep 1
done
# Create this env's database if it doesn't exist (prod=authentik already exists).
if ! docker compose exec -T postgres psql -U authentik -d postgres -tAc \
       "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
  say "建立 database $DB_NAME…"
  docker compose exec -T postgres psql -U authentik -d postgres -c "CREATE DATABASE \"$DB_NAME\"" >/dev/null
fi
ok "Postgres ready (db=$DB_NAME)"

# ── 2. Prisma (idempotent) against THIS env's DB ─────────────────────────
say "Prisma migrate + generate…"
(
  cd apps/api
  set -a; . "./$ENV_FILE"; set +a
  # This project's schema SSOT is schema.prisma synced via `db push` (later
  # columns like emailVerified were added by push, never migration-tracked), so
  # `migrate deploy` would leave a fresh DB with an incomplete baseline. Always
  # push to guarantee the DB matches the current schema. Idempotent + safe on
  # an already-synced PROD db (no-op when nothing changed).
  # --accept-data-loss: schema adds unique constraints (Conversation/User) that
  # trip db push's interactive guard; non-interactive boot must pass it. On a
  # fresh env DB this is harmless; on an already-synced DB push is a no-op.
  npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1 || true
  npx prisma generate >/dev/null 2>&1 || true
)

# Auto-seed demo data — UAT ONLY. PROD is the deploy target and must stay clean:
# data arrives via real use or an explicit promote (scripts/db-copy.sh uat prod),
# never auto-seeded. Founder ruling 2026-06-24: 「所有嘢測試完先 deploy 去 PROD」.
# To seed PROD on purpose: cd apps/api && set -a; . ./.env.prod; set +a && npx tsx prisma/seed.ts
USERS=$(docker compose exec -T postgres psql -U authentik -d "$DB_NAME" -tAc 'SELECT COUNT(*) FROM "User";' 2>/dev/null | tr -d '[:space:]')
if [[ "$ENV_NAME" == "uat" && ( -z "$USERS" || "$USERS" == "0" ) ]]; then
  say "Seed demo data (UAT)…"
  (cd apps/api && set -a; . "./$ENV_FILE"; set +a && npx tsx prisma/seed.ts) >/dev/null
  ok "Seed 完成"
elif [[ "$ENV_NAME" == "prod" && ( -z "$USERS" || "$USERS" == "0" ) ]]; then
  printf "  ${D}PROD DB 係空 — 唔自動 seed（PROD 保持 clean；data 經 deploy/真實使用嚟）${R}\n"
else
  printf "  ${D}DB($DB_NAME) 已有 $USERS 個用戶，跳過 seed${R}\n"
fi

# ── 3. API ───────────────────────────────────────────────────────────────
if [[ "$SKIP_API" == "1" ]]; then
  ok "API 已跑 (port $API_PORT) — 跳過"
else
  say "啟動 API (port $API_PORT)…"
  ( cd apps/api && set -a; . "./$ENV_FILE"; set +a && exec npx nest start --watch ) \
    > "$LOG_DIR/${ENV_NAME}-api.log" 2>&1 &
  disown
  for _ in {1..60}; do
    curl -fsS -o /dev/null "$API_URL/listings?limit=1" 2>/dev/null && { ok "API ready"; break; }
    sleep 1
  done
fi

# ── 4. Frontends ─────────────────────────────────────────────────────────
# Launch `next dev` directly (the package.json -p is hardcoded) so each env
# binds its own port + points at its own API via NEXT_PUBLIC_* env vars.
say "啟動 Consumer ($CONSUMER_PORT) / Authenticator ($AUTH_PORT) / Admin ($ADMIN_PORT)…"
start_front() { # $1=appdir  $2=port  $3=logname
  ( cd "apps/$1" \
    && NEXT_PUBLIC_API_URL="$API_URL" \
       NEXT_PUBLIC_CONSUMER_URL="$CONSUMER_URL" \
       NEXT_PUBLIC_AUTHENTICATOR_URL="$AUTHENTICATOR_URL" \
       exec npx next dev -p "$2" ) > "$LOG_DIR/${ENV_NAME}-$3.log" 2>&1 &
  disown
}
[[ "$SKIP_CONSUMER" == "1" ]] && ok "Consumer 已跑 ($CONSUMER_PORT) — 跳過"      || start_front consumer      "$CONSUMER_PORT" consumer
[[ "$SKIP_AUTH"     == "1" ]] && ok "Authenticator 已跑 ($AUTH_PORT) — 跳過"     || start_front authenticator "$AUTH_PORT"     authenticator
[[ "$SKIP_ADMIN"    == "1" ]] && ok "Admin 已跑 ($ADMIN_PORT) — 跳過"            || start_front admin         "$ADMIN_PORT"    admin

for name_port in "Consumer:$CONSUMER_PORT" "Authenticator:$AUTH_PORT" "Admin:$ADMIN_PORT"; do
  name="${name_port%%:*}"; port="${name_port##*:}"
  for _ in {1..60}; do
    curl -fsS -o /dev/null "http://localhost:$port/" 2>/dev/null && { ok "$name ready (port $port)"; break; }
    sleep 1
  done
done

# ── 5. Summary ────────────────────────────────────────────────────────────
printf "\n${G}━━━━━━━━━━━━━━ %s ━━━━━━━━━━━━━━${R}\n" "$ENV_NAME"
printf "  ${G}Consumer${R}        %s\n" "$CONSUMER_URL"
printf "  ${G}Authenticator${R}   %s\n" "$AUTHENTICATOR_URL"
printf "  ${G}Admin${R}           %s\n" "$ADMIN_URL"
printf "  ${G}API${R}             %s\n" "$API_URL"
printf "  ${D}Postgres db${R}     %s (container :5432)\n" "$DB_NAME"
printf "\n"
printf "  ${D}Demo 帳號（password123）：seller@authentik.hk · cardlab@ · milan@ · procheck@${R}\n"
printf "  ${D}Logs：tail -f $LOG_DIR/${ENV_NAME}-*.log${R}\n"
printf "  ${D}停止本環境：./stop.sh ${ENV_NAME}    停止全部：./stop.sh all${R}\n"
printf "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}\n"

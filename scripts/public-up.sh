#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Authentik HK — START PUBLIC TEST STACK (all apps)
#
# 流程:
#   1. 起 5 個 docker container (postgres + 4 cloudflared tunnels)
#   2. 即刻拎齊 4 條 trycloudflare.com URL (tunnel 先 live，apps 後跟)
#   3. Schema + seed
#   4. Build 4 個 app (NEXT_PUBLIC_* 全部 URL 已知)
#   5. Start 4 個 app
#
# 完全隔離 local dev: ports 3018/4010/3011/3012 + Postgres 5433.
# 用法: ./scripts/public-up.sh        # 起齊
#       ./scripts/public-down.sh      # 熜曬（隨時 idempotent）
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.public.yml"
STATE="$ROOT/.public-state"
LOGS="$STATE/logs"
PID_FILE="$STATE/pids.txt"
URL_FILE="$STATE/urls.txt"
mkdir -p "$LOGS"

PORT_API=4010
PORT_CONSUMER=3018
PORT_AUTH=3011
PORT_ADMIN=3012
PORT_PG=5433
DB_USER=authentik
DB_PASS=authentik_public_dev
DB_NAME=authentik
PUBLIC_DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${PORT_PG}/${DB_NAME}?schema=public"

G="\033[32m"; B="\033[34m"; Y="\033[33m"; R="\033[31m"; D="\033[2m"; N="\033[0m"
say()  { printf "${B}▸${N} %s\n" "$*"; }
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}!${N} %s\n" "$*"; }
err()  { printf "${R}✗${N} %s\n" "$*" >&2; }

fail() {
  err "$1"
  err ""
  err "→ 請睇 log，然後跑 ./scripts/public-down.sh 清理之後重試："
  err "    cat $LOGS/${2:-api}.log"
  err "    ./scripts/public-down.sh"
  exit 1
}

# Helper: poll docker container log for trycloudflare URL
wait_tunnel_url() {
  local container=$1
  local url=""
  for i in {1..60}; do
    url=$(docker logs "$container" 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true)
    [[ -n "$url" ]] && { echo "$url"; return 0; }
    sleep 1
  done
  return 1
}

# ── 0. Sanity ──────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { err "docker 未安裝"; exit 1; }
if ! docker info >/dev/null 2>&1; then
  say "Docker daemon 唔 running — 自動開 Docker Desktop…"
  open -a Docker 2>/dev/null || { err "open -a Docker fail — 請手動開"; exit 1; }
  for i in {1..90}; do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || { err "等咗 90 秒 Docker 仍未 ready"; exit 1; }
  ok "Docker daemon ready"
fi

CONFLICTS=()
[[ -f "$PID_FILE" ]] && CONFLICTS+=("pidfile 存在 ($PID_FILE)")
for p in "$PORT_API" "$PORT_CONSUMER" "$PORT_AUTH" "$PORT_ADMIN" "$PORT_PG"; do
  lsof -ti tcp:$p >/dev/null 2>&1 && CONFLICTS+=("port $p 已被佔用")
done
for c in authentik-postgres-public authentik-tunnel-api authentik-tunnel-consumer authentik-tunnel-auth authentik-tunnel-admin; do
  docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$c" && CONFLICTS+=("docker container $c 存在")
done
if [[ ${#CONFLICTS[@]} -gt 0 ]]; then
  err "Public stack 已經有部分 running / 殘留狀態："
  for c in "${CONFLICTS[@]}"; do err "    • $c"; done
  err ""
  err "請先跑 ./scripts/public-down.sh 清理，然後再試 ./scripts/public-up.sh"
  exit 1
fi

# ── 1. Bring up ALL docker services (Postgres + 4 tunnels) ─────────────
say "啟動 docker stack (Postgres + 4 cloudflared tunnels)…"
docker compose -f "$COMPOSE_FILE" --profile auth --profile admin up -d >/dev/null
ok "Docker containers up"

say "等 Postgres ready…"
for i in {1..30}; do
  docker compose -f "$COMPOSE_FILE" exec -T postgres-public pg_isready -U "$DB_USER" >/dev/null 2>&1 && break
  sleep 1
done
ok "Postgres ready"

# ── 2. Capture all 4 tunnel URLs upfront (tunnels live independently of backends) ──
say "拎 4 條 cloudflared URL…"
: > "$URL_FILE"
API_URL=$(wait_tunnel_url authentik-tunnel-api)        || fail "API tunnel URL 拎唔到" "tunnel-api"
echo "API=$API_URL" >> "$URL_FILE"
ok "API URL:           $API_URL"

CONSUMER_URL=$(wait_tunnel_url authentik-tunnel-consumer) || fail "Consumer tunnel URL 拎唔到" "tunnel-consumer"
echo "CONSUMER=$CONSUMER_URL" >> "$URL_FILE"
ok "Consumer URL:      $CONSUMER_URL"

AUTH_URL=$(wait_tunnel_url authentik-tunnel-auth)      || fail "Auth tunnel URL 拎唔到" "tunnel-auth"
echo "AUTH=$AUTH_URL" >> "$URL_FILE"
ok "Authenticator URL: $AUTH_URL"

ADMIN_URL=$(wait_tunnel_url authentik-tunnel-admin)    || fail "Admin tunnel URL 拎唔到" "tunnel-admin"
echo "ADMIN=$ADMIN_URL" >> "$URL_FILE"
ok "Admin URL:         $ADMIN_URL"

# ── 3. Schema + Seed ───────────────────────────────────────────────────
say "套用 schema 落 public DB…"
(cd apps/api && DATABASE_URL="$PUBLIC_DB_URL" npx prisma db push --accept-data-loss --skip-generate >/dev/null) \
  || fail "Schema sync 失敗" "seed-main"
ok "Schema synced"

say "Seed bulk listings (~165 items)…"
(cd apps/api && DATABASE_URL="$PUBLIC_DB_URL" npx tsx prisma/seed.ts > "$LOGS/seed-main.log" 2>&1) \
  && ok "Bulk listings seeded" \
  || warn "seed.ts 部分失敗 (繼續)"

say "Seed demo accounts + scenarios…"
(cd apps/api && DATABASE_URL="$PUBLIC_DB_URL" npx tsx prisma/seed-demo-accounts.ts > "$LOGS/seed-demo.log" 2>&1) \
  && ok "Demo accounts seeded" \
  || warn "seed-demo 部分失敗 (繼續)"

# ── 4. Build all 4 apps (URLs known upfront — no double-build) ────────
say "Build API…"
(cd apps/api && npx nest build > "$LOGS/build-api.log" 2>&1) || fail "API build 失敗" "build-api"
ok "API built"

say "Build Consumer (links to Auth: $AUTH_URL)…"
(cd apps/consumer && \
  NEXT_PUBLIC_API_URL="$API_URL/api" \
  NEXT_PUBLIC_AUTHENTICATOR_URL="$AUTH_URL" \
  npx next build --no-lint > "$LOGS/build-consumer.log" 2>&1) \
  || fail "Consumer build 失敗" "build-consumer"
ok "Consumer built"

say "Build Authenticator (links to Consumer: $CONSUMER_URL)…"
(cd apps/authenticator && \
  NEXT_PUBLIC_API_URL="$API_URL/api" \
  NEXT_PUBLIC_CONSUMER_URL="$CONSUMER_URL" \
  npx next build --no-lint > "$LOGS/build-auth.log" 2>&1) \
  || fail "Authenticator build 失敗" "build-auth"
ok "Authenticator built"

say "Build Admin…"
(cd apps/admin && \
  NEXT_PUBLIC_API_URL="$API_URL/api" \
  NEXT_PUBLIC_CONSUMER_URL="$CONSUMER_URL" \
  NEXT_PUBLIC_AUTHENTICATOR_URL="$AUTH_URL" \
  npx next build --no-lint > "$LOGS/build-admin.log" 2>&1) \
  || fail "Admin build 失敗" "build-admin"
ok "Admin built"

# ── 5. Start all apps ──────────────────────────────────────────────────
say "啟動 API (port $PORT_API)…"
(
  cd apps/api
  DATABASE_URL="$PUBLIC_DB_URL" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  JWT_EXPIRES_IN="7d" \
  API_PORT="$PORT_API" \
  CORS_ORIGIN="" \
  STRIPE_MODE="mock" \
  NODE_ENV="production" \
  nohup node dist/src/main > "$LOGS/api.log" 2>&1 &
  echo "api $!" >> "$PID_FILE"
)
for i in {1..30}; do curl -sf "http://localhost:$PORT_API/api/listings?limit=1" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:$PORT_API/api/listings?limit=1" >/dev/null 2>&1 || fail "API 起唔到" "api"
ok "API up on $PORT_API"

say "啟動 Consumer (port $PORT_CONSUMER)…"
(cd apps/consumer && \
  NEXT_PUBLIC_API_URL="$API_URL/api" \
  NEXT_PUBLIC_AUTHENTICATOR_URL="$AUTH_URL" \
  nohup npm run start -- -p "$PORT_CONSUMER" > "$LOGS/consumer.log" 2>&1 &
  echo "consumer $!" >> "$PID_FILE")
for i in {1..30}; do curl -sf "http://localhost:$PORT_CONSUMER" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:$PORT_CONSUMER" >/dev/null 2>&1 || fail "Consumer 起唔到" "consumer"
ok "Consumer up on $PORT_CONSUMER"

say "啟動 Authenticator (port $PORT_AUTH)…"
(cd apps/authenticator && \
  NEXT_PUBLIC_API_URL="$API_URL/api" \
  NEXT_PUBLIC_CONSUMER_URL="$CONSUMER_URL" \
  nohup npm run start -- -p "$PORT_AUTH" > "$LOGS/auth.log" 2>&1 &
  echo "auth $!" >> "$PID_FILE")
for i in {1..30}; do curl -sf "http://localhost:$PORT_AUTH" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:$PORT_AUTH" >/dev/null 2>&1 || fail "Authenticator 起唔到" "auth"
ok "Authenticator up on $PORT_AUTH"

say "啟動 Admin (port $PORT_ADMIN)…"
(cd apps/admin && \
  NEXT_PUBLIC_API_URL="$API_URL/api" \
  NEXT_PUBLIC_CONSUMER_URL="$CONSUMER_URL" \
  NEXT_PUBLIC_AUTHENTICATOR_URL="$AUTH_URL" \
  nohup npm run start -- -p "$PORT_ADMIN" > "$LOGS/admin.log" 2>&1 &
  echo "admin $!" >> "$PID_FILE")
for i in {1..30}; do curl -sf "http://localhost:$PORT_ADMIN" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "http://localhost:$PORT_ADMIN" >/dev/null 2>&1 || fail "Admin 起唔到" "admin"
ok "Admin up on $PORT_ADMIN"

# ── Summary ────────────────────────────────────────────────────────────
printf "\n${G}═══ Public stack 已上線 ═══${N}\n\n"
printf "  ${B}消費者前端${N}  %s\n" "$CONSUMER_URL"
printf "  ${B}鑑定師${N}      %s\n" "$AUTH_URL"
printf "  ${B}Admin${N}        %s\n" "$ADMIN_URL"
printf "  ${D}(API)${N}        %s\n" "$API_URL"
printf "\n  Demo accounts (password = ${Y}password123${N})\n"
printf "    買家：alice@demo.hk / bob@demo.hk\n"
printf "    賣家：tom@demo.hk / jenny@demo.hk\n"
printf "    鑑定師：milan@authentik.hk\n"
printf "    Legacy seller：seller@authentik.hk (165+ listings)\n\n"
printf "  Logs:   %s\n" "$LOGS"
printf "  Stop:   ${Y}./scripts/public-down.sh${N}\n\n"
printf "  ${Y}⚠ 部 Mac 唔 sleep 個 tunnel 先 live — 'caffeinate -d' 或者插電唔關蓋${N}\n\n"

#!/usr/bin/env bash
# Authentik HK — start everything (DB + API + 3 frontends)
#
# Run:  ./start.sh
# Logs: .dev-logs/{api,consumer,authenticator,admin}.log
# Stop: ./stop.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

G="\033[32m"; B="\033[34m"; Y="\033[33m"; D="\033[2m"; R="\033[0m"
say() { printf "${B}▸${R} %s\n" "$*"; }
ok()  { printf "${G}✓${R} %s\n" "$*"; }
warn(){ printf "${Y}!${R} %s\n" "$*"; }

# ── 0a. Docker daemon — auto-start Docker Desktop if needed ──────────────
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker 未安裝 — 請先裝 Docker Desktop: https://docs.docker.com/desktop/install/mac-install/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  say "Docker daemon 唔 running — 自動開 Docker Desktop…"
  open -a Docker 2>/dev/null || {
    warn "open -a Docker fail — 請手動開 Docker Desktop 再試"
    exit 1
  }
  # Wait up to 90 seconds for daemon to come up
  for i in {1..90}; do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  if ! docker info >/dev/null 2>&1; then
    warn "等咗 90 秒 Docker 仍未 ready — 請手動開咗先再 run"
    exit 1
  fi
  ok "Docker daemon ready"
fi

# ── 0b. Skip services whose port is already occupied ─────────────────────
SKIP_4000=0; SKIP_3008=0; SKIP_3001=0; SKIP_3003=0
for p in 4000 3008 3001 3003; do
  if lsof -ti tcp:$p >/dev/null 2>&1; then
    warn "Port $p 已被佔用 — 跳過該服務（如需重啟請先 ./stop.sh）"
    eval "SKIP_$p=1"
  fi
done

# ── 1. Postgres ───────────────────────────────────────────────────────────
say "啟動 Postgres…"
npm run db:up >/dev/null
for _ in {1..30}; do
  docker compose exec -T postgres pg_isready -U authentik >/dev/null 2>&1 && break
  sleep 1
done
ok "Postgres ready"

# ── 2. Prisma (idempotent — safe to run every time) ──────────────────────
say "Prisma migrate + generate…"
(
  cd apps/api
  set -a; . ./.env; set +a
  npx prisma migrate deploy >/dev/null 2>&1 || npx prisma db push --skip-generate >/dev/null 2>&1 || true
  npx prisma generate >/dev/null 2>&1 || true
)

# Auto-seed if empty
USERS=$(docker compose exec -T postgres psql -U authentik -d authentik -tAc 'SELECT COUNT(*) FROM "User";' 2>/dev/null | tr -d '[:space:]')
if [[ -z "$USERS" || "$USERS" == "0" ]]; then
  say "Seed demo data…"
  (cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed.ts) >/dev/null
  ok "Seed 完成"
else
  printf "  ${D}DB 已有 $USERS 個用戶，跳過 seed${R}\n"
fi

# ── 3. API (4000) ─────────────────────────────────────────────────────────
if [[ "$SKIP_4000" == "1" ]]; then
  ok "API 已跑 (port 4000) — 跳過"
else
  say "啟動 API (port 4000)…"
  ( cd apps/api && set -a; . ./.env; set +a && exec npx nest start --watch ) \
    > "$LOG_DIR/api.log" 2>&1 &
  disown
  for _ in {1..60}; do
    curl -fsS -o /dev/null "http://localhost:4000/api/listings?limit=1" 2>/dev/null && { ok "API ready"; break; }
    sleep 1
  done
fi

# ── 4. Frontends ─────────────────────────────────────────────────────────
say "啟動 Consumer (3008) / Authenticator (3001) / Admin (3003)…"
[[ "$SKIP_3008" == "1" ]] && ok "Consumer 已跑 (port 3008) — 跳過" || \
  { ( npm run dev:consumer ) > "$LOG_DIR/consumer.log" 2>&1 & disown; }
[[ "$SKIP_3001" == "1" ]] && ok "Authenticator 已跑 (port 3001) — 跳過" || \
  { ( npm run dev:authenticator ) > "$LOG_DIR/authenticator.log" 2>&1 & disown; }
[[ "$SKIP_3003" == "1" ]] && ok "Admin 已跑 (port 3003) — 跳過" || \
  { ( npm run dev:admin ) > "$LOG_DIR/admin.log" 2>&1 & disown; }

for name_port in "Consumer:3008" "Authenticator:3001" "Admin:3003"; do
  name="${name_port%%:*}"; port="${name_port##*:}"
  skip_var="SKIP_$port"
  [[ "${!skip_var}" == "1" ]] && continue
  for _ in {1..60}; do
    curl -fsS -o /dev/null "http://localhost:$port/" 2>/dev/null && { ok "$name ready (port $port)"; break; }
    sleep 1
  done
done

# ── 5. Summary ────────────────────────────────────────────────────────────
printf "\n${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}\n"
printf "  ${G}Consumer${R}        http://localhost:3008\n"
printf "  ${G}Authenticator${R}   http://localhost:3001\n"
printf "  ${G}Admin${R}           http://localhost:3003\n"
printf "  ${G}API${R}             http://localhost:4000/api\n"
printf "\n"
printf "  ${D}Demo 帳號（password123）：${R}\n"
printf "  ${D}  seller@authentik.hk · cardlab@ · milan@ · procheck@${R}\n"
printf "\n"
printf "  ${D}Logs：tail -f $LOG_DIR/*.log${R}\n"
printf "  ${D}停止：./stop.sh${R}\n"
printf "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}\n"

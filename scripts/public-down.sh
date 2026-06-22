#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Authentik HK — STOP PUBLIC TEST STACK (idempotent)
#
# 永遠都 work：
#   1. 殺曬 .public-state/pids.txt 入面所有 PID
#   2. 掃曬 4010 / 3018 / 3011 / 3012 ports（防 pidfile 唔同步）
#   3. `docker compose down -v` 熜曬 Postgres + 全部 cloudflared 容器
#   4. 強制 `docker rm -f` 4 條 tunnel container（防 compose miss）
#   5. 清 .public-state/
#
# 跑幾多次都 OK，stack 唔 up 都 OK，唔需要任何 flag。
# 完全唔影響 local dev (3008 / 3001 / 3002 / 4000 + DB 5432)。
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.public.yml"
STATE="$ROOT/.public-state"
PID_FILE="$STATE/pids.txt"

G="\033[32m"; B="\033[34m"; Y="\033[33m"; D="\033[2m"; N="\033[0m"
say() { printf "${B}▸${N} %s\n" "$*"; }
ok()  { printf "${G}✓${N} %s\n" "$*"; }

PUBLIC_PORTS=(4010 3018 3011 3012)
TUNNEL_CONTAINERS=(authentik-tunnel-api authentik-tunnel-consumer authentik-tunnel-auth authentik-tunnel-admin)

# ── 1. Kill PIDs from pidfile (if any) ─────────────────────────────────
killed_any=0
if [[ -f "$PID_FILE" ]]; then
  while read -r line; do
    [[ -z "$line" ]] && continue
    pid="${line##* }"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for i in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
      killed_any=1
    fi
  done < "$PID_FILE"
fi

# ── 2. Port sweep — catch anything pidfile missed ──────────────────────
for p in "${PUBLIC_PORTS[@]}"; do
  pid=$(lsof -ti tcp:$p 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    kill -9 $pid 2>/dev/null || true
    killed_any=1
  fi
done

if [[ "$killed_any" -eq 1 ]]; then
  ok "Host processes (API / Consumer / Auth / Admin) stopped"
else
  printf "${D}○${N} 冇 host process 喺 public ports 上面\n"
fi

# ── 3. Docker compose down (covers all profiles + removes volumes) ─────
say "停 Postgres + cloudflared containers…"
docker compose -f "$COMPOSE_FILE" --profile auth --profile admin down -v >/dev/null 2>&1 || true
# Belt-and-braces: explicit rm in case compose has stale state
for c in "${TUNNEL_CONTAINERS[@]}" authentik-postgres-public; do
  docker rm -f "$c" >/dev/null 2>&1 || true
done
ok "Containers + DB volume removed"

# ── 4. Cleanup state dir ───────────────────────────────────────────────
[[ -d "$STATE" ]] && rm -rf "$STATE"

ok "Public stack 已熜曬"
echo ""
printf "${D}Local dev (3008/3001/3002/4000) 狀態：${N}\n"
for p in 3008 3001 3002 4000; do
  if lsof -ti tcp:$p >/dev/null 2>&1; then
    printf "  ${G}●${N} port $p 仍 running\n"
  else
    printf "  ${D}○${N} port $p 冇用緊\n"
  fi
done
echo ""
exit 0

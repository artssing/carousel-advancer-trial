#!/usr/bin/env bash
# Authentik HK — stop one environment (or everything)
#
# Run:   ./stop.sh [prod|uat|all]    (default: all)
#   prod / uat  → stop just that env's API + 3 frontends. Postgres (shared
#                 container) stays UP so the other environment keeps running.
#   all         → stop both environments' apps + stray dev procs + Postgres.
#
# Start back up: ./start.sh [prod|uat]

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# shellcheck source=scripts/env-config.sh
source "$ROOT/scripts/env-config.sh"

TARGET="${1:-all}"
MODE="${2:-dev}"     # dev = 停本機 hot-reload｜docker = 停部署容器
case "$TARGET" in prod|uat|all) ;; *) echo "用法：./stop.sh [prod|uat|all] [dev|docker]"; exit 1;; esac

G="\033[32m"; B="\033[34m"; D="\033[2m"; R="\033[0m"
say() { printf "${B}▸${R} %s\n" "$*"; }
ok()  { printf "${G}✓${R} %s\n" "$*"; }

# ═══ Docker 部署模式 ═══════════════════════════════════════════════════
if [[ "$MODE" == "docker" ]]; then
  if [[ "$TARGET" == "all" ]]; then
    say "停晒成個 Docker 部署 stack（app + tunnel；Postgres 保留）…"
    docker compose $DEPLOY_COMPOSE -p "$DEPLOY_PROJECT" stop \
      $(deploy_services prod) $(deploy_services uat) cloudflared 2>/dev/null || true
    ok "Docker stack 已停（Postgres 照行；停埋 DB：docker compose stop postgres）"
  else
    say "停 $TARGET Docker 容器（tunnel / Postgres / 另一 env 唔郁）…"
    docker compose $DEPLOY_COMPOSE -p "$DEPLOY_PROJECT" stop $(deploy_services "$TARGET") 2>/dev/null || true
    ok "$TARGET docker 容器已停。再起：./start.sh $TARGET docker"
  fi
  exit 0
fi

# Kill every PID listening on the given ports (TERM then KILL).
kill_ports() { # $@ = "port:Name" pairs
  for port_name in "$@"; do
    port="${port_name%%:*}"; name="${port_name##*:}"
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      kill -TERM $pids 2>/dev/null || true
      sleep 1
      pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
      [[ -n "$pids" ]] && kill -KILL $pids 2>/dev/null || true
      printf "  ${D}· stopped %s (%s)${R}\n" "$name" "$port"
    fi
  done
}

# Kill the port's listener AND, if its parent is a nest/npx supervisor, the
# parent too. `nest start --watch` runs the app as a CHILD that binds the port;
# killing only the child lets the watcher respawn it (env "comes back" after
# stop). We only kill the parent when it's clearly a nest/npx supervisor, so we
# never touch the shell/init.
kill_port_and_supervisor() { # $1=port
  local port="$1" pid ppid pcmd
  for pid in $(lsof -ti tcp:"$port" 2>/dev/null || true); do
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [[ -n "$ppid" && "$ppid" != "1" ]]; then
      pcmd=$(ps -o command= -p "$ppid" 2>/dev/null || true)
      [[ "$pcmd" == *nest* || "$pcmd" == *npx* ]] && kill -TERM "$ppid" 2>/dev/null || true
    fi
    kill -TERM "$pid" 2>/dev/null || true
  done
}

stop_env() { # $1 = prod|uat
  env_config "$1" || return 1
  say "停 $ENV_NAME (API $API_PORT / Consumer $CONSUMER_PORT / Auth $AUTH_PORT / Admin $ADMIN_PORT)…"
  # Frontends: `next dev -p <port>` carries the port in its argv → match directly
  # (kills the supervisor + its render workers, not just the port listener).
  for fport in "$CONSUMER_PORT" "$AUTH_PORT" "$ADMIN_PORT"; do
    pkill -f "next dev -p $fport" 2>/dev/null || true
  done
  # API: kill the nest --watch supervisor via the port listener's parent.
  kill_port_and_supervisor "$API_PORT"
  sleep 1
  # Final sweep — anything still holding a port gets KILLed.
  kill_ports "$API_PORT:API" "$CONSUMER_PORT:Consumer" "$AUTH_PORT:Authenticator" "$ADMIN_PORT:Admin" "$STRIPE_GW_PORT:StripeGW"
}

if [[ "$TARGET" == "all" ]]; then
  stop_env prod
  stop_env uat
  # Sweep stray dev processes from THIS repo only (covers anything not bound to a port yet)
  say "清 stray dev processes…"
  for pat in "$ROOT.*nest start" "$ROOT.*next dev" "$ROOT.*turbo run dev" "$ROOT.*tsx"; do
    pids=$(pgrep -f "$pat" 2>/dev/null || true)
    [[ -n "$pids" ]] && kill -TERM $pids 2>/dev/null || true
  done
  sleep 1
  for pat in "$ROOT.*nest start" "$ROOT.*next dev" "$ROOT.*turbo run dev" "$ROOT.*tsx"; do
    pids=$(pgrep -f "$pat" 2>/dev/null || true)
    [[ -n "$pids" ]] && kill -KILL $pids 2>/dev/null || true
  done
  say "停 Postgres…"
  npm run db:down >/dev/null 2>&1 || true
  ok "All stopped (prod + uat + Postgres)"
else
  stop_env "$TARGET"
  ok "$TARGET 已停。Postgres 仍然 running（另一環境可能仲用緊）。停埋 DB：./stop.sh all"
fi

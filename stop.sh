#!/usr/bin/env bash
# Authentik HK — stop everything (frontends + API + DB)
#
# Run:  ./stop.sh
# Start back up: ./start.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

G="\033[32m"; B="\033[34m"; Y="\033[33m"; D="\033[2m"; R="\033[0m"
say() { printf "${B}▸${R} %s\n" "$*"; }
ok()  { printf "${G}✓${R} %s\n" "$*"; }

# 1. Kill anything on our 4 ports
say "停 frontends + API…"
for port_name in "4000:API" "3008:Consumer" "3001:Authenticator" "3003:Admin"; do
  port="${port_name%%:*}"; name="${port_name##*:}"
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    kill -TERM $pids 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [[ -n "$pids" ]] && kill -KILL $pids 2>/dev/null || true
    printf "  ${D}· stopped $name ($port)${R}\n"
  fi
done

# 2. Kill stray dev processes from THIS repo only
for pat in "$ROOT.*nest start" "$ROOT.*next dev" "$ROOT.*turbo run dev" "$ROOT.*tsx"; do
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  [[ -n "$pids" ]] && kill -TERM $pids 2>/dev/null || true
done
sleep 1
for pat in "$ROOT.*nest start" "$ROOT.*next dev" "$ROOT.*turbo run dev" "$ROOT.*tsx"; do
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  [[ -n "$pids" ]] && kill -KILL $pids 2>/dev/null || true
done

# 3. Postgres
say "停 Postgres…"
npm run db:down >/dev/null 2>&1 || true

ok "All stopped"

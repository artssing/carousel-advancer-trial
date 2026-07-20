#!/usr/bin/env bash
# ─── Environment topology SSOT ──────────────────────────────────────────────
# Single source of truth for per-environment ports / DB / env-file mapping.
# Sourced by BOTH start.sh and stop.sh so the two never drift apart.
#
# Two environments run SIMULTANEOUSLY on different ports, against TWO databases
# inside the SAME Postgres container (founder ruling 2026-06-24):
#
#   env   API   Consumer  Authenticator  Admin   Postgres DB (port 5432)
#   ────  ────  ────────  ─────────────  ─────   ───────────────────────
#   prod  4000  3008      3001           3003    authentik
#   uat   4010  3018      3011           3013    authentik_uat
#
# UAT ports = PROD + offset (API +10, frontends +10) so both stacks coexist.
#
# Usage:
#   source scripts/env-config.sh
#   env_config uat   # populates API_PORT CONSUMER_PORT AUTH_PORT ADMIN_PORT
#                    #            DB_NAME ENV_FILE API_URL CONSUMER_URL
#                    #            AUTHENTICATOR_URL ADMIN_URL  (returns 1 on bad env)

env_config() {
  case "${1:-}" in
    prod)
      ENV_NAME=prod
      API_PORT=4000; CONSUMER_PORT=3008; AUTH_PORT=3001; ADMIN_PORT=3003
      STRIPE_GW_PORT=4242
      DB_NAME=authentik
      ENV_FILE=.env.prod
      ;;
    uat)
      ENV_NAME=uat
      API_PORT=4010; CONSUMER_PORT=3018; AUTH_PORT=3011; ADMIN_PORT=3013
      STRIPE_GW_PORT=4252
      DB_NAME=authentik_uat
      ENV_FILE=.env.uat
      ;;
    *)
      printf 'env-config: unknown environment "%s" (expected: prod | uat)\n' "${1:-<empty>}" >&2
      return 1
      ;;
  esac
  API_URL="http://localhost:${API_PORT}/api"
  CONSUMER_URL="http://localhost:${CONSUMER_PORT}"
  AUTHENTICATOR_URL="http://localhost:${AUTH_PORT}"
  ADMIN_URL="http://localhost:${ADMIN_PORT}"
}

# All ports for a given env (space-separated) — handy for stop.sh port sweeps.
env_ports() {
  env_config "$1" || return 1
  printf '%s %s %s %s %s' "$API_PORT" "$CONSUMER_PORT" "$AUTH_PORT" "$ADMIN_PORT" "$STRIPE_GW_PORT"
}

# ── Docker deploy 模式共用（start.sh / stop.sh docker mode 用）──────────
# Compose project 釘死做 repo 資料夾名 — 確保 CI（喺 BUILD_DIR 行）同手動
# （喺 repo root 行）操作同一個 stack，唔會各開一套。
DEPLOY_PROJECT="carousel-advancer-trial"
DEPLOY_COMPOSE="-f docker-compose.yml -f docker-compose.deploy.yml"
deploy_services() {  # $1 = prod|uat → 該 env 嘅 app services（唔包 tunnel/postgres）
  case "$1" in
    prod) printf 'api-prod consumer-prod authenticator-prod admin-prod' ;;
    uat)  printf 'api-uat consumer-uat authenticator-uat admin-uat' ;;
  esac
}

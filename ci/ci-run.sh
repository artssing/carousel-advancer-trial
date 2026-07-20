#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Pipeline step 邏輯（畀 Jenkinsfile 叫）。放喺 repo 入面，會被 copy 入
# BUILD_DIR 執行 → 改呢度嘅邏輯唔使 reseed Jenkins job，run `./ci.sh build` 即生效。
#
#   bash ci/ci-run.sh <step> <env>
#   step: install | typecheck | postgres | dockerbuild | deploy | smoke
#   env : uat | prod
#
# 註：唔用 `set -u`（macOS bash 3.2 quirk，見 CLAUDE.md CI #1）。
# ─────────────────────────────────────────────────────────────────────────
set -eo pipefail

STEP="${1:?需要 step}"
ENVIRONMENT="${2:-uat}"

# ── env topology（對齊 .env.compose.*：CI 部署用 dev+100 host port）──
if [ "$ENVIRONMENT" = "prod" ]; then
  ENV_FILE=".env.compose.prod"; PROJECT="authentik"
  API_PORT=4100; CONS_PORT=3108; AUTH_PORT=3101; ADM_PORT=3103
else
  ENV_FILE=".env.compose.uat";  PROJECT="authentik_uat"
  API_PORT=4110; CONS_PORT=3118; AUTH_PORT=3111; ADM_PORT=3113
fi
HOST="host.docker.internal"
APP_COMPOSE="docker-compose.app.yml"

echo "▶ step=$STEP env=$ENVIRONMENT project=$PROJECT"

case "$STEP" in
  install)
    npm install --no-audit --no-fund
    # Prisma client（enum / model 型別）—— 隔離 build 一定要 generate，
    # 否則 api type-check 爆一堆 "@prisma/client has no exported member"。
    npx prisma generate --schema=apps/api/prisma/schema.prisma
    ;;

  typecheck)
    # repo-wide lint 壞咗 → type-check 先係權威 gate（CLAUDE.md）
    npm run type-check
    ;;

  postgres)
    # docker-compose.yml 寫死 container_name=authentik-postgres，跨 project 會撞名。
    # 已經行緊就跳過；停咗就 start；冇先 compose up。
    if [ -n "$(docker ps -q -f name='^authentik-postgres$')" ]; then
      echo "postgres 已經行緊 → 跳過"
    elif [ -n "$(docker ps -aq -f name='^authentik-postgres$')" ]; then
      echo "postgres 存在但停咗 → start"
      docker start authentik-postgres
    else
      docker compose -f docker-compose.yml up -d postgres
    fi
    ;;

  dockerbuild)
    docker compose -f "$APP_COMPOSE" --env-file "$ENV_FILE" -p "$PROJECT" build
    ;;

  deploy)
    # 先清走上次 pipeline 部署（避免半 created 容器殘留）
    docker compose -f "$APP_COMPOSE" -p "$PROJECT" down --remove-orphans 2>/dev/null || true
    set +e
    docker compose -f "$APP_COMPOSE" --env-file "$ENV_FILE" -p "$PROJECT" up -d 2>&1 | tee /tmp/deploy.out
    rc=${PIPESTATUS[0]}
    set -e
    if [ "$rc" != "0" ]; then
      if grep -q "address already in use" /tmp/deploy.out 2>/dev/null; then
        echo ""
        echo "✗ Deploy 失敗：port 被佔用。"
        echo "  多數係你本地 ./start.sh $ENVIRONMENT（next dev / nest）行緊，佔住 $API_PORT/$CONS_PORT/$AUTH_PORT/$ADM_PORT。"
        echo "  CI 部署同本地 dev stack 唔可以同時用同一 port。"
        echo "  → 喺 Mac 行：./stop.sh $ENVIRONMENT   然後再 ./ci.sh rebuild $ENVIRONMENT"
      fi
      exit 1
    fi
    ;;

  smoke)
    echo '等 service 起身…'; sleep 15
    curl -fsS "http://$HOST:$API_PORT/api/listings" >/dev/null && echo 'API ok'
    curl -fsS "http://$HOST:$CONS_PORT"             >/dev/null && echo 'consumer ok'
    curl -fsS "http://$HOST:$AUTH_PORT"             >/dev/null && echo 'authenticator ok'
    curl -fsS "http://$HOST:$ADM_PORT"              >/dev/null && echo 'admin ok'
    ;;

  *)
    echo "未知 step: $STEP"; exit 1
    ;;
esac

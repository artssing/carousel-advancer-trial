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

# ── Deploy topology（2026-07-20 收斂：改用 docker-compose.deploy.yml —
#    同 tunnel/certifinehk.com 部署同一套，取代舊 docker-compose.app.yml。
#    PROJECT 釘死 = repo 資料夾名，令 CI（BUILD_DIR）同手動（repo root /
#    ./start.sh docker）操作同一個 compose stack，唔會各開一套容器。──
COMPOSE="-f docker-compose.yml -f docker-compose.deploy.yml"
PROJECT="carousel-advancer-trial"
NETWORK="${PROJECT}_default"
if [ "$ENVIRONMENT" = "prod" ]; then
  # api-prod = shared API image 嘅 builder service
  BUILD_SVCS="api-prod consumer-prod authenticator-prod admin-prod"
  DEPLOY_SVCS="api-prod consumer-prod authenticator-prod admin-prod"
  SMOKE_API="api-prod:4000"; SMOKE_FRONTS="consumer-prod:3008 authenticator-prod:3001 admin-prod:3003"
else
  BUILD_SVCS="api-prod consumer-uat authenticator-uat admin-uat"
  DEPLOY_SVCS="api-uat consumer-uat authenticator-uat admin-uat"
  SMOKE_API="api-uat:4000"; SMOKE_FRONTS="consumer-uat:3008 authenticator-uat:3001 admin-uat:3003"
fi

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
    docker compose $COMPOSE -p "$PROJECT" build $BUILD_SVCS
    ;;

  deploy)
    # 只 recreate 目標 env 嘅 app services（另一 env / tunnel / postgres 唔郁）。
    # tunnel 用 service 名 route，容器 recreate 完自動接返 — deploy 唔使掂 tunnel。
    # ⚠️ 絕對唔好加 --remove-orphans：jenkins / n8n 同一個
    #    project 名下，會被當 orphan 剷走（= CI 剷自己）。
    docker compose $COMPOSE -p "$PROJECT" up -d --force-recreate postgres $DEPLOY_SVCS
    ;;

  smoke)
    # 冇 host port（founder 2026-07-20）→ 喺 compose network 內用 service 名測，
    # 即 cloudflared 實際行嘅同一條路徑。
    echo '等 service 起身…'; sleep 15
    docker run --rm --network "$NETWORK" curlimages/curl:latest \
      -fsS --max-time 10 "http://$SMOKE_API/api/listings?limit=1" >/dev/null && echo 'API ok'
    for f in $SMOKE_FRONTS; do
      docker run --rm --network "$NETWORK" curlimages/curl:latest \
        -fsS --max-time 10 "http://$f/" >/dev/null && echo "${f%%:*} ok"
    done
    ;;

  *)
    echo "未知 step: $STEP"; exit 1
    ;;
esac

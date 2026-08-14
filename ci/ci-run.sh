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
# 兩個 env 完全獨立：各自 build、各自 tag（certifine-api:prod / :uat）。
# 2026-08-11 之前 UAT build 嘅係 `api-prod`（因為 API image 共用），所以一次
# UAT deploy 會改到 PROD 嗰個 tag。而家 UAT build `api-uat`，掂唔到 PROD。
if [ "$ENVIRONMENT" = "prod" ]; then
  BUILD_SVCS="api-prod consumer-prod authenticator-prod admin-prod"
  DEPLOY_SVCS="api-prod consumer-prod authenticator-prod admin-prod"
  SMOKE_API="api-prod:4000"; SMOKE_FRONTS="consumer-prod:3008 authenticator-prod:3001 admin-prod:3003"
else
  BUILD_SVCS="api-uat consumer-uat authenticator-uat admin-uat"
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
    # 拆 repo 之前，呢個 check 就係 API/web 邊界嗰道牆 —— 見 script 頭嘅註釋。
    bash scripts/check-domain-boundary.sh
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
    # Stamp the image so `deploy` can be verified instead of assumed.
    # `git rev-parse` is the source of truth; GIT_COMMIT is only honoured as an
    # override when git is unavailable (CI checkouts without .git).
    GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo "${GIT_COMMIT:-unknown}")"
    BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # Human-facing version. SSOT is the repo-root VERSION file, bumped by hand
    # on release — a commit sha answers "which build", a version answers "which
    # release", and only the second one maps to a CHANGELOG entry.
    APP_VERSION="$(tr -d '[:space:]' < VERSION 2>/dev/null || echo 0.0.0)"
    export GIT_COMMIT BUILT_AT APP_VERSION
    echo "▸ stamping image: v$APP_VERSION commit=$GIT_COMMIT builtAt=$BUILT_AT"
    docker compose $COMPOSE -p "$PROJECT" build $BUILD_SVCS

    # 除咗浮動 tag（:prod / :uat），每個 build 再落一個釘死嘅 sha tag。
    # 浮動 tag 答「呢個 env 最新係邊個」，sha tag 答「嗰次 build 去咗邊」——
    # rollback 要嘅係後者，而佢唔會被下次 build 蓋走。
    SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
    for svc in $BUILD_SVCS; do
      # service 名 → image 名：api-uat → certifine-api:uat
      app="${svc%-*}"; env_suffix="${svc##*-}"
      src="certifine-${app}:${env_suffix}"
      docker image inspect "$src" >/dev/null 2>&1 || continue
      docker tag "$src" "certifine-${app}:${env_suffix}-${SHORT}"
      echo "  釘死 $src → certifine-${app}:${env_suffix}-${SHORT}"
    done
    ;;

  deploy)
    # 只 recreate 目標 env 嘅 app services（另一 env / tunnel / postgres 唔郁）。
    # tunnel 用 service 名 route，容器 recreate 完自動接返 — deploy 唔使掂 tunnel。
    # ⚠️ 絕對唔好加 --remove-orphans：jenkins / n8n 同一個
    #    project 名下，會被當 orphan 剷走（= CI 剷自己）。
    #
    # ⚠️ postgres 唔喺 --force-recreate 名單入面（2026-08-11 修）。佢本來喺，
    #    同上面句 comment 自相矛盾，而後果唔止係 DB 斷幾秒：api-prod 有
    #    `depends_on: postgres (service_healthy)`，postgres 一 recreate，
    #    compose 就會連 api-prod 一齊重啟 —— 而 api-prod 同 api-uat 共用
    #    `certifine-api:latest`，即係一次 UAT deploy 會靜靜咁將新 code 推上
    #    PROD。2026-08-11 就係咁中招。`up` 仍然會確保 postgres 起咗身（佢係
    #    dependency），只係唔會逼佢重生。
    # --no-deps 係關鍵，唔係可有可無：`up --force-recreate <svc>` 會連
    # dependency 一齊 recreate。api-uat 有 `depends_on: api-prod`，所以冇
    # 佢就會拖住 api-prod 重啟，而兩者共用 certifine-api:latest → 一次 UAT
    # deploy 靜靜咁 deploy 埋 PROD。2026-08-11 連續中兩次先捉到（第一次以為
    # 淨係 postgres 嗰條路）。dependency 由上面個 `postgres` step 負責起身。
    #
    # ⚠️ `docker compose --dry-run` 喺呢件事上面**報錯咗兩次**：兩次都話
    #    api-prod 係 `Running`，實際兩次都 recreate 咗。唔好靠佢落保證，要
    #    deploy 完查 .State.StartedAt。
    docker compose $COMPOSE -p "$PROJECT" up -d --force-recreate --no-deps $DEPLOY_SVCS
    ;;

  smoke)
    # 冇 host port（founder 2026-07-20）→ 喺 compose network 內用 service 名測，
    # 即 cloudflared 實際行嘅同一條路徑。
    echo '等 service 起身…'; sleep 15
    docker run --rm --network "$NETWORK" curlimages/curl:latest \
      -fsS --max-time 10 "http://$SMOKE_API/api/listings?limit=1" >/dev/null && echo 'API ok'

    # A 200 above proves each container is alive, NOT that it is running the
    # code we just built — an old image answers exactly as well. Compare the
    # build stamp on ALL FOUR: they are four independently tagged images, and
    # on 2026-08-10 the four UAT images spanned 18h41m of build times. Checking
    # only the API would call a deploy live while a portal serves old code, and
    # most changes in this repo are front-end.
    WANT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    STALE=""
    for svc in $SMOKE_API $SMOKE_FRONTS; do
      GOT="$(docker run --rm --network "$NETWORK" curlimages/curl:latest \
        -fsS --max-time 10 "http://$svc/api/version" 2>/dev/null \
        | sed -n 's/.*"commit":"\([^"]*\)".*/\1/p')"
      if [ "$GOT" = "$WANT" ]; then
        echo "  ${svc%%:*} version ok"
      else
        # An empty GOT means /api/version is missing entirely — an image built
        # before 2026-08-10, which is itself conclusive.
        echo "  ${svc%%:*} STALE — serving '${GOT:-<no /api/version>}', expected '$WANT'"
        STALE="$STALE ${svc%%:*}"
      fi
    done
    if [ -n "$STALE" ]; then
      echo "DEPLOY NOT LIVE —$STALE"
      exit 1
    fi
    echo 'version ok (all 4)'
    for f in $SMOKE_FRONTS; do
      docker run --rm --network "$NETWORK" curlimages/curl:latest \
        -fsS --max-time 10 "http://$f/" >/dev/null && echo "${f%%:*} ok"
    done
    ;;

  *)
    echo "未知 step: $STEP"; exit 1
    ;;
esac

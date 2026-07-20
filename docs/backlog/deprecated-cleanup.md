# Deprecated 清單 — 正式發佈後可刪（2026-07-20 盤點）

> 原則：而家唔刪住（留底 + 退路），**PROD 正式上線跑穩之後**一次過清。
> 刪之前每項照 grep 一次確認冇新引用。

## A. Quick-tunnel 年代（已被 named tunnel + deploy.yml 取代，冇嘢引用）

| 檔/物 | 係乜 | 刪法 |
|---|---|---|
| `docker-compose.public.yml` | 舊「臨時公開」stack（trycloudflare 隨機網址） | 直接刪檔 |
| `scripts/public-up.sh` / `scripts/public-down.sh` | 起/停上面嗰套 | 直接刪檔 |
| `.public-state/`（如存在） | 上面套嘢嘅 pidfile | 直接刪 |
| container `authentik-postgres-public` + volume | 6 日前實驗遺留（port 5433，獨立 DB）| ⚠️ 刪前 founder 確認入面冇要留嘅 data：`docker rm -f authentik-postgres-public` + `docker volume rm <佢個 volume>` |

## B. 舊 CI deploy 拓撲（2026-07-20 被 deploy.yml 收斂取代）

| 檔 | 係乜 | 刪法 |
|---|---|---|
| `docker-compose.app.yml` | 舊 Jenkins deploy compose（31xx host port，已加 DEPRECATED banner） | Jenkins 行過幾次新 pipeline 冇問題後刪 |
| `.env.compose.prod` / `.env.compose.uat` | 只服務 app.yml + Jenkinsfile isolate cp 嗰行 | 同 app.yml 一齊刪；順手刪 Jenkinsfile 嗰句 `cp "$SRC"/.env.compose.*`（Jenkinsfile 改動要 `./ci.sh fresh` 重種） |
| 舊 image `authentik-api/consumer/authenticator/admin:*` | app.yml build 出嚟嘅舊名 image | `docker image prune` / 逐個 `docker rmi` |

## C. Code 層（發佈後跟手執）

| 位置 | 係乜 |
|---|---|
| `orders.controller` `PATCH :id/pay`（`markPaid`） | Legacy mock 付款入口；真 flow 行 create-intent/webhook。已加 draft guard，發佈後審視可否成個拆走（OFFLINE_CASH 流程確認唔靠佢先） |
| `payments.controller` `confirm-mock` | mock mode 專用；上真 Stripe（`STRIPE_MODE=live`）後 PROD 用唔到，可留俾 dev 或拆 |
| `apps/api/src/payments/stripe-adapter.ts` mock branch | 上真 Stripe 後 dev 都改用 mock gateway 的話可刪 in-process mock |
| `start.sh` / `stop.sh` **dev mode 喺 server 機嘅用法** | 唔係刪 code — 係規矩：呢部機（server）唔好行 dev mode，dev 喺另一部機 |

## D. 大執類（已有獨立 backlog，唔喺呢度重覆）

- `@authentik/*` scope / DB 名 / demo email → `docs/backlog/purge-authentik-internals.md`
- 自家 Mac 做 PROD 風險 → `docs/backlog/self-host-prod-risk-backlog.md`

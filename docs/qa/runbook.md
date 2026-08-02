# QA Runbook — 開跑前必讀

## 環境

預設打 **UAT**（PROD 唔好亂玩，而且前台未上線 —— 見 `docs/backlog/prod-not-live-backlog.md`）。

| | URL |
|---|---|
| Consumer | https://uat.certifinehk.com |
| API | https://uat-api.certifinehk.com/api（NestJS global prefix `/api`） |
| Authenticator | https://uat-auth.certifinehk.com |
| Admin | https://uat-admin.certifinehk.com |
| DB | `docker exec authentik-postgres psql -U authentik -d authentik_uat` |

## 帳號（password 全部 `password123`）

**QA 一律用呢兩個，唔准掂 demo 帳號**（2026-08-02 起）：

- `qa-buyer@demo.hk`
- `qa-seller@demo.hk`

點解：08-02 一次 full run 喺 tom 個錢包整咗個 HK$100 PROCESSING 提款出嚟，
又喺佢名下開咗幾件 listing。跑多幾次，demo 帳號就唔再適合 demo。

Demo 帳號（**唔好用嚟做 QA**）：買家 alice / bob / carol / dave@demo.hk；
賣家 tom / jenny@demo.hk；鑑定師 milan / procheck / cardlab@authentik.hk。
鑑定師 flow 暫時仍然要借 milan —— 未有 QA 專用鑑定師帳號（要 admin 開通）。

註冊個 body key 係 `displayName`，**唔係** `name`。

登入：`POST /api/auth/login` → `accessToken`。
**注意**：睇自己資料嘅 route 係 `/api/me`，唔係 `/api/auth/me`。

---

## ⚠️ 開跑前一定要做：確認部署真係生效

**2026-08-01 血嘅教訓** —— QA 花咗 11 分鐘寫咗份 FAIL 報告，實情係 API container 行緊兩日前嘅舊 code。三條「失敗」全部係假警報。

跑之前驗證：

```bash
# 睇 image 幾時建
docker images | grep certifine

# 確認新 code 真係喺 container 入面（<新函數名> 換做今次改動嘅識別字）
docker exec certifine-api-uat grep -rl "<新函數名>" dist/
docker exec certifine-consumer-uat grep -rl "<新字串>" .next/ | head -1
```

對唔上就**停低講**，唔好照跑 —— 跑出嚟嘅嘢係垃圾。

---

## 兩個部署陷阱

### 1. `build api-uat` 唔會 rebuild API

`api-uat` 喺 `docker-compose.deploy.yml` **冇 `build:` section**，直接用 `api-prod` build 出嘅 `certifine-api:latest`。

```bash
# ❌ 表面成功，實際乜都冇 rebuild
docker compose ... build api-uat

# ✅
docker compose -p carousel-advancer-trial -f docker-compose.yml -f docker-compose.deploy.yml build api-prod
docker compose -p carousel-advancer-trial -f docker-compose.yml -f docker-compose.deploy.yml up -d --force-recreate api-prod api-uat
```

⚠️ `api-uat` 有 `depends_on: api-prod` —— 郁一邊會拖另一邊 restart。

### 2. `prisma db push` 會俾 `apps/api/.env` 蓋過

`set -a; . ./.env.uat` export 出嘅 `DATABASE_URL` **入唔到**（prisma 讀返 `apps/api/.env`，嗰個指住 PROD DB）。一定要 inline：

```bash
DATABASE_URL="postgresql://authentik:<pw>@localhost:5432/authentik_uat?schema=public" npx prisma db push --accept-data-loss
```

佢照樣印「Your database is now in sync」，所以要自己 verify：

```bash
docker exec authentik-postgres psql -U authentik -d authentik_uat -c '\d "SharePreview"'
```

---

## 測試數據

UAT 亂玩得（空 auto-seed）。規矩：

1. 用 QA 帳號，唔好掂 demo 帳號。
2. 每次 run 生成 run-id（`qa-20260802-a`），listing title 前綴 + analytics
   `anonymous_id` / `session_id` 一律用佢，事後認得返、篩得走。
3. **每次 run 完要喺報告尾列低留低咗咩** —— listing / order / share-preview /
   cashout intent 嘅 id。
4. Full run 之前可以由乾淨 snapshot 還原 UAT DB（`scripts/db-copy.sh`），
   一次過解決殘留。**但一定要 founder 明示先做** —— 會炸走佢人手放喺 UAT 嘅嘢。

唔好自己刪 R2 bucket 入面嘅嘢：要 founder 明確指名個 bucket 授權（見 `docs/backlog/social-share-backlog.md` #4、#7）。

## 報告

出落 `docs/qa/reports/YYYY-MM-DD-<selector>.md`。格式見 `README.md` —— 一律寫
**MISMATCH（expected / actual）**，唔好自己判 bug。

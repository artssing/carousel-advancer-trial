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

**完整 demo 帳號清單：`docs/demo-accounts.md`**（password 全部 `password123`）。
QA 要知邊啲係 demo 帳號先避得開佢哋 —— 所以呢張 list 係 QA 要讀嘅嘢，
唔係淨係 demo 用。

### 鑑定師：借 `milan@authentik.hk`（founder 2026-08-10）

冇 QA 專用鑑定師帳號 —— `qa-auth@authentik.hk` 喺呢份 runbook 出現過，但
**從來冇 seed 落 `authentik_uat`**（login 返 401）。Founder 2026-08-10 拍板：
**鑑定師 portal 嘅 case 借 `milan@authentik.hk`**，唔使等開新帳號。

呢個係 08-02 「唔准掂 demo 帳號」嘅**明文例外**，唔係推翻佢。條界線係：

- 買家 / 賣家 flow —— 照用 `qa-*`，milan 唔關事
- 鑑定師 flow —— 借 milan，但**只做讀，唔好留低嘢**。要落單、改狀態、
  提款嗰啲，做完自己清乾淨，並喺報告寫低整咗乜、刪咗乜
- 唔准借 alice / tom / jenny —— 佢哋有 QA 專用替身，冇理由借

點解要寫明：scope 檔同呢份 runbook 之前一句叫「借 milan」、一句叫「唔准掂
demo 帳號」，2026-08-10 一次 run 就係喺度停低問人。規矩自己打架，agent 就
會卡住或者亂估，兩樣都差。

註冊個 body key 係 `displayName`，**唔係** `name`。

登入：`POST /api/auth/login` → `accessToken`。
**注意**：睇自己資料嘅 route 係 `/api/me`，唔係 `/api/auth/me`。

---

## ⚠️ 開跑前一定要做：確認部署真係生效

**2026-08-01 血嘅教訓** —— QA 花咗 11 分鐘寫咗份 FAIL 報告，實情係 API container 行緊兩日前嘅舊 code。三條「失敗」全部係假警報。

跑之前驗證：

**由 2026-08-10 起，一條 curl 答到：**

```bash
docker run --rm --network carousel-advancer-trial_default curlimages/curl:latest \
  -fsS http://api-uat:4000/api/version
```

```json
{"commit":"eb19c41…","builtAt":"2026-08-11T04:12:00Z","env":"uat","startedAt":"…"}
```

`commit` 同你想測嗰個 SHA 唔一樣 → **停低講**，跑出嚟嘅嘢係垃圾。

| 收到 | 意思 |
|---|---|
| `404` | 個 image 舊過 2026-08-10（`/api/version` 嗰陣先加）→ deploy 一定未生效 |
| `commit: "dev"` | 你打緊 host 上跑 source 嘅 dev server，唔係 container |
| `commit: "unknown"` | 有人喺 `ci/ci-run.sh` 以外 build，冇蓋章 → 驗唔到，當佢未知 |

**⚠️ 分清楚兩個「UAT」**（2026-08-10 撞到）：Docker stack（`api-uat:4000`，行 tunnel
`uat.certifinehk.com`）同 founder 部機上嘅 dev server（`localhost:4010`，直接 serve
working tree）係兩樣嘢，可以差好多日 code。報告寫「UAT 綠」之前，講清楚係邊個。

**四個容器都要查,唔係淨係 API。** 四個獨立 image 獨立 tag：2026-08-10 實測
四個 UAT image 嘅 build 時間**橫跨 18 個鐘 41 分**。而且呢個 repo 大部分改動
喺前端 —— 淨係查 API 會話你知「deploy 生效」，但你今次改嗰啲一行都冇上到。

```bash
for s in api-uat:4000 consumer-uat:3008 authenticator-uat:3001 admin-uat:3003; do
  printf '%s ' "$s"
  docker run --rm --network carousel-advancer-trial_default curlimages/curl:latest \
    -fsS --max-time 5 "http://$s/api/version" || echo '(冇回應／冇呢個 endpoint)'
  echo
done
```

四個 `commit` 要**一模一樣**,而且等於你想測嗰個 SHA。有一個唔同 = 部分 deploy，
一樣係垃圾數據。

（`ci/ci-run.sh smoke` 已經內置同一個 loop，deploy 完會自己 fail，唔使人手行。）

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

# CI/CD Pipeline Proposal — Docker + Jenkins + n8n（本地先行，雲端就緒）

> Draft: 2026-07-14 · 狀態：**待 founder 拍板**
> 目標：自動發佈 Authentik HK monorepo。**Phase 0–2 全部喺本地 Docker 行**，架構一開始就設計成「改幾個 config 就上 cloud」。

## 0. 一句話定位

Jenkins 做**編排 + build/deploy 引擎**（checkout → type-check gate → build artifact → docker image → deploy → smoke test），n8n 做**膠水層 + 人手 gate + 通知 + 定時任務**（GitHub webhook 觸發、PROD approve 按鈕、Email/Slack 告警、nightly health check）。兩個都用 Docker 起，同 app stack 分開一個 compose file。

**點解要兩個工具都要？** Jenkins 擅長 pipeline stage / build agent / credential 管理，但寫「等人 approve」「發靚通知」「多個 webhook fan-out」呢類 workflow 好笨；n8n 就係為咗呢啲 low-code 編排而生。分工：**Jenkins 管 build 正確性，n8n 管流程同人機互動**。

---

## 1. 對齊現有 project 決定（唔會推翻）

呢個 proposal 建基於 CLAUDE.md 已拍板嘅嘢，唔重新發明：

| 現有決定 | Pipeline 點跟 |
|---|---|
| **`type-check` 係權威 gate**（repo-wide lint 壞咗） | Pipeline gate 用 `npm run type-check`，**唔用 lint 做 fail 條件**（lint 只做 warning，唔 block） |
| **UAT/PROD 只隔離 data+schema+port，唔隔離 code**（同一 working tree） | 呢個係「code-level staging」缺口，正正係 pipeline 要補嘅嘢 —— PROD 改行 **build artifact**（`next build && next start` / `node dist/main.js`），UAT 保留 hot-reload |
| **Schema SSOT = `prisma db push`，唔係 migrate** | 上 cloud 前必須切去 `prisma migrate`（CLAUDE.md backlog 第 5 點已經自己標咗）。**Phase 3 處理**，本地階段暫用 `db push` |
| **`packages/*` 改完要 rebuild dist**（lesson #10） | Docker build stage 一定要 `turbo run build`（連 `@authentik/utils`/`ui`/`config` 一齊 build），唔可以淨係 build app |
| **start.sh / env-config.sh 係 port topology SSOT** | Pipeline 唔重複寫 port，deploy stage `source scripts/env-config.sh` 攞值 |
| **`.env.prod` / `.env.uat` gitignored** | Secret 由 **Jenkins Credentials** 注入，唔入 git、唔入 image layer |
| **PROD 永不 auto-seed**（start.sh 已 gate） | Deploy PROD stage 唔跑 seed；UAT deploy 可 reseed |
| **stop 要殺成棵 process tree**（nest --watch supervisor） | 改用 Docker container 之後呢個問題自然消失（`docker compose down` 殺成個 container），係上 container 嘅額外好處 |

---

## 2. 目標架構（本地）

```
                    ┌─────────────────────────────────────────────┐
   git push ───────▶│  GitHub (artssing/carousel-advancer-trial)  │
                    └───────────────────┬─────────────────────────┘
                                        │ webhook (push / PR)
                                        ▼
                              ┌───────────────────┐
                              │   n8n  (:5678)    │  ← 膠水 + gate + 通知
                              │  Webhook node     │
                              └─────────┬─────────┘
                                        │ 觸發 Jenkins job (REST /buildWithParameters)
                                        ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  Jenkins (:8080)   —  Pipeline (Jenkinsfile, declarative)           │
   │                                                                     │
   │  1 Checkout   2 Install (npm ci)   3 Type-check GATE                │
   │  4 turbo build (packages+apps)     5 docker build 4 images          │
   │  6 Deploy → UAT (compose up)       7 Smoke test (curl /health)      │
   │  8 ── n8n approval gate ──▶ Deploy → PROD (artifact compose up)     │
   └───────────────────────────┬────────────────────────────────────────┘
                               │ 每個 stage 結果
                               ▼
                    ┌───────────────────┐
                    │   n8n workflows   │ → Email / Slack / Telegram 通知
                    │                   │ → nightly health-check / db-copy
                    └───────────────────┘
```

### App runtime stack（被 deploy 嘅嘢）

一個新 `docker-compose.app.yml`，每個 app 一個 service，行 **production 模式**：

| Service | Image build | Runtime | Port（沿用 env-config） |
|---|---|---|---|
| `postgres` | `postgres:16-alpine`（已有） | — | 5432 |
| `api` | multi-stage：`nest build` → `node dist/main.js` | production | 4000 (prod) / 4010 (uat) |
| `consumer` | `next build` → `next start` | production | 3008 / 3018 |
| `authenticator` | `next build` → `next start` | production | 3001 / 3011 |
| `admin` | `next build` → `next start` | production | 3003 / 3013 |

UAT / PROD 兩套用**同一份 compose + 唔同 `--env-file` + 唔同 project name**（`docker compose -p authentik_uat`）就可以並存，延續你而家 start.sh 嘅思路，只係由「host 上跑 next dev」變「container 跑 artifact」。

### CI infra stack（Jenkins + n8n 本身）

另一個 `docker-compose.ci.yml`，同 app stack 完全分開，唔會被 deploy 動到：

- `jenkins`（`jenkins/jenkins:lts-jdk21`）+ mount `docker.sock` 令 Jenkins 可以 build image（Docker-outside-of-Docker）
- `n8n`（`n8nio/n8n`）+ 一個 volume 存 workflow
- 兩個都 mount persistent volume 存 config / job 歷史

---

## 3. Pipeline stages（Jenkinsfile 骨架）

```
Stage 1  Checkout          git checkout 觸發嘅 commit
Stage 2  Install           npm ci  (lockfile 鎖版本，比 npm install 快 + reproducible)
Stage 3  Type-check GATE   npm run type-check   ← fail 即停，唔 build
Stage 4  Build             turbo run build      ← packages 先 (^build)，再 apps
Stage 5  Image build       docker build ×4 (api/consumer/authenticator/admin)，tag = git short SHA
Stage 6  Deploy UAT        docker compose -p authentik_uat --env-file .env.uat up -d
Stage 7  Smoke test        curl -f API /health + 每個前端首頁 200；prisma db push (uat)
Stage 8  Approve gate      呼叫 n8n webhook → 等人喺 n8n / Slack 撳 approve
Stage 9  Deploy PROD       docker compose -p authentik prod up -d（artifact）；db push (prod)，不 seed
Stage 10 Notify            成功/失敗都 POST 去 n8n → 出通知
```

**分支策略（2026-07-14 拍板）**：
- `main` push → 自動行 Stage 1–7，deploy 落 **UAT**（流動 HEAD，即改即測）
- `release/v1.0`（及日後 `release/v1.x`）→ 先有機會觸發 Stage 8–10 **PROD**（經 n8n approve gate，唔係一 merge 即上）
- 即係：功能喺 `main`/UAT 驗收 → merge/cherry-pick 入 `release/v1.0` → n8n 送 approve → 撳咗先真正 deploy PROD

---

## 4. n8n 四個角色（你揀晒全部）具體 workflow

| # | Workflow | Trigger | 做咩 |
|---|---|---|---|
| **A. Webhook 觸發** | GitHub push/PR webhook | 收到 → 判斷 branch → call Jenkins `/buildWithParameters?token=…&ENV=uat` | 令 push code 自動開 build，唔使入 Jenkins 撳 |
| **B. 通知 / 告警** | Jenkins 每個 job 完 POST 埋嚟 | 格式化 → 送去 **WhatsApp**（build 綠/紅、邊個 commit、log link） | 見下面 WhatsApp setup |
| **C. 審批 gate** | Jenkins Stage 8 call n8n | n8n 送一個「PROD deploy 待批 — [Approve] [Reject]」互動訊息；你撳 approve → n8n resume Jenkins job | 對應你「UAT 驗收完先上 PROD」紅線，變成一撳確認 |
| **D. 定時任務** | n8n Schedule node（cron） | ① nightly health-check（curl 4 個 service，死咗告警）② 每朝 `db-copy.sh prod uat` 攞真資料落 UAT ③ 定時清 UAT reseed | 用 n8n cron 唔使自己寫 crontab |

> n8n 嘅 approve gate + 通知，其實就係將你 CLAUDE.md 講嘅 founder 流程（「所有嘢 UAT 測完先 deploy PROD」）自動化埋。

### 4.1 WhatsApp 通知（可行，但 setup 比 Telegram 重）

**結論：得，n8n 有官方 WhatsApp Business Cloud node**（唔使自己砌 HTTP）。但要留意 WhatsApp 唔似 Telegram/Slack 咁「攞個 token 就出到」，因為佢係 Meta 商業平台：

要準備：
1. **Meta Business Manager** 帳戶 + **WhatsApp Business Account (WABA)**。
2. 一個**專用電話號碼**（唔可以係你部手機而家已經 login 緊普通 WhatsApp 嗰個號）。
3. Meta developer app + 攞 **API key / phone number ID**，入 n8n 嘅 WhatsApp credential。
4. **⚠️ 最關鍵**：WhatsApp 對「商家主動發（business-initiated）」嘅訊息要用**預先批核嘅 message template**。build 通知係主動發（唔係你先 send 佢），所以要起一個 template（例：`「Build {{1}} 喺 {{2}} {{3}}」`）交 Meta 審批先出到。純文字自由訊息只可以喺用戶主動 send 咗畀你之後嘅 24 小時窗口內。

**我嘅建議**：WhatsApp 睇通知最方便（你日日都用），值得做。但**setup 手續 + template 審批**會拖慢 Phase 2。折衷方案 —— **Phase 2 先用 Telegram bot（5 分鐘攞 token 就出到）跑通條 pipeline，同步申請 WhatsApp WABA + template，批到就切去 WhatsApp**。兩個 channel n8n 都留住都得。呢個唔阻住你 P0/P1。

---

## 5. 你要準備嘅嘢（Checklist）

### 5.1 一定要有（Phase 0 之前）

- [ ] **Docker Desktop**（你已經用緊 docker compose 起 postgres，即係已有 ✅）確認版本 ≥ 24，有 `docker compose` v2
- [ ] **主機資源**：Jenkins + n8n + 兩套 app stack 同時行，建議 **≥ 8GB RAM 撥畀 Docker、≥ 20GB 磁碟**（4 個 Next build image 唔細）
- [ ] **GitHub 權限**：你係 `artssing/carousel-advancer-trial` owner，要能加 **webhook** + 一個 **Personal Access Token / Deploy Key**（畀 Jenkins clone）
- [ ] **決定 secret 清單**：`JWT_SECRET`、Postgres 密碼、（將來）Stripe/Sumsub key —— 全部要放入 Jenkins Credentials，唔好再散喺 `.env`

### 5.2 要我幫手整（Pipeline 交付物）

- [ ] `apps/api/Dockerfile`、`apps/consumer|authenticator|admin/Dockerfile`（multi-stage，build → 瘦 runtime）
- [ ] `docker-compose.app.yml`（UAT/PROD 共用，project-name 區分）
- [ ] `docker-compose.ci.yml`（Jenkins + n8n）
- [ ] `Jenkinsfile`（上面 10 個 stage）
- [ ] `.dockerignore`（唔好 copy `node_modules` / `.next` / `.env*` 入 build context）
- [ ] n8n workflow export（4 個 workflow 嘅 JSON，可 import）
- [ ] `/health` endpoint（api 加一個，畀 smoke test 用；如果未有）

### 5.3 上 Cloud 前先解決（Phase 3，未係而家）

- [ ] **Prisma `db push` → `migrate`**：寫 migration files（CLAUDE.md backlog 已標）。唔轉嘅話 fresh cloud DB 會缺欄（你 lesson 已經中過一次）
- [ ] **Secret 管理升級**：本地 Jenkins Credentials → cloud 用 Docker secrets / Vault / cloud secret manager
- [ ] **Registry**：本地 image 夠用；上 cloud 要 push 去 registry（GitHub Container Registry / Docker Hub）
- [ ] **真 managed 服務**：Postgres（Neon/Supabase）、object storage（R2）、真 Stripe/Sumsub，唔再 mock

---

## 6. 分期落地

| Phase | 內容 | 產出 | 你要做 |
|---|---|---|---|
| **P0 · 容器化** | 寫齊 Dockerfile + `docker-compose.app.yml`，本地 `docker compose up` 起到成個 stack（artifact 模式，唔再 next dev） | 4 個 image build 得成、4 個 service 200 | 確認 RAM/磁碟夠、review Dockerfile |
| **P1 · Jenkins 本地** | 起 `docker-compose.ci.yml` 嘅 Jenkins，入 Jenkinsfile，手動撳 build 跑通 Stage 1–7（deploy UAT） | 一 click build → UAT 自動起 | 開 Jenkins admin、入 GitHub credential |
| **P2 · n8n 接入** | 加 GitHub webhook → n8n → Jenkins 自動觸發；接通知 channel；加 approve gate + nightly health-check | push code 自動 build + deploy UAT + 通知 + PROD approve gate | 揀通知 channel、GitHub 加 webhook |
| **P3 · 上 Cloud** | Prisma migrate 化、image push registry、真 managed 服務、PROD 上真 server | 真 cloud CI/CD | 開 VPS/雲、domain、registry account |

**建議：P0–P2 一步步嚟，每 phase 我做完你驗收先落下一步**（正正係你自己嘅 UAT-first 原則套落 pipeline 本身）。

---

## 7. 風險 / 要留意

1. **Docker socket mount = Jenkins 有 host root 權限**：本地無所謂，上 cloud 要收緊（rootless Docker 或 Kaniko build）。
2. **首次 build 慢**：4 個 Next app `next build` 冷 cache 可以 5–10 分鐘；turbo remote cache 之後會快好多。
3. **UAT/PROD 而家共用 working tree 嘅根本問題**：容器化 + artifact 之後就真正解決（PROD 鎖 image tag，code change 唔會 leak 落 PROD），呢個係上 container 最大實質好處。
4. **Lint 壞咗**：pipeline 唔可以拎 lint 做 gate，`type-check` 先係權威（已跟）。將來修好 lint 可以再加做 non-blocking stage。
5. **Prisma db push 上 cloud 會爆**：務必 P3 先轉 migrate，唔好貪快帶住 db push 上雲。

---

## 8. 已拍板決定（2026-07-14）

1. ✅ **通知 channel = WhatsApp**（n8n WhatsApp Business Cloud node）。建議 Phase 2 先用 Telegram 跑通、同步申請 WhatsApp WABA + template，批到切過去（見 §4.1）。
2. ✅ **分支策略** = `main`→UAT、`release/v1.0`→PROD（經 approve gate）。
3. ✅ **P0 已開始**：Dockerfile ×4 + `docker-compose.app.yml` + compose env + api entrypoint 已寫好。本地測試步驟見 `docs/setup/DOCKER-P0-RUNBOOK.md`。已先留 backup（`.backups/worktree-before-cicd-p0-*.tar.gz`），全部改動係新增檔案，可即刻 revert。

### 下一步（等你）

- 喺你部機跑 `docs/setup/DOCKER-P0-RUNBOOK.md` 嘅 build 指令，睇 4 個 image build 唔 build 到、4 個 service 200。
- 有 error（尤其 Prisma alpine / turbo build / NEXT_PUBLIC）貼返個 log 我，我即刻修。
- P0 綠燈 → 我開 Phase 1（Jenkins 本地 + Jenkinsfile）。

# HANDOFF — 新機 setup 指南

由舊機 push、新機 pull，繼續開發。

## 0. 前置（新機一次性）

新機需要：
- macOS 任何近期版本（舊機 Darwin 22.6.0 Docker 唔 support，新機應該無此問題）
- **Docker Desktop**（已知你會自己裝）
- **Node.js 20+** + npm 11（與舊機一致）
- **Git** + GitHub credentials（SSH key 或 PAT）

## 1. Clone repo

```bash
cd ~/Desktop  # 或者你想擺嘅地方
git clone https://github.com/artssing/carousel-advancer-trial.git
cd carousel-advancer-trial
```

## 2. 裝依賴

```bash
npm install
```

預計裝 700+ packages，需時 3–5 分鐘。

## 3. 設定 .env

`.env` 喺 .gitignore 入面（裝有 dev secrets），所以唔會跟住 pull。新機要建立：

```bash
cp apps/api/.env.example apps/api/.env
```

預設值已經夠 local dev 用。

## 4. 起 Postgres（要先開 Docker Desktop）

開 Docker Desktop app，等右上角 🐳 鯨魚 icon 變穩定（無 loading）。然後：

```bash
npm run db:up      # docker compose up -d postgres
```

確認跑起：

```bash
docker ps | grep postgres
```

應該見到 `authentik-postgres` container listening on `5432`。

## 5. Prisma migrate + seed

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
cd ../..
```

Seed 會建立：
- Seller: `seller@authentik.hk` / `password123`
- 3 個 authenticators: `milan@` / `procheck@` / `cardlab@authentik.hk` (all `password123`)
- 3 個 sample listings

## 6. 起 dev servers

```bash
npm run dev:api        # Terminal A — port 4000
npm run dev:consumer   # Terminal B — port 3008
```

或者一齊起齊：`npm run dev`

## 7. Verify happy flow

開 http://localhost:3008：
1. 撳「我要賣」→ /login 已預填 demo seller credentials → 登入
2. 上架商品（例：手袋 HKD 48,000）→ 跳去 listing
3. 登出（/orders 右上角）→ /register 另一個 email 做買家
4. /browse → 揀啱啱嘅商品 → Tier 3 揀鑑定師 → 撳「付款並啟動鑑定流程」
5. /orders 見到 status `PAID`（已付款 · 等待寄出至鑑定師）

## 8. Claude Code 接續

新機開 Claude Code 喺 `carousel-advancer-trial/` 入面，`CLAUDE.md` 會 auto-load。
直接同 Claude 講「**繼續 Authentik HK 嘅工作**」，佢會：
- 從 `CLAUDE.md` 攞 project state
- 從 `docs/business-plan.md` 攞商業 + 法律 context
- 從 `.claude/agents/` 攞 code-reviewer / qa-tester subagent 定義

## Troubleshooting

**Prisma migrate hang on connect**：Docker Desktop 未起穩，等 30 秒再試。

**Port 3008 / 4000 已被佔用**：
```bash
lsof -nP -iTCP:3008 -sTCP:LISTEN  # 查邊個 process
kill <pid>
```

**`@prisma/client did not initialize yet`**：去 `apps/api/` 跑 `npx prisma generate`。

**舊機 push 之前漏咗野**：去舊機跑 `git pull origin main` 拉返新機 push 嘅嘢，再 push 本地新 commit。

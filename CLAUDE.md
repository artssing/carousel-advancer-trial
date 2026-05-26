# CLAUDE.md — Authentik HK Project State Snapshot

> Last updated: 2026-05-27
> 給未來嘅 Claude Code session 快速接手用。

## Project 一句話

香港 C2C 二手交易平台，按品類強制/可選第三方鑑定（>HKD 10k 強制），平台**中立做撮合 + escrow**，鑑定錯誤由具名星級鑑定師按合約 + 自購 E&O 保險承擔。Founder 想做香港試點，web + iOS native (Swift) + Android native (Kotlin)。

完整商業 / 技術 plan：`~/.claude/plans/project-founder-carousell-https-www-car-idempotent-gizmo.md`

## 核心法律姿態（最重要）

**平台 = information intermediary**。所有 authenticity claim 必須歸屬於具名鑑定師。任何 UI / copy / 報告**唔可以**講「我哋保證」/「by Authentik」。星級由系統演算法派生（基於完成單數 + 爭議率），唔可以人手或 client 改。Reference: L'Oréal v eBay (EU)。

3 個 Authentication tier（由 `packages/utils/src/tier.ts` 強制）：
- **Tier 1**：< HKD 1,000 — 純撮合，買家可選自付鑑定
- **Tier 2**：HKD 1,000 – 9,999 — 可選鑑定
- **Tier 3**：≥ HKD 10,000 — **強制**揀至少 1 位鑑定師，否則 server 拒絕落單

## Monorepo 結構

```
carousel-advancer-trial/
├── apps/
│   ├── consumer/       Next.js 14 · port 3008 · 普通用家（買 + 賣）
│   ├── authenticator/  Next.js 14 · port 3001 · 鑑定家（暫無接 API）
│   ├── admin/          Next.js 14 · port 3002 · 內部 ops（暫無接 API）
│   └── api/            NestJS 10 · port 4000 · Prisma + Postgres + JWT
├── packages/
│   ├── ui/             Shared components (Button, Card, TierPill, StarRating…)
│   ├── config/         Tailwind preset + tsconfig
│   ├── utils/          tierForPrice, calculateFees, formatHKD, CATEGORIES
│   └── api-client/     共用 TS types（已被 frontend 直接 import）
├── docker-compose.yml  Postgres 16
└── .claude/agents/     Subagent definitions (code-reviewer, qa-tester)
```

## 目前狀態（2026-05-27）

### ✅ 已完成 — Stage 1 Web MVP

- 3 個 portal 全部 scaffolded（consumer / authenticator / admin），UI design 完成
- NestJS API 完成：auth (JWT) / users / listings / orders / payments(mock) / authenticators
- Prisma schema：User / Listing / Order / Authenticator + enums
- Server-enforced invariants：tier 計算、fee 計算、Tier 3 強制 authenticatorId、賣家不可買自己
- Consumer 完全接到 API：login / register / browse / listing detail（揀鑑定師 + 付款）/ sell / orders
- Seed data：1 seller + 3 鑑定師 (Milan Station / 先達 ProCheck / 信和 CardLab) + 3 商品

### ⚠️ 目前 blocker

**Docker Desktop 唔 support 呢部 Mac 嘅 macOS 版本（Darwin 22.6.0 / macOS Ventura）**。
- Homebrew 都有 perm + xcrun / Command Line Tools 問題
- 暫時無法 spin up Postgres 跑真實 end-to-end happy flow
- 所有 backend code 已 type-check 通過，等有 DB 就可以跑

### 🔜 等 DB 起到就可以做

1. `npm run db:up` (or 用 Postgres.app / cloud Postgres)
2. `cd apps/api && npx prisma migrate dev --name init && npx tsx prisma/seed.ts`
3. `npm run dev:api` + `npm run dev:consumer`
4. 跑 happy flow（見下面）

### ❌ 未做

- 真實 Stripe 接入（目前係 mock `POST /payments/:orderId/confirm`）
- Sumsub KYC（目前 auto-VERIFIED）
- SF Express API 整合
- Authenticator portal 接 API（inbox / submit report）
- Admin portal 接 API（爭議仲裁 / 鑑定師審批 / 財務）
- iOS native (Swift + SwiftUI) — Stage 2
- Android native (Kotlin + Jetpack Compose) — Stage 3

## Happy flow (Stage 1)

1. 註冊 `POST /api/auth/register` → JWT
2. 登入 `POST /api/auth/login`
3. 賣家上架 `POST /api/listings`（server 用 `tierForPrice` 算 tier）
4. 買家睇 `GET /api/listings/:id`，揀鑑定師 `GET /api/authenticators?category=X`
5. 落單 `POST /api/orders`（server 用 `calculateFees` 算費用，鎖 listing 為 `RESERVED`）
6. Mock 付款 `POST /api/payments/:orderId/confirm` → order 變 `PAID`
7. 買家於 `/orders` 見訂單

Demo accounts (after seed)：
- Seller: `seller@authentik.hk` / `password123`
- 3 個鑑定師都用 `password123`（milan@/procheck@/cardlab@authentik.hk）

## Common commands

```bash
# Install
npm install

# Dev (all)
npm run dev

# Individual
npm run dev:consumer      # 3008
npm run dev:api           # 4000
npm run dev:authenticator # 3001
npm run dev:admin         # 3002

# DB
npm run db:up             # docker compose up postgres
npm run db:down
cd apps/api && npx prisma migrate dev
cd apps/api && npx tsx prisma/seed.ts

# Quality
npm run type-check
npm run lint
```

## 重要文件（搵 reference 時睇）

| 用途 | 路徑 |
|------|------|
| 商業 plan 全文 | `~/.claude/plans/project-founder-carousell-https-www-car-idempotent-gizmo.md` |
| Tier business logic | `packages/utils/src/tier.ts` |
| Fee 計算 | `packages/utils/src/categories.ts`（`calculateFees`） |
| Money format | `packages/utils/src/money.ts`（`formatHKD`） |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Order state machine | `apps/api/src/orders/orders.service.ts` + `packages/api-client/src/types.ts`（`OrderStatus`） |
| Frontend API client | `apps/consumer/lib/api.ts` |
| Code reviewer agent | `.claude/agents/code-reviewer.md` |
| QA tester agent | `.claude/agents/qa-tester.md` |

## Founder rulings (已 persist 喺 agents)

- Consumer canonical port = **3008**（唔係 3000）
- Admin dark theme 係**故意**（內部工具 vs consumer-facing）— 唔好 flag 不一致
- Money rounding 永遠用 `Order.totals.*` server 值，唔可以 client 重算
- Stub data 喺 Stage 1 係**故意**嘅（backend 未接時），唔好當 bug

## 環境

- macOS: Darwin 22.6.0（Docker Desktop 唔 support 呢個版本）
- Node: v20+（用 npm 11.12.1，未裝 pnpm）
- 已裝：next 14.2.35, NestJS 10, Prisma 5.22, Tailwind 3.4, shadcn-based UI
- 未裝/未跑：Postgres (blocker)、Stripe、Sumsub

## Subagents

`.claude/agents/` 入面有兩個 project-level subagents：
- **code-reviewer** — 識別平台 neutrality invariants、tier/fee 規則、OrderStatus transitions
- **qa-tester** — 內置 standard test surface (C1–C6 consumer, A1–A4 auth, D1–D3 admin)，知道 `/listing/1` 嘅 fee baseline

兩個 agent 已經 onboarded 過 founder 同 confirm 過 open questions（見各自 .md 入面嘅 `Resolved policies` section）。

下次新 session 開咗就 `Agent({ subagent_type: "code-reviewer", ... })` 直接用。

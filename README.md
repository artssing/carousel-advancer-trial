# Authentik HK — 香港 C2C 認證二手交易平台

香港首個按品類強制 / 可選第三方鑑定的 C2C 平台。> HKD 10,000 必經平台註冊的星級鑑定師驗證後才放款。平台立場為**純資訊撮合 + escrow 託管**，鑑定錯誤的法律及賠償責任由鑑定方按合約 + E&O 保險承擔。

完整商業 / 技術 plan：`~/.claude/plans/project-founder-carousell-https-www-car-idempotent-gizmo.md`

## Monorepo 結構

```
.
├── apps/
│   ├── consumer/         # Consumer Portal (普通用家 / 買賣家) — port 3008
│   ├── authenticator/    # Authenticator Portal (鑑定家) — port 3001
│   ├── admin/            # Admin / Ops Console (內部) — port 3002
│   └── api/              # NestJS API (Prisma + Postgres) — port 4000
├── packages/
│   ├── ui/               # shared component library
│   ├── config/           # tsconfig / tailwind / eslint presets
│   ├── utils/            # tier / fee / category business logic
│   └── api-client/       # typed types (shared with backend via @prisma/client)
├── docker-compose.yml    # Postgres 16
└── turbo.json
```

## Stage 1 Happy Flow（已實現）

1. 註冊（`POST /api/auth/register`）→ 取得 JWT
2. 登入（`POST /api/auth/login`）
3. 賣家上架商品（`POST /api/listings`，server 自動計算 tier）
4. 買家瀏覽商品 + 進入詳情頁
5. Tier 3 商品 → 揀鑑定師（從 `/api/authenticators?category=X`）
6. 落單（`POST /api/orders`，server 用 `calculateFees` 計算費用 + 鎖 listing 為 `RESERVED`）
7. 付款（`POST /api/payments/:orderId/confirm` mock — Stage 1.5 換成 Stripe）
8. 訂單轉為 `PAID`，買家可於 `/orders` 見到

## 首次啟動

### 0. 前置（一次性）

```bash
# 安裝依賴（已執行）
npm install

# 起 Postgres
npm run db:up   # = docker compose up -d postgres

# 等 5 秒讓 Postgres ready，然後跑 Prisma migration + seed
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
cd ../..
```

Seed 會建立：
- Demo seller：`seller@authentik.hk` / `password123`
- 3 個 active authenticators（Milan Station / 先達 ProCheck / 信和 CardLab）
- 3 個 sample listings（手袋 / iPhone / Pokemon Card）

### 1. 起服務

開 4 個 terminal（或用 `npm run dev` 一齊起）：

```bash
# Terminal A：API（port 4000）
cd apps/api && npm run dev

# Terminal B：Consumer（port 3008）
cd apps/consumer && npm run dev

# Terminal C / D：Authenticator (3001) / Admin (3002) — optional
cd apps/authenticator && npm run dev
cd apps/admin && npm run dev
```

或者一次過：`npm run dev`（Turborepo 會起齊）

### 2. End-to-end demo

1. 開 http://localhost:3008
2. 撳「我要賣」→ 跳去 `/login` → 用 demo seller 登入（已預填）
3. 登入後撳「上架」填表 → 發佈 → 跳去 listing 詳情
4. 登出（`/orders` 右上角）
5. 用另一個 email 註冊（`/register`）做買家
6. 於 `/browse` 揀啱啱發佈嘅商品 → 揀鑑定師（如 Tier 3）→ 撳「付款並啟動鑑定流程」
7. 跳去 `/orders` 見到狀態 `PAID`

## 開發 commands

```bash
npm run dev              # 起齊 3 個 portal + api
npm run dev:consumer     # port 3008
npm run dev:api          # port 4000
npm run db:up            # 起 Postgres
npm run db:down          # 停 Postgres
npm run db:setup         # apps/api：migrate + seed
npm run type-check
npm run lint
```

## API endpoints（Stage 1）

| Method | Path | Auth | 用途 |
|--------|------|------|------|
| POST | `/api/auth/register` | - | 註冊 |
| POST | `/api/auth/login` | - | 登入 → JWT |
| GET | `/api/me` | ✓ | 當前用戶 |
| GET | `/api/listings` | - | 列商品（可 `?category=HANDBAG`） |
| GET | `/api/listings/:id` | - | 商品詳情 |
| POST | `/api/listings` | ✓ | 上架（server 算 tier） |
| GET | `/api/authenticators` | - | 鑑定師清單（可 `?category=X`） |
| POST | `/api/orders` | ✓ | 建立訂單（server 算 fee；Tier 3 必須 `authenticatorId`） |
| GET | `/api/orders` | ✓ | 我嘅訂單 |
| GET | `/api/orders/:id` | ✓ | 訂單詳情 |
| POST | `/api/payments/:orderId/confirm` | ✓ | Mock 付款（Stage 1.5 換 Stripe） |

## Stage 1.5 / 後續

- [ ] Stripe Connect 接 escrow（取代 mock payment endpoint）
- [ ] SF Express API 整合（運單）
- [ ] Sumsub KYC（取代 auto-VERIFIED）
- [ ] Authenticator portal 接 API（inbox / submit report）
- [ ] Admin portal 接 API（爭議仲裁 / 鑑定師審批）
- [ ] iOS native（Swift + SwiftUI）

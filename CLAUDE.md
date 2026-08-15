# CLAUDE.md — Certifine HK Project State

> Last updated: 2026-07-27（第 2 次瘦身）
> 新 session：讀完本檔 → `docs/business-plan.md` → `docs/setup/HANDOFF.md`（新機）→ `.claude/agents/`
> 唔好重新問已決定嘅嘢或重跑 plan mode — 全部 persist 咗。
> **回應一律用繁體中文（香港）。**

## Identity

**Product：Certifine**（面向國際，唔加「HK」落 brand）。
**Platform：** 香港 C2C 二手，按品類強制/可選第三方鑑定。平台中立做撮合 + escrow。
**法律 framing：** platform = information intermediary（L'Oréal v eBay）— 所有 authenticity claim 歸具名鑑定師。UI/copy 唔可以講「我哋保證」。
**收費：** 鑑定師自訂 fee rate（`Authenticator.feeRatePct`/`feeMinHKD`；無鑑定師 authFee=0）。平台費 1.5%。
**Tier（`packages/utils/src/tier.ts`）：** T1 <$1k 純撮合 · T2 $1k–9,999 可選鑑定 · T3 ≥$10k 強制鑑定。

## 每 session 必知嘅 rules

- **改 UI / component 前**：讀 `docs/lessons.md`（20 條全文）。**改 CI 前**：讀 `docs/setup/CI-RUNBOOK.md`。
- **SSOT**：enum-like 選項（category/district/status/event 名）一律 `packages/utils`，page 唔准自己 hardcode。
- **改 `@certifine/web-kit` 後必 rebuild**：`npx tsc -p tsconfig.build.json`。
- **repo-wide lint 已壞**：`npm run type-check` 先係權威 gate。
- **Portal 色 token**：consumer `brand-*` 綠 / authenticator `authBrand-*` 靛藍。
- **新 feature 有用戶可見互動 = 必須 tag analytics event**（registry 白名單：`analytics-events.ts`）。冇 tagging = review blocker。
- **Soft delete only**：customer 刪除一律 soft；hard delete 只限 admin DB。
- **Money rounding** 用 server `Order.totals.*`，client 唔准重算。
- **UI/UX gap 一發現必須 spawn coordinator**（連 root cause）。Bug fix 直接做；enhancement 先通知 founder。
- **絕對唔可以重覆犯同樣 UX 錯誤**；已知 pattern 必須複用（詳 `docs/lessons.md`）。
- 其他 founder rulings：`docs/founder-rulings.md`

## Monorepo + Commands

```
apps/  consumer(3008 買+賣) authenticator(3001 鑑定師) admin(3003 ops dark) api(4000 NestJS+Prisma)
packages/  ui(src-consumed) utils(dist-consumed!) config api-client
```

```bash
npm install / npm run dev / npm run type-check
npm run db:up|db:down
cd apps/api && npx tsx prisma/seed.ts
./seed-demo.sh          # demo accounts + scenarios
```

## UAT / PROD 環境

| | API | Consumer | Auth | Admin | DB | env file |
|---|---|---|---|---|---|---|
| prod | 4000 | 3008 | 3001 | 3003 | `authentik` | `.env.prod` |
| uat | 4010 | 3018 | 3011 | 3013 | `authentik_uat` | `.env.uat` |

- `./start.sh [prod|uat]` / `./stop.sh [prod|uat|all]`；topology SSOT = `scripts/env-config.sh`。
- **UAT 測完先 deploy PROD**：UAT 亂玩得（空 auto-seed）；PROD 保持 clean 永不 auto-seed。
- `scripts/db-copy.sh uat prod` promote（先寫 `.backups/`）。
- Schema SSOT = schema.prisma，用 `prisma db push --accept-data-loss`（唔係 migration）。
- split 只隔離 data+port，唔隔離 code。stop 殺埋 supervisor 成棵 tree（stop.sh 已處理）。

## 已完成 features（詳情 docs/completed-features.md）

Flow v2 · Ack v2 · Custody gate · 鑑定師 Lifecycle · 提款 2FA · Analytics · Browse smart search · Scan 頁 · Checkout Review→Pay + 30min · 支付 gateway Phase 1.5

## Backlog（docs/backlog/）

Stripe 真 key · Sumsub KYC · SF Express · 真 escrow · AI 收費監控 · admin custody override · analytics Phase 2 · release pipeline · purge authentik 字眼 · iOS/Android · self-host risk · Zoho email

## Demo accounts（docs/demo-accounts.md）

password 全部 `password123`。買家 alice/bob/carol/dave@demo.hk；賣家 tom/jenny@demo.hk；鑑定師 milan/procheck/cardlab@authentik.hk；legacy seller@authentik.hk

## 重要檔案 SSOT

| 用途 | 路徑 |
|------|------|
| 教訓全文 + UI patterns | `docs/lessons.md` |
| CI 陷阱清單 | `docs/setup/CI-RUNBOOK.md` |
| Founder rulings | `docs/founder-rulings.md` |
| Completed features | `docs/completed-features.md` |
| Tier / Fee / 品類 | `packages/utils/src/tier.ts` / `categories.ts` |
| Search / Brand | `packages/utils/src/search.ts` / `brands.ts` |
| Analytics events | `packages/utils/src/analytics-events.ts` |
| Order state machine | `apps/api/src/orders/orders.service.ts` |
| Prisma schema | `apps/api/prisma/schema.prisma` |

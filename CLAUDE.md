# CLAUDE.md — Certifine HK Project State（前名 Authentik）

> Last updated: 2026-07-14（token 瘦身：細節搬咗去 docs/，本檔只留規則 + pointer）

## 新 session 接手指引

1. 讀完本檔 → 2. `docs/business-plan.md` → 3. `docs/setup/HANDOFF.md`（新機）→ 4. 掃 `.claude/agents/`
- **唔好**重新問已決定嘅嘢或重跑 plan mode — 全部已 persist。
- **Founder 語言**：繁體中文（香港）。回應都用繁中。
- **改 UI / component 前**：讀 `docs/lessons.md`（20 條教訓全文 + patterns）。**改 CI 前**：讀 `docs/setup/CI-RUNBOOK.md` 陷阱清單。

## Project 一句話 + 法律姿態（最重要）

**Product 名：Certifine**（2026-07-20 拍板；**面向國際，唔好加「HK」落 brand**）。User-facing 全用 Certifine；內部仲有 `@authentik/*` scope / DB 名 / demo email — founder 已表明**之後要大執清晒**（唔想再見 authentik 字眼），計劃見 `docs/backlog/purge-authentik-internals.md`，未執之前唔好散裝改。香港 C2C 二手平台，按品類強制/可選第三方鑑定，平台**中立做撮合 + escrow**。**平台 = information intermediary**（L'Oréal v eBay）：所有 authenticity claim 歸具名鑑定師（合約 + E&O 保險承擔），UI/copy 唔可以講「我哋保證」；星級純演算法派生（完成單數 + 爭議率），不可手改。

**收費**：鑑定師自訂 fee rate（% of 貨價）+ 最低收費（`Authenticator.feeRatePct`/`feeMinHKD`；無鑑定師 authFee=0）。平台費 1.5%。
**Tier**（`packages/utils/src/tier.ts`）：T1 <$1k 純撮合 · T2 $1k–9,999 可選鑑定 · T3 ≥$10k 強制鑑定（server 拒無鑑定師落單）。

## 已完成 features（invariant + doc pointer；細節唔好喺度搵）

- **Flow v2**（`docs/proposals/` 多份）：交收 `SHIP`/`MEETUP_AUTH`/`MEETUP_3WAY`/`MEETUP_DIRECT`（賣家 declare → 買家揀；T3 唔准 DIRECT）；付款 `ONLINE_ESCROW`(mock)/`OFFLINE_CASH`(限 meetup)。買家評價、meetup state machine 已完成。
- **Ack Model v2**（`docs/proposals/ack-model-v2-proposal.md`）：有物流 trace / 三方同場就唔使人手 ack。SHIP：必填 SF 單號、鑑定師收件 single ack（≥3 相）、寄買家後 T+3 auto-COMPLETED+cashout（cron `sweepShipAutoComplete`）。MEETUP_3WAY：verdict PASSED 直接 COMPLETED。MEETUP_DIRECT：零 ack 強制 OFFLINE_CASH。Legacy states 只留舊單。
- **Custody gate（2026-07-14 拍板）**：MEETUP_AUTH 唔准鑑定師一鍵直入鑑定（`startMeetupAuth` 只服務 MEETUP_3WAY）。Custody 入口只有：① QR drop-off scan（`QrToken` 60s 一次性）② 電話 fallback（賣家登記已驗證電話 exact match + ≥3 相，`custody-phone-fallback`）。兩路都寫 `Order.custodyVia` audit。賣家冇 verified phone → 搵客服。
- **鑑定師 Lifecycle**（`docs/proposals/authenticator-lifecycle-proposal.md`）：`/onboarding` 申請 → admin `/authenticators` 審批（approve/reject/needs-more-info 必填 reason）；suspend/remove（in-flight 單擋 remove）。審批 copy 紅線：核實資歷 ≠ 背書鑑定結果。
- **提款 2FA**（`docs/proposals/payout-2fa-proposal.md`）：提款 + 加收款戶口都要 email OTP（dev 888888）step-up — `*/initiate` → `*/confirm`，`PayoutIntent` 10 分鐘 TTL 一次性防 replay。冇 verified email → 擋。全額都驗。`<OtpInput>` 喺 packages/ui（`portal` prop 分色）。
- **Analytics**（Spec SSOT：`docs/proposals/analytics-tagging-spec.md`；charts/IA：`analytics-charts-ia-proposal.md`）：event registry = `packages/utils/src/analytics-events.ts`（**唔准自由命名**，白名單外 server drop）；fire-and-forget batch `POST /analytics/events`；heartbeat 唔落 DB 只餵 presence；user_id 以 JWT 為準。Admin `/analytics` 5 tab。
  - **⚠️ Governance ruling（必守）**：新 feature 有用戶可見互動 = 必須（1）加 event 入 registry（2）update spec Changelog（3）wire tracking，先算完成。冇 tagging = review blocker。全新 domain 要 founder review。
- **Browse smart search**：`parseSearchQuery()`（`packages/utils/src/search.ts`）抽 category 自動套 filter + 可移除 chip；API tokenized 多 term AND match；`sort=relevance` JS ranking。品牌 filter 多選（`brand=a,b` OR）。
- **Scan 頁**：permission priming（未授權先顯示說明卡，user gesture 先問；stream 有 seq guard 防孤兒 — 離開 /scan 必熄相機）。
- **Checkout Review→Pay + 30 分鐘付款時限**（2026-07-20 拍板）：checkout 兩步（review 顯示商品/交收/鑑定師/明細/escrow 說明 → 確認先入付款）。**Draft 唔 lock 貨**：落單只係開 draft（listing 照 ACTIVE，賣家睇唔到，24h 冇 confirm 靜靜清走），**double confirm 一刻先搶 RESERVED（鬥快，輸咗有明確提示）+ 起錶**；未 confirm 唔准開 payment intent。**30 分鐘一刀切**（`Order.paymentDeadlineAt` server 設，idempotent）；過期 = cron `sweepPaymentExpired`（5 分鐘粒度）→ `PAYMENT_EXPIRED` 終態 + listing 釋放 + void gateway intents + server-side event `checkout_payment_expired`。Rulings：過期後**重行成個流程**（冇一鍵重開）；**買家過期率 = admin-only 指標**（customer 不可見，將來可能做 ban 判斷 — backlog）；換鑑定師方向 = 准，但買賣雙方同意（proposal 待批：`docs/proposals/authenticator-swap-proposal.md`）。
- **支付 gateway 拓撲 Phase 1.5**（2026-07-20；`docs/setup/stripe-setup.md` §0.5）：API 行真 `stripe` SDK；`STRIPE_API_BASE` override 指去獨立 mock gateway（`apps/mock-stripe/server.ts`，講 Stripe wire protocol + 簽名 webhook）。**UAT=test mode（gateway 4252，start.sh 自動起）；PROD 仍 mock**。Webhook `POST /api/webhooks/stripe`（冇 JWT，HMAC 驗證，idempotent）。Admin refund/release 先過 gateway 後寫 DB。上真 Stripe＝換 keys + 刪 `STRIPE_API_BASE` + `<PaymentElement>`。

> ⚠️ 已知：repo-wide lint 壞咗 — `npm run type-check` 先係權威 gate。

## Monorepo + Commands

```
apps/  consumer(3008 買+賣) authenticator(3001 鑑定師) admin(3003 ops dark) api(4000 NestJS+Prisma)
packages/  ui(src-consumed) utils(dist-consumed!) config api-client
```

```bash
npm install / npm run dev / npm run type-check
npm run db:up|db:down
cd apps/api && npx tsx prisma/seed.ts
./seed-demo.sh          # demo accounts + scenarios（docs/demo-accounts.md）
```

## UAT / PROD 環境（必守）

| | API | Consumer | Auth | Admin | DB | env file |
|---|---|---|---|---|---|---|
| prod | 4000 | 3008 | 3001 | 3003 | `authentik` | `.env.prod` |
| uat | 4010 | 3018 | 3011 | 3013 | `authentik_uat` | `.env.uat` |

- `./start.sh [prod|uat]` / `./stop.sh [prod|uat|all]`；topology SSOT = `scripts/env-config.sh`。start.sh 有 self-heal（.bin exec bit）+ fail-loudly（起唔到即印 log tail）。
- **「UAT 測完先 deploy PROD」**：UAT 亂玩得（空 auto-seed）；PROD 保持 clean **永不 auto-seed**。`scripts/db-copy.sh uat prod` promote（先寫 `.backups/`）。
- Schema SSOT = schema.prisma 經 `prisma db push --accept-data-loss`（唔係 migration；fresh db 用 migrate deploy 會缺欄）。
- ⚠️ split 只隔離 data+port，**唔隔離 code**（同一 working tree）。完整 release pipeline backlog：`docs/proposals/release-pipeline-backlog.md`。
- stop 要殺埋 `nest --watch` supervisor 成棵 tree（唔係淨 port-kill），stop.sh 已處理。

## Demo accounts（詳見 docs/demo-accounts.md）

password 全部 `password123`。買家 alice/bob/carol(有 PENDING offer)/dave(KYC PENDING)@demo.hk；賣家 tom（多 listings）/jenny（T3 高價，UAT 有 verified phone）@demo.hk；鑑定師 milan/procheck/cardlab@authentik.hk；legacy seller@authentik.hk（165+ listings）。

## 重要文件

| 用途 | 路徑 |
|------|------|
| 教訓全文 + UI patterns | `docs/lessons.md` |
| CI 陷阱清單 | `docs/setup/CI-RUNBOOK.md` |
| Tier / Fee / 品類 SSOT | `packages/utils/src/tier.ts` / `categories.ts` |
| Search parsing | `packages/utils/src/search.ts`；brand 偵測 `brands.ts` |
| Analytics event registry | `packages/utils/src/analytics-events.ts` |
| Order state machine | `apps/api/src/orders/orders.service.ts` |
| Prisma schema | `apps/api/prisma/schema.prisma` |

## Founder rulings

- **Soft delete only**：customer 刪除一律 soft（status flip + `removedAt`/`removedByRole`）；hard delete 只限 admin 落 DB，永不開 API。ADMIN 下架賣家還原唔到。
- Money rounding 用 server `Order.totals.*`，client 唔准重算。
- Admin dark theme 係故意；stub data 未接 API 時係故意；consumer port = 3008。

## Process rulings

- **UI/UX gap 一發現必須 spawn coordinator**（連 root cause）。Bug fix 直接做；enhancement 先通知 founder。
- **絕對唔可以重覆犯同樣 UX 錯誤**；已知 pattern 必須複用（全文 `docs/lessons.md`）。

## 教訓 index（一句版 — 詳情/背景必讀 `docs/lessons.md` 對應編號）

1. Drawer/modal 顯示 entity 必附 navigation link，唔准 dead-end。
2. Grid card 用 flex-col + min-h title + mt-auto price 對齊高度。
3. Seed detect 用 `docker compose exec psql`（`prisma db execute` 唔 return data）。
4. Cross-app link 用 `<a>` + `NEXT_PUBLIC_*_URL`，唔用 next/link。
6. Multi-role query 嘅 WHERE 必 cover buyer/seller/authenticator 三方。
7. flex-row child 唔會自動 horizontal fill — empty state 要 `w-full`/`flex-1`。
8. **SSOT**：enum-like 選項（category/district/status/event 名）一律 `packages/utils`，page 唔准自己 hardcode。
9. URL state 一律 `useSearchParams()`，唔准 `useState(() => readUrl())`。
10. 改 `@authentik/utils` 後必 rebuild dist（`npx tsc -p tsconfig.build.json`）；`@authentik/ui` 係 src-consumed 唔使。
11. 每個 button 必有真 handler；mock 必標明 disabled/coming soon。
12. Server 寫 message 必同步 WebSocket broadcast。
13. Param 改用途必 rename；write-then-fetch-nothing path 要加 visibility。
14. 雙向 feature（buyer↔seller）framing 必綁 role。
15. Display number 對用戶 mental model，唔係 data structure。
16. **Destructive/terminal action 一律 `<ConfirmDialog>`**（severity 分層 + portal 色 + consequence 必寫；詳 confirm-dialog-proposal.md）。
17. Mobile horizontal strip 必齊 4 class：`flex overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain`。
18. Portal 色 token：consumer `brand-*` 綠 / authenticator `authBrand-*` 靛藍；parity = behavior 唔 = 色。
19. Row/card 代表單一 entity = 成個框 clickable（stretched-link pattern）。
20. Hover affordance 只可以落有 click handler 嗰層；hover 範圍 = click target 範圍。

## 未做 / Backlog

Stripe 真 key（code path 已 production-shape；差 KYB + `<PaymentElement>` + hold-7-日策略）、Sumsub KYC（auto-VERIFIED）、SF Express、真 escrow、AI 收費監控、admin custody override、analytics Phase 2（offer/im/auth_portal domains + `order_status_changed` server-side — 要 orders.service central transition helper 重構）、release pipeline（見 backlog doc）、**purge authentik 內部字眼**（`docs/backlog/purge-authentik-internals.md`）、iOS/Android。

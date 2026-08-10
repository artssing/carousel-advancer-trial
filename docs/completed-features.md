# Completed Features — Certifine

> 技術細節 SSOT。CLAUDE.md 唔 fit 呢啲，放喺度。
> 當要了解某個 feature 詳情時再睇。

## Flow v2

交收四模式 `SHIP` / `MEETUP_AUTH` / `MEETUP_3WAY` / `MEETUP_DIRECT`：
- 賣家 declare → 買家揀；T3 唔准 DIRECT。
- 付款兩種：`ONLINE_ESCROW`（mock） / `OFFLINE_CASH`（限 meetup）。
- 買家評價、meetup state machine 已完成。
- 詳見：`docs/proposals/` 多份

## Ack Model v2

有物流 trace / 三方同場就唔使人手 ack：
- SHIP：必填 SF 單號、鑑定師收件 single ack（≥3 相）、寄買家後 T+3 auto-COMPLETED+cashout（cron `sweepShipAutoComplete`）。
- MEETUP_3WAY：verdict PASSED 直接 COMPLETED。
- MEETUP_DIRECT：零 ack 強制 OFFLINE_CASH。
- Legacy states 只留舊單。
- 詳見：`docs/proposals/ack-model-v2-proposal.md`

## Custody gate（2026-07-14 拍板）

MEETUP_AUTH 唔准鑑定師一鍵直入鑑定（`startMeetupAuth` 只服務 MEETUP_3WAY）。Custody 入口只有：
1. QR drop-off scan（`QrToken` 60s 一次性）
2. 電話 fallback（賣家登記已驗證電話 exact match + ≥3 相，`custody-phone-fallback`）
兩路都寫 `Order.custodyVia` audit。賣家冇 verified phone → 搵客服。

## 鑑定師 Lifecycle

`/onboarding` 申請 → admin `/authenticators` 審批（approve/reject/needs-more-info 必填 reason）；suspend/remove（in-flight 單擋 remove）。審批 copy 紅線：核實資歷 ≠ 背書鑑定結果。
詳見：`docs/proposals/authenticator-lifecycle-proposal.md`

## 提款 2FA

提款 + 加收款戶口都要 email OTP（dev 888888）step-up — `*/initiate` → `*/confirm`，`PayoutIntent` 10 分鐘 TTL 一次性防 replay。冇 verified email → 擋。全額都驗。`<OtpInput>` 喺 packages/ui（`portal` prop 分色）。
詳見：`docs/proposals/payout-2fa-proposal.md`

## Analytics

- Event registry = `packages/utils/src/analytics-events.ts`（**唔准自由命名**，白名單外 server drop）。
- Fire-and-forget batch `POST /analytics/events`；heartbeat 唔落 DB 只餵 presence；user_id 以 JWT 為準。
- Admin `/analytics` 5 tab。
- **⚠️ Governance ruling（必守）**：新 feature 有用戶可見互動 = 必須（1）加 event 入 registry（2）update spec Changelog（3）wire tracking，先算完成。冇 tagging = review blocker。全新 domain 要 founder review。
- Spec SSOT：`docs/proposals/analytics-tagging-spec.md`；charts/IA：`analytics-charts-ia-proposal.md`

## Browse smart search

`parseSearchQuery()`（`packages/utils/src/search.ts`）抽 category 自動套 filter + 可移除 chip；API tokenized 多 term AND match；`sort=relevance` JS ranking。品牌 filter 多選（`brand=a,b` OR）。

## Scan 頁

permission priming（未授權先顯示說明卡，user gesture 先問；stream 有 seq guard 防孤兒 — 離開 /scan 必熄相機）。

## Checkout Review→Pay + 30 分鐘付款時限（2026-07-20 拍板）

checkout 兩步（review 顯示商品/交收/鑑定師/明細/escrow 說明 → 確認先入付款）。
**Draft 唔 lock 貨**：落單只係開 draft（listing 照 ACTIVE，賣家睇唔到，24h 冇 confirm 靜靜清走），**double confirm 一刻先搶 RESERVED（鬥快，輸咗有明確提示）+ 起錶**；未 confirm 唔准開 payment intent。
**30 分鐘一刀切**（`Order.paymentDeadlineAt` server 設，idempotent）；過期 = cron `sweepPaymentExpired`（5 分鐘粒度）→ `PAYMENT_EXPIRED` 終態 + listing 釋放 + void gateway intents + server-side event `checkout_payment_expired`。
Rulings：
- 過期後**重行成個流程**（冇一鍵重開）
- **買家過期率 = admin-only 指標**（customer 不可見，將來可能做 ban 判斷 — backlog）
- 換鑑定師方向 = 准，但買賣雙方同意（proposal 待批：`docs/proposals/authenticator-swap-proposal.md`）

## 支付 gateway 拓撲 Phase 1.5（2026-07-20）

- API 行真 `stripe` SDK；`STRIPE_API_BASE` override 指去獨立 mock gateway（`apps/mock-stripe/server.ts`，講 Stripe wire protocol + 簽名 webhook）。
- **UAT=test mode（gateway 4252，start.sh 自動起）；PROD 仍 mock**。
- Webhook `POST /api/webhooks/stripe`（冇 JWT，HMAC 驗證，idempotent）。
- Admin refund/release 先過 gateway 後寫 DB。
- 上真 Stripe＝換 keys + 刪 `STRIPE_API_BASE` + `<PaymentElement>`。
- 詳見：`docs/setup/stripe-setup.md` §0.5

## 已確定但未做（Backlog）

- Stripe 真 key（code path 已 production-shape；差 KYB + `<PaymentElement>` + hold-7-日策略）
- Sumsub KYC（auto-VERIFIED）
- SF Express
- 真 escrow
- AI 收費監控
- admin custody override
- analytics Phase 2（offer/im/auth_portal domains + `order_status_changed` server-side — 要 orders.service central transition helper 重構）
- release pipeline（見 `docs/proposals/release-pipeline-backlog.md`）
- **purge authentik 內部字眼**（`docs/backlog/purge-authentik-internals.md`）
- iOS/Android
- **自家 Mac 做 PROD 風險**（`docs/backlog/self-host-prod-risk-backlog.md`）
- email 升級去 Zoho（`docs/backlog/email-hosting-upgrade-backlog.md`）

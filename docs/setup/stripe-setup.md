# Stripe 線上託管 — Production Setup 指引

> Phase 1 MVP（已實作）：mock mode，模擬整個 PaymentIntent flow，唔需要 Stripe account 都可以開發 / 測試。
> **Phase 1.5（2026-07-20 已實作）**：production-shape 拓撲 —— 真 `stripe` SDK + 獨立 mock gateway + 簽名 webhook。
> Production 上線時跟以下步驟由 mock → test → live。

---

## 0.5 Phase 1.5 — mock gateway 拓撲（而家 UAT 就係咁行）

```
Browser ──create-intent──▶ API（真 stripe SDK, STRIPE_API_BASE override）──▶ mock gateway (apps/mock-stripe)
Browser ──/confirm（CORS，代替 stripe.js confirmPayment）──▶ mock gateway
mock gateway ──簽名 webhook（t=..,v1=HMAC，stripe.webhooks.constructEvent 驗到）──▶ POST /api/webhooks/stripe
API webhook handler（idempotent）──▶ Payment AUTHORIZED/CAPTURED + Order PAID；frontend poll /status
```

- Gateway：`apps/mock-stripe/server.ts`（零 dependency；`start.sh` 讀到 `STRIPE_MODE≠mock` + `STRIPE_API_BASE=localhost:<port>` 自動起）。Port SSOT `scripts/env-config.sh`：prod 4242 / uat 4252。
- **UAT = `STRIPE_MODE=test` + mock gateway；PROD 暫時仍 `mock`**（in-process 舊路徑保留）。
- 已 wire：adapter real branches（create/capture/cancel/refund/constructEvent）、webhook endpoint（raw body + 簽名驗證，冇 JWT）、admin force-refund/release-escrow 先過 gateway 後寫 DB、decline/retry、T1 instant charge、T2/3 hold + capture。E2E 已喺 UAT 驗證（2026-07-20）。
- **轉真 Stripe（test mode）**＝ `.env` 換真 `sk_test_*`/`whsec_*` + **刪 `STRIPE_API_BASE`** + frontend 換 `<PaymentElement>`（§3c）。Backend 唔使再改。

---

## 0. 而家 mock mode 點 work

`apps/api/src/payments/stripe-adapter.ts` 係抽象層，由 env `STRIPE_MODE` 控制：

| Mode | 行為 |
|------|------|
| `mock` (default) | 純 in-memory simulation，唔 call 外面 network。Test cards 4242…/4000…/4000…9995 等決定 success / decline。**Phase 1 default。** |
| `test` | 真 `stripe` SDK。設 `STRIPE_API_BASE` = 接本地 mock gateway（Phase 1.5，UAT 而家咁行）；唔設 = 接真 Stripe test servers。 |
| `live` | Production keys (`sk_live_...`)。真錢交易。 |

而家所有環境都 default `mock`。`.env` 唔需要任何 `STRIPE_*` 變數。

---

## 1. 開 Stripe Account（HK acquiring）

1. 去 https://dashboard.stripe.com/register 開 account（公司名 = Authentik HK Ltd.）
2. **Country = Hong Kong** — 啟動 HKD acquiring
3. 提交 KYB documents：
   - BR（商業登記）
   - 公司章程 / Articles of Association
   - Director ID + proof of address
   - 銀行戶口（HKD settlement）
4. 等 Stripe approval（一般 3-5 工作天）
5. 補充付款方法 (optional)：
   - **Alipay HK** — Settings → Payment methods → Enable
   - **WeChat Pay HK** — 同上
   - 兩者都係 Stripe Sources，唔需要額外 vendor account

---

## 2. 拎 API keys

Dashboard → Developers → API keys：

| Key | 用途 | .env 變數 |
|-----|------|----------|
| Publishable key (`pk_test_…` / `pk_live_…`) | Frontend Stripe.js 用 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Secret key (`sk_test_…` / `sk_live_…`) | Backend SDK 用 | `STRIPE_SECRET_KEY` |
| Webhook signing secret (`whsec_…`) | 驗證 webhook 嘅 signature | `STRIPE_WEBHOOK_SECRET` |

**安全規則**：
- `pk_*` 可以入 frontend bundle（public）
- `sk_*` + `whsec_*` 永遠淨係 server-side，**唔可以 commit 入 git**
- Dev test mode 同 prod live mode 用唔同 set keys

---

## 3. Wire Stripe 入 codebase

### 3a. ~~Install SDK~~（✅ 已裝）

```bash
cd apps/api
npm install stripe
```

### 3b. ~~補完 `stripe-adapter.ts` real branches~~（✅ 2026-07-20 已完成）

`apps/api/src/payments/stripe-adapter.ts` 預留咗 3 個 mode-switch 點：`createIntent` / `confirmIntent` / `captureIntent` / `cancelIntent` / `refundIntent` / `verifyWebhookSignature`。每個都有 `if (STRIPE_MODE === 'mock')` 早 return，real branch call `realStripeUnsupported()`（throw）。

**TODO**：將 `realStripeUnsupported()` 換做真 SDK call：

```ts
// pseudo-code
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-...' });

// In createIntent:
const pi = await stripe.paymentIntents.create({
  amount: args.amountHKD * 100,
  currency: 'hkd',
  capture_method: args.captureMethod,
  metadata: args.metadata,
});
return {
  id: pi.id,
  status: pi.status as PaymentIntentStatus,
  amount: pi.amount,
  currency: pi.currency,
  captureMethod: pi.capture_method as 'automatic' | 'manual',
  clientSecret: pi.client_secret!,
  metadata: pi.metadata as any,
};

// confirmIntent: skipped — real Stripe uses stripe.js client-side, then webhook
// captureIntent: stripe.paymentIntents.capture(intentId)
// cancelIntent:  stripe.paymentIntents.cancel(intentId)
// refundIntent:  stripe.refunds.create({ payment_intent: intentId })
// verifyWebhookSignature: stripe.webhooks.constructEvent(payload, sig, secret)
```

### 3c. Frontend Stripe Elements (consumer `/checkout`)

```bash
cd apps/consumer
npm install @stripe/stripe-js @stripe/react-stripe-js
```

Replace mock test-card picker（`apps/consumer/app/checkout/[orderId]/page.tsx` 入面嘅 `TEST_CARDS` block）with `<Elements>` + `<PaymentElement>` from `@stripe/react-stripe-js`. Wrap with `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)`. On submit: `stripe.confirmPayment({ elements, clientSecret })`.

Real-mode flow:
1. `/checkout` calls `POST /payments/:orderId/create-intent` → gets `clientSecret`
2. `<PaymentElement>` collects card / Alipay HK / WeChat HK
3. `stripe.confirmPayment(clientSecret)` — handles 3DS in iframe, card on Stripe servers (PCI SAQ A)
4. Webhook `payment_intent.succeeded` fires → `PaymentsService` updates `Payment.status = AUTHORIZED/CAPTURED` + `Order.status = PAID`
5. Frontend polls `/payments/:orderId/status` until orderStatus !== AWAITING_PAYMENT

### 3d. ~~Webhook endpoint~~（✅ 2026-07-20 已完成：`apps/api/src/payments/stripe-webhook.controller.ts`；raw body 喺 main.ts mount）

Create `apps/api/src/webhooks/stripe.controller.ts`:

```ts
@Controller('webhooks')
export class StripeWebhookController {
  constructor(private payments: PaymentsService) {}

  @Post('stripe')
  async handle(@Req() req: Request, @Headers('stripe-signature') sig: string) {
    const ok = stripeAdapter.verifyWebhookSignature(req.rawBody as any, sig);
    if (!ok) throw new BadRequestException('Invalid signature');
    const event = JSON.parse(req.rawBody as any);
    switch (event.type) {
      case 'payment_intent.succeeded': await payments.onPaymentSucceeded(event.data.object); break;
      case 'payment_intent.payment_failed': await payments.onPaymentFailed(event.data.object); break;
      case 'payment_intent.canceled': await payments.onPaymentCanceled(event.data.object); break;
      case 'charge.refunded': await payments.onRefunded(event.data.object); break;
      case 'charge.dispute.created': /* Phase 2 — for now: log + alert admin only */; break;
    }
    return { received: true };
  }
}
```

**冇 JWT auth**（webhook 由 Stripe call，唔係 user）— Stripe signature 自身 verify。Express 要保 raw body：`app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }))`。

**Lesson #5 防 regression**：`STRIPE_WEBHOOK_SECRET` 同 `STRIPE_SECRET_KEY` 一定要喺 `JwtModule` 載入 .env 之前 ready。沿用現有 `set -a; . ./.env; set +a` workaround，或者趁機 fix `JwtModule.registerAsync`（CLAUDE.md 已 flagged）。

### 3e. Webhook local testing（dev mode）

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

CLI forward 真 test webhook 入本地。trigger manually：
```bash
stripe trigger payment_intent.succeeded
```

### 3f. Production webhook config

Dashboard → Developers → Webhooks → Add endpoint：
- URL: `https://api.authentik.hk/api/webhooks/stripe`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`
- Copy signing secret → `.env` `STRIPE_WEBHOOK_SECRET`

---

## 4. `.env` 範例

### Dev (mock — default)
```
STRIPE_MODE=mock
# No keys needed
```

### Staging (test mode)
```
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_51xxxxx...
STRIPE_WEBHOOK_SECRET=whsec_xxxxx...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51xxxxx...
```

### Production
```
STRIPE_MODE=live
STRIPE_SECRET_KEY=sk_live_51xxxxx...
STRIPE_WEBHOOK_SECRET=whsec_xxxxx...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51xxxxx...
```

---

## 5. Stripe Test Cards（Phase 1 mock mode 同 real test mode 都用）

| Card # | 行為 |
|--------|------|
| `4242 4242 4242 4242` | ✓ Visa success |
| `5555 5555 5555 4444` | ✓ Mastercard success |
| `4000 0000 0000 0002` | ✗ Card declined |
| `4000 0000 0000 9995` | ✗ Insufficient funds |
| `4000 0025 0000 3155` | 3DS challenge (test mode 會 popup challenge) |
| `4000 0000 0000 9987` | Authentication required + 3DS fail |

Mock mode 認 number 直接 simulate（無 challenge popup）；test mode 用真 Stripe.js iframe 體驗。

---

## 6. Go-live Checklist

- [ ] HK acquiring approved (KYB done)
- [ ] Production API keys copied to `.env`（**唔好 commit**）
- [ ] Webhook endpoint registered on Dashboard，signing secret in `.env`（endpoint code 已完成：`stripe-webhook.controller.ts`）
- [x] `stripe-adapter.ts` real-mode branches 實作完（2026-07-20，mock gateway E2E 驗證）
- [ ] `<PaymentElement>` 替代 mock test-card picker
- [ ] `JwtModule.registerAsync` migration done（lesson #5 fix — env load ordering）
- [ ] Webhook 用 ngrok / Stripe CLI 喺 staging E2E test 成功
- [ ] Refund flow（Phase 2 — admin trigger）E2E test
- [ ] Dispute alert email wired（Phase 2 — admin 收 `charge.dispute.created` 通知）
- [ ] Tier-aware capture trigger E2E（Tier 1 instant / Tier 2-3 hold + capture at AUTH_PASSED / DELIVERED no-auth）
- [ ] Buyer cancel-hold E2E
- [ ] Reconciliation：Stripe Dashboard 對 Order DB rows 一致
- [x] Stripe webhook retry policy（如 server down）— `payments` table idempotent on `gatewayRef`（handler status-guard 已做，gateway retry 3 次驗證）
- [ ] Production logging：Stripe events 入 Sentry / Datadog

---

## 7. Phase 2 / Backlog（已 documented，coordinator 後續 sprint）

1. **Hold 7 日 expiry policy**：D-2 warn buyer + 14 日強制取消（founder ruling 2026-XX-XX）
2. **Seller 保證金（pre-paid deposit）**：上 listing 時 freeze 一舊錢，防 seller flake
3. **Chargeback 處理**：admin contest dashboard（依家只 log，唔 auto-handle — 平台想避免 risk）
4. **Stripe Connect**：鑑定師 direct payout（非 admin manual transfer）
5. **FPS QR supplement**：HK 本地 instant 轉賬，平 fees
6. **Multi-currency**（RMB / USD listing）

---

## 8. Known files

| Path | 用途 |
|------|------|
| `apps/api/src/payments/stripe-adapter.ts` | Mode-aware abstraction，real SDK plug-in point |
| `apps/api/src/payments/payments.service.ts` | Business logic: createIntent / confirm / capture / cancel |
| `apps/api/src/payments/payments.controller.ts` | HTTP endpoints |
| `apps/api/src/payments/payments.module.ts` | NestJS module（forwardRef OrdersModule for capture trigger）|
| `apps/api/src/orders/orders.service.ts` | `tryCapturePayment(orderId, trigger)` helper |
| `apps/api/prisma/schema.prisma` | `Payment` + `PaymentStatus` enum + `Order.activePaymentId` |
| `apps/consumer/app/checkout/[orderId]/page.tsx` | Buyer checkout UI（mock test-card picker） |
| `apps/consumer/app/orders/[id]/page.tsx` | AWAITING_PAYMENT pay button → `/checkout/[id]` |
| `apps/consumer/app/listing/[id]/page.tsx` | Order create flow → 自動 redirect 去 `/checkout` for ONLINE_ESCROW |
| `apps/consumer/lib/api.ts` | `payments.createIntent` / `confirmMock` / `cancelHold` / `status` |

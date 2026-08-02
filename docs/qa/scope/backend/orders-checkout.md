---
layer: backend
feature: checkout
owners:
  - apps/api/src/orders/**
  - apps/api/src/payments/**
  - packages/utils/src/tier.ts
  - packages/utils/src/analytics-events.ts
last_synced_commit: 3b8dfcd
---

# Orders / Checkout / Payments — Backend

Order state machine 個 SSOT 喺 `apps/api/src/orders/orders.service.ts`。

## 落單 → 付款

- [OC-01] 買家落單 → order `status = AWAITING_PAYMENT`
- [OC-02] `POST /orders/:id/confirm-review` → `paymentDeadlineAt` **啱啱好 30 分鐘**之後
  - Founder 2026-07-20 拍板，唔可以 29 或 31
- [OC-03] 付款成功 → order `PAID`，件 listing 轉 `RESERVED`
- [OC-04] 轉咗 RESERVED 之後，件貨即刻**唔喺** browse 同賣家 profile 出現（接返 LB-01 / LB-04）
- [OC-05] 過期咗嘅 order 再付款 → **400 Order is PAYMENT_EXPIRED, cannot accept payment**

## 銀碼

- [OC-06] Tier 3、售價 12000、鑑定師收 7%：`authFee 840` / `platformFee 180` / `sellerNet 10980`
  - 平台費 1.5%；鑑定師 fee rate 由 `Authenticator.feeRatePct` 決定
- [OC-07] Client **唔准**自己計 —— 全部行 server `Order.totals.*`

## 權限

- [OC-08] `GET /orders` 冇 token → **401**
- [OC-09] 買家見到自己買嘅，賣家見到自己賣嘅，唔會撈亂
- [OC-10] 唔關自己事嘅 order id → **403 / 404**（唔可以 200）

## Custody gate

- [OC-11] 未過 custody 就想一撳開始 `MEETUP_AUTH` → 攔住，行電話驗證 fallback

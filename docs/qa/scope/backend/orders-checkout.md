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

## Lane budget

`curl` 10 · `static` 0 · `browser` 0 · `manual` 0 —— 全部 `verified`。

> ⚠️ Order 嘅推進動詞全部係 **`PATCH`**，唔係 POST（`POST /orders/:id/confirm-review` → **404**）。
> `POST` 只用喺 `POST /orders`（落單）同 `POST /orders/qr/scan|confirm`。
>
> `CreateOrderDto`：`listingId` · `deliveryMethod` · `paymentMethod`（**只收 `ONLINE_ESCROW` / `OFFLINE_CASH`**）
> · 選擇性 `authenticatorId` / `meetupBranchId` / `meetupFreeText`。

## 落單 → 付款

- [OC-01] `curl` `verified` — 買家落單 → order `status = AWAITING_PAYMENT`
  ```bash
  POST $API/orders -H "Authorization: Bearer $BUYER" -H 'Content-Type: application/json' \
    -d '{"listingId":"<active id>","authenticatorId":"cmpo6snzz0003svubzdfugqz2",
         "deliveryMethod":"MEETUP_AUTH","paymentMethod":"ONLINE_ESCROW",
         "meetupBranchId":"br_legacy_cmpo6snzz0003svubzdfugqz2"}'
  ```
  - 實測 2026-08-03：201 → `cmsc1gkqa000hy4lvzwrtacvf` `"status":"AWAITING_PAYMENT"`
  - 理由：落單唔可以直接跳去 PAID，中間段 30 分鐘窗口係成個 checkout 設計嘅核心

- [OC-02] `curl` `verified` — `PATCH /orders/:id/confirm-review` → `paymentDeadlineAt` **啱啱好 30 分鐘**之後
  - `PATCH $API/orders/<id>/confirm-review -H "Authorization: Bearer $BUYER"`（冇 body）
  - 實測：delta **1801.2s**（容差 ±5s）
  - ⚠️ 用 `POST` 打呢條 → **404**（route 係 PATCH）。2026-08-02 之前條 case 寫錯咗做 POST。
  - 理由：Founder 2026-07-20 拍板 30 分鐘，唔可以 29 或 31

- [OC-03] `curl` `verified` — 付款成功 → order `PAID`，件 listing 轉 `RESERVED`
  - `PATCH $API/orders/<id>/pay -H "Authorization: Bearer $BUYER"`
  - 實測：order `PAID`；`GET $API/listings/cmsc1ga7d000ey4lvzks939vl` → `"status":"RESERVED"`
  - 理由：付咗錢件貨仲喺 browse 就會超賣

- [OC-04] `curl` `verified` — 轉 RESERVED 之後：**browse 即刻搵唔到**，但**賣家 profile 仲喺**（帶已預留狀態）
  - browse：`GET "$API/listings?limit=50&q=QA-0803-OC"` → `total 0`
  - profile：`GET "$API/users/<sellerId>/listings?limit=100" -H "Authorization: Bearer $TOKEN"`
    → 件貨仍然喺 items 入面，`"status":"RESERVED"`
  - ⚠️ **2026-08-02 之前呢條寫住「兩邊都消失」，而家 profile 嗰半已經改咗**（commit `f9e1d58`，
    founder ruling 2026-08-02）。接返 [LB-01] / [LB-04]。
  - 理由：呢條係 checkout 同 listing 可見性嘅 integration 接口，兩邊各自 pass 唔代表接得返

- [OC-05] `curl` `verified` — 過期咗嘅 order 再付款 → **400 Order is PAYMENT_EXPIRED, cannot accept payment**
  - `PATCH $API/orders/cmrsbu7f500047riuor71134d/pay -H "Authorization: Bearer $BUYER"`（現成 PAYMENT_EXPIRED 單）
  - 實測：逐字對得上
  - 理由：deadline 過咗淨係 UI 唔畀撳唔算數，server 一定要自己攔

## 銀碼

- [OC-06] `curl` `verified` — Tier 3、售價 12000、鑑定師 7%：`authFee 840` / `platformFee 180` / `sellerNet 10980`
  - 睇 [OC-01] 個 response body
  - 實測：`salePriceHKD 12000, authFeeHKD 840, platformFeeHKD 180, sellerNetHKD 10980`
  - ⚠️ Order response **冇 `totalHKD` 欄位**（實測 keys 入面搵唔到）。權威總額喺
    `POST $API/payments/<orderId>/create-intent` 個 `amountHKD`。呢點係 [CC-01] 嘅根。
  - 理由：平台費 1.5% 寫死；鑑定師 fee rate 由 `Authenticator.feeRatePct` 決定，兩者唔可以撈亂

## 權限

- [OC-08] `curl` `verified` — `GET /orders` 冇 token → **401**
  - `GET $API/orders`
  - 理由：訂單列表係最敏感嗰批資料

- [OC-09] `curl` `verified` — 買家見到自己買嘅，賣家見到自己賣嘅，唔會撈亂
  - `GET $API/orders -H "Authorization: Bearer $BUYER"`
  - 實測 alice：39 張，39 張都係 buyer 身分，`neither = 0`
  - 理由：一條 query 寫錯 `OR` 就會漏人哋單出嚟

- [OC-10] `curl` `verified` — 唔關自己事嘅 order id → **403 / 404**（唔可以 200）
  - `GET $API/orders/cmpz0xozo0001mqnzuwifrovs -H "Authorization: Bearer <alice>"` → **403**
  - 理由：list 過濾啱唔代表 detail 有 check，兩層要分開驗

## Custody gate

- [OC-11] `curl` `verified` — 未過 custody 就想直接開始 `MEETUP_AUTH` → **400**，行電話驗證 fallback
  - `PATCH $API/orders/<PAID MEETUP_AUTH order>/start-meetup-auth -H "Authorization: Bearer $AUTHENTICATOR"`
  - 實測：`400 MEETUP_AUTH 必須經 QR 交收（或賣家電話號碼核實）先可以開始鑑定，唔可以直接開始`
  - 理由：custody 係「件貨真係喺鑑定師手上」嘅唯一憑據，冇咗佢成個 escrow 責任鏈斷開

## 已刪嘅 ID（永不重用）

- **OC-07**（「Client 唔准自己計 —— 全部行 server `Order.totals.*`」）—— 2026-08-03 刪。
  佢驗嘅係 consumer 前端嘅加數，同 [CC-01] 係同一個 assertion、同一份 evidence，
  而且擺喺 backend scope 違反 `_index.md` 嘅 layer 分工。淨係留 [CC-01]。

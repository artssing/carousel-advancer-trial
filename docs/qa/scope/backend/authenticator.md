---
layer: backend
feature: authenticator
owners:
  - apps/api/src/authenticators/**
  - apps/api/src/orders/**
last_synced_commit: e8b5ce1
# 2026-08-15 sync（`3b8dfcd..e8b5ce1`）：owners 入面兩個目錄有大改動（32 條 route 加咗
# DTO，`orders.service.ts` 因為 orders IA 重寫改咗 171 行），但逐個 case 對過 body：
# AT-04（`QrConfirmDto` = token/photos）、AT-08（`CreateOrderDto` = listingId/authenticatorId/
# deliveryMethod/paymentMethod/meetupBranchId/meetupFreeText/offerId）全部**冇多送任何
# DTO 冇宣告嘅欄位**，`forbidNonWhitelisted` 生效後呢幾條 case 唔會受影響，冇改。
# Shared sweep（`packages/`）：`packages/utils/src/order-status.ts` 拆咗做 SSOT 文案函數、
# `packages/domain` 新增 —— 兩樣都係文案／business-rule 層，呢個 scope 淨係打
# API status code／body 唔理文案，同呢個 scope 冇關。
---

# Authenticator — Backend

## Lane budget

`curl` 7 · `static` 0 · `browser` 0 · `manual` 0 —— 全部 `verified`。

> 鑑定師帳號係 **`milan@authentik.hk`**（`@authentik.hk`，唔係 `@demo.hk`）。
> ⚠️ Inbox 唔喺 `/authenticators/*` —— 佢係 `GET /orders/authenticator-inbox`。

- [AT-01] `curl` `verified` — 鑑定師 token 攞 inbox → **200** + 有 item
  - `GET $API/orders/authenticator-inbox -H "Authorization: Bearer $AUTHENTICATOR"`
  - 實測 2026-08-03：200，46 個 item
  - 理由：inbox 空咗＝鑑定師開唔到工，係佢哋唯一嘅入口

- [AT-03] `curl` `verified` — QR scan 用亂作 token → **400 QR 碼無效**
  - `POST $API/orders/qr/scan -H "Authorization: Bearer $AUTHENTICATOR" -H 'Content-Type: application/json' -d '{"token":"bogus-token-xyz"}'`
  - 理由：QR 係實體交收嘅信任錨，亂作 token 撞得入就整個 custody 鏈冇意義

- [AT-04] `curl` `verified` — QR scan 用有效 token → 推進到正確嘅 custody state
  - 三步：
    ```bash
    GET  $API/orders/<PAID MEETUP_AUTH id>/handover-token -H "Authorization: Bearer $SELLER"   # → 32 字 token
    POST $API/orders/qr/scan    -H "Authorization: Bearer $AUTHENTICATOR" -d '{"token":"<t>"}' # → 201 role SELLER_DROPOFF + preview
    POST $API/orders/qr/confirm -H "Authorization: Bearer $AUTHENTICATOR" \
         -d '{"token":"<t>","photos":["https://…/p1.png","https://…/p2.png","https://…/p3.png"]}'
    ```
  - 實測：order → `status CUSTODY`、`custodyVia QR`、`custodyHeld true`、`receivedByAuthAt` 有值
  - 理由：呢條係 [OC-11] custody gate 嘅正路對照 —— 冇佢就淨係證明到「攔得住」，證明唔到「開得着」

- [AT-05] `curl` `verified` — 搜尋 endpoint → **200**
  - `GET "$API/orders/authenticator-search?q=test" -H "Authorization: Bearer $AUTHENTICATOR"`
  - 理由：inbox 46 單起跳，冇搜尋就靠碌

- [AT-06] `curl` `verified` — Branches endpoint → **200**
  - `GET $API/authenticators/me/branches -H "Authorization: Bearer $AUTHENTICATOR"`
  - 實測：`[{"id":"br_legacy_cmpo6snzz0003svubzdfugqz2","name":"主要地址","districtKey":"MK",…}]`
  - 理由：落單要 `meetupBranchId`，呢條係 checkout 嘅上游

- [AT-07] `curl` `verified` — 鑑定師 fee rate 真係入到 order totals（同 [OC-06] 對）
  - 落一張 12000 嘅單畀 milan（`feeRatePct 0.07`）→ `authFeeHKD 840`
  - 理由：fee rate 由鑑定師自訂，唔可以喺 API 度寫死一個平台預設值

- [AT-08] `curl` `verified` — 冇鑑定師嘅 order → `authFee = 0`
  ```bash
  POST $API/orders -H "Authorization: Bearer $BUYER" -H 'Content-Type: application/json' \
    -d '{"listingId":"<800 蚊 MEETUP_DIRECT listing>","deliveryMethod":"MEETUP_DIRECT",
         "paymentMethod":"OFFLINE_CASH","meetupFreeText":"旺角站"}'
  ```
  - 實測：`authenticatorId: null`、`authFeeHKD: 0`、`platformFeeHKD: 12`（800 × 1.5%）
  - 理由：T1 純撮合單唔可以無端端計鑑定費

## 已刪嘅 ID（永不重用）

- **AT-02**（「買家 token 攞同一個 inbox → 403」）—— 2026-08-03 併入 [AU-11] 角色隔離矩陣
  （`backend/auth.md`）。`/orders/authenticator-inbox` 喺嗰個矩陣第一行。

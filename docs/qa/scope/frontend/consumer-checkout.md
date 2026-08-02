---
layer: frontend
feature: checkout
owners:
  - apps/consumer/app/checkout/**
  - apps/consumer/app/orders/**
  - packages/ui/src/components/tier-pill.tsx
  - packages/utils/src/tier.ts
last_synced_commit: 3b8dfcd
---

# Checkout / Orders — Frontend

## Lane budget

`curl` 2 · `static` 1 · `browser` 4 · `manual` 0 —— 3 `verified` · 4 `unverified`（全部 browser，未有 spec）。

- [CC-01] `static` `verified` — Checkout 頁**唔應該**自己加總額，要行 server 嘅權威數
  - `grep -n "salePriceHKD + order.authFeeHKD" "apps/consumer/app/checkout/[orderId]/page.tsx"`
  - 實測 2026-08-03：**2 hit** —— `:290` `const total = order.salePriceHKD + order.authFeeHKD + order.platformFeeHKD;`
    同 `:146`（analytics `total_hkd`）
  - 背景：`Order` API response 根本冇 `totalHKD` 欄位（見 [OC-06]）；權威總額喺
    `POST /payments/:orderId/create-intent` 個 `amountHKD`
  - ⚠️ 呢條只講 source 有／冇嗰條加數。畫面顯示咗咩數由 [CC-02] 一齊睇。
  - 理由：CLAUDE.md 寫死 money rounding 行 server `Order.totals.*`。client 加出嚟嘅數今日啱，
    但一旦 server 加咗 discount / 稅 / 運費，兩邊就會靜靜雞分岔

- [CC-02] `browser` `unverified` — 確認之後出 30 分鐘倒數
  - 未有 Playwright spec。Server 側 `paymentDeadlineAt` 見 [OC-02]
  - 理由：倒數係買家唯一睇得到嘅時限提示，冇咗就會無故過期

- [CC-03] `browser` `unverified` — 倒數到臨界值會出提示（對應 `checkout_deadline_warning_shown`）
  - 未有 Playwright spec。要 browser + 等時間（或者改 client clock）
  - 理由：analytics event 收得（[AN-09]）唔代表個提示真係出過

- [CC-04] `browser` `unverified` — 過咗期入返個 order → 出過期畫面，唔係死 loop 或者白畫面
  - 未有 Playwright spec。Server 側 400 見 [OC-05]
  - 理由：白畫面同「畀你再撳一次然後 400」係兩種都會嚇親人嘅失敗

- [CC-05] `curl` `verified` — `GET /orders` 回嘅單分得清買家／賣家身分，數目係 ground truth
  - `GET $API/orders -H "Authorization: Bearer $BUYER"`
  - 實測 2026-08-03（alice）：39 張，39 張都係 buyer 身分，`neither = 0`
  - 理由：呢個係 [CC-07] 兩個 tab 對數嘅基準；API 撈亂咗就唔使睇畫面
  - 註：2026-08-03 由舊 [CC-05]（一半 API 一半畫面）拆出

- [CC-06] `curl` `verified` — 訂單多嗰陣要有分頁，唔會一次過 load 晒
  - `GET $API/orders -H "Authorization: Bearer $BUYER"`
  - 實測：回**一個 bare array**（39 個 element），冇 `items/total/hasMore` wrapper，
    亦冇 `limit/offset` 參數（對比 `GET /listings` 係 `{"items":[…],"total":195,"hasMore":true}`）
  - 附帶（同一個檔，冇 case 覆蓋）：`orders.service.ts:396, 1109, 1221` 用緊寫死嘅 `take: 50` / `take: 100`
  - 理由：訂單只會愈嚟愈多，一次過 load 晒係遲早會爆嘅 pattern

- [CC-07] `browser` `unverified` — 訂單列表兩個 tab（買家／賣家）嘅數目同 [CC-05] 對得返
  - 未有 Playwright spec。`apps/consumer/app/orders/page.tsx:284-289` 係喺 client 對住成個 array `.filter()`
  - 理由：filter 條件寫錯（例如兩邊都用 `buyerId`）畫面會靜靜雞得一半單，API 完全睇唔出
  - 註：2026-08-03 由舊 [CC-05] 拆出

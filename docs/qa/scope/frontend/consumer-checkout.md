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

- [CC-01] Review 步驟顯示 server 計嘅 `Order.totals.*`，client 唔可以自己再計
- [CC-02] 確認之後出 30 分鐘倒數
- [CC-03] 倒數到臨界值會出提示（對應 `checkout_deadline_warning_shown`）
- [CC-04] 過咗期入返個 order → 出過期畫面，唔係死 loop 或者白畫面
- [CC-05] 訂單列表分買家／賣家兩邊，數目對得返 API
- [CC-06] 訂單多嗰陣有分頁，唔會一次過 load 晒

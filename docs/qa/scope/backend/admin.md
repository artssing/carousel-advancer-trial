---
layer: backend
feature: admin
owners:
  - apps/api/src/admin/**
last_synced_commit: 3b8dfcd
---

# Admin — Backend

## Lane budget

`curl` 3 · `static` 1 · `browser` 0 · `manual` 0 —— 3 `verified` · 1 `pending`。

> Admin 帳號：`admin@demo.hk` / `password123`（SUPER_ADMIN）。

- [AD-01] `curl` `verified` — 以下九條 admin token 全部 **200**
  ```
  GET $API/admin/overview
  GET $API/admin/disputes
  GET $API/admin/kyc-queue
  GET $API/admin/users
  GET $API/admin/orders
  GET $API/admin/listings
  GET $API/admin/finance/summary
  GET $API/admin/finance/payouts
  GET $API/analytics/admin/overview
  ```
  - ⚠️ **舊 case 寫嘅三條路徑喺真實 API 唔存在**（2026-08-02 發現，2026-08-03 再確認）：
    | 舊寫法 | 實測 | 真路徑 |
    |---|---|---|
    | `/admin/finance` | **404** | `/admin/finance/summary` |
    | `/admin/payouts` | **404** | `/admin/finance/payouts` |
    | `/admin/analytics` | **404** | `/analytics/admin/overview` |
  - 理由：admin portal 五個 tab 全部靠呢批 endpoint，一條 500 就成頁白

- [AD-03] `curl` `verified` — 以上九條冇 token → 全部 **401**
  - 同上九條，唔帶 `Authorization`
  - 實測：九條全部 401
  - 理由：admin 資料冇任何一條可以匿名讀。買家 token → 403 嗰半見 [AU-11] 矩陣

- [AD-05] `static` `verified` — Admin code path 入面**冇任何** hard delete
  - `grep -rn "\.delete(\|deleteMany" apps/api/src/admin/` → **0 hit**（2026-08-03）
  - ⚠️ 呢條只講「source 入面搵唔到 hard-delete 呼叫」，唔等於 runtime 一定唔會刪。
    Customer 側嘅 soft delete 行為由 [CS-05] 實測覆蓋。
  - 理由：CLAUDE.md 寫死 soft delete only；hard delete 一旦寫落去係唔可逆嘅

## 已刪嘅 ID（永不重用）

- **AD-04**（CAPTURED force refund）—— 2026-08-03 founder 拍板撤走。UAT 去唔到 CAPTURED
  而唔令張單變 terminal（`admin.controller.ts:884` 會擋），加上 `STRIPE_MODE=mock`，
  「真係打去 gateway」喺呢個環境定義上驗唔到。

- **AD-02**（「買家 token 打以上任何一個 → 403」）—— 2026-08-03 併入 [AU-11] 角色隔離矩陣
  （`backend/auth.md`）。

---
layer: frontend
feature: sell
owners:
  - apps/consumer/app/sell/**
  - apps/consumer/app/my-listings/**
  - apps/consumer/components/share-ig-modal.tsx
  - packages/ui/src/components/tier-pill.tsx
  - packages/utils/src/tier.ts
  - packages/utils/src/categories.ts
last_synced_commit: 3b8dfcd
---

# Sell / My listings — Frontend

## Lane budget

`curl` 1 · `static` 1 · `browser` 3 · `manual` 0 —— 2 `verified` · 3 `unverified`（browser，未有 spec）。

- [CS-01] `browser` `unverified` — 上架流程行得完，出到嘅 listing 即刻喺 browse 見到
  - 未有 Playwright spec。API 側行得通：`POST $API/listings` 建完即刻喺 `GET /listings` 見到
  - 理由：上架係賣家側唯一一條 critical path，斷咗就冇貨

- [CS-02] `browser` `unverified` — 價錢一改，tier 預覽跟住變（999 → T1，1000 → T2，10000 → T3）
  - 未有 Playwright spec。`app/sell/page.tsx:333` 有 `tierForPrice(price)`；API 側邊界見 [LB-12]
  - 理由：賣家落價之前要知會唔會踩入強制鑑定，呢個係定價決定嘅一部分

- [CS-03] `static` `verified` — 品類／地區選項全部由 `packages/utils` SSOT 出，page 唔准 hardcode
  - `grep -n "from '@authentik/utils'" -B4 apps/consumer/app/sell/page.tsx`
  - 實測 2026-08-03（`:20-24`）：import `sellCategories, categoryById, categoryByApiEnum, tierForPrice,
    brandsForCategory, hasBrandPicker, brandFieldLabel, matchBrandFromTitle, CONDITION_GRADES,
    formatHKD, stationDisplayLabel, stationCodesFromValue` —— 冇 hardcode 選項
  - 理由：CLAUDE.md 寫死 enum-like 選項一律 SSOT。Page 自己抄一份，加新品類嗰陣就會漏
  - 已知反例（冇 case 覆蓋，值得一條 cross-cutting static case）：
    `app/checkout/[orderId]/page.tsx:337` 硬寫 `>= 10000 / >= 1000` 而唔係 `tierForPrice`

- [CS-04] `browser` `unverified` — My-listings 撳分享開到同一個 wizard，`entry` 標住 `my_listings`
  - 未有 Playwright spec。Prop 側證實咗：`app/my-listings/page.tsx:289`
    `<ShareIgModal listing={shareListing} entry="my_listings" …>`；
    `share-ig-modal.tsx:344` `entry?: 'listing_detail' | 'my_listings'`
  - 理由：`entry` 係 share funnel 分流嘅維度，傳錯就分唔到兩個入口邊個有效

- [CS-05] `curl` `verified` — 刪除 listing 一律 **soft delete**
  ```bash
  DELETE $API/listings/<id> -H "Authorization: Bearer $SELLER"      # → 200
  docker exec authentik-postgres psql -U authentik -d authentik_uat \
    -tAc "select id,status from \"Listing\" where id='<id>'"        # → REMOVED，row 仲喺
  ```
  - 實測 2026-08-03：`cmsc1q4o8001ty4lvdhxa3s1r | REMOVED`
  - 理由：CLAUDE.md 寫死 soft delete only。Hard delete 會連埋歷史訂單嘅 FK 一齊拆

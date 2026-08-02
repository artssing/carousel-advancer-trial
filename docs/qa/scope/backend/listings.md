---
layer: backend
feature: listings
owners:
  - apps/api/src/listings/**
  - apps/api/src/users/public-users.controller.ts
  - packages/utils/src/search.ts
  - packages/utils/src/categories.ts
  - packages/utils/src/brands.ts
last_synced_commit: 3b8dfcd
---

# Listings / Browse / Search — Backend

## 可見性（founder ruling 2026-07-30）

- [LB-01] `GET /listings` 回嘅 row **全部** `status = ACTIVE`
  - RESERVED / SOLD 買唔到，出現喺 browse 只會嘥買家注意力
- [LB-02] 已知一件 SOLD 同一件 RESERVED 嘅 id，兩件都**唔喺** `/listings` 任何一頁出現
- [LB-03] 但 `GET /listings/:id` 直接攞 → **200**，`status` 照返真實值
  - 舊連結、社交分享要仍然去到
- [LB-04] `GET /users/:id/listings`（賣家公開 profile）都係 **ACTIVE only**
- [LB-05] DRAFT / REMOVED 喺以上全部入口都唔會出現

## 搜尋同篩選

- [LB-06] `?q=<品牌名>` — 每個空格分開嘅 term 都要中 title｜description｜brand（AND）
- [LB-07] `?category=HANDBAG` — 回嘅 row 全部係嗰個 category
- [LB-08] `?brand=CHANEL,GUCCI` — 多選係 **OR**
- [LB-09] `?sort=priceAsc` / `priceDesc` — 價錢真係順／逆序
- [LB-10] 分頁：連續兩頁嘅 id 完全冇重疊
- [LB-11] `conditionMin` 篩走 condition 係 null 嘅舊 row（唔可以當佢全新）

## Tier

- [LB-12] `tierForPrice` 邊界：999 → 1，1000 → 2，9999 → 2，10000 → 3
  - SSOT 喺 `packages/utils/src/tier.ts`，API 唔可以自己另計一套

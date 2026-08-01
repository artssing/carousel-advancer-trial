---
layer: frontend
feature: listings
owners:
  - apps/consumer/app/browse/**
  - apps/consumer/app/listing/[id]/page.tsx
  - apps/consumer/components/product-card.tsx
  - apps/consumer/components/top-nav.tsx
  - packages/ui/src/components/tier-pill.tsx
last_synced_commit: 8029541
---

# Browse / Listing detail — Frontend

## 平台中立（改動前一定要諗清楚）

- [CB-01] 商品卡 **冇任何** authenticity claim
  - 冇「已驗證」pill、冇 cert 標記。Listing schema 根本冇 cert 欄位，鑑定係成交之後先發生
- [CB-02] `TierPill` 三個 label 都係講**規則**，唔係講結果：
  `Tier 1 · Match-only` / `Tier 2 · Optional Auth` / `Tier 3 · Mandatory Auth`
  - **唔可以**出現 `Verified`（founder 2026-08-02）
- [CB-03] 全站 copy 冇「平台保證」「我哋保證」呢類字眼；成色一律標「賣家申報」

## 角落 ribbon

- [CB-04] SOLD → 灰色「已售出」45° ribbon，張相 dim 但**張卡仍然撳得入**
- [CB-05] RESERVED → 琥珀色「已預留」
- [CB-06] ACTIVE → 冇 ribbon
- [CB-07] SOLD 同 RESERVED 同時成立時只顯示 SOLD

## 基本

- [CB-08] Browse 出到卡，搜尋／篩選／排序郁得
- [CB-09] Listing 詳情頁登出都入得（crawler 要讀到）
- [CB-10] Mobile 375px：漢堡選單見到、搜尋列 padding 正常、卡片價錢同 tier pill 唔撞

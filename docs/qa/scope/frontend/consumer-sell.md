---
layer: frontend
feature: sell
owners:
  - apps/consumer/app/sell/**
  - apps/consumer/app/my-listings/**
  - packages/ui/src/components/tier-pill.tsx
  - packages/utils/src/tier.ts
  - packages/utils/src/categories.ts
last_synced_commit: 3b8dfcd
---

# Sell / My listings — Frontend

- [CS-01] 上架流程行得完，出到嘅 listing 即刻喺 browse 見到
- [CS-02] 價錢一改，tier 預覽跟住變（999 → T1，1000 → T2，10000 → T3）
- [CS-03] 品類／地區選項全部由 `packages/utils` SSOT 出，page 唔准 hardcode
- [CS-04] My-listings 撳分享開到同一個 wizard，`entry` 標住 `my_listings`
- [CS-05] 刪除 listing 一律 **soft delete**

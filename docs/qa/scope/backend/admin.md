---
layer: backend
feature: admin
owners:
  - apps/api/src/admin/**
last_synced_commit: 8029541
---

# Admin — Backend

- [AD-01] 呢啲 endpoint admin token 全部 **200**：
  overview / disputes / kyc-queue / users / orders / listings / finance / payouts / analytics
- [AD-02] 買家 token 打以上任何一個 → **403**
- [AD-03] 冇 token → **401**
- [AD-04] Force refund：CAPTURED 嘅 payment 真係去到 gateway refund
- [AD-05] Soft delete only —— admin 刪 customer 資料一律 soft，唔可以 hard delete

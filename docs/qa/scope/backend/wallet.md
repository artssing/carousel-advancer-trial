---
layer: backend
feature: wallet
owners:
  - apps/api/src/wallet/**
last_synced_commit: 8029541
---

# Wallet / 提款 2FA — Backend

- [WA-01] `GET /wallet/balance` 帶 token → **200**；冇 token → **401**
- [WA-02] `GET /wallet/methods` → **200**
- [WA-03] 提款 initiate → 回 EMAIL OTP，收件人 **遮咗中間**（`t**@demo.hk`），有效期 **300 秒**
- [WA-04] Confirm 用錯 code → **400 驗証碼錯誤**
- [WA-05] Confirm 用唔存在嘅 intentId → **404**
- [WA-06] Confirm **唔帶** `intentId` → 應該 **400**（DTO validation）
  - ⚠️ 2026-08-01 實測係 **500**。未修，見報告
- [WA-07] 成功 confirm 之後有 `verifiedVia` audit 記錄

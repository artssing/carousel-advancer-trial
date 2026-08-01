---
layer: frontend
feature: authenticator
owners:
  - apps/authenticator/**
last_synced_commit: 8029541
---

# Authenticator portal — Frontend

- [AP-01] Root 同 `/login` 都 200
- [AP-02] 色系行 `authBrand-*` 靛藍，**唔係** consumer 嘅 `brand-*` 綠
- [AP-03] Dashboard / inbox / scan 入得，鑑定師登入之後見到自己啲 case
- [AP-04] QR scan 頁面錯誤狀態有 handle（無效 token 唔會白畫面）
- [AP-05] 提款 2FA 同 consumer 同一個 `OtpInput` component

---
layer: backend
feature: authenticator
owners:
  - apps/api/src/authenticators/**
  - apps/api/src/orders/**
last_synced_commit: 8029541
---

# Authenticator — Backend

- [AT-01] 鑑定師 token 攞 inbox → **200** + 有 item
- [AT-02] 買家 token 攞同一個 inbox → **403**
- [AT-03] QR scan 用亂作 token → **400 QR 碼無效**
- [AT-04] QR scan 用有效 token → 推進到正確嘅 custody state
- [AT-05] 搜尋 endpoint → **200**
- [AT-06] Branches endpoint → **200**
- [AT-07] 鑑定師 fee rate（`feeRatePct` / `feeMinHKD`）真係入到 order totals（同 OC-06 對）
- [AT-08] 冇鑑定師嘅 order → `authFee = 0`

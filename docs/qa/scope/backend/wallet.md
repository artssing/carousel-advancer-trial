---
layer: backend
feature: wallet
owners:
  - apps/api/src/wallet/**
last_synced_commit: 3b8dfcd
---

# Wallet / 提款 2FA — Backend

## Lane budget

`curl` 7 · `static` 0 · `browser` 0 · `manual` 0 —— 全部 `verified`。

> 用賣家帳號（tom@demo.hk）—— 買家錢包冇餘額，提款 case 行唔起。

- [WA-01] `curl` `verified` — `GET /wallet/balance` 帶 token → **200**；冇 token → **401**
  - `GET $API/wallet/balance -H "Authorization: Bearer $SELLER"`
  - 理由：餘額係錢，guard 掛漏咗係最嚴重嗰種漏

- [WA-02] `curl` `verified` — `GET /wallet/methods` → **200** + 收款方式列表
  - `GET $API/wallet/methods -H "Authorization: Bearer $SELLER"`
  - 實測：`[{"id":"cmq7wmkpn00055umxerp5xuq6","type":"FPS_PHONE",…}]`
  - 理由：提款要攞 `payoutMethodId`，呢條係 [WA-03] 嘅前置

- [WA-03] `curl` `verified` — 提款 initiate → 回 EMAIL OTP，收件人**遮咗中間**，有效期 **300 秒**
  ```bash
  POST $API/wallet/requests/initiate -H "Authorization: Bearer $SELLER" \
    -H 'Content-Type: application/json' \
    -d '{"amountHKD":100,"payoutMethodId":"cmq7wmkpn00055umxerp5xuq6"}'
  ```
  - 實測：`{"intentId":"cmsc1kt09000yy4lvimoo55g1","channel":"EMAIL","maskedTarget":"t**@demo.hk","otpExpiresInSeconds":300}`
  - ⚠️ body 個 key 係 **`payoutMethodId`**，唔係 `methodId`。用錯 key 會回 **500**，
    睇落同真 bug 一模一樣（2026-08-02 就係咁誤判過）。
  - 理由：遮碼同有效期都係安全參數，改咗要即刻知

- [WA-04] `curl` `verified` — Confirm 用錯 code → **400 驗証碼錯誤**
  - `POST $API/wallet/requests/confirm -d '{"intentId":"<intentId>","code":"000000"}'`
  - 理由：錯碼一定要擋，而且訊息唔可以透露正確碼有幾多位／過期冇

- [WA-05] `curl` `verified` — Confirm 用唔存在嘅 intentId → **404 驗證請求不存在，請重新發起**
  - `POST $API/wallet/requests/confirm -d '{"intentId":"does-not-exist","code":"000000"}'`
  - 理由：唔可以攞住個亂作 id 就撞落去 null pointer

- [WA-06] `curl` `verified` — Confirm **唔帶** `intentId` → 應該 **400**（DTO validation）
  - `POST $API/wallet/requests/confirm -d '{"code":"000000"}'`
  - ⚠️ 2026-08-01 / 08-02 / **08-03 三次實測都係 500**。未修 —— 見 `reports/2026-08-02-full.md`。
    Root shape：controller 用 inline type（`@Body() dto: { intentId: string; code: string }`），
    冇 DTO class，`ValidationPipe` 冇嘢驗。
  - 理由：一條冇 DTO 嘅 endpoint 代表所有殘缺 body 都會變 500，唔止呢一個 key

- [WA-07] `curl` `verified` — 成功 confirm 之後有 `verifiedVia` audit 記錄
  - Mock OTP 由 API log 攞：`docker logs certifine-api-uat --since 5m | grep '\[MOCK EMAIL\]'`
    → `email=tom@demo.hk purpose=PAYOUT_CONFIRM code=888888 (dev mode)`
  - `POST $API/wallet/requests/confirm -d '{"intentId":"<intentId>","code":"888888"}'`
  - 實測：201 → `{"id":"cmsc1l6yp0012y4lv3hofhq2q","status":"PENDING","verifiedVia":"EMAIL","verifiedAt":"2026-08-02T16:56:18.040Z","reference":"PO-20260802-AS9F"}`
  - 理由：提款係唯一一個「錢真係離開平台」嘅動作，冇 audit 就查唔到係邊個批准

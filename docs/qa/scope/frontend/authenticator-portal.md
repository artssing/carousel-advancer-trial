---
layer: frontend
feature: authenticator
owners:
  - apps/authenticator/**
  - packages/ui/src/components/otp-input.tsx
  - packages/config/tailwind-preset.ts
last_synced_commit: 3b8dfcd
---

# Authenticator portal — Frontend

## Lane budget

`curl` 1 · `static` 2 · `browser` 2 · `manual` 0 —— 3 `verified` · 2 `unverified`（browser，未有 spec）。

- [AP-01] `curl` `verified` — Root 同 `/login` 都 200
  - `curl -o /dev/null -w '%{http_code}\n' https://uat-auth.certifinehk.com/` 同 `/login`
  - 實測 2026-08-03：兩條都 200
  - 理由：portal 開唔到嘅話下面全部 case 都冇意思，呢條係最平嘅 smoke

- [AP-02] `static` `verified` — 行緊嗰個 container 嘅 CSS 入面**唔應該**有 consumer 綠 `brand-*`
  ```bash
  docker exec certifine-authenticator-uat sh -c \
    'grep -o "\.text-brand-[0-9]*\|\.bg-brand-[0-9]*\|\.text-authBrand-[0-9]*\|\.bg-authBrand-[0-9]*" .next/static/css/*.css | cut -d: -f2 | sort -u'
  ```
  - 實測 2026-08-03：`authBrand-*` 係主色，但**同時**有
    `.bg-brand-50 .bg-brand-100 .bg-brand-600 .text-brand-600 .text-brand-700 .text-brand-800`
  - Source 側（已排除 `.next` / `node_modules`）：`photo-uploader.tsx:143`、`offer-card.tsx:228,251`、
    `wallet/payout-method-drawer.tsx:158`、`wallet/cashout-wizard.tsx:166,170,182,203,207,240`、
    `app/messages/page.tsx:502`
  - Token 定義：`packages/config/tailwind-preset.ts:16` `brand.600 = #008766`（綠）／
    `:62` `authBrand.500 = #6366f1`（靛藍），註解明講要分開
  - ⚠️ 呢條只講「CSS bundle 入面有／冇呢啲 class 名」。**綠色喺畫面上有幾明顯冇驗過** —— 要 browser
  - 理由：consumer=綠 / authenticator=靛藍 係 portal identity 訊號。共用 component 帶住 consumer 色
    走入第二個 portal 係一個會不斷復發嘅 pattern（同 admin 個 language switcher 一樣，見 [MP-02] 附註）

- [AP-03] `browser` `unverified` — Dashboard / inbox / scan 入得，鑑定師登入之後見到自己啲 case
  - 未有 Playwright spec。API 側見 [AT-01] + [AU-11] 矩陣
  - 理由：API 回到 46 單唔代表個 inbox render 到出嚟

- [AP-04] `browser` `unverified` — QR scan 頁面錯誤狀態有 handle（無效 token 唔會白畫面）
  - 未有 Playwright spec。API 側見 [AT-03]（`400 QR 碼無效`）
  - 理由：scan 係喺舖頭櫃枱即場做，白畫面即刻卡住條隊

- [AP-05] `static` `verified` — 提款 2FA 同 consumer 用同一個 `OtpInput` component
  - `grep -rn "OtpInput" apps/consumer/app/account/wallet apps/authenticator/components/wallet`
  - 實測 2026-08-03：consumer（`app/account/wallet/methods/page.tsx:5`）同 authenticator
    （`components/wallet/cashout-wizard.tsx:5`、`payout-method-drawer.tsx:4`）都
    `import { … OtpInput } from '@authentik/ui'`
  - 理由：OTP 輸入嘅 paste / 退格 / 自動跳格行為好易寫錯，只維護一份先唔會兩邊行為分岔

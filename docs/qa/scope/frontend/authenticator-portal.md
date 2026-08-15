---
layer: frontend
feature: authenticator
owners:
  - apps/authenticator/**
  - packages/ui/src/components/otp-input.tsx
  - packages/config/tailwind-preset.ts
  # ── 2026-08-15 sync（e8b5ce1）補入：AP-02 嘅「consumer 綠留喺 bundle」而家
  #    由呢幾個 packages/ui 共用 component 帶入嚟，唔再係 apps/authenticator 自己
  #    hardcode（offer-card.tsx / conversation-pane.tsx 喺 8-11 已經變薄 adapter）
  - packages/ui/src/components/conversation-pane.tsx
  - packages/ui/src/components/offer-card.tsx
  - packages/ui/src/components/confirm-dialog.tsx
  - packages/ui/src/components/button.tsx
  - packages/ui/src/components/badge.tsx
  - packages/ui/src/components/resizable-sidebar.tsx
last_synced_commit: e8b5ce1
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
  - ⚠️ **2026-08-15 sync：source 側嘅證據轉咗嚟源**（container CSS 冇重新驗過 —— 呢個係 sync，
    唔係 run，冇打 UAT）。舊引用嘅 `apps/authenticator/components/{offer-card,conversation-pane}.tsx`
    喺 `b7e6aaa`（ConversationPane 合併）＋ 08-11 OfferCard fork 合併之後已經變成幾十行嘅**薄
    adapter**，唔再自己帶 `brand-*` class（實測：`grep -n "brand-[0-9]" apps/authenticator/components/{offer-card,conversation-pane,wallet/*}.tsx apps/authenticator/app/messages/page.tsx` **零命中**，
    2026-08-15）。`brand-*` 而家嘅**唯一**來源係佢哋包住嘅共用 component 本身
    （`packages/ui/src/components/conversation-pane.tsx:46-54`、`offer-card.tsx`、
    `confirm-dialog.tsx:130`、`button.tsx:10,15`、`badge.tsx:11`、`resizable-sidebar.tsx:147`）——
    呢啲檔為咗俾 consumer 側用，literal 帶住 `bg-brand-600` 呢類 class 名，
    而 Tailwind content-scan 見到個 class 名就會編譯佢，唔理邊個 portal 嘅 adapter
    喺 runtime 揀咗邊個 theme prop
  - Token 定義：`packages/config/tailwind-preset.ts` `brand.600 = #008766`（綠，`brand:` block）／
    `authBrand.500 = #6366f1`（靛藍，`authBrand:` block），註解明講要分開
  - ⚠️ 呢條只講「CSS bundle 入面有／冇呢啲 class 名」。**綠色喺畫面上有幾明顯冇驗過** —— 要 browser
  - **Expected 冇變**：`authBrand-*` 應該係主色，但因為根源而家喺共用 package（Tailwind
    content-scan 全 repo），`bg-brand-*` 呢類 class **理論上會繼續出現**喺任何食
    `packages/ui` 嘅 portal 嘅 CSS bundle——呢個由 08-03 到而家從來冇修過，唔係新退步，
    下次 run 見到一樣嘅 class 名清單**唔係新 mismatch**，係同一個已知現象換咗個 source of truth
  - 理由：consumer=綠 / authenticator=靛藍 係 portal identity 訊號。共用 component 帶住 consumer 色
    走入第二個 portal 係一個會不斷復發嘅 pattern（同 admin 個 language switcher 一樣，見 [MP-02] 附註）。
    2026-08-15 之後呢個 pattern 由「app 層自己抄咗一份」變成「package 層本身就係源頭」，
    範圍收窄咗但冇消失

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
    `import { … OtpInput } from '@certifine/ui'`
  - 理由：OTP 輸入嘅 paste / 退格 / 自動跳格行為好易寫錯，只維護一份先唔會兩邊行為分岔

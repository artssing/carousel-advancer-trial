# Proposal: 提款 2FA（Payout Two-Factor Verification）

> Status: **APPROVED — founder 2026-07-13 拍板**
> Date: 2026-07-13
> Author: coordinator analysis（因 coordinator agent 環境故障，由主線以同等角度產出）
> 觸發：founder 2026-07-13 —「提款我認為需要做 2FA」

## Founder rulings（2026-07-13）

| # | 問題 | 拍板 |
|---|---|---|
| Q1 | Scope | ✅ **提款 + 新增收款戶口兩個閘都要 2FA** |
| Q2 | 冇 verified 聯絡方式嘅 user | ✅ **擋住，引導先驗證**（唔開客服通道） |
| Q3 | 細額豁免 | ✅ **全額都驗，唔設豁免** |
| Q4 | Channel | ✅ **長遠 SMS OTP 係首選；MVP 初期先用 Email OTP**（SMS 待真 provider，屆時 SMS 升做首選、email 退做 fallback） |
| Q5 | Authenticator portal | ✅ **提款同一套**（同一 API 同一 component，portal 色跟 ruling #18） |

---

## 1. 問題陳述

`POST /wallet/requests`（提款）而家只靠 JWT。任何人拎到一個已登入 session（電腦冇鎖、token 洩漏、phishing）就可以：

1. `POST /wallet/methods` 加一個**自己嘅** FPS/銀行戶口
2. `POST /wallet/requests` 將受害者成個 available balance 提走

呢個係 marketplace 最經典嘅 account-takeover 洗錢路徑。提款係**不可逆嘅資金外流**（T1 郁錢，founder ruling #16 精神），係全平台最需要 step-up verification 嘅動作。

## 2. 風險分層：邊啲動作要 2FA

| 動作 | 風險 | 建議 | 理由 |
|---|---|---|---|
| **建立提款請求** `POST /wallet/requests` | 🔴 資金直接外流 | ✅ **必須 2FA**（MVP scope） | 核心訴求 |
| **新增提款方法** `POST /wallet/methods` | 🔴 ATO 第一步（加賊戶口） | ✅ **必須 2FA**（MVP scope） | 唔封呢度，賊加咗戶口等你唔為意先提款；封咗就算 session 被劫都加唔到收款戶口 |
| 改 default method | 🟡 | ❌ 唔使 | 提款嗰刻先揀 method + 提款本身有 2FA，double gate 冗餘 |
| 刪除 method | 🟢 | ❌ 唔使 | 刪除唔會令錢流出；soft-delete 已可還原 |
| 改電話號碼 | 🟡 | 已有 CHANGE_PHONE OTP + 24h cooldown | 現制已足夠，唔使加 |

> **關鍵設計**：2FA 保護「加收款戶口」+「提款」兩個閘，先至封死成條 ATO 鏈。淨做提款一個閘係假安全。

## 3. 2FA channel 揀邊個

### 現有基建盤點（唔重新發明）

- `OtpRequest`（phone）+ `EmailOtpRequest`：bcrypt-hashed 6 位、5 分鐘 TTL、5 次 attempt、anti-enumeration、dev 固定 code `888888`
- User：`phoneVerified`（**optional** — 唔係人人有）、`emailVerified`（register v2 之後新用戶必有；legacy seed user 可能 false）
- 真 SMS / email provider = backlog（dev mode mock）

### 建議：**Phone OTP 優先，Email OTP fallback**

| Channel | Pros | Cons | 判斷 |
|---|---|---|---|
| **Phone OTP（SMS）** | HK 用戶最熟（銀行/FPS 全部咁做）；phone 綁定 + 24h change cooldown 已係現成防護 | phone optional（未必有）；SMS provider backlog | ✅ **首選**（有 verified phone 就用佢） |
| **Email OTP** | register v2 用戶必有 verified email；基建現成 | email 帳戶同 platform 密碼常共用 → 被入侵相關性高 | ✅ **fallback only** |
| TOTP app（Google Authenticator） | 最安全、零 provider 成本 | HK 大眾用戶唔熟；setup 摩擦高；QR/secret 管理係新基建 | 🔜 Phase 2 opt-in（power seller / 鑑定師） |

**Fallback 決策樹**（server 決定，response 話畀 client 知用咗邊個 channel）：

```
phoneVerified? ──yes──> SMS OTP 去 user.phone
      │no
emailVerified? ──yes──> Email OTP 去 user.email
      │no
      └──> 擋：提款前必須先驗證電話或 email（引導去 profile 驗證 flow）
```

> Legacy user（兩樣都冇）**唔可以**豁免——豁免 = 賊專登搵呢啲戶口打。將「驗證聯絡方式」做成提款前置條件，順手推進 founder「phone 最終 mandatory」嘅方向。

## 4. UX Flow（step-by-step）

### 4a. 提款（happy path）

```
[Wallet 頁] 撳「提款」
   ↓
[提款 form] 揀 method + 入金額（現有 UI）
   ↓ 撳「確認提款」
[Step-up modal]（ConfirmDialog v2 骨架延伸，portal=consumer 綠 / authenticator 靛藍）
   ├─ 上半：提款 summary（金額、手續費、淨額、到賬戶口 displayLabel）— 等於現有 T1 confirm 內容
   ├─ 下半：「驗證碼已發送至 +852 9123 **67」＋ 6 格 OTP input（自動 focus 跳格、貼上自動分配）
   ├─ 「重新發送」link：60 秒 cooldown（倒數顯示）
   └─ dismissOnBackdrop={false}（T1 郁錢規格）
   ↓ 6 位入齊自動 submit
[成功] → 現有 PayoutRequest PENDING flow（PO-ref、mock state machine 不變）
```

**一個 modal 做齊 confirm + 2FA**，唔好兩層 dialog（confirm 完再彈 OTP = 雙重摩擦，用戶會嬲）。OTP input 本身就係「我確認」嘅動作，符合 ruling #16「T1 要重確認」精神——OTP 係比 typedConfirmation 更強嘅確認。

### 4b. 錯誤 / 邊界 UX

| 情況 | UX |
|---|---|
| 入錯 code | inline 錯誤「驗證碼唔啱，仲有 N 次機會」；input 清空重入 |
| 5 次 fail | 該 OTP 作廢；顯示「嘗試次數已滿，請重新發送驗證碼」；**唔鎖戶口**（避免 DoS 人哋戶口），但 audit log 記低 |
| 5 分鐘過期 | 「驗證碼已過期」＋ resend button |
| resend 濫用 | 每 phone/email 每 purpose：1 分鐘 1 次、每日上限（跟現有 sendOtp rate limit pattern） |
| OTP 途中金額/戶口想改 | 關 modal 返去 form 改 → 舊 OTP session 作廢（見 §5 binding） |
| OTP 途中 balance 跌咗（例如新 dispute 鎖錢） | server create 嗰刻現有 atomic balance re-check 已處理 → 彈 ConflictException，UI 顯示「可提取餘額已變動」返回 form |
| 加 payout method | 同一 modal pattern，summary 換成「你將新增收款戶口：××」 |

## 5. Server-side 設計

### 5a. 新 purpose + binding（防 replay 核心）

```
enum OtpPurpose { ... PAYOUT_CONFIRM }        // phone
enum EmailOtpPurpose { ... PAYOUT_CONFIRM }   // email mirror
```

**兩-step API**（OTP bind 落具體 intent，唔係 bind 落 session）：

```
POST /wallet/requests/initiate
  body: { payoutMethodId, amountHKD }
  → server 驗晒（method ownership、min/max、balance）先發 OTP
  → 建立短命 PayoutIntent（10 分鐘 TTL）：
      { id, userId, payoutMethodId, amountHKD, channel, otpRequestId }
  → response: { intentId, channel: 'SMS'|'EMAIL', maskedTarget: '+852 9*** **67' }

POST /wallet/requests/confirm
  body: { intentId, code }
  → verify OTP（單次消費 + attempt counting，重用 verifyOtp 邏輯）
  → 用 intent 內凍結嘅 payoutMethodId + amountHKD 行現有 createRequest
    transaction（balance re-check 原封不動）
```

- **Code 淨係啱呢一單**：金額/method 改咗 = 新 intent = 新 OTP。舊 code 對新 intent 無效。
- intent 一次性：confirm 成功即 consume；同一 intent 唔可以 confirm 兩次（防 double-submit / 多 device race——第二個 device confirm 時 intent 已 consumed → 409）。
- `POST /wallet/methods` 同理：initiate（發 OTP）→ confirm（帶 code 先寫 DB）。
- **Anti-enumeration 延續**：initiate 對唔存在嘅 method 照樣行現有 NotFoundException（呢度係 authed endpoint，唔使 200-always）。

### 5b. Audit trail

- `PayoutRequest` 加欄：`verifiedVia: 'SMS' | 'EMAIL'`（Phase 2 加 `'TOTP'`）、`verifiedAt`
- OTP fail-out（5 次錯）寫 server log + 未來 admin security feed（backlog）

### 5c. Dev mode

跟現有 pattern：非 prod 固定 `888888`，UAT 測試零阻力。真 SMS provider（Twilio 等）上線時只換 sender，flow 不變。

## 6. 摩擦 trade-off：細額豁免？

| 方案 | Pros | Cons |
|---|---|---|
| **全部提款都 2FA**（建議） | 規則簡單好解釋；ATO 冇窿捐；code 入 6 位 <10 秒，摩擦其實好細 | 高頻細額 cashout 用戶每次都要入 code |
| 細額豁免（如 <HKD 1,000 免） | 減摩擦 | 賊可以斬件提款（20 × $999）；要再加「每日免驗額度」對沖 → 複雜度爆升 |
| 「信任裝置 30 日」 | 平衡 | device fingerprint 基建係新嘢，MVP 唔值 |

**建議全部都驗**。提款唔係高頻動作（賣家一單完成先提一次），一個 OTP 嘅摩擦遠低過資金被盜嘅代價；HK 用戶對「銀行類操作要 SMS code」完全有心理預期。「信任裝置」留 Phase 2 觀察投訴先做。

## 7. 分期

- **MVP（本 proposal scope）**
  1. `PAYOUT_CONFIRM` purpose ×2（phone/email）+ fallback 決策樹
  2. `PayoutIntent` model + initiate/confirm 兩-step API（提款 + 加 method 兩個閘）
  3. Step-up modal（ConfirmDialog v2 延伸 + 6 格 OTP input component 入 `packages/ui` — SSOT，consumer/authenticator 兩 portal 共用）
  4. `verifiedVia`/`verifiedAt` audit 欄
  5. 冇 verified 聯絡方式 → 擋 + 引導驗證
- **Phase 2**
  - 真 SMS provider（Twilio / 本地 SMS gateway）
  - TOTP app opt-in（鑑定師 / 高額賣家）
  - 「信任裝置」豁免（如 MVP 摩擦投訴多）
  - Admin security feed（OTP fail-out / 異常提款 pattern 監控）

## 8. 需要 founder 拍板嘅 open questions

1. **Q1 — Scope**：同意「提款 + 新增收款戶口」兩個閘都要 2FA？（建議：係，缺一唔可）
2. **Q2 — 冇 verified phone/email 嘅 legacy user**：同意「必須先驗證先可提款」？定係畀條客服人手通道？（建議：擋 + 引導自助驗證；客服通道係 ops 負擔）
3. **Q3 — 細額豁免**：同意全額都驗、唔設豁免？（建議：係）
4. **Q4 — Email fallback**：接受 email OTP 做冇電話用戶嘅 fallback？定係索性借呢個機會將 phone 變 mandatory-for-cashout？（兩個都合理；後者更安全但摩擦大啲——建議 MVP 用 fallback，觀察數據）
5. **Q5 — Authenticator portal**：鑑定師提款（earnings 頁）同一套規則？（建議：係，同一 API 同一 modal component，portal 色跟 ruling #18）

---

### 附錄：現有代碼錨點

| 項 | 位置 |
|---|---|
| 提款 endpoint | `apps/api/src/wallet/wallet.controller.ts:58` |
| createRequest transaction（balance re-check） | `apps/api/src/wallet/wallet.service.ts:281` |
| Phone OTP send/verify（重用對象） | `apps/api/src/auth/auth.service.ts:553` / `:606` |
| OtpRequest / EmailOtpRequest model | `apps/api/prisma/schema.prisma:205` / `:231` |
| PayoutRequest model | `apps/api/prisma/schema.prisma:797` |
| ConfirmDialog v2 規格 | `docs/proposals/confirm-dialog-proposal.md` |

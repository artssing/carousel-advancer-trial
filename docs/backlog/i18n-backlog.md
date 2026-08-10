# 中英文 i18n — Backlog

> 2026-07-30 起用 `locales/ssot.json` 做 SSOT，基礎設施同核心頁已經行得。
> 呢度記低仲未 wire 嘅頁同刻意押後嘅 UX enhancement。

## 已完成（唔好重做）

| 部分 | 位置 |
|---|---|
| SSOT + compile pipeline | `locales/ssot.json` → `scripts/compile-locales.ts` → `packages/utils/src/locales/data.ts` |
| `t()` / `createT()` / `getClientLocale()` / `detectLocale()` | `packages/utils/src/locales/` |
| Locale cookie route（3 個 app 各一份，behind-tunnel host 已處理） | `apps/*/app/api/locale/route.ts` |
| Consumer 共用框架：top-nav + footer | `apps/consumer/components/{top-nav,footer}.tsx` |
| Consumer browse 頁 | `apps/consumer/app/browse/page.tsx` |
| Authenticator 核心頁：login / dashboard / scan / inbox | `apps/authenticator/app/` |
| Footer 語言 select（`variant="select"`，幼身唔搶眼） | `packages/ui/src/components/language-switcher.tsx` |

**改 `locales/ssot.json` 後**：`npx tsx scripts/compile-locales.ts`，再 `cd packages/utils && npx tsc -p tsconfig.build.json`。
**注意**：`packages/utils/package.json` 個 `build` script **唔可以**加 `compile-locales`（`scripts/` 唔喺 Docker image 入面，會令所有 app build 炸 `ERR_MODULE_NOT_FOUND`）。`data.ts` 係 commit 咗嘅 generated artifact。

---

## 1. 完整 locale UX enhancement（founder 押後）

Founder 2026-07-30：「consumer 個 locale 其實好樣衰，先幫我放係 footer 先。之後成個 enhancement 再處理」。

而家：footer 一個幼身 select，切換 = full page reload（`/api/locale?lang=X&from=…` set cookie 再 redirect）。

**要諗**：
- 語言掣擺位（footer 夠唔夠？top-nav 需唔需要一個唔樣衰嘅版本？mobile 點算？）
- 首次到訪由 `Accept-Language` 自動偵測定一律 default 中文
- 登入用戶 locale 存落 `User` table，跨裝置跟住
- 切換要唔要 full reload（client-side 換 dictionary 會快好多，但 SSR 內容點算）
- URL 要唔要帶 locale（`/en/browse`）—— 影響 SEO

---

## 2. Authenticator 仲未 wire 嘅頁

`onboarding` / `profile` / `earnings` / `branches` / `messages` / `authenticate/[orderId]`

---

## 3. Consumer 仲未 wire 嘅頁

2026-08-10 數過（`grep -L createT` 掃晒 `apps/consumer/app/**/page.tsx`）：**24 個 page 得 `browse` 一個 import `createT`**。原本呢張清單漏咗 6 個，補返：

`page.tsx`（首頁）· **`login`** · **`register`** · `sell` · `checkout/[orderId]` · `orders` · `orders/[id]` · `my-listings` · `messages` · `listing/[id]` · `seller/[id]` · `buyer/[id]` · `authenticator/[id]` · `s/[id]` · `auth/link-confirm` · `auth/complete-profile` · `account/profile` · `account/wallet` · `account/wallet/methods` · `account/wallet/payouts` · `about` · `terms` · `privacy`

**`login` / `register` 應該排第一。** 英文用戶撞到嘅第一版 UI 就係佢哋 —— 而家由「建立你的帳戶」到「我哋會寄驗証碼到你嘅電郵。」全部 hardcode 中文。

（`top-nav` / `footer` 入面個 `createT` 收成 `_t`，underscore = 而家未真用，只係 wire 好咗個線頭。）

---

## 4. Admin portal 完全未 wire

Admin 係內部 ops 工具，優先度最低。要唔要做英文版由 founder 決定。

---

## 5. `zh-copy-extraction.json` — 對完賬（2026-08-10）

Repo root 個未 track 檔，749 條 `{namespace, key, zh, context}`，係早期抽 hardcode 中文嘅產物。同 `locales/ssot.json` 對完：

| | 條數 |
|---|---:|
| 已入 ssot，字一模一樣 | 638（85%） |
| 已入，但 ssot 之後改過字（**ssot 為準**） | 14 |
| 從來冇入過 ssot | 97 |

嗰 97 條再掃 source（跳過 `.next`／`node_modules`）：**14 條字串已經冇咗**（嗰段 UI 刪咗）· **42 條係「取消」「登入」咁短嘅通用字**，grep 命中唔可信 · **41 條係真漏網**，而且幾乎全部集中喺 `register/page.tsx` 同 `login/page.tsx`。

即係話：**呢 41 條唔係要逐條補 key，係整個 `login`／`register` 未 wire**（見上面第 3 項）。清單價值已經收喺呢度。

**待 founder 決定：** 檔案本身（92K）可以刪。

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

## 3.5 已 wire 但未收乾淨嘅 page（2026-08-10）

`login` / `register` / `AuthHeroPanel` 收乾淨咗（零剩餘）。`listing/[id]` / `orders` /
`sell` 主體 copy 做晒，但仲有大約 100 處未收，全部係同三類：

| 類 | 例 | 點解 codemod 唔掂 |
|---|---|---|
| 帶 `${}` 嘅字串 | `` `賣家申報：${conditionLabel(c)}` ``、`` `${mins} 分鐘前` `` | 要決定 params 點命名，係判斷題 |
| module-level helper 掟嘅錯 | `sell/page.tsx:82` `reject(new Error('無法解碼影片'))` | 喺 component 外面，`_t` 唔喺 scope。建議掟 key，catch 嗰邊 `_t(e.message)` —— `t()` 查唔到會原樣返回，degrade 得乾淨 |
| 剩低嘅零星字 | `取消`、`關閉`、`賣家：` | ssot 冇，或者多過一個 namespace 有 |

**唔好當呢三頁做完。** 英文用戶而家見到嘅係主體英文 + 呢啲位中文。

## 3.6 SSR 一律出中文（未解決）

`getClientLocale()` 喺 `useEffect` 入面行，所以**伺服器一律 render 中文，英文要 hydrate 之後先出**。
後果：英文用戶見到一閃中文；`curl` 攞到嘅 HTML 永遠係中文，即係**爬蟲同 SEO 收到嘅係中文版**。

呢個係現有 idiom 嘅限制（`browse` / `top-nav` / `footer` 一直都係咁），唔係今次改動引入。
真正解法喺第 1 項嗰個 enhancement 入面：locale 由 middleware 讀 cookie 塞落 `x-locale`
header，server component 用 `getLocale(headers())`，或者行 `/en/…` 路由。

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

---

## 6. `setError(_t(…))` —— 譯完存落 state，之後唔會再譯（2026-08-11 發現）

**33 處，橫跨 12 個檔**（`grep -rn "setError(.*_t(" apps/*/app --include='*.tsx'`）。

```tsx
setError(e instanceof ApiError ? e.message : _t('account.wallet.error.load'));
```

`locale` 喺 `useEffect` 之後先到。Error 通常喺 mount 嗰陣發生 —— 嗰刻 `_t` 仍然
係中文，句子譯完**存咗落 state**，之後 locale 到咗都唔會重譯。英文用戶一撞到
錯誤就見中文。

同一個 bug 喺 `ConversationPane` 個 typing indicator 出現過，`f92e7de` 修法係
**存 role，唔存句子**，render 先譯。呢度同理：存 key（或者 error code），
render 先 `_t()`。

由 QA browser case IN-03 喺 wallet 三頁撞到（container 連唔到 API → error path
被觸發 → `載入失敗` 喺英文版出現）。

## 7. IN-03 分唔開「UI copy」同「用戶寫嘅字」（2026-08-11）

`docs/qa/browser/tests/screens-en.spec.ts` 掃成個 `body.innerText` 搵漢字。喺
有 listing 嘅頁（`/`、`/listing/[id]`）會撈到：

```
[TEST-COND] Chanel Classic 幾乎全新     ← 賣家寫嘅商品標題
Milan Station 旺角                      ← 鑑定師自己改嘅名
```

**呢啲喺任何語言都應該原樣顯示。** 而家 `/listing/[id]` 濾走 API 返嘅
`title` / `seller.displayName`，但首頁有成打 listing + ticker，濾唔切。

正路修法：唔好掃 `body`，改成只掃 **chrome 區域**（top-nav / footer / 特定
component container）。未做，所以呢兩條 case 而家係紅。**唔好用「放鬆漢字檢查」
嚟令佢綠** —— 咁等於閹咗成條 case。

`docs/qa/browser/README.md` 寫住「連續 flaky 兩次即刻 skip 咗佢再查」——
呢兩條而家就係嗰種狀態。

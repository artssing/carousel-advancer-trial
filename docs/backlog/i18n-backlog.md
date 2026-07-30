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

`sell` / `checkout` / `orders` / `account/*` / `listing/[id]` / `about` / `terms` / `privacy` / `messages` / `my-listings` / `seller/[id]`

---

## 4. Admin portal 完全未 wire

Admin 係內部 ops 工具，優先度最低。要唔要做英文版由 founder 決定。

---

## 5. `zh-copy-extraction.json`

Repo root 有個未 track 嘅 `zh-copy-extraction.json`，係早期抽 copy 嘅產物。決定 keep（放入 `scripts/` 或 `docs/`）定刪。

---
layer: frontend
feature: listings
owners:
  - apps/consumer/app/browse/**
  - apps/consumer/app/listing/[id]/page.tsx
  - apps/consumer/app/seller/[id]/page.tsx
  - apps/consumer/components/product-card.tsx
  - apps/consumer/components/top-nav.tsx
  - packages/ui/src/components/tier-pill.tsx
  - packages/utils/src/tier.ts
  - packages/utils/src/categories.ts
  - packages/utils/src/brands.ts
  - packages/utils/src/search.ts
last_synced_commit: 3b8dfcd
---

# Browse / Listing detail — Frontend

## Lane budget

`curl` 2 · `static` 3 · `browser` 6 · `manual` 0
—— 5 `verified`（2 curl + 3 static）· 3 `verified`（browser，有 Playwright spec）· 3 `unverified`（browser）。

## 平台中立（改動前一定要諗清楚）

- [CB-01] `static` `verified` — `product-card.tsx` 同 consumer bundle 入面**冇** authenticity claim 字串
  - `grep -c "已驗證\|Verified\|認證" apps/consumer/components/product-card.tsx` → **0**
  - `docker exec certifine-consumer-uat sh -c 'grep -rho "Tier 3 · Verified" .next/'` → 0 hit
  - ⚠️ 呢條**只**講「source／bundle 冇呢啲字串」。張卡實際 render 成點見 [CB-08]。
  - 理由：Listing schema 根本冇 cert 欄位，鑑定係成交之後先發生；卡上出現任何「已驗證」
    等於平台自己發真偽聲明（L'Oréal v eBay framing 一破，法律 framing 就冇咗）

- [CB-02] `static` `verified` — `TierPill` 三個 label 都係講**規則**，唔係講結果
  - `docker exec certifine-consumer-uat sh -c 'grep -rho "Match-only\|Optional Auth\|Mandatory Auth\|Tier 3 · Verified" .next/ | sort | uniq -c'`
  - 實測 2026-08-03：`59 Mandatory Auth · 30 Match-only · 30 Optional Auth`；`Tier 3 · Verified` **0 hit**
  - 理由：`Verified` 係 founder 2026-08-02 明令唔可以出現嘅字。呢條驗嘅係行緊嗰個 container
    嘅 bundle，唔係 source —— 因為 deploy 冇生效嗰次就係 source 啱但 bundle 舊

- [CB-03] `static` `verified` — 全站 copy 冇「平台保證」類字眼；成色一律標「賣家申報」
  - `grep -rn "平台保證\|我哋保證\|我們保證" apps/ packages/ locales/ --exclude-dir=node_modules --exclude-dir=.next`
    → 12 hit，全部係 disclaimer／註解／design sample（例如 `about/page.tsx:75`
    「平台從未亦不會以『我哋保證』…發出真偽聲明」），冇一句係聲稱
  - `grep -rln "賣家申報" apps packages locales` → **只有 `apps/consumer/components/share-ig-modal.tsx`**
  - 已記錄嘅唔一致（founder 未拍板）：`listing/[id]/page.tsx:770` 用「賣**方**申報」、`:845` 規格表完全冇 attribution
  - 理由：中立 framing 唔係一句 disclaimer，係逐個 surface 嘅 attribution。少一個地方標，
    嗰個地方就變咗平台自己講

## 角落 ribbon

> **2026-08-02 founder ruling 之後呢批 case 先第一次驗得到** —— 以前 `ProductCard` 三個 caller
> 全部由 ACTIVE-only 嘅 API 餵，根本冇 surface render 到 ribbon。而家賣家 profile
> （`/seller/:id`，見 [LB-04]）會出 RESERVED / SOLD。

- [CB-04] `browser` `verified` — SOLD → 灰色「已售出」45° ribbon，張相 dim 但**張卡仍然撳得入**
  - Spec：`docs/qa/browser/tests/seller-profile.spec.ts`
  - 理由：售咗嘅貨仍然係賣家往績，撳得入先睇到成交價同鑑定結果

- [CB-05] `browser` `verified` — RESERVED → 琥珀色「已預留」ribbon
  - Spec：`docs/qa/browser/tests/seller-profile.spec.ts`
  - 理由：琥珀同灰要分得出，唔係買家會以為仲買得

- [CB-06] `browser` `unverified` — ACTIVE → **冇** ribbon
  - 未有 Playwright spec。要喺 `/browse` 同 `/seller/:id` 兩邊都睇（browse 全部 ACTIVE，一隻 ribbon 都唔應該有）
  - 理由：ribbon 邏輯寫錯方向嘅話，所有卡都會標住「已售出」

- [CB-07] `browser` `unverified` — SOLD 同 RESERVED 同時成立時只顯示 SOLD
  - 未有 Playwright spec。要一件同時兩個 state 嘅貨（DB 直接砌）
  - 理由：兩個 ribbon 疊埋一齊係最核突嗰種 render bug

## 基本

- [CB-08] `browser` `unverified` — Browse 出到卡，搜尋／篩選／排序**控制項**撳得郁，結果跟住變
  - 未有 Playwright spec。頁係 client-rendered，`curl | grep` 睇唔到卡
  - 底層 API 由 [LB-06]…[LB-10] 覆蓋；呢條淨係驗畫面同互動
  - 理由：API 啱唔代表 UI 有 wire —— 兩者拆開先答得清「邊一層壞」
  - 註：2026-08-03 由舊 [CB-08]（一半 API 一半畫面）拆出，API 嗰半見 [CB-11]

- [CB-09] `curl` `verified` — Listing 詳情頁登出都入得（crawler 要讀到）
  - `curl -o /dev/null -w '%{http_code} redirect=%{redirect_url}\n' https://uat.certifinehk.com/listing/<id>`
  - 實測：`200 redirect=`（冇 redirect）
  - 理由：加咗 auth gate 就等於所有社交分享連結全部死

- [CB-10] `browser` `verified` — Mobile 375px：漢堡選單見到、頁面**唔會橫向 overflow**
  - Spec：`docs/qa/browser/tests/browse-mobile.spec.ts`（`mobile` project，iPhone 13 viewport）
  - 理由：`docs/lessons.md` 記低咗呢個 regression 返嚟過幾次

- [CB-11] `curl` `verified` — Browse URL 嘅 query 契約同 API 對得上（`?q=&category=&brand=&sort=`）
  - `GET "$API/listings?q=Chanel&category=HANDBAG&brand=CHANEL&sort=priceDesc&limit=5"`
  - 實測：`total 2`，兩件都係 `CHANEL/HANDBAG`，價錢 `38000 → 15000` 降序
  - 理由：UI 砌 URL、API 讀 URL，兩邊 param 名一改就靜靜雞唔 filter（照回全部，睇落似「冇壞」）

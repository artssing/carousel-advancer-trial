---
layer: backend
feature: listings
owners:
  - apps/api/src/listings/**
  - apps/api/src/users/public-users.controller.ts
  - packages/utils/src/search.ts
  - packages/utils/src/categories.ts
  - packages/utils/src/brands.ts
  - packages/utils/src/tier.ts
last_synced_commit: 3b8dfcd
---

# Listings / Browse / Search — Backend

## Lane budget

`curl` 13 · `static` 0 · `browser` 0 · `manual` 0 —— 12 `verified` · 1 `pending`。

> `API=https://uat-api.certifinehk.com/api`。分頁參數係 `?limit=&offset=`，
> response 係 `{"items":[…],"total":N,"hasMore":bool}`（**唔係** bare array）。

## 可見性

**Founder ruling 2026-08-02（改咗 2026-07-30 嗰個）**：browse 同賣家 profile 答緊兩條唔同問題。
Browse 係買嘢嘅地方，買唔到嘅貨係雜訊；profile 係睇賣家嘅地方，「呢件賣咗」正正係你想要嘅信號。

- [LB-01] `curl` `verified` — `GET /listings` 回嘅 row **全部** `status = ACTIVE`
  - `GET "$API/listings?limit=50&offset=0"`（行晒 offset 0/50/100/150）
  - 實測 2026-08-03：195 row，status 全部 ACTIVE
  - 理由：RESERVED / SOLD 買唔到，出現喺 browse 只會嘥買家注意力

- [LB-02] `curl` `verified` — 已知一件 SOLD 同一件 RESERVED 嘅 id，兩件都**唔喺** `/listings` 任何一頁
  - SOLD `cmpwta7l7000d11l5pslo1q82` · RESERVED `cmpox0qft003le11zdoizrqux`
  - 行晒全部頁再 `grep` 呢兩個 id → **0 hit**
  - 理由：LB-01 睇 status 欄，呢條由另一邊入手（已知反例揾唔揾得返出嚟），過濾寫漏 index 就會中

- [LB-03] `curl` `verified` — `GET /listings/:id` 直接攞 → **200**，`status` 照返真實值
  - `GET $API/listings/cmpwta7l7000d11l5pslo1q82` → 200 `"status":"SOLD"`
  - 理由：舊連結、社交分享要仍然去到，唔可以連 404

- [LB-04] `curl` `verified` — `GET /users/:id/listings`（賣家 profile）包含 **ACTIVE + RESERVED + SOLD**，
  **ACTIVE 排最前**，DRAFT / REMOVED 仍然收埋
  - `GET "$API/users/<sellerId>/listings?limit=60" -H "Authorization: Bearer $TOKEN"`
  - 實測 2026-08-03（jenny `cmpzo1ry80005fo9wmkg57rsw`）：`total 36` = 24 ACTIVE + 10 RESERVED + 2 SOLD，
    回嘅次序係 24 個 ACTIVE → 10 個 RESERVED → 2 個 SOLD
  - ⚠️ **呢條 endpoint 要帶 token** —— `PublicUsersController` 成個 class 掛住 `@UseGuards(JwtAuthGuard)`
    （`public-users.controller.ts:19-20`），冇 token → 401。所以條 case 唔再叫佢做「公開 profile」。
  - **開放問題（等 founder 拍板）**：一個「賣家 profile」應唔應該登出都入到？依家係唔得，
    同 [SB-09]（crawler 一定登出）嘅邏輯行返轉頭。呢條 case 唔判斷，只記錄。
  - 排序點嚟：Postgres 照 enum 宣告次序排，`ListingStatus` 係 ACTIVE → RESERVED → SOLD，
    所以 `status asc` 已經自然頂上買得嘅貨（commit `f9e1d58`）
  - 理由：profile 空空如也會低估一個真係做過交易嘅賣家；ribbon 喺卡上標返 state（見 [CB-04]/[CB-05]）
  - 註：Browse（[LB-01]）**冇變**，仍然 ACTIVE-only

- [LB-05] `curl` `verified` — **REMOVED** 喺 browse 同賣家 profile 兩邊都唔出現
  - 造法：`POST $API/listings` 開一件 → `DELETE $API/listings/<id>`（soft delete，status 變 REMOVED）
  - 實測：`cmsbews5x000l5vcn6ngzn0v4` (REMOVED) 喺 `/listings` 全部頁同 tom profile 都 0 hit
  - 理由：soft delete 之後件貨要即刻由所有公開入口消失，但 row 唔可以真係冇咗

- [LB-13] `curl` `pending` — **DRAFT** 喺 browse 同賣家 profile 兩邊都唔出現
  - `pending` 原因：**而家造唔到 DRAFT**。`POST /listings` 一定出 ACTIVE，API 冇任何路徑產生 DRAFT，
    UAT DB `select status,count(*) from "Listing" group by status` → SOLD 14 / REMOVED 1 / RESERVED 35 / ACTIVE 195，
    **一條 DRAFT 都冇**。
  - Founder 2026-08-02：DRAFT 而家唔存在，但將來可能會有 —— 所以呢條唔刪，等 surface 出現先驗。
  - 理由：草稿係賣家自己嘅嘢，一旦有呢個 state，漏咗過濾就等於幫人提早出街

## 搜尋同篩選

- [LB-06] `curl` `verified` — `?q=` 每個空格分開嘅 term 都要中 title｜description｜brand（**AND**）
  - `GET "$API/listings?q=Chanel%20Classic&limit=50"` → 10 件，每件都同時含兩個 term
  - 理由：OR 語意會令兩個字嘅搜尋回一大堆雜嘢，用家即刻覺得個 search 壞咗

- [LB-07] `curl` `verified` — `?category=HANDBAG` → 回嘅 row 全部係嗰個 category
  - `GET "$API/listings?category=HANDBAG&limit=50"` → 50/50 HANDBAG
  - 理由：category 係 SSOT enum，API 唔可以做 fuzzy match

- [LB-08] `curl` `verified` — `?brand=CHANEL,GUCCI` 多選係 **OR**
  - `GET "$API/listings?brand=CHANEL,GUCCI&limit=50"` → total 3（CHANEL×2 + GUCCI×1）
  - 理由：多選品牌行 AND 就永遠回 0 件，係最典型嗰個 filter bug

- [LB-09] `curl` `verified` — `?sort=priceAsc` / `priceDesc` 價錢真係順／逆序
  - `GET "$API/listings?sort=priceAsc&limit=10"` → `[100,800,800,1000,1200,…]` 完全 sorted
  - `GET "$API/listings?sort=priceDesc&limit=10"` → `[320000,185000,155000,…]`
  - 理由：排序做喺 DB 定 in-memory 決定咗分頁準唔準

- [LB-10] `curl` `verified` — 分頁：連續幾頁嘅 id 完全冇重疊
  - 行 offset 0/50/100/150 → 195 個 id，`len(ids) - len(set(ids)) = 0`
  - 理由：排序唔穩定（冇 tiebreaker）就會有 row 喺兩頁都出現，另一啲永遠見唔到

- [LB-11] `curl` `verified` — `conditionMin` 篩走 `condition` 係 null 嘅舊 row
  - `GET "$API/listings?conditionMin=GOOD&limit=50"` → total 7，全部 GOOD／NEARLY_NEW，冇一件係 null
  - 理由：null 當「全新」處理係最惡劣嘅失敗方向 —— 直接誤導買家

## Tier

- [LB-12] `curl` `verified` — `tierForPrice` 邊界：999 → 1 · 1000 → 2 · 9999 → 2 · 10000 → 3
  - 現成 fixture（UAT 已存在，唔使再造）：
    ```
    GET $API/listings/cmsbews5x000l5vcn6ngzn0v4   # 999   → tier 1（REMOVED，要 DB 或直接 GET）
    GET $API/listings/cmsbewstj000n5vcn6ggbkzv0   # 1000  → tier 2
    GET $API/listings/cmsbewtg0000p5vcn7noca7q8   # 9999  → tier 2
    GET $API/listings/cmsbewu13000r5vcnahmvren4   # 10000 → tier 3
    ```
  - 加埋全庫對數：行晒 4 頁 196 row，冇一件 `tier` 同 `priceHKD` 推算出嚟嘅唔夾（0 mismatch）
  - 理由：SSOT 喺 `packages/utils/src/tier.ts`，API 唔可以自己另計一套。門檻寫死喺兩處遲早會分岔

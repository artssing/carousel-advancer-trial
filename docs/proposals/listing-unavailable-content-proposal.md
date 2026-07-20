# Listing detail · 商品不可購買時嘅底部 content

> Status: ✅ **Done（2026-06-05 完成全部 MVP items + 擴展至所有 listing）**
> Saved: 2026-06-04
> Trigger: founder 指出原本「我的訂單／繼續瀏覽」CTA generic 又重複（top nav 已有），但有更有意義嘅 content 可以擺嗰個位
> 已完成：
> - ✅ 移除兩個 generic button（2026-06-04）
> - ✅ 賣家其他商品 strip（2026-06-04）
> - ✅ 同類商品 strip（2026-06-04）
> - ✅ IM contextual 文案：RESERVED → 「問賣家有冇同類貨」/ SOLD → 「問賣家有冇同類貨或補貨計劃」（2026-06-05）
> - ✅ **擴展至所有 listing status**（ACTIVE 都顯示 recommendations，唔淨係 RESERVED/SOLD）—— founder 加入要求（2026-06-05）
>
> Backlog 仍然開：subscribe-to-re-list 通知、follow seller — 等 push infra ready 一齊做

---

## 一句 summary

非賣家視角下，當 listing `status ≠ ACTIVE`（RESERVED / SOLD），底部應該 surface contextual content（賣家其他貨、同類商品、contextual IM）轉化買家興趣，而唔係 generic navigation。

---

## 已做 ✅

- **移除「我的訂單」+「繼續瀏覽」兩個 button** —— Top nav 已有，重複噪音。`apps/consumer/app/listing/[id]/page.tsx` non-owner non-ACTIVE branch 而家只剩小字說明。

## Backlog（按 priority 排）

### 1. 賣家其他上架商品 strip（High）

當 listing 唔買得，**同一賣家可能仲有相關貨**（尤其 SOLD 情境，賣家可能仲有同款／類似補貨）。

- Section title：**「{賣家名} 嘅其他商品」**
- API：`api.users.sellerListings(listing.seller.id, 4, 0)` — 已存在，唔需要新 endpoint
- UI：複用 `seller/[id]/page.tsx` / `browse/page.tsx` 嘅 listing card grid pattern
- Empty case：array length 0 → 整個 section 唔 render（**唔好**顯示「暫無商品」空 state）
- Filter：排除自己 id（即使 strip 嘅 query 已 implicitly 排除）

**Defense vs regression**：
- 用 `flex flex-col` + `min-h-[2.5rem]` title + `mt-auto` price → 避免 card 高度不對齊
- 唔加 platform-issued 「Top Seller」/「Trusted」label

### 2. 同類商品 strip（High，SOLD 情境最重要）

SOLD = 終局，用戶最大動機係搵類似貨。

- Section title：**「同類商品」**（**唔可以**用「相似商品」/「推薦」/「你可能喜歡」—— 隱含 endorsement，違反 platform neutrality / L'Oréal v eBay）
- API：`api.listings.list(listing.category, 4, 0)` — 已存在
- Filter：排除自身 listing.id
- UI：同上 card pattern
- Empty case：array length 0 → section 靜默隱藏

### 3. IM contextual 文案（Medium）

「聯絡賣家」button 已有，但文案 generic。RESERVED / SOLD 情境下應該 contextual：

- RESERVED：「問賣家有冇同類貨」（**唔係**「問交易進度」—— 對現有買家會造成壓力，交易進度由訂單頁處理）
- SOLD：「問賣家有冇同類貨或補貨計劃」
- 未登入用戶：可 inline 顯示「登入後可聯絡賣家」link（optional）

### 4. Subscribe-to-re-list 通知（Backlog · 低優先）

RESERVED listing 取消／refund 後通知 user「有貨」。

- 依賴 push / email infra（暫無）
- 信任 risk：通知後 RESERVED 單繼續完成，user 失望
- 留到 push notification system build 完先做

### 5. Follow seller（Backlog）

「Follow」呢個 seller 嘅 future listings → 需要 `UserFollow` table + 通知系統。Phase C 嘅 seller profile 完整版一拼考慮。

---

## 守住 platform neutrality

- Strip 純粹 list factual ACTIVE listings，**唔加任何 editorial spin**
- Section title 用 factual 字眼（「同類商品」、「{賣家名} 嘅其他商品」），唔用「推薦」/「相似」/「精選」
- 唔加 platform-issued endorsement badge

## 防 regression check（implement 時跑一次）

- [ ] Strip card 高度對齊（`flex flex-col` + `min-h-[2.5rem]` + `mt-auto`）
- [ ] Strip 用 `packages/utils` 嘅 category SSOT（唔可以重新定義 category enum）
- [ ] Empty array → 唔 render section header（唔可以「暫無...」空 state）
- [ ] 排除自身 listing id
- [ ] 唔加任何 platform-issued endorsement copy
- [ ] 兩個額外 API call 只 trigger 喺 `status !== 'ACTIVE' && !isOwner` 時

## Phase split

| Sub-item | Priority | 預估 |
|---|---|---|
| 移除 generic button | ✅ Done | — |
| 賣家其他商品 strip | High | 30 min |
| 同類商品 strip | High | 30 min |
| IM 文案 contextual | Medium | 10 min |
| Subscribe-to-re-list | Backlog | 需 push/email infra |
| Follow seller | Backlog | 需 UserFollow schema |

**Phase 1 total（item 2-4）≈ 1 小時**，全部 reuse 現有 API + pattern，冇 schema 改動。

## 相關文件

- `apps/consumer/app/listing/[id]/page.tsx` — 改動集中喺 non-owner non-ACTIVE branch
- `apps/consumer/lib/api.ts` — `api.users.sellerListings` / `api.listings.list` 已存在
- `apps/consumer/app/browse/page.tsx` — card pattern 參考
- `apps/consumer/app/seller/[id]/page.tsx` — card pattern 參考
- `docs/seller-profile-c-proposal.md` — Phase C 完整 seller profile（呢個 backlog 可以一拼做）

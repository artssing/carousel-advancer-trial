# Search Result Ranking — Design Proposal（2026-07-10 Coordinator，暫不實施）

> Founder ask：搜尋結果排序太單一（create time / 單一 text score），參考大平台混合多 signal，並預留課金排前。**Design only — founder 諗清楚先做。**

## 現狀（code 實證）

- `sort=relevance`：in-memory 評分（title +3 / brand +2 / desc +1 / 整句 bonus），其餘 `createdAt desc`（`listings.service.ts:122-165`）
- Sort UI：相關度 / 最新上架 / 價格升跌（`browse/page.tsx`）
- **完全冇 impression / click / save / chat-start tracking**
- 賣家質素（avgRating / completedOrders）每 request 現場 aggregate，冇 denormalize

## A. Signal inventory

| Signal | 數據狀態 | 權重層 |
|---|---|---|
| Text relevance | ✅ 已有 | Primary（有 query 時） |
| 新鮮度 createdAt（+ 未來 bumpedAt） | ✅ / 新欄 | Primary（無 query）/ tie-break |
| 賣家質素（成交數、評分） | 部分有，未 denormalize | Secondary |
| Listing 質素（相數、影片、描述長度、condition 有冇填） | ✅ 全部 derive 到 | Secondary / tie-break |
| 價錢 vs 品類中位數 | ❌ 冇 median 計算 | Secondary |
| Engagement（曝光/click/chat/收藏） | ❌ 完全冇 event table | Phase 2 |
| 個人化（interests / 瀏覽史） | interests 有；瀏覽史冇 | Phase 2/3 — **只用喺 discovery feed，唔入明確搜尋**（保持「搜 X 得 X」可預測性） |
| ACTIVE > RESERVED | ✅ | Tie-break（RESERVED 排頂 = dead click） |
| 防 gaming 罰分 | ✅ 有 PriceChange heuristic pattern | Guardrail |
| 課金 boost | ❌ | Phase 3 — **獨立 slot 機制，唔溝入 organic score** |

## B. 評分形狀：**分層 + tie-break，唔係單一加權和**

單一 linear blend 好脆（權重錯少少，5★ 賣家嘅無關 listing 會壓過 exact match — eBay Best Match 早年經典投訴）。建議：

**有 query（相關度）**：
```
1. textRelevanceScore DESC（現有公式不變，dominant）
2. ACTIVE 先過 RESERVED
3. secondaryComposite DESC（0.5 賣家質素 + 0.3 listing 質素 + 0.2 價錢競爭力，normalize 0–1）
4. createdAt DESC
```

**無 query（category browse / 首頁）**：加一個新 default「**精選**」sort：
`0.5 新鮮度衰減 + 0.25 賣家質素 + 0.15 listing 質素 + 0.10 價錢競爭力`
**「最新上架」保留純 createdAt desc 不動** — 想要誠實 newest-first 嘅買家必須仲有呢個選項（透明可逆 house rule）。

## C. 新鮮度 / Bump

- **編輯 listing 唔可以 reset 新鮮度**（否則賣家會每小時改個 typo 爬 rank）。新鮮度讀 `GREATEST(createdAt, bumpedAt)`；`bumpedAt` 係獨立欄，只由明確「重新整理」action 寫
- Free bump rate-limit（每 listing 24h/7d 一次 — 待拍板），server 端 enforce（照 48h price-drop delay pattern）
- 防 gaming：照抄 PriceChange suspicious heuristics pattern，加「7 日 ≥N 次 bump」flag 入同一 admin audit view

## D. 課金排前（Phase 3 sketch)

- **紅線（不可讓步）**：boosted ≠ 任何真偽/信任 signal。「推廣」badge 必須同星級 trust pill 視覺分開 — 唔可以令買家覺得「畀咗錢 = 平台認可」（L'Oréal v eBay，同星級不可手改同一邏輯）
- **Slot model**：保留位（例如每頁第 1 位 / 每 8 格 1 個），boosted listing **必須本身通過晒 active filters 先可以入** — 唔可以硬塞入唔相關嘅結果。唔用純加分（有錢賣家永久霸版 = 買家信任 + organic 賣家留存雙輸）
- **收費**：MVP 建議日費 flat fee（配合平台 1.5% flat 費嘅簡單 mental model）；bundle（3 日/7 日 Carousell Bump 式）中間路線；競價 CPC（eBay Promoted 式）要 real-time bidding + click-fraud 基建，後期先諗
- **Cap**：每頁 boosted 上限（1-in-8 定 1-in-24 待拍板）
- **Scope guardrail**：boost 只限 listing placement，**永不開放畀鑑定師買 checkout 揀鑑定師嗰度嘅排位**（嗰個就係 pay-for-endorsement，正正係星級不可手改想防嘅嘢）

## E. 基建前置

- Event tracking：impression 用 browse 頁現有 IntersectionObserver batch ping（「card 可見 ≥1s」），加 click / chat-start
- 品類 median price：nightly aggregate cache，唔好 per-request
- 賣家質素 denormalize 落 User（照 Authenticator.starRating pattern）
- 評分繼續 in-memory JS（code 自己註明 catalog 上萬先轉 Postgres FTS）

## F. 分期

| Phase | 內容 | 新 tracking? |
|---|---|---|
| **MVP** | 現有 scorer 加 賣家質素/listing 質素/價錢中位/ACTIVE tie-break + 「精選」default sort | 冇 |
| **Phase 2** | Engagement events + free bump（rate-limit）+ 賣家質素 denormalize + 首頁個人化 | 有 |
| **Phase 3** | 課金 boost：slot + 推廣 label + 日費 + cap + admin audit | 有 |

## 待 Founder 拍板

1. 要唔要 free bump？（會攤薄未來課金 boost 嘅價值 — 可以直接跳去 paid-only）
2. 確認 boost 只限賣家 listing，鑑定師 checkout 排位永不開放（建議硬性 no）
3. Tier 3（≥10k 強制鑑定）listing 可唔可以 boost？（高風險 segment vs 最肯畀錢 segment）
4. 每頁 boosted cap：1-in-8 定 1-in-24？
5. Label 用字：「推廣」定「贊助」？
6. Free bump cadence：24h 定 7d 一次？

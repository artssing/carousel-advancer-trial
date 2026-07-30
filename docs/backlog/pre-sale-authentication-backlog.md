# 賣前鑑定 + 真「已驗證」標記 — Backlog

> Founder ruling 2026-07-30。呢個係**產品 feature**，唔係 UI 修飾。

## 點解會有呢個 item

Product card 左上角本來有個「◆ 已驗證」pill，條件係 `tier === 3`。但：

- **Listing schema 冇任何 cert / verified 欄位**（只有 `tier Int`）
- 鑑定係**交易之後** per-order 先發生（買家落單揀鑑定師），上架嗰刻件貨根本未驗過
- 喺未驗過嘅貨標「已驗證」= 直接違反平台中立（CLAUDE.md：平台唔可以 assert authenticity，所有 authenticity claim 要歸具名鑑定師）

中途試過改成誠實嘅「必經鑑定」，但 founder 2026-07-30 再拍板**整個移除**：買家 checkout 已經知 Tier 3 強制鑑定，卡上落 tag 只係呃 attention。

Founder 原話：「除非我地知道有個 flow 係可以預先搵鑑定師鑑定，佢攞到鑑定方張 cert 再賣，咁樣呢個 tag 要有意義。」

**而家狀態**：`product-card.tsx` 個 `CornerRibbon` 只做交易狀態（已售出 / 已預留），冇任何 authenticity claim。

---

## 要做啲乜

### 1. 賣前鑑定 flow

賣家上架前（或上架後）可以主動搵鑑定師驗貨：
- 賣家發起 request，揀鑑定師（重用現有 authenticator registry + `feeRatePct` / `feeMinHKD`）
- 交收（可重用現有 QR custody flow：`SELLER_DROPOFF` scan → CUSTODY）
- 鑑定師出 verdict + 證書
- 邊個俾錢？（賣家自己出？定成交後由買家 cover？）—— **要 founder 拍板**

### 2. Schema

`Listing` 加：
- `certAuthenticatorId`（具名鑑定師 FK — 平台中立嘅關鍵，claim 歸佢）
- `certVerdict` / `certIssuedAt` / `certExpiresAt`
- `certDocUrl`（證書檔，行 StorageService / R2）

要諗：件貨改咗價 / 改咗描述,張 cert 仲有效？改相呢？

### 3. UI

- Product card corner ribbon 加返一個 state（`已驗證`），排喺 SOLD / RESERVED 之後
- Listing detail 頁證書 section：具名鑑定師 + 日期 + 證書連結
- **Copy 必須中立**：「由 <鑑定師名> 鑑定」，唔可以係「Certifine 保證」

### 4. 防濫用

- Cert 唔可以轉去第二件 listing
- 過期點顯示
- 鑑定師停牌 / 除牌，佢啲舊 cert 點算

---

**Effort**：大 feature，牽涉 schema + 新 order-like flow + 兩個 portal UI + 收費政策。粗估 1–2 星期。動工前要 founder 拍板收費模式。

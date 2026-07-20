# 賣家完整 Profile + Reputation 系統（方案 C）

> Status: 🟡 **Backlog（Phase 4 候選）**
> Saved: 2026-06-04
> Owner: TBD
> 觸發背景: IM drawer 對話入面無法睇對方賣咩、無法 build trust（gap A/B 已先解決）

---

## 一句 summary

由方案 B 嘅「只 list ACTIVE listings + 基本資料」升級到接近 Carousell / 閒魚 standard 嘅完整賣家頁，包含 buyer review、reputation 指標、回覆速度等行為訊號 —— 建立完整買家信心 + 阻嚇 fraudulent seller。

---

## Scope（方案 B 已有嘅基礎之上加）

### 1. Buyer review 機制（**最大工程**）

而家 `AuthenticatorReview` 只 attach 鑑定師，**冇 seller review**。要加：

```prisma
model SellerReview {
  id        String   @id @default(cuid())
  orderId   String   @unique           // 一單一 review
  sellerId  String
  buyerId   String
  rating    Int                         // 1-5
  comment   String?
  // 細項評分（可選，視乎 founder ruling）
  itemAsDescribed Int?                  // 貨品同描述相符
  communication   Int?                  // 溝通
  shippingSpeed   Int?                  // 出貨速度
  createdAt DateTime @default(now())
}
```

- `POST /orders/:id/seller-review`（買家、order COMPLETED 後 7 日內、未 review 過）
- 加入買家評價 UI 喺 orders 頁 inline form（同現有 authenticator review 並列）

### 2. Reputation 指標（**算法、平台中立**）

接駁 `tier-pill` 思路 —— 平台只 surface factual data，唔加「Top Seller」judgement badge：

| 指標 | 計算方式 | 顯示 |
|------|---------|------|
| 完成單數 | `Order COUNT WHERE status=COMPLETED AND sellerId=?` | 「已賣 12 件」 |
| 平均評分 | `AVG(SellerReview.rating)` | ★ 4.8 |
| 評價數 | `COUNT(SellerReview)` | 「6 個評價」 |
| 好評率 | `% rating >= 4` | 95% 好評 |
| 加入日期 | `User.createdAt` | 2024-03 加入 |
| 回覆中位時間 | `Message` 內計 buyer 發訊息後 seller 首次回覆嘅 median | < 2 小時 |
| 爭議率 | `COUNT(Order WHERE status=DISPUTED) / COUNT(COMPLETED)` | 內部用，唔公開 |

⚠️ **法律姿態**：保持 L'Oréal v eBay 中立 —— 不加任何 platform-issued endorsement badge（「Top Seller」/「Trusted Seller」/「Authentik Pick」）。星級純演算法 derive，不可人手 override，同 authenticator 一樣。

### 3. Block / Report

- `POST /users/:id/block`（buyer 視角隱藏該 seller 嘅 listings + 收唔到 IM）
- `POST /users/:id/report`（理由：fraud / harassment / off-platform → admin 入 ticket queue）
- Admin portal 加 review queue

### 4. Public profile 頁面（`/seller/:id` 擴展）

方案 B 嘅簡頁升級為 tabs：

```
👤 Brian Lee  ★ 4.8 (6 評價) · 已賣 12 件 · 2024-03 加入
[ Listings (8) ] [ Reviews (6) ] [ 關於 ]

LISTINGS:  active listings grid
REVIEWS:   timeline of comments + ratings
關於:      bio (可選由 seller 填), 接受交收方式, 賣家區域
```

### 5. 細項

- IM drawer 加「回覆速度 < 2 小時」badge 鼓勵 seller 快回（同時間 buyer 知道大概等幾耐）
- 「最近活躍」綠點（last seen < 24h）
- 「身份已驗證」（KYC PASSED 時顯示，但 wording 中立 —— 「KYC 驗證」唔等於「平台保證真實」）

---

## Phase 化建議

| Phase | Scope | 預估 |
|------|------|------|
| C-1 | `SellerReview` schema + API + orders 頁買家評價 UI | 1.5 日 |
| C-2 | Reputation 指標 aggregation API + 公開 profile 顯示 | 1 日 |
| C-3 | `/seller/:id` tabs UI（listings / reviews / 關於）| 1 日 |
| C-4 | Block / Report + admin queue | 1.5 日 |
| C-5 | 回覆速度 metric + 活躍 indicator | 0.5 日 |

**Total ≈ 5–6 日**

---

## 法律 & 私隱 check list

- [ ] Real name 永遠唔 expose，只用 `displayName`
- [ ] Email 永遠唔 expose
- [ ] 詳細地址唔 expose（只去到 district level）
- [ ] 平台唔可以加 endorsement badge（「Trusted」等）
- [ ] Review 出之後可以由買家自己 delete，但有 audit log
- [ ] Seller 可以申訴不公評價 → admin queue（人手）
- [ ] Block / Report data retention：1 年
- [ ] 爭議率係**內部指標**，唔可以公開（會引致 seller 知道後刻意避戰）

---

## 觸發條件（何時做）

呢個方案唔急。等以下三個 condition 任一發生先做：

1. 方案 B 落地後 IM 有真實 traffic，user 表達想睇更多 seller 資料
2. 開始有 fraudulent listing / scam 個案，需要 reputation 把關
3. Stage 2（iOS）launch 前要追上 Carousell baseline trust experience

唔好為咗「feature 齊」而做。

# Instant Messaging (IM) 方案

> Status: **Draft — 待 Founder 拍板**
> Created: 2026-06-03
> 由 Coordinator 設計，未開始開發

---

## 核心設計理念

IM 唔係社交聊天 — 係**交易輔助工具**。所有對話綁定到 Order（唔係 user pair），保留仲裁證據。

---

## 對話範圍

| 情境 | 對話結構 |
|------|---------|
| 無鑑定 | 買家 ↔ 賣家（2 方） |
| 有鑑定（寄送） | 買家 ↔ 賣家 + 鑑定師獨立渠道 |
| MEETUP_3WAY | 三方群組 |
| MEETUP_AUTH | 買家 ↔ 鑑定師（賣家唔在場） |

**唔做 Pre-order 詢問**（落單後先開對話），防繞平台。

---

## 入口

1. **訂單卡底部**「訊息」button → inline drawer（唔離開頁面）
2. **鑑定師 Inbox** — 訂單卡顯示未讀 badge
3. **TopNav** — Package icon 加紅色未讀計數

---

## 分期

### MVP（第一期）

- Per-order 2-party 文字對話（買家 ↔ 賣家）
- SYSTEM 自動訊息（訂單狀態變更自動插入）
- 30 秒 polling 取新訊息 + TopNav 未讀 badge
- Off-platform 聯絡方式過濾（電話號碼、WhatsApp link 等）
- 500 字限制
- 鑑定師 read-only 閱讀

**Schema：**

```prisma
model Conversation {
  id        String    @id @default(cuid())
  orderId   String    @unique
  order     Order     @relation(fields: [orderId], references: [id])
  createdAt DateTime  @default(now())
  messages  Message[]
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  senderId       String
  sender         User         @relation(fields: [senderId], references: [id])
  senderRole     MessageRole
  body           String
  isFiltered     Boolean      @default(false)
  readByBuyer    Boolean      @default(false)
  readBySeller   Boolean      @default(false)
  readByAuth     Boolean      @default(false)
  deletedAt      DateTime?
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
}

enum MessageRole {
  BUYER
  SELLER
  AUTHENTICATOR
  SYSTEM
}
```

**API endpoints：**

```
GET  /conversations/:orderId          — 取 conversation + messages
POST /conversations/:orderId/messages — 發訊息（body 過濾）
GET  /conversations/unread-count      — 取 unread 數字
PATCH /conversations/:orderId/read    — 標記已讀
```

### Phase 2

- SSE 取代 polling（NestJS `@Sse()` 原生支援）
- 鑑定師可發訊息
- 圖片分享（R2/S3，限 3 張 10MB）
- 已讀回條
- 訊息舉報 → Admin 後台

### Backlog

- PWA Push Notification
- AI 客服 bot
- 面交時間 calendar picker
- 訊息翻譯

---

## 安全/法律

- **被動過濾**：block 電話號碼/WhatsApp/Telegram/PayMe
- **開場 SYSTEM 訊息**：「所有訊息均有記錄，用作爭議仲裁」
- **永久保留**（軟刪除），DISPUTED 狀態自動鎖定對話
- **舉報按鈕** → Admin 後台

---

## 待 Founder 確認（3 個決定）

1. **Pre-order 詢問**：方案建議唔做。要唔要比潛在買家問「仲有貨嗎？」
2. **三方 vs 獨立渠道**：只有 MEETUP_3WAY 用三方群組，其他鑑定師獨立。定係全部有鑑定師嘅訂單都三方？
3. **訊息保留期限**：永久保留定設上限（建議 3 年配合消費者保障法規）？

---

## 相關檔案（開發時參考）

| 用途 | 路徑 |
|------|------|
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Consumer 訂單頁（加訊息 button） | `apps/consumer/app/orders/page.tsx` |
| Consumer TopNav（加 unread badge） | `apps/consumer/components/top-nav.tsx` |
| Consumer API client | `apps/consumer/lib/api.ts` |
| 鑑定師 Inbox（加 unread badge） | `apps/authenticator/app/inbox/page.tsx` |

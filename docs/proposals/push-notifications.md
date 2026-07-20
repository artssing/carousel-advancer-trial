# Push Notifications — 全平台需求 collection

> Status: 🟡 **Backlog（infra-dependent，等 push 系統 ready 一齊做）**
> Saved: 2026-06-04
> Trigger: 議價系統需要 push notification 提醒 offer expiry / payment deadline，順手 collect 全平台所有需要 push 嘅 events

---

## Why a separate infrastructure decision

Push notifications 跨 web (Web Push / Notification API) + iOS (APNS) + Android (FCM) 需要：
- VAPID keypair（Web Push）
- APNS cert / FCM project（mobile，Stage 2/3）
- 後端 push dispatcher service（節流 / batch / retry / unsubscribe）
- 用戶 device subscription 存儲（per-user, per-device）
- 用戶 preferences（哪類 event 想收 push、quiet hours、digest vs realtime）
- Email fallback for users who 未 enable push

預估 infra build：**3–5 日**（Web Push only） + 鎖定 push payload schema。

唔好喺每個 feature 各自做 push —— 等個 dispatcher service ready 一次過 hook 晒。

---

## Events that should trigger push（全部 surface 喺度，唔再 scatter）

### A. IM / 訊息

| Event | Trigger | Recipient | Copy 範例 | Priority |
|-------|---------|-----------|-----------|----------|
| 新對話訊息（非自己發）| `POST /conversations/.../send` | 對方 party | 「{對方名}：{訊息頭 30 字...}」| High |
| Conversation 入面 SYSTEM message 重要事件 | 系統事件 | 所有 parties | 「鑑定通過」/「議價成功」等 | High |
| 對話 inactive > 48h 且仍有未回覆 | Cron daily | 對方 party | 「{對方名} 仲未回覆你嘅對話」| Low |

### B. 議價 Offers（呢個 sprint 加嘅）

| Event | Trigger | Recipient | Copy | Priority |
|-------|---------|-----------|------|----------|
| 收到議價 | offer created | 對方 party | 「{對方名} 出價 HK${price}」| High |
| Offer 被接受 | offer.status = ACCEPTED | 提議方 | 「議價成功！HK${price}，請喺 12h 內落單」| Critical |
| Offer 被拒絕 | offer.status = REJECTED | 提議方 | 「對方拒絕你嘅出價」| Medium |
| Offer counter-offer | new child offer | 提議方 | 「對方還價 HK${counter}」| High |
| Offer 剩 < 6h 過期（pending）| Cron 6h before expiresAt | 對方（未回覆嗰個）| 「議價將於 6h 後過期」| Medium |
| Offer expired | Cron sweep | 雙方 | 「議價已過期」| Low |
| 付款 deadline 剩 < 3h | Cron 3h before paymentDeadlineAt | Buyer | 「議價成功嘅商品仲未落單，剩 3h」| Critical |
| 付款 deadline 過咗，listing 反 ACTIVE | Cron sweep | 雙方 | 「商品已重新上架」| Medium |

### C. Order state changes

| Event | Trigger | Recipient | Copy | Priority |
|-------|---------|-----------|------|----------|
| 收到新訂單 | order created | Seller | 「{買家名} 落咗單買你嘅 {listing}」| High |
| 買家付款完成 | order.paidAt set | Seller, Authenticator | 「{買家名} 已付款，請寄出 / 開始鑑定」| High |
| 鑑定師簽收 | receivedByAuthAt set | Buyer, Seller | 「鑑定師已收件，開始鑑定」| Medium |
| 鑑定結果 PASSED | authVerdict=PASSED | Buyer, Seller | 「✓ 鑑定通過：真品」| Critical |
| 鑑定結果 FAILED | authVerdict=FAILED | Buyer, Seller | 「✗ 鑑定不通過：假貨，退款處理中」| Critical |
| 鑑定 INCONCLUSIVE | authVerdict=INCONCLUSIVE | Buyer, Seller | 「鑑定無法判定，進入退款流程」| High |
| 賣家寄出畀買家 | shippedToBuyerAt | Buyer | 「商品已寄出」| Medium |
| 買家確認收到 | deliveredAt | Seller | 「買家已確認收到」| Medium |
| Order 完成 | completedAt | Seller, Authenticator | 「交易完成，款項已派發」| High |
| 訂單爭議 | status = DISPUTED | 對方 + 平台 admin | 「{name} 申請爭議仲裁」| Critical |
| Refund 完成 | status = REFUNDED | Buyer | 「退款已處理」| High |

### D. Authenticator

| Event | Trigger | Recipient | Copy | Priority |
|-------|---------|-----------|------|----------|
| 收到新鑑定訂單 | order.authenticatorId 設咗 | Authenticator | 「新訂單：{listing title}，HK${price}」| High |
| SLA 剩 < 12h | Cron warn | Authenticator | 「{listing} 鑑定 SLA 剩 12h」| High |
| SLA 已逾期 | Cron alert | Authenticator + admin | 「{listing} 鑑定已逾期」| Critical |
| 鑑定師 E&O 保險將過期 | Cron monthly | Authenticator | 「E&O 保險將於 30 日後到期」| Medium |
| 收到新買家評價 | review created | Authenticator | 「{買家名} 評咗你 N 星」| Low |

### E. Seller

| Event | Trigger | Recipient | Copy | Priority |
|-------|---------|-----------|------|----------|
| Listing 被 RESERVED | listing.status → RESERVED | Seller | 「{listing} 已被 {買家} 預留」| High |
| Listing 賣出 | listing.status → SOLD | Seller | 「{listing} 已售出 HK${price}」| High |
| Listing 收到買家評價 | seller review created | Seller | 「{買家名} 評咗你 N 星」| Medium |
| 賣家收款 release | payment released | Seller | 「款項已入賬 HK${amount}」| High |

### F. Buyer

| Event | Trigger | Recipient | Copy | Priority |
|-------|---------|-----------|------|----------|
| 自己關注嘅 listing 重新上架 | listing.status RESERVED → ACTIVE | Past viewers? | 「你睇過嘅 {listing} 重新上架」| Low（要做 follow / wishlist） |
| 收到 listing/order 訊息 | 已 cover @ A | Buyer | — | — |
| 賣家有新 listing | seller new listing | Followers | 「{seller} 上架咗新貨」| Low（要 follow 功能）|

### G. Admin / Compliance

| Event | Trigger | Recipient | Priority |
|-------|---------|-----------|----------|
| 新爭議 case | order status = DISPUTED | Admin queue | Critical |
| 鑑定師 disputeRate > 10% | Cron weekly | Admin + 該 authenticator | Critical |
| KYC 申請等審批 | user.kycStatus = PENDING | Admin queue | High |
| 大宗交易（> HKD 50,000）| order created | Admin（fraud / AML 監察）| Medium |
| Off-platform contact 攔截 | message filter triggered | Admin（pattern 監察）| Low |

---

## 共通需求

### User preferences UI

`/settings/notifications` page：每類 event 提供 toggle（push / email / 兩者 / off）。Default：

- Critical：push + email（強制 push，唯一可關 email）
- High：push + email（可分別關）
- Medium：push only
- Low：digest（每日聚合一次）

### Quiet hours

22:00 – 08:00 預設靜音（critical 除外）。可由 user override。

### Bundling / digest

同一 conversation 5 分鐘內多條訊息 → bundle 成一條 push「{對方名} 發咗 N 條新訊息」。

### Click action

每個 push payload 帶 `deepLink`：
- 訊息 push → `/messages?conv={conversationId}` 或 listing/order context
- Offer push → `/messages?conv={conversationId}#offer-{offerId}` + auto-scroll
- Order push → `/orders/{orderId}` 或 `/authenticate/{orderId}`（authenticator）
- Listing push → `/listing/{listingId}`

### Unsubscribe

每個 push 默認包 Unsubscribe link 通往 settings page。

---

## Implementation phases

### Phase 1 — Web Push MVP（infra build）

1. VAPID keypair generation + storage（env）
2. Schema：`PushSubscription { id, userId, endpoint, p256dh, auth, deviceLabel, createdAt }`
3. `POST /push/subscribe` + `POST /push/unsubscribe`
4. Frontend：service worker + permission flow + subscribe call on first login
5. Push dispatcher service（NestJS）：takes `{ userId, title, body, deepLink, priority, dedupeKey }`
6. User preferences schema + settings UI
7. Quiet hours logic
8. Bundling / debounce logic（5-min window per conversation）

**預估：3–5 日**

### Phase 2 — Hook events to dispatcher

逐個 event（上面表）連去 dispatcher。每 event：
- 加 hook 喺對應 service method
- 寫 unit test 確保 dispatch 一次（idempotency / dedupeKey）

**預估：2–3 日**（按 events 數量 ~30 個）

### Phase 3 — Mobile push（iOS / Android）

iOS APNS + Android FCM，sync 同樣 events。當 Stage 2/3 mobile app build 嗰陣一齊做。

---

## 防 regression check（implement push 時注意）

- [ ] **唔可以 spam**：同一 user 同一 dedupeKey 30 秒內只 dispatch 一次
- [ ] **Idempotency**：cron 重跑唔可以重複發
- [ ] **Privacy**：push body 唔可以包敏感資料（HKID、real name、私聯絡）
- [ ] **Quiet hours**：critical events bypass，其餘嚴格遵守
- [ ] **Permission decline**：用戶拒咗瀏覽器 permission 唔可以再 prompt（要喺 settings 主動 enable 先 prompt）
- [ ] **Service worker scope**：只 register 一次，避免重複
- [ ] **Cross-tab dedupe**：同一 user 開咗多個 tab 唔可以收幾次
- [ ] **Stale subscription**：endpoint 410 Gone → 自動刪 PushSubscription row

---

## 相關 backlog files

- `docs/seller-profile-c-proposal.md` — seller follow 功能（B. listing 上架 push）
- `docs/listing-unavailable-content-proposal.md` — subscribe-to-re-list（F. listing 重新上架 push）
- `docs/authenticator-evidence-upload-proposal.md` — admin dispute review push
- `docs/superadmin-portal-proposal.md` — admin queue events
- 議價系統 MVP（呢個 sprint）— B. Offer events 全部 in-app only，等呢個 doc 嘅 dispatcher build 完先 connect

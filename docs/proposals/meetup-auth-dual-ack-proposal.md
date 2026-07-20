# 提案：「鑑定師面交」+「物流寄送」引入 Photo-Evidence + Receiver-Photos Dual-Ack 流程（v4 — full scope）

> **Status: 🚧 Implementing（2026-06-05）**
> **Saved: 2026-06-05**
>
> **Dependency block**: 必須同 `docs/authenticator-evidence-upload-proposal.md` 嘅 server-side photo storage 一齊 ship。Browser-local 相對方睇唔到，dual-ack 失去意義。
>
> **預估 implementation**：storage infra 2-3 日 + dual-ack flow 2-3 日 = **總計 4-6 日**

---

## 範圍

只動「鑑定師面交」(`MEETUP_AUTH`)。SHIP / MEETUP_3WAY / MEETUP_DIRECT 完全唔郁。

---

## Founder 已 confirm 嘅 design decisions（v3 final）

| # | Item | Decision |
|---|------|----------|
| 1 | Dual-ack scope | 只 `MEETUP_AUTH` |
| 2 | Phase A 順序 | 鑑定師先影相 + ack → 賣家 view 相後 ack |
| 3 | Phase C 模式 | 買家親身在店 + 單方 ack（in-person sync，無 timing risk）|
| 4 | 影相 minimum | **均一 3 張**（Phase A / FAILED 退貨均 3 張）|
| 5 | FAILED 退貨 dual-ack | 鑑定師影相 + 賣家 ack（但**買家退款獨立 proceed**，唔 wait seller）|
| 6 | Seller no-ack Phase A | **7 日 auto-cancel** + 全額退買家 |
| 7 | Buyer no-ack Phase C | **唔會發生**——鑑定師物理上持貨，買家唔到唔簽就唔交，order indefinite wait |
| 8 | Seller no-ack FAILED 退貨 | **唔阻塞買家退款**；買家退款即時 proceed；賣家 ack = 取回證明，唔取會累積寄存費（backlog model）|
| 9 | DISPUTED 裁決 | **External legal**——平台只提供相片 + IM 證據 chain，唔裁決，唔 admin intervene |
| 10 | Admin 角色 | **完全唔介入** dual-ack flow（admin portal 只用於 KYC / authenticator approval / overview）|
| 11 | Phase D seller payment ack | **移除** —— buyer Phase C ack 後 escrow 即時 auto-release，賣家只收 notification |

---

## State Machine（v3 final，6 個新 status）

```
AWAITING_PAYMENT
  ↓ buyer pays
PAID
  ↓ auth: start-meetup-handover
HANDOVER_TO_AUTH          (鑑定師收到通知賣家已到)
  ↓ auth: upload ≥3 photos + receive-ack
SELLER_ACK_PENDING        ←──── 7 日 timeout cron → AUTO_CANCELED → 退錢買家
  ↓ seller: view 相 + ack
CUSTODY                   (鑑定師正式 take custody，custodyHeld=true)
  ↓ auth: submit-verdict-meetup
  ├─ PASSED ────────────────────────────────────────┐
  │                                                  ▼
  │                                AWAITING_BUYER_PICKUP
  │                                  (indefinite — 鑑定師持貨等買家)
  │                                  ↓ buyer + auth 喺店：buyer-receive-ack
  │                                  (sync in-person, no timeout needed)
  │                                COMPLETED
  │                                  ↓ escrow auto-release (mock)
  │                                  listing=SOLD, custodyHeld=false
  │
  └─ FAILED / INCONCLUSIVE ───────────────────────────┐
                                                      ▼
                              即時兩件事 atomic：
                              1. buyer 退款 → status=REFUNDED
                              2. auth uploads ≥3 退貨相 → returnPhotosUploadedAt set
                              ▼
                              REFUNDED 狀態（已退錢買家）+ returnAckPending=true
                                ↓ seller 嚟取貨：seller-return-ack
                                ↓ returnSellerAckAt set
                              order 完結（status 仍 REFUNDED；seller-return-ack 純 evidence）

ANY 中間 state → 任何方 dispute → DISPUTED（freeze，External legal，平台冇 next step）
```

### Schema 改動

```prisma
enum OrderStatus {
  // existing...
  HANDOVER_TO_AUTH           // 新
  SELLER_ACK_PENDING         // 新
  CUSTODY                    // 新（reuse MEETUP_AUTH_CUSTODY 嘅 idea）
  AWAITING_BUYER_PICKUP      // 新
  // AUTHENTICATING / AUTH_PASSED / AUTH_FAILED / COMPLETED / DISPUTED / REFUNDED — existing
}

model Order {
  // existing...
  // Phase A
  authReceiveAckAt           DateTime?
  handoverPhotos             String[]   @default([])  // ≥3 photos
  sellerHandoverAckAt        DateTime?
  authCustodyStartedAt       DateTime?  // 雙方 ack 齊嘅時間
  custodyHeld                Boolean    @default(false)
  // Phase C
  buyerReceiveAckAt          DateTime?  // 買家在店 ack
  // Phase D (FAILED return)
  returnPhotos               String[]   @default([])  // ≥3 photos
  returnPhotosUploadedAt     DateTime?
  returnSellerAckAt          DateTime?  // 賣家取回確認（不 block 退款）
}
```

---

## API Endpoints（v3，7 個新）

| Endpoint | Caller | Pre-state | Post-state |
|---|---|---|---|
| `PATCH /orders/:id/start-meetup-handover` | auth | `PAID + MEETUP_AUTH` | `HANDOVER_TO_AUTH` |
| `PATCH /orders/:id/auth-receive-ack` | auth | `HANDOVER_TO_AUTH + photos.length ≥ 3` | `SELLER_ACK_PENDING` + photos saved |
| `PATCH /orders/:id/seller-handover-ack` | seller | `SELLER_ACK_PENDING` | `CUSTODY` + `custodyHeld=true` |
| `PATCH /orders/:id/submit-verdict-meetup` | auth | `CUSTODY` | PASSED → `AWAITING_BUYER_PICKUP`；FAILED → atomic：`REFUNDED` + upload return photos required（≥3）|
| `PATCH /orders/:id/buyer-receive-ack` | buyer | `AWAITING_BUYER_PICKUP` | `COMPLETED` + escrow release + `custodyHeld=false` |
| `PATCH /orders/:id/seller-return-ack` | seller | `REFUNDED + returnPhotosUploadedAt set + returnSellerAckAt null` | sets `returnSellerAckAt`（status stay REFUNDED）|
| `PATCH /orders/:id/dispute-meetup` | any party | 任何中間 state | `DISPUTED` + freeze; platform 唔 resolve |

### Cron jobs

- **`sweepSellerAckTimeout`**（每 15 分鐘）：揾所有 `SELLER_ACK_PENDING + authReceiveAckAt + 7 day < now`，atomic：status → `REFUNDED` (買家退錢) + custodyHeld=false + SYSTEM message「賣家逾 7 日未確認交付，訂單已取消，買家獲全額退款。」

---

## SYSTEM Messages（broadcast 三方）

複用 `OffersService.systemMessage()` pattern。

| Transition | 文案 |
|---|---|
| start-meetup-handover | 「鑑定師 [name] 已開始準備接收商品。」 |
| auth-receive-ack | 「鑑定師 [name] 已影相記錄商品狀況並接收。請賣家確認交付。」 |
| seller-handover-ack | 「賣家 [name] 已確認交付。商品由鑑定師正式保管。」 |
| submit-verdict PASSED | 「鑑定完成：真品。買家可前往鑑定師店面取貨。」 |
| submit-verdict FAILED | 「鑑定完成：不通過。買家已獲全額退款。商品退回賣家自取。」 |
| buyer-receive-ack | 「買家 [name] 已現場確認收貨。交易完成，款項已釋放。」 |
| seller-return-ack | 「賣家 [name] 已確認取回退回商品。」 |
| seller-ack-timeout | 「賣家逾 7 日未確認交付，訂單自動取消，買家獲全額退款。」 |
| dispute-meetup | 「[role] 提出爭議。Authentik HK 為資訊中介，唔裁決爭議。雙方可拎相片 + 對話作為證據自行解決（包括法律途徑）。」 |

---

## UI 設計

### Authenticator workbench（5-step working panel for MEETUP_AUTH）

```
Step 1 — 等賣家到場       (PAID)
  「賣家應該嚟你嘅店面交付商品。」
  [按鈕] 賣家已到，準備接收  → POST /start-meetup-handover

Step 2A — 影相 + 接收     (HANDOVER_TO_AUTH)
  「請拍攝至少 3 張商品狀況相，然後撳『已接收』。」
  Photo uploader（base64 MVP；server storage v1）
  [按鈕，require photos ≥ 3] 影相完成，已接收  → POST /auth-receive-ack
  Inline confirm（reuse OfferCard withdraw pattern）：
    「確認後你正式對商品負保管責任。影相將作 audit evidence。」

Step 2B — 等賣家確認       (SELLER_ACK_PENDING)
  Read-only：「✓ 已接收 + 影相。等待賣家 [Tom] 確認交付。」
  顯示 photos thumbnails
  ⏱ 7 日 timeout countdown 顯示（amber 5 日後變紅）
  [按鈕] 提出爭議（紅 outline）

Step 3 — 鑑定中            (CUSTODY)
  現有 checklist + verdict buttons → POST /submit-verdict-meetup
  PASSED 之後跳 Step 4
  FAILED 之後彈 Step 5

Step 4 — 等買家來取貨      (AWAITING_BUYER_PICKUP)
  「鑑定通過。買家 [Alice] 嚟取貨時，請喺現場一齊撳『確認收貨』。」
  Read-only，indefinite wait（無 timer）
  [按鈕] 提出爭議

Step 5 — FAILED 退貨        (REFUNDED + returnPhotosUploadedAt 未 set)
  「鑑定不通過。買家已退款。請影 3 張退貨相，賣家來取時請佢確認。」
  Photo uploader for 退貨相
  [按鈕] 上載完成  → server save returnPhotos + returnPhotosUploadedAt
  之後變 Step 5B

Step 5B — 等賣家來取        (REFUNDED + returnPhotosUploadedAt set)
  「等待賣家 [Tom] 來取回退貨。」
  [按鈕] 賣家已到並取回  → POST /seller-return-ack

Done
```

### Seller view `/orders/[id]`

```
status = HANDOVER_TO_AUTH
  Read-only：「鑑定師正在影相確認商品狀況，請喺現場稍候。」

status = SELLER_ACK_PENDING
  amber CTA：「鑑定師已影相記錄。請睇返相片，確認你已交付。」
  [Gallery] 顯示 3+ 張 photos thumbnails（可放大）
  ⏱ countdown：「請於 [time] 前確認（剩 X 日 Y 小時）」
  [按鈕] 確認相片正確，完成交付  → inline 2-step confirm
    Confirm copy：「確認後鑑定師正式接管。確認即代表你同意相片如實反映交付時狀況。」
  [按鈕] 提出爭議（紅 outline）

status = CUSTODY / AUTHENTICATING / AWAITING_BUYER_PICKUP
  Read-only progress panel

status = COMPLETED
  「✓ 交易完成。款項 HKD [net] 已入賬。」

status = REFUNDED + returnPhotosUploadedAt set + returnSellerAckAt null
  amber CTA：「鑑定不通過。買家已獲退款。請睇返退貨相，然後前往鑑定師店面取回商品。」
  [Gallery] 退貨相 3+ 張
  「⚠ 如逾期未取，鑑定師可能會收取寄存費（屬於你同鑑定師之間嘅安排，唔屬於 Authentik HK 平台責任）。」
  [按鈕] 已取回商品  → inline 2-step confirm
    Confirm copy：「確認後代表你接受退貨時嘅商品狀況同退貨相一致。」

status = AUTO_CANCELED（7-day timeout）
  「⚠ 因你逾 7 日未確認交付，訂單已自動取消，買家已全額退款。」
```

### Buyer view `/orders/[id]`

```
status = PAID / HANDOVER_TO_AUTH / SELLER_ACK_PENDING / CUSTODY / AUTHENTICATING
  Read-only progress panel

status = AWAITING_BUYER_PICKUP
  emerald CTA：「鑑定通過。請前往 [鑑定師店名/地址] 取貨，現場確認收貨。」
  [按鈕] 我已在店並確認收貨  → inline 2-step confirm
    Confirm copy：「
      確認後代表你親手收到商品並認可貨品狀況，
      款項將即時釋放畀賣家，此操作不可撤回。
      如貨品有問題，請唔好確認，撳『提出爭議』先。」
  [按鈕] 提出爭議（紅 outline）

status = COMPLETED：「✓ 交易完成。」
status = REFUNDED：「✓ 鑑定不通過，已全額退款。」
```

### 共同進度視圖（embedded `/orders/[id]`，三方睇同樣 content）

```
┌──────────────────────────────────────────────┐
│ 鑑定師面交 交易進度                           │
│ ────────────────────────────────────────────  │
│  ✓ 落單                          [time]       │
│  ✓ 已付款                        [time]       │
│  ⏳ 賣家交付到鑑定師：                        │
│      ✓ 鑑定師影相 + 已接收      [time]       │
│      ⏳ 等賣家 [Tom] 確認交付（剩 X 日）      │
│  ─ 鑑定中                                     │
│  ─ 買家現場取貨                               │
│  ─ 完成                                       │
└──────────────────────────────────────────────┘
```

### Dispute Modal

```
[彈窗] 提出爭議
  ┌────────────────────────────────────────┐
  │ ⚠ 提出爭議後：                          │
  │ • 訂單會凍結，escrow 唔會 release       │
  │ • 鑑定師繼續持有商品                   │
  │ • Authentik HK 為資訊中介，不裁決爭議   │
  │ • 你可以拎相片 + IM 對話作為證據       │
  │   自行同對方解決（包括法律途徑）        │
  │                                          │
  │ 爭議原因（必填）：                       │
  │ [textarea]                              │
  │                                          │
  │ [取消]  [確認提出爭議]                  │
  └────────────────────────────────────────┘
```

### Inline 2-step confirm pattern

每個 ack button reuse `OfferCard withdrawConfirmOpen` pattern。Step 1 撳 → 紅色 panel 出現含 confirm copy。Step 2 撳「確認」先正式 fire API。

### Status labels 更新

`apps/consumer/app/orders/page.tsx` `STATUS_LABEL_BASE`：

| Status | Buyer 視角 | Seller 視角 | Auth 視角 |
|--------|-----------|-------------|-----------|
| HANDOVER_TO_AUTH | 鑑定師接收中 | 鑑定師接收中 | 影相 + 接收 |
| SELLER_ACK_PENDING | 賣家確認中 | **等緊你確認** | 等賣家確認 |
| CUSTODY | 鑑定師持貨中 | 鑑定師持貨中 | 持貨中 |
| AWAITING_BUYER_PICKUP | **請到店取貨** | 等買家取貨 | 等買家取貨 |
| COMPLETED | ✓ 完成 | ✓ 完成 + 已收款 | ✓ 完成 |
| REFUNDED (returnPhotosUploadedAt set, returnSellerAckAt null) | ✓ 已退款 | **請取回退貨** | 等賣家取回 |
| DISPUTED | 爭議處理中 | 爭議處理中 | 爭議處理中 |

`needsMyAction()` 加：
- buyer × AWAITING_BUYER_PICKUP
- seller × SELLER_ACK_PENDING
- seller × REFUNDED + returnPhotosUploadedAt set + returnSellerAckAt null
- auth × HANDOVER_TO_AUTH (need to upload + ack)

### `actionRequiredCount` 更新（TopNav badge）

`orders.service.ts` 加新 status × role count。

---

## 防 Regression — 5 條 critical

1. **Race condition dual-ack**：Phase A 兩個 ack 用 `prisma.$transaction` + `where: { status, authReceiveAckAt: { not: null } }` 確保 seller-ack endpoint 唔能 fire 喺 auth 仲未 ack 之前
2. **State skip**：所有 endpoint server-side explicit pre-state check（throw `BadRequestException`），唔可只靠 UI 隱藏
3. **Photo persistence**：依賴 storage infra MVP；唔可 ship Phase A 唔做完 storage。Browser-local object URLs 對方睇唔到 = dual-ack 失效
4. **Cron timeout reliability**：每 15 分鐘 `sweepSellerAckTimeout`；用既有 `OffersCron` pattern；失敗要 logger.error
5. **DISPUTED 後 escrow guard**：所有 release escrow code path 加 `if (status === DISPUTED) throw`；`/dispute-meetup` 用 `$transaction` 同時 set `status=DISPUTED + custodyHeld=true + escrowHeld=true`

呼應 CLAUDE.md「已知 UX bugs」第 1（dead-end）、6（WHERE clause 漏 role）、12（direct DB write 冇 broadcast）、16（destructive action 冇 confirm）

---

## Phase Split

### MVP — Tightly coupled，必須一齊 ship

依賴 storage infra MVP（先做 storage，再做呢個）。

1. Server-side photo storage endpoint（從 `authenticator-evidence-upload-proposal.md` 提升 priority）
2. 4 個新 OrderStatus enum + 7 個 Order timestamp/photos columns
3. 7 個 service methods + endpoints + transaction safety
4. 1 個 cron job（sweepSellerAckTimeout）
5. 9 條 SYSTEM message broadcasts（reuse `systemMessage()` wrapper）
6. Authenticator workbench 5-step UI
7. Consumer orders detail page：3 個 ack CTA panels + dispute button + 共同進度視圖
8. Consumer orders list page：新 status labels + `needsMyAction` + `renderActions`
9. `actionRequiredCount` 更新
10. Dispute modal UI（reuse confirm panel pattern）

**預估**：storage infra 2-3 日 + flow 2-3 日 = **總 4-6 日**

### Backlog（唔 block launch）

- Storage fee model（賣家逾期取回退貨累積費用）
- DISPUTED 嘅 「雙方 ack resolved」route（純粹 platform 唔裁決，但雙方可標記已解決）
- Push notification 對應 events
- Photo immutability append-only storage（暫時 UI lock + DB updatedAt timestamp）

---

## Verification

End-to-end manual test 用 demo accounts：

1. 加一張 `MEETUP_AUTH` test listing 入 `seed-demo.sh`
2. Alice 落單 → PAID
3. Milan 撳「賣家已到」→ HANDOVER_TO_AUTH
4. Milan 上載 3 張相 + 撳「已接收」→ SELLER_ACK_PENDING
5. **Tom（另 tab）** 應該見 amber CTA + 相 gallery
6. Tom 撳「確認交付」→ inline confirm → confirm → CUSTODY (custodyHeld=true)
7. Milan 做 verdict PASSED → AWAITING_BUYER_PICKUP
8. Alice **去 Milan 店面**，撳「我已在店並確認收貨」→ inline confirm → COMPLETED + escrow release
9. **負面測 #1**：Step 4 之後 Tom 唔 ack 7 日（手動改 DB authReceiveAckAt = 8 日前）→ run cron → status → REFUNDED
10. **負面測 #2**：Step 6 之後 Alice 撳 dispute → DISPUTED + custodyHeld 仍 true（DB check）+ 所有 release escrow endpoints 拒絕 fire
11. **FAILED 路徑測**：Step 7 verdict FAILED → atomic：REFUNDED + Milan 必須上載 3 張退貨相 → Tom 嚟取 → seller-return-ack

---

## 相關 files

- `apps/api/prisma/schema.prisma` — OrderStatus enum + Order columns
- `apps/api/src/orders/orders.service.ts` — 7 new methods + actionRequiredCount + cron
- `apps/api/src/orders/orders.controller.ts` — 7 new PATCH routes
- `apps/api/src/orders/dto.ts` — `AuthReceiveAckDto` (photoUrls array) + `ReturnPhotosDto` + `DisputeDto` (reason text)
- `apps/api/src/offers/offers.cron.ts` — pattern reference for new sweepSellerAckTimeout cron
- `apps/consumer/lib/api.ts` — 7 new methods
- `apps/consumer/app/orders/page.tsx` — STATUS_LABEL / FLOW_STEPS / needsMyAction / renderActions
- `apps/consumer/app/orders/[id]/page.tsx` — 3 ack CTA + dispute modal + 共同進度視圖 + photo gallery viewer
- `apps/authenticator/app/authenticate/[orderId]/page.tsx` — 5-step + photo uploader + dispute button
- `apps/authenticator/lib/api.ts` — 7 new methods
- `apps/api/prisma/seed-demo-accounts.ts` — 加 MEETUP_AUTH test listing
- 新 doc：`docs/authenticator-evidence-upload-proposal.md` 升至 MVP priority
- `CLAUDE.md` — Phase 紀錄

## 相關 patterns to reuse

- `OffersService.systemMessage()` private wrapper
- `OfferCard withdrawConfirmOpen` inline 2-step
- `slaInfo()` countdown helper
- Cross-app `XLink` component
- `OffersCron` setInterval pattern
- `sell/page.tsx readAsDataURL` photo upload base64 MVP pattern
- Image gallery + lightbox pattern from `apps/consumer/app/listing/[id]/page.tsx`

---

## Founder ready-to-implement checklist

✅ Scope 確認
✅ Dual-ack sequence 確認
✅ 7 個 endpoint + state machine 確認
✅ 影相 minimum 確認（3 張）
✅ Timeout 策略確認（seller no-ack 7 日 / buyer 在店無 timeout / FAILED return 賣家不阻塞 buyer 退款）
✅ Dispute resolution 確認（External legal，platform 唔裁決）
✅ Admin 角色確認（completely no involvement）
✅ Legal copy framing 確認（資訊中介，不裁決）
⏳ Photo storage infra：**先做先**（dependency block）

**可以開始 implement 嘅 trigger**：storage infra MVP done。

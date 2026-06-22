# Demo Accounts — Manual Test Reference

> All passwords: **`password123`**
> Re-seed anytime: `cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed-demo-accounts.ts`

---

## 🛒 買家（buyers）— 全部 KYC VERIFIED 除咗 Dave

| Email | 名稱 | 用途 |
|---|---|---|
| `alice@demo.hk` | Alice (買家) | **主買家** — 用嚟做大部分 happy path test（checkout / 議價 / IM）|
| `bob@demo.hk` | Bob (買家) | **次買家** — 模擬「兩個 buyers 爭同一件貨」競爭場景 |
| `carol@demo.hk` | Carol (買家) | **PENDING offer 持有者** — 已對 DEMO-C 出價 HK$950 等 Tom 回覆 |
| `dave@demo.hk` | Dave (KYC PENDING) | **未通過 KYC** — 測試任何 KYC-gated UI / 限制 |

## 🏪 賣家（sellers）

| Email | 名稱 | 用途 |
|---|---|---|
| `tom@demo.hk` | Tom (賣家) | **主賣家** — 持有 3 件低-中價貨（DEMO-A/B/C）|
| `jenny@demo.hk` | Jenny (賣家) | **高價賣家** — 持有 Rolex Tier 3 (DEMO-D) + LV (DEMO-E) |

## 🛡 Admin（admin portal port 3002）

| Email | 名稱 | 用途 |
|---|---|---|
| `admin@demo.hk` | Admin Ops | **SUPER_ADMIN role** — 登入 http://localhost:3002 處理 disputes / KYC / users |

## 🔍 鑑定師（authenticators）— Pre-existing

| Email | 名稱 | 專長 |
|---|---|---|
| `milan@authentik.hk` | Milan Station 旺角 | 手袋 |
| `procheck@authentik.hk` | 先達 ProCheck | iPhone |
| `cardlab@authentik.hk` | 信和 CardLab | Pokemon Card |

## 💼 Legacy account（已有資料留住）

| Email | 名稱 | 備註 |
|---|---|---|
| `seller@authentik.hk` | Demo Seller | 持有 165+ seed listings，用嚟測試 listing browse / search / pagination |

---

## 📦 Pre-seeded listings (DEMO-A 到 DEMO-E)

| Code | 商品 | 賣家 | 價錢 | Tier | 場景 |
|---|---|---|---|---|---|
| DEMO-A | Coach 銀包 · 棕色 | Tom | HK$2,800 | 2 | Bob 有開緊嘅 IM 對話 |
| DEMO-B | Pikachu 普卡 · 第一版 | Tom | HK$450 | 1 | Tier 1 純撮合測試 |
| DEMO-C | Nike Dunk Low Panda US 9 | Tom | HK$1,200 | 2 | **Carol PENDING offer HK$950 等 Tom 回覆** |
| DEMO-D | Rolex Submariner 116610LN | Jenny | HK$65,000 | 3 | Tier 3 強制鑑定 |
| DEMO-E | LV Neverfull MM 棋盤格 | Jenny | HK$9,500 | 2 | 大金額議價測試 |

---

## 🎬 Manual test playbook

### Test 1 — Plain checkout flow（最簡單）

1. 登入 `alice@demo.hk`
2. 入 `/browse?cat=pokemon_card` → 揀 **DEMO-B** (Pikachu)
3. 揀交收方式 → 揀付款方式 → 落單
4. 跳去 `/orders` 應該見到新 order，listing 應變 RESERVED
5. 入 `tom@demo.hk` 揭發「賣出」分頁應該見到呢張單

### Test 2 — Tier 3 強制鑑定

1. 登入 `alice@demo.hk`
2. 入 **DEMO-D** (Rolex)
3. 應該強制要揀一位鑑定師 + 顯示鑑定費用明細
4. 試試揀「買賣雙方面交（無鑑定）」→ server 應 reject

### Test 3 — 議價 happy path（核心功能）

**兩個 tab**：alice / tom

1. **Alice tab**：入 **DEMO-E** (LV HK$9,500) → 「聯絡賣家」開 drawer
2. Drawer input 左邊 🏷 button → click → 議價 form 出現
3. 輸入 **8000** → 「提出」→ Drawer 出現 amber OfferCard「等待對方回覆」
4. **Tom tab**：`/messages` → click Alice 對話 → OfferCard 顯示 accept/reject/還價 buttons
5. Tom click「接受」→ 兩邊都見「✓ 議價成功」SYSTEM message + pinned strip
6. **Alice tab**：OfferCard 出現「立即落單（鎖定 HK$8,000）→」綠色 button
7. Click → 跳去 `/listing/<id>?offerId=<id>`
8. 應該見：原價 HK$9,500 line-through、新價 HK$8,000 brand 色、amber 付款限期 banner
9. 完成 checkout → order 用 HK$8,000

### Test 4 — Counter-offer 連環議價

**兩個 tab**：alice / tom

1. Alice 出 HK$7,000 喺 DEMO-E
2. Tom 揀「另出價」→ 輸入 8,500 → 提出
3. Alice tab 應該見到 round 2 OfferCard、舊嘅 (round 1) 變 COUNTERED 灰色
4. Alice 接受 HK$8,500 → 流程同 Test 3 一樣

### Test 5 — 競爭買家 race

**兩個 tab**：alice / bob 對同一張 listing（**DEMO-C**）

1. Alice 入 DEMO-C → 「聯絡賣家」→ 出價 HK$1,000
2. Bob 入 DEMO-C → 「聯絡賣家」→ 試出價 HK$1,100 → 應該成功（唔同 conversation）
3. **Tom tab**：`/messages` 應該見到 Carol（HK$950 pending）+ Alice (HK$1,000) + Bob (HK$1,100) 三段對話
4. Tom 接受 Alice 嗰個 → Carol 同 Bob 嘅 offers 應該變 WITHDRAWN（competing offers swept）
5. DEMO-C listing → RESERVED

### Test 6 — RESERVED 商品 viewer state

1. Test 5 完成後（DEMO-C reserved），任何 non-owner 登入睇 DEMO-C
2. 應該見到 amber 「此商品交易進行中」banner 喺頂部
3. 唔再見到 checkout flow，只有「我的訂單」link

### Test 7 — Authenticator workbench（鑑定師視角）

1. 用 Test 2 嘅 Rolex order：先用 alice@ 完成落單 + payment（mock）
2. 登入 `milan@authentik.hk` → `/inbox` 應該見到呢張單
3. Click 入鑑定工作台：
   - **左 Zone A**：見到 Jenny 上架嘅照片 + 完整 description「2021 年購入...輕微錶帶刮痕」+ Jenny chip
   - **右 Zone B**：SLA countdown + Checklist + Verdict
4. 試 click 「✗ 假貨」 → checklist 旁邊出現「不符」tags
5. Click 兩個項目「不符」→ Notes 自動 fill bullets
6. 上傳一個 dummy 影片 / 圖片 → 簽名 → 提交

### Test 8 — IM cross-app（鑑定師角度）

1. `cardlab@authentik.hk` 登入 → `/messages`
2. 應該見到自己 mediate 嘅 order conversations
3. Drawer 入面 click「Jenny」/ listing thumbnail → 應該開新 tab 入 consumer URL

### Test 9 — Edit own listing

1. `tom@demo.hk` 登入 → `/my-listings` → click DEMO-A
2. 頂部見到 brand「這是你上架嘅商品」banner
3. Click「編輯商品」→ 跳 `/sell?edit=<id>`
4. 改 title / price / 圖 → 「儲存修改」
5. 跳返 listing 詳情，新值反映

### Test 10 — Two-pane messages UI

1. `alice@demo.hk` 登入 → `/messages`
2. Desktop（≥ md）應該見**左 sidebar conversation list + 右 active conversation pane**
3. 揀對話：active row 出現 brand 左 accent border
4. Mobile（縮窗 < md）：list 同 pane 互相切換，pane 有 ← back button

---

## 🧹 Reset 場景

```bash
cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed-demo-accounts.ts
```

呢個 script idempotent：
- Demo accounts upsert（password 重置返 password123）
- Tom + Jenny 嘅 listings 全部刪走重建
- Demo accounts 嘅 conversations / offers 重置
- Carol 嘅 HK$950 PENDING offer 重新出現
- Bob 嘅 DEMO-A 對話重置

**唔影響**：`seller@authentik.hk` 嘅 165+ seed listings、authenticator 帳號、已完成嘅 cardlab Charizard demo IM。

# Authentik HK — Analytics Tagging Spec

**Status: APPROVED — founder 2026-07-14 拍板「先做 MVP」；MVP 已落地（Phase 2 / Backlog 見 §10）**

Owner: UX & Product Coordinator
最後更新：2026-07-14
覆蓋範圍：`apps/consumer`（3008）、`apps/authenticator`（3001）、`apps/admin`（3003，dark theme，呈現層）、`apps/api`（4000，event ingestion + 儲存）

參照 codebase 位置：
- Order state machine：`apps/api/prisma/schema.prisma`（`OrderStatus` enum）
- 現有 WebSocket presence pattern（可重用）：`apps/api/src/messages/messages.gateway.ts`（`presence` event、`lastSeenAt`、`handleConnect`/`handleDisconnect`）
- Search 解析 SSOT：`packages/utils/src/search.ts`（`parseSearchQuery`）
- Admin 現有 stub（要被本 spec 取代/接通）：`apps/admin/app/analytics/page.tsx`（目前純 hardcoded static numbers，冇接任何 event 來源）

---

## 0. 設計原則（呢份 spec 嘅紅線）

1. **平台中立（L'Oréal v eBay）**：Analytics 係內部 ops 工具，**唔可以喺任何 customer-facing UI 呈現**（唔可以做成「平台幫緊你篩選/背書」訊號）。所有 event 只餵入 admin console（dark theme，internal-only，port 3003），呢個原則喺 admin dark theme 已經係故意設計（見 CLAUDE.md）嘅延伸。
2. **PDPO（香港私隱條例）**：
   - IM message **內容唔記**（只記 event 發生咗、message count、唔記文字）。
   - Search query **原文要記**（founder 要求 "search 咩" 分析），但要視為可識別個人行為資料 → retention 限期 + anonymize 排程（見 §7）。
   - IP address 只用作 fraud/rate-limit，唔用喺 analytics dashboard 呈現個人層面；聚合層面（e.g. 地區分布）先出。
3. **Guest 都要 track**（founder 要求 guest vs member 比例），但 guest identity 只用 client-side anonymous id，唔連去任何 PII，直至用戶登入先 merge。
4. **唔阻塞主 request path**：event 寫入用 fire-and-forget（async queue / best-effort），絕對唔可以令 checkout/offer 等主 flow 因為 analytics 寫入失敗而 500。
5. **Single event pipe，唔係散落 log**：所有 3 個 portal 用同一個 event schema + 同一個 ingestion endpoint，先可以喺 admin 拼埋一條 user journey。

---

## 1. Event 命名規範

- 格式：`domain_action`（snake_case，全小寫），例如 `search_performed`、`listing_viewed`、`checkout_completed`。
- Domain 白名單（對應下面 §2 分類）：
  `session` / `browse` / `search` / `listing` / `offer` / `checkout` / `order` / `im` / `wallet` / `auth_portal`（鑑定師 portal）/ `admin`
- Action 用動詞一致：`_viewed` / `_performed` / `_started` / `_completed` / `_failed` / `_clicked`。
- **唔可以自由命名**：新 event 要喺 §9 governance 定義嘅 registry 度 review 過先可以上 code。

### 通用 envelope（每個 event 都必須帶）

| Field | Type | 說明 |
|---|---|---|
| `event_name` | string | e.g. `search_performed` |
| `event_id` | uuid | 去重用，client 產生 |
| `occurred_at` | ISO8601 timestamp | client-side 產生時間（唔係 server 收到時間，另存 `received_at`） |
| `received_at` | ISO8601 timestamp | server 落地時間（server 補） |
| `env` | enum `PROD` \| `UAT` | 對應 UAT/PROD split，**analytics table 要跟埋隔離**，唔可以 UAT 測試資料混入 PROD dashboard |
| `portal` | enum `CONSUMER` \| `AUTHENTICATOR` \| `ADMIN` | 邊個 app fire 嘅 |
| `anonymous_id` | string | client-side 產生（見 §3），guest 同 member 都有 |
| `user_id` | string \| null | 登入先有；未登入 = null |
| `role` | enum `GUEST` \| `BUYER` \| `SELLER` \| `AUTHENTICATOR` \| `ADMIN` \| `MULTI` | 見 §3 role dimension |
| `session_id` | string | 見 §3 session 定義 |
| `page_path` | string | 觸發時所在 route（e.g. `/browse`, `/orders/[id]`） |
| `referrer` | string \| null | 上一個 page_path（同 app 內部導覽）或 external referrer |
| `device` | enum `MOBILE` \| `DESKTOP` \| `TABLET` | UA-derived，粗粒度就夠 |
| `properties` | JSON object | event-specific payload（見下面每個 event） |

---

## 2. Event Taxonomy（完整列表）

### 2.1 `session` domain（所有 portal，guest + member）

| Event | Trigger | Properties | Guest/Member |
|---|---|---|---|
| `session_started` | App load 後第一個 event（新 session_id 產生時）| `entry_path`, `utm_source?`, `utm_campaign?` | 兩者 |
| `session_heartbeat` | 每 60 秒一次（tab 前景時），用作 online presence 計算 | `active_seconds_since_last_heartbeat` | 兩者 |
| `session_ended` | tab close / beforeunload，或 heartbeat 斷咗 >5 分鐘後 server 判定 | `duration_seconds`, `page_count` | 兩者 |
| `user_login` | 登入成功 | `method`（`PASSWORD` 現時得呢個）, `previous_anonymous_id`（identity merge，見 §3）| Member-only |
| `user_logout` | 主動登出 | — | Member-only |
| `user_signup` | 註冊成功 | `initial_role`（`BUYER`/`SELLER`） | Member-only |

### 2.2 `browse` domain（consumer，guest + member）

| Event | Trigger | Properties |
|---|---|---|
| `page_view` | 每次 route 轉換（含 SPA client-side nav）| `page_path`, `page_type`（`home`/`browse`/`listing_detail`/`seller_profile`/`orders`/`checkout`/...）|
| `category_selected` | 首頁/browse category chip 撳落 | `category_id`（`apiEnum` from `packages/utils/src/categories.ts`）|
| `home_strip_scrolled` | horizontal scroll strip（最新上架/category）滑動超過 50% viewport | `strip_name` |
| `listing_viewed` | 進入 listing detail page | `listing_id`, `tier`（1/2/3）, `price_hkd`, `category_id`, `has_authenticator`（bool）, `source`（`browse`/`search`/`seller_profile`/`direct_link`）|
| `listing_view_ended` | 離開 listing detail（SPA nav cleanup 或 pagehide）| `listing_id`, `dwell_seconds`（client clamp 30 分鐘，<1 秒唔 fire）|
| `seller_profile_viewed` | 進入賣家公開頁 | `seller_id` |
| `authenticator_profile_viewed` | 進入鑑定師公開檔案（消費者側）| `authenticator_id`, `source_listing_id?` |

### 2.3 `search` domain（consumer，guest + member）— founder 重點 #4

| Event | Trigger | Properties |
|---|---|---|
| `search_performed` | 用戶提交 search query（debounced，唔係逐個 keystroke）| `query_raw`（原文，見 §7 PDPO retention）, `parsed_category`（`parseSearchQuery` 抽出，nullable）, `parsed_brand`（nullable）, `auto_applied_filters`（array，例如 `["category:handbag"]`）, `remaining_terms`（array）, `result_count`, `sort` |
| `search_zero_result` | `search_performed` 但 `result_count === 0` 時額外多 fire 一個（方便 admin 直接開 zero-result report）| 同上全部 properties |
| `search_filter_removed` | 用戶移除自動套用嘅 chip（透明可逆機制）| `filter_type`, `filter_value` |
| `search_result_clicked` | 由 search result list 撳入某個 listing | `query_id`（連番 `search_performed` 個 event_id，funnel 用）, `listing_id`, `result_position` |

> Search → click → purchase conversion 靠 `search_result_clicked.query_id` 連去後續 `listing_viewed` → `checkout_started` → `checkout_completed`（`session_id` + `listing_id` join，見 §4）。

### 2.4 `listing` domain（sell flow，consumer，member-only）

| Event | Trigger | Properties |
|---|---|---|
| `sell_flow_started` | 撳「賣嘢」入 sell 表單 | `entry_source` |
| `sell_step_completed` | 每完成一個 sell wizard step | `step_name`（`category`/`photos`/`price`/`delivery_pref`/`review`）, `step_index` |
| `sell_brand_autodetected` | `matchBrandFromTitle` 命中 | `matched_brand`, `category_id` |
| `listing_published` | 提交成功 | `listing_id`, `tier`, `price_hkd`, `category_id`, `delivery_methods_offered`（array）|
| `listing_edited` | 編輯已上架 listing | `listing_id`, `fields_changed`（array）|
| `listing_removed` | 賣家 soft-delete | `listing_id`, `reason?` |
| `listing_restored` | 賣家自行還原 | `listing_id` |

### 2.5 `offer` domain（consumer，member-only，buyer+seller 雙向）

| Event | Trigger | Properties |
|---|---|---|
| `offer_proposed` | 出價/還價提交 | `listing_id`, `offer_id`, `proposed_by_role`（`BUYER`/`SELLER`）, `proposed_price_hkd`, `round_number` |
| `offer_accepted` | 對方接受 | `offer_id`, `final_price_hkd` |
| `offer_rejected` | 對方拒絕 | `offer_id` |
| `offer_withdrawn` | 撤回（經 ConfirmDialog）| `offer_id` |
| `offer_countered` | 還價 | `offer_id`, `new_offer_id` |

### 2.6 `checkout` domain（consumer，member-only）— founder 重點 #5（漏斗）核心

| Event | Trigger | Properties |
|---|---|---|
| `checkout_started` | 由 listing/offer 進入 checkout page | `listing_id`, `tier`, `price_hkd` |
| `checkout_delivery_selected` | 揀交收方式 | `delivery_method`（`SHIP`/`MEETUP_AUTH`/`MEETUP_3WAY`/`MEETUP_DIRECT`）|
| `checkout_authenticator_selected` | Tier 2 optional / Tier 3 mandatory 揀鑑定師 | `authenticator_id`, `is_mandatory` |
| `checkout_payment_method_selected` | 揀付款方式 | `payment_method`（`ONLINE_ESCROW`/`OFFLINE_CASH`）|
| `checkout_fee_breakdown_viewed` | Fee breakdown render 到嗰刻 | `platform_fee_hkd`, `auth_fee_hkd`, `total_hkd` |
| `checkout_payment_confirmed` | 撳「確認付款」submit | `order_id`, `total_hkd` |
| `checkout_completed` | Order 成功建立（`AWAITING_PAYMENT`→`PAID`）| `order_id` |
| `checkout_abandoned` | 進入 checkout 後 10 分鐘冇 `checkout_completed` 又離開 | `last_step_reached` |
| `checkout_2fa_otp_requested` | Wallet/payout-related step-up（如涉及）| — |

### 2.7 `order` domain（consumer + authenticator，member-only，覆蓋成個 state machine）

| Event | Trigger | Properties |
|---|---|---|
| `order_status_changed` | 任何 `OrderStatus` transition（**server-side authoritative**，喺 `orders.service.ts` 每個 transition 點 fire）| `order_id`, `from_status`, `to_status`, `triggered_by_role` |
| `order_ship_tracking_submitted` | 賣家/鑑定師填 SF 單號 | `order_id`, `tracking_owner`（`seller`/`authenticator`）|
| `order_qr_scanned` | MEETUP_AUTH drop-off/pickup QR scan | `order_id`, `scan_type`（`dropoff`/`pickup`）|
| `order_auto_completed` | T+3 auto-complete cron（`sweepShipAutoComplete`）觸發 | `order_id` |
| `order_dispute_raised` | 買家 `dispute-ship` 或其他爭議入口 | `order_id`, `dispute_reason_category` |
| `order_review_submitted` | 買家 review | `order_id`, `rating`（1-5）, `has_comment`（bool，**唔記 comment 內容**）|
| `verdict_submitted` | 鑑定師出 verdict | `order_id`, `authenticator_id`, `verdict`（PASSED/FAILED/INCONCLUSIVE）, `time_to_verdict_seconds`（SLA 分析）|

### 2.8 `im` domain（consumer + authenticator，member-only）— 只記行為，唔記內容（PDPO）

| Event | Trigger | Properties |
|---|---|---|
| `conversation_started` | 開新對話 | `conversation_id`, `context_type`（`listing`/`order`）|
| `message_sent` | 發送訊息 | `conversation_id`, `message_length_bucket`（`short`/`medium`/`long`，**唔記原文**）|
| `conversation_opened` | 開返 existing 對話 | `conversation_id` |

### 2.9 `wallet` domain（consumer + authenticator，member-only）

| Event | Trigger | Properties |
|---|---|---|
| `payout_initiated` | `POST */initiate` | `amount_hkd`, `channel`（`EMAIL_OTP`）|
| `payout_otp_confirmed` | OTP 驗證成功 | `payout_id` |
| `payout_method_added` | 新增收款戶口（經 OTP gate）| `method_type` |
| `payout_failed` | OTP 錯 / intent 過期 / 409 replay | `reason` |

### 2.10 `auth_portal` domain（authenticator app，member-only，founder 重點 #3 online 數）

| Event | Trigger | Properties |
|---|---|---|
| `authenticator_online` | Portal 開啟 + WebSocket connect（**重用 `messages.gateway.ts` 現有 `presence` 機制**，唔重新發明）| `authenticator_id` |
| `authenticator_offline` | Disconnect / heartbeat timeout | `authenticator_id`, `session_duration_seconds` |
| `inbox_job_viewed` | 開 job detail | `order_id` |
| `job_accepted` / `job_started` | 開始鑑定 workbench | `order_id`, `sla_remaining_seconds` |
| `sla_breach` | 48h SLA 過咗未出 verdict（**server-side 判定 fire**，唔靠 client）| `order_id`, `overdue_seconds` |
| `earnings_viewed` | 開 earnings page | — |

### 2.11 `admin` domain（admin app，member-only，internal audit trail）

| Event | Trigger | Properties |
|---|---|---|
| `admin_action_taken` | 任何 admin mutating action（approve/reject/suspend/refund 等）| `action_type`, `target_entity_type`, `target_entity_id`, `admin_user_id` |
| `admin_report_viewed` | 開任何 analytics/report page | `report_name` |

---

## 3. User Identity Model

- **`anonymous_id`**：client-side 產生（UUID v4），存喺 `localStorage`（跨 tab 持久）。未登入用戶所有 event 帶呢個 id，`user_id = null`。
- **Login merge**：登入成功 fire `user_login` 帶 `previous_anonymous_id`。Server 寫 identity mapping table `anonymous_id → user_id`（一對多：一個 user 可以有多個 anonymous_id — 換裝置/清 cache）。**唔 retroactive 改寫舊 event**（event 係 immutable log）；admin console 查一個 user 嘅完整 journey 時，經 mapping table 拉埋所有曾連結嘅 `anonymous_id` 一齊 query（先做到「登入前瀏覽 → 登入 → 落單」完整 path）。
- **Role dimension**：一個 `user_id` 唔同時間可以係唔同 role（tom 同時買+賣）。Event 嘅 `role` 記**嗰個 action 當刻嘅 role context**（checkout event role=BUYER；sell flow event role=SELLER），唔係用戶嘅「主 role」。`ADMIN` / `AUTHENTICATOR` 對應獨立 portal login。
- **Session 定義**：`session_id` client 產生；每次 app 開啟（cold start / tab reopen）或距離上一個 event **30 分鐘無活動**（GA4 standard）就開新 session。`session_heartbeat` 每 60 秒防止「開住 tab 唔郁」錯判。

---

## 4. Online Presence（founder 重點 #1、#3）

### 4.1 機制：重用現有 WebSocket presence pattern

`apps/api/src/messages/messages.gateway.ts` 已有 `handleConnect`/`handleDisconnect` + `presence` event + `lastSeenAt`。建議**擴展**（唔係取代）：

- Connect/disconnect 之外，每 60 秒收 `session_heartbeat`（WS 優先，連線已開住）更新 `PresenceState` 現況表：`user_id/anonymous_id → last_active_at`。
- **Online 定義**：`last_active_at` 喺 **2 分鐘內**（heartbeat 週期 60s 留一次 miss buffer）。
- **Guest online**：計，但分開列：`active_users_online`（member，可拆 buyer/seller/authenticator）vs `guests_online`（anonymous_id only）。直接回答 founder 重點 #2。
- **鑑定師 online 獨立計數**：`authenticator_online`/`authenticator_offline` scope 落 authenticator app，admin 出獨立 counter「XX 位鑑定師在線」（SLA capacity 有 business meaning，唔同普通 buyer online 混）。

### 4.2 Admin 呈現

- Real-time counter cluster（3 格）：`買家/賣家在線`、`Guest 瀏覽緊`、`鑑定師在線`。
- Admin console 用短 polling（5-10 秒 refetch aggregate）已夠，唔使 admin 自己開 WebSocket。

---

## 5. Journey / Funnel Tracking（founder 重點 #5）

### 5.1 原則

一條 journey = 同一 `session_id`（或經 `anonymous_id → user_id` mapping 嘅跨 session 長 journey）底下按 `occurred_at` 排序嘅所有 event。Admin console 要做到：

1. **搜一個 user_id / anonymous_id** → 完整 event timeline（chronological，唔使拼 SQL）。
2. **搜一個 order_id** → 條 order 嘅完整 lifecycle timeline（所有 `order_status_changed` transitions + 相關 `checkout_*` + `verdict_submitted` + `payout_*`）— dispute 排查神器。
3. **標準 funnel view**（預先定義，唔使 ad-hoc SQL）：
   - **購買**：`listing_viewed` → `checkout_started` → `checkout_delivery_selected` → `checkout_payment_confirmed` → `checkout_completed` → `order_status_changed(to=COMPLETED)`
   - **搜尋轉化**：`search_performed` → `search_result_clicked` → `listing_viewed` → `checkout_started` → `checkout_completed`
   - **賣家上架**：`sell_flow_started` → `sell_step_completed`(每步) → `listing_published`
   - **鑑定師接單**：`inbox_job_viewed` → `job_accepted` → `verdict_submitted`（連 `sla_breach` 做 miss rate）
   - **註冊轉化**：`session_started`(guest) → `user_signup` → 首個 `listing_viewed` 或 `sell_flow_started`

### 5.2 實作建議（high level）

- Funnel 唔靠即時 SQL join（效能），用 **hourly/nightly materialized aggregation table**（`funnel_snapshot`）；raw event explorer 先讀原始 event table。

---

## 6. Search Analytics（founder 重點 #4）

- `search_performed` 記 `query_raw` + `parseSearchQuery()` 輸出 → admin 答到「用戶打緊咩」+「parser 抽中幾多/漏咗幾多」（**parser miss rate = product signal**：`search.ts` 要唔要加新 brand/category alias）。
- **Zero-result query = supply gap 訊號**：`search_zero_result` 獨立 report「呢排 zero-result 最多嘅 query」，直接指導揀貨/招商。
- **Search → purchase conversion**：`search_result_clicked.query_id` → `listing_viewed.source=search` → 同 session `checkout_completed`。Admin 呈現四層漏斗：search 總數 → CTR → checkout rate → completion rate。

---

## 7. Data Model 建議（high level）

### 7.1 Event 儲存

- 新 Postgres table（同一 `authentik`/`authentik_uat` DB，跟現有 UAT/PROD 隔離）：`AnalyticsEvent`
  ```
  id            uuid PK
  event_name    text (indexed)
  event_id      uuid (unique, dedupe)
  occurred_at   timestamptz (indexed)
  received_at   timestamptz
  env           enum PROD | UAT
  portal        enum CONSUMER | AUTHENTICATOR | ADMIN
  anonymous_id  text (indexed)
  user_id       text nullable (indexed)
  role          enum
  session_id    text (indexed)
  page_path     text
  referrer      text nullable
  device        enum
  properties    jsonb
  ```
- 高 volume event（`session_heartbeat`、`page_view`）另開 table 或 down-sample（heartbeat 唔逐條存，只更新 `PresenceState` 現況表），避免 event table 爆量。
- **Ingestion**：`POST /analytics/events`（batched — client debounce 儲一批先送）。Fire-and-forget：失敗唔可以影響主 flow（client SDK catch + drop，唔 retry-block UI）。

### 7.2 Retention policy（PDPO）

| 資料類別 | Retention | 處理 |
|---|---|---|
| `query_raw`（search 原文） | 90 日 raw，之後 anonymize（拆走 id 連結，只留聚合詞頻） | Scheduled job |
| 一般 event（page_view/listing_viewed 等） | 12 個月 raw，之後 roll-up 月度聚合，raw 刪 | Scheduled job |
| `order`/`checkout`/`wallet` event | 對齊現有財務 record retention（dispute/審計需要） | 同 Order/PayoutRequest 同期 |
| `admin_action_taken` | 永久（audit trail） | — |
| IP address | 只喺 ingestion 層做 rate-limit/fraud，**唔寫入 event**、唔喺 dashboard 呈現個人層面 | — |

### 7.3 環境隔離

- `env` 必填；admin console **預設只睇 `PROD`**。UAT event 只用作驗收 tagging，唔係業務決策依據。

---

## 8. Admin Console 呈現（`apps/admin/app/analytics`）

現有 `analytics/page.tsx` 係 hardcoded stub — spec 落地後由真實 event 資料取代。頁面結構（high level）：

1. **Real-time 頂列（3 counter）**：買家/賣家在線、Guest 瀏覽緊、鑑定師在線（§4）。
2. **Guest vs Member 比例**：24h/7d/30d 切換。
3. **Top searches 表**：query 原文 + 次數 + avg result_count + zero-result flag；可切「本週 zero-result 排行」。
4. **Funnel 圖**（§5.1 五條，dropdown 揀）：每步 conversion %，斷崖流失 highlight。
5. **Raw event explorer**：搜 `user_id`/`anonymous_id`/`order_id`/`session_id` → chronological timeline，可 export CSV（dispute 排查）。
6. **North-star KPI**（MAU、GMV、Auth pass rate、SLA met、Dispute rate、Take rate）— 改由 event 聚合算出，唔再 hardcode。

---

## 9. Governance 規則（founder 重點 #7）

> 目標：**「以後每有新 feature，呢份 spec 必須跟住 update + 必須做 tagging」**，唔可以淪為一次性文件。

1. **Event registry 係 code 一部分**：`packages/utils/src/analytics-events.ts`（跟 `categories.ts`/`tier.ts` SSOT pattern）定義 event taxonomy 做 TypeScript const + type（event name union + properties interface）。三個 portal + API 都 import 呢個 SSOT，**唔准喺 page 自由 `track('random_name', {...})`**（lesson #8 catalog SSOT 原則套用到 event 命名）。
2. **新 feature PR checklist 新增**：
   - [ ] 新增/改動用戶可見互動？→ 本 spec 有冇對應 event？冇就先加。
   - [ ] Event 用咗 `analytics-events.ts` 型別（唔係 free-text string）？
   - [ ] 有冇 PII 風險（message 內容/敏感欄位）誤入 `properties`？
3. **Code review gate**：新 route/mutating action 冇對應 tracking = review blocker（同 ruling #16「destructive 冇 confirm」同級），寫入 `.claude/agents/code-reviewer` checklist。
4. **Spec 版本化**：每加 event/domain，本文件文末 Changelog 加一行（日期 + 觸發 feature）。Code 同 spec 必須同步。
5. **Founder review cadence**：**全新 domain** 先要 founder review taxonomy；同 domain 內加 event，engineer 照 pattern 直接加，PR tag 埋 spec 改動畀 founder 見到。

---

## 10. 分期建議

### MVP（Phase 1）

- Ingestion endpoint + `AnalyticsEvent` table + `packages/utils` event registry SSOT
- `session` domain 全部（presence 基礎）
- `search_performed` / `search_zero_result` / `search_result_clicked`
- `listing_viewed` / `checkout_started` / `checkout_completed` / `order_status_changed`（購買 funnel 骨幹）
- Online presence 3 counter（擴展 `messages.gateway.ts`）
- Admin `/analytics`：real-time counter + top searches + 購買 funnel + raw event explorer
- **Governance day 1 建立**（PR checklist + registry SSOT），唔可以事後補

### Phase 2

- 其餘 domain（`offer`/`im`/`wallet`/`auth_portal`/`admin`）全覆蓋
- 5 條標準 funnel 圖表化
- Zero-result 專頁報表 + retention/anonymize scheduled job
- Guest↔member 跨 session 長 journey view

### Backlog

- Postgres FTS search analytics（catalog 大先做）
- 真 event streaming（Kafka 等；volume 影響主 DB 先做）
- 進階 attribution（UTM/campaign ROI）

---

## Changelog

- 2026-07-20（checkout review+deadline，founder 5 rulings）：checkout domain 新增 4 event — `checkout_review_viewed` / `checkout_review_confirmed`（= 30 分鐘 `paymentDeadlineAt` 起點）/ `checkout_deadline_warning_shown`（<5 分鐘 toast）/ **`checkout_payment_expired`（首個 server-side event：cron `sweepPaymentExpired` 直接 insert AnalyticsEvent，唔經 client batch；founder ruling #5「入 registry」）**。買家過期率 = admin-only 指標，customer 不可見，將來可能用作 ban account 判斷（ruling #3）。

- 2026-07-14（chart + IA，founder 批 analytics-charts-ia-proposal.md）：admin `/analytics` 重組做 5 tab（總覽/交易健康/商品與搜尋/鑑定師營運/排查工具，real-time counter 逢 tab 顯示，per-tab lazy load）。新 chart：North-star KPI 卡（`GET /analytics/admin/north-star`：MAU/GMV/auth pass/SLA met/dispute/take rate）、付款後訂單去向（`/order-outcomes`）、funnel 按 tier 拆（`/funnel/purchase-by-tier`，tier 由 event props + salePriceHKD 推）、listing 表加訂單數+view→訂單轉化欄、鑑定師 SLA 健康度（`/sla-health`，authCompletedAt−receivedByAuthAt，紅線 48h）、zero-result 趨勢（`/zero-result-trend`，top 5 query 14 日 SVG multi-line）。全部用現有 event + Order table，冇新 event。

- 2026-07-14：初稿（DRAFT），涵蓋 founder 7 點原話要求，待 review。
- 2026-07-14（enhancement，founder 要求）：① 時間粒度 — admin `/analytics` 新增 activity chart（每小時近 48h / 每分鐘近 60 分鐘 30 秒自動更新，metric 可揀 page_view/sessions/searches/listing_viewed/checkout_completed；`GET /analytics/admin/timeseries`）。② 每 listing view 數 + 平均停留時間 — 新 event `listing_view_ended`（browse domain，dwell_seconds clamp 30 分鐘）+ admin「Listing 表現」表（views / 獨立訪客 / 平均停留；`GET /analytics/admin/listings`）。
- 2026-07-14：founder 拍板「先做 MVP」。MVP 落地：`packages/utils/src/analytics-events.ts` registry、`AnalyticsEvent`/`AnalyticsIdentityLink` schema、`POST /analytics/events` + admin query endpoints、consumer/authenticator client SDK、admin `/analytics` dashboard。UAT 驗證通過（search event 落地 + dashboard 真數據 + explorer timeline）。Deviation from spec：`order_status_changed` server-side instrumentation 延後 Phase 2（orders.service 47 個 status write 冇 central transition helper，要先重構）；購買 funnel「訂單完成」步暫時直接查 Order table。

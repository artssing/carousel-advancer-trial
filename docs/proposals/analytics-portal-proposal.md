# Analytics Portal 方案

> Status: **Draft — 待 Founder 拍板**
> Created: 2026-06-03

---

## 技術方案：PostHog (Self-hosted) + Prisma 直查 + Recharts

| 層 | 工具 | 負責 |
|---|---|---|
| 行為事件追蹤 | PostHog（Docker 自建，HK server） | 頁面瀏覽、搜尋、funnel 點擊 |
| 財務 KPI | Prisma / PostgreSQL aggregate | GMV、收入、完成率 |
| Dashboard 展示 | `apps/admin` 新增 `/analytics` 路由 | 統一入口 |
| 圖表 | Recharts（MIT，Next.js 友好） | 折線圖、漏斗、bar chart |

PostHog 選擇理由：開源、可 self-host（HK VPS，PDPO 合規）、event autocapture、Session Replay、Funnel 分析，對標 Mixpanel，月費 $0 起。

---

## 追蹤指標

### Traffic（PostHog）
- DAU / MAU、Session Duration、Bounce Rate
- 搜尋關鍵字 Top 20（`search_submitted` event）
- 品類瀏覽分佈、零結果搜尋率

### Conversion Funnel（PostHog）
```
listing_viewed → delivery_method_selected → authenticator_selected
→ payment_method_selected → order_created → payment_confirmed → order_completed
```
可按 Tier / 品類 / 交收方式切片分析。

### Revenue（Prisma 直查）
- GMV（30d rolling）、平台費收入、鑑定費收入
- 品類 GMV 分佈、平均訂單價值 (AOV)

### Authenticator 表現（Prisma 直查）
- 平均鑑定時間：`AVG(authCompletedAt - receivedByAuthAt)`
- SLA 達標率（<48h）、通過率、爭議率
- 收入排行、按品類表現

### Operational（Prisma 直查）
- 面交 vs 寄送比例、OFFLINE_CASH vs ONLINE_ESCROW 比例
- 訂單各環節停留時間、AUTH_FAILED 率
- Tier 3 訂單放棄率

---

## 6 個 Dashboard 頁面

### 1. Overview 總覽
- 4 格 Hero KPI：今日 GMV / 本月 GMV / 活躍訂單 / 平台收入
- 30 天 GMV 折線圖 + 訂單狀態 donut
- 品類銷售佔比 + 需要關注事項 Alert Panel

### 2. User Analytics 用戶分析
- DAU/MAU 趨勢（買家 vs 賣家 vs 鑑定師）
- KYC 狀態漏斗、新 vs 回頭用戶比例
- 搜尋關鍵字 Word Cloud
- 用戶地區分佈（香港 18 區 heat map，`react-simple-maps`）

### 3. Revenue & Orders 訂單/收入
- Tab A 收入：GMV 趨勢（按 Tier 分層）、收入來源分拆、品類 breakdown
- Tab B 訂單流量：成交率、流失分析、AUTH_FAILED 趨勢
- Tab C 價格分佈：histogram、Tier 比例

### 4. Authenticator Analytics 鑑定師分析
- 全局：平均鑑定時間、SLA 達標率、通過率/失敗率
- 排行表格（可排序）：鑑定師 / 完成數 / 通過率 / 鑑定時間 / 收入
- 個人詳情：月度收入趨勢、品類分佈、評分趨勢
- SLA 壓力熱圖（星期 × 小時）

### 5. Funnel Analysis 漏斗分析
- 主漏斗 7 步（PostHog data）
- 可按品類 / Tier / 交收方式 / 付款方式切片
- 每步 drop-off 分析 + 停留時間

### 6. Real-time Ops 實時監控
- 進行中訂單（按 status breakdown）
- 今日新訂單/付款完成（每小時 bar）
- AUTHENTICATING 訂單 SLA 倒計時（紅/黃/綠）
- Alert Feed：超 SLA / AUTH_FAILED / DISPUTED / 新鑑定師申請

---

## Event Tracking 埋點位置

### Client-side（PostHog JS SDK）
- `apps/consumer/app/layout.tsx` — init + `$identify`
- `apps/consumer/app/browse/page.tsx` — `search_submitted`, `category_filter_applied`
- `apps/consumer/app/listing/[id]/page.tsx` — `listing_viewed`, `delivery_method_selected`, `authenticator_selected`, `payment_method_selected`, `order_created`
- `apps/authenticator/app/authenticate/[orderId]/page.tsx` — `verdict_submitted`

### Server-side（PostHog Node SDK）
- `orders.service.ts` `markPaid()` — `payment_completed`
- `orders.service.ts` `submitVerdict()` — `auth_verdict_submitted`
- `orders.service.ts` `completeOrder()` / `completeMeetup()` — `order_completed`

---

## API Endpoints

```
GET /analytics/overview              Hero KPIs
GET /analytics/revenue?range=30d     時序收入
GET /analytics/funnel                漏斗轉化率
GET /analytics/authenticators        鑑定師表現表格
GET /analytics/authenticators/:id    個人詳情
GET /analytics/orders/heatmap        訂單時段分佈
GET /analytics/ops/realtime          實時監控
GET /analytics/listings/price-dist   價格分佈
GET /analytics/categories/breakdown  品類 GMV
```

---

## 分期

### MVP（2-3 週）
1. Admin `/analytics` 頁（Overview Dashboard）
2. API `analytics.module` + 4 endpoint：overview / revenue / authenticators / realtime
3. PostHog 埋點：pageview / listing_viewed / order_created / order_completed（server-side）
4. Recharts：GMV 折線 + 品類 bar + 狀態 donut
5. SLA 燈號實時監控

### Phase 2（4-6 週後）
1. Funnel Dashboard
2. 用戶分析頁（DAU/MAU、搜尋 Top 20）
3. 鑑定師個人詳情 + 評分趨勢
4. 價格分佈 histogram
5. 時間範圍選擇器（7d/30d/90d/自訂）
6. CSV 匯出

### Backlog（AI/ML）
- 異常偵測：鑑定師通過率突降
- 需求預測：按品類/節假日預測成交量
- 詐騙風險評分
- 動態定價建議
- 鑑定師配對優化

---

## npm 依賴

- `posthog-js`（consumer app）
- `posthog-node`（api app）
- `recharts`（admin app）
- `react-simple-maps`（admin app，Phase 2）

---

## PDPO 合規

- PostHog self-hosted 於 HK VPS，數據不出境
- User ID 用 cuid hash，不傳 email/姓名
- Admin analytics 需要 SUPER_ADMIN / OPS_ADMIN role
- 財務數據用 server `Order.totals.*` rounding

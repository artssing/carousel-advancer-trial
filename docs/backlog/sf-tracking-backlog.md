# SF Express 物流追蹤整合 — Backlog（2026-07-10 founder request）

> Founder ask：platform 記低 SF 資料，直接由 SF 攞到「單去到邊」實時狀態。
> 現狀：Ack v2 已儲 `sellerShipTrackingNo` / `authShipTrackingNo`（SF 單號），但只係文字，冇 live 狀態。

## 技術可行性 — 做到，三條路

### Phase 0（零成本，即刻可做）：Deep link 去 SF 官網
- 訂單頁個 SF 單號變 clickable，直開 SF HK 查件頁（帶單號）
- 冇 API、冇帳號、零成本；缺點：跳出 app，狀態唔入 DB

### Phase 1（正路）：SF 官方「丰橋」開放平台
- SF 官方 developer platform（open.sf-express.com），有 **路由查詢 API**（畀單號攞完整 tracking 事件）+ **路由 push webhook**（狀態變自動推畀我哋，唔使 poll）
- 有 7×24 sandbox 可以免費測
- **要件**：要註冊 developer + 一般要有 SF **月結帳號（顧客編碼 + 校驗碼做 auth）** — 即係公司要開 SF 商業帳戶先用到 production。呢個就係「platform 記低 SF 帳號」嘅位：帳號係**平台級**（一個），唔係每個賣家自己嘅
- 好處：免 per-query 費（帳號客戶）、官方數據最準最快

### Phase 2 alternative（快 launch）：第三方 aggregator
- AfterShip（香港公司，SF 官方 partner）/ TrackingMore / Tracktry — 淨係畀單號就查到，唔使 SF 帳號
- REST API + webhook，接入半日搞掂；收費 per-tracking（大約每單幾毫到一蚊港紙級別）
- 適合 SF 月結帳號未開好之前頂住先

## 同 Ack v2 嘅協同（真正價值）

1. **T+3 tracking-aware auto-complete**（Coordinator R1 建議，founder 已認可方向）：sweep 前查 SF 狀態 — 未派到自動延長，唔會貨未到就 complete
2. 訂單頁顯示「運送中 · 已到分揀中心 · 派送中」timeline，買賣家唔使自己去 SF 查
3. 「賣家話寄咗但冇寄」— webhook 冇 pickup 事件 X 日 → 自動提醒/flag admin
4. 爭議處理：admin disputes 頁直接見到 SF 事件史做證據

## 建議落地次序

| 期 | 內容 | 前置 |
|----|------|------|
| **P0** | 單號 deep link 去 SF 查件頁 | 冇 — 一個 component 改動 |
| **P1** | 開 SF 月結帳號 → 丰橋 developer 註冊 → sandbox 接路由查詢 + push webhook | **Founder 要去開 SF 商業帳戶**（行政動作，技術等佢） |
| P1.5 | Tracking-aware T+3（sweep 查狀態先完成） | P1 |
| 替代 | AfterShip per-tracking 頂住（如 SF 帳號開得慢） | 開 AfterShip 帳號 + API key |

## Schema 預想（P1 時先郁）

- `PlatformConfig` 存 SF credentials（顧客編碼 + 校驗碼 — **secret，唔可以入 git**，行 .env / config）
- 新 `ShipmentEvent` model（orderId, trackingNo, status, eventAt, raw Json）承接 webhook
- Order 加 `lastTrackingStatus` denormalized 欄位方便 list 頁顯示

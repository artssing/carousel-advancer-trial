# Admin Analytics — Chart + IA 重組 Proposal

> Status: **APPROVED — founder 2026-07-14 批「tab 重組先 → A1 六個 chart（High 四個先）」；已全部落地 + UAT 驗證**（A2 留待 taxonomy review）
> Date: 2026-07-14
> Author: project-coordinator
> 前置：analytics MVP + timeseries/dwell enhancement 已上線（見 analytics-tagging-spec.md）

## Part A — 新 Chart（分兩批）

### A1. 現有數據即刻做到（唔使加 event）

| # | Chart | 睇咩問題 | Actionable | Priority |
|---|---|---|---|---|
| A1-1 | 購買 Funnel 按 **tier 拆**（3 條並列） | Tier 3 強制鑑定係咪嚇走買家（completion rate 對比） | Tier 3 明顯低 → 優化 fee 透明度文案 | **High** |
| A1-2 | Listing 表現表加 **view-to-checkout conversion 欄**（color code） | 邊件貨高 view 冇轉化 / 高轉化 | 揀 feature 候選；揪定價/描述問題通知賣家 | **High** |
| A1-4 | **Order 最終狀態分布**（stacked bar/donut：COMPLETED vs AUTH_FAILED vs DISPUTED vs REFUNDED，直查 Order table） | 付款之後啲單最終去咗邊 — 鑑定承諾有冇兌現 | AUTH_FAILED 高 → 鑑定師質素排查；Dispute 高 → 邊個 delivery method 出事 | **High** |
| A1-5 | **鑑定師 SLA 健康度**（bar per authenticator，紅線 48h；直查 Order/Authenticator table） | 邊個鑑定師拖 SLA | admin 主動關注/暫緩派單依據 | Medium-High（要核實 schema 時間戳欄位） |
| A1-3 | Zero-result search **trend**（top 5 query multi-line） | Supply gap 係咪持續/惡化 | 持續 7 日 zero-result = BD 招商方向 | Medium |
| — | **North-star KPI 卡**（MAU/GMV/Auth pass rate/SLA met/Dispute rate/Take rate — spec §8 承諾但未落地，要新聚合 API） | 平台整體健康 | 總覽 tab 核心 | **High** |

### A2. 要加新 event（Phase 2 domain，governance：全新 domain 要 founder review）

| # | Chart | 要 wire 嘅 domain | Priority |
|---|---|---|---|
| A2-6 | Offer 議價漏斗 + 平均輪數 histogram | `offer` domain | Medium |
| A2-7 | 鑑定師 inbox→accept→verdict 漏斗 + P50/P90 | `auth_portal` domain | Medium |
| A2-9 | Order 完整 state timeline（dispute 排查） | `order_status_changed`（要 orders.service central helper 重構，**另立項目**） | Medium |
| A2-8 | IM 訊息量 vs 成交率 scatter（唔記內容，PDPO OK） | `im` domain | Low |
| A2-10 | Retention cohort heatmap（30/60/90 日） | 要 scheduled job infra | Low-Medium |

## Part B — IA 重組：單 route 5 個 tab

```
/analytics
 ├─ Tab 1 總覽 Overview（日常 3 秒判斷）：3 online counter、guest/member、activity timeseries、North-star KPI 卡
 ├─ Tab 2 交易健康：購買 funnel（+tier 拆）、order 最終狀態分布、dispute/refund trend；(P2: offer 漏斗)
 ├─ Tab 3 商品與搜尋：listing 表現(+conversion)、top searches、zero-result trend
 ├─ Tab 4 鑑定師營運：SLA 健康度、鑑定師在線；(P2: auth_portal 漏斗)
 └─ Tab 5 排查工具：raw event explorer；(P2: order 完整 timeline)
```

理由：①日常掃 vs 出事先開嘅 deep-dive 分離；②tab 對應決策角色（業務/選品/鑑定師管理）；③Phase 2 全部預留咗位，唔使將來重整；④全 internal、無個人 PII 圖表（紅線 OK）。

實施成本：tab 重組 = UI-only 搬家（現有 7 個 block 原封不動分組）；A1 chart 大多係現有 endpoint 加 group-by / 前端聚合；唯一要新後端邏輯 = North-star KPI 聚合 API。

## 建議執行次序

1. IA tab 重組（先做，後面有位擺）
2. A1-4 order 狀態分布 → A1-1 tier funnel → A1-2 conversion 欄 → North-star KPI 卡 → A1-5 SLA → A1-3 trend
3. A2 新 domain（offer/auth_portal/im）留返獨立 session 過 taxonomy review 一齊 wire

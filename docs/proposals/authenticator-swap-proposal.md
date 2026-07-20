# 換鑑定師 Consent Flow — Proposal（DRAFT，待 founder 拍板）

> 2026-07-20 coordinator 出稿。背景：founder ruling「准換，但買賣雙方都要同意」。
> 未實作 — 下面 G 段 5 個 decision point 拍板後先開工。

## A. 准換窗口

**准**：`AWAITING_PAYMENT` → `PAID`（Payment 仲係 AUTHORIZED hold，未 capture）。
**唔准**：capture 之後 / custody 已發生（鑑定師收咗實物 = 具名責任鏈已開始，唔可以中途轉移；亦防「唔滿意初步判斷就換人」後門）。
T3 唔可以換到「無鑑定師」；T2 可以移除鑑定師（UI 文案分開：「唔要鑑定」≠「換人」）。

## B. Flow

- 發起：買家或賣家都可以（鑑定師唔可以發起，但新舊鑑定師都收唯讀通知）
- 機制：仿 Offer propose→accept/reject pattern，新 model `AuthenticatorChangeRequest`（orderId, fromUserId, old/newAuthenticatorId, newBranchId?, status, expiresAt）
- 對方 accept 用 `<ConfirmDialog>`（列明新舊鑑定師 + 費用差額 + 新分店地址）
- 24 小時冇回應自動 EXPIRED；發起方可撤回；同一 order 同時只准一個 PENDING request
- 系統訊息落 THREE_WAY conversation + WebSocket broadcast（lesson #12）
- 鑑定師唔使同意（同落單一致），但 accept 嗰刻 server 重新驗證新鑑定師 `ACTIVE`

## C. 費用差價

| 情況 | 處理 |
|---|---|
| AWAITING_PAYMENT | 直接 server 重算 `calculateOrderFees` 覆寫 totals |
| PAID + OFFLINE_CASH | 覆寫 totals，meetup 現場俾新金額 |
| PAID + ONLINE_ESCROW (AUTHORIZED) | void 舊 hold → 用新 totals 開新 hold（買家可能要重做 3DS — dialog 要講明） |
| 已 CAPTURED | 唔准換（同 custody 掛鉤） |

刻意唔做「差價找數/部分退款」— 窗口設計保證永遠改緊未落實嘅金額。

## D. UI

入口 = Order 詳情頁鑑定師卡旁「申請換鑑定師」（IM 只做通知，唔做表單）；pending banner 同 Offer 同一 visual language；鑑定師 picker 重用現有 component（algorithm-derived 星級）。

## E. Edge cases

新鑑定師 accept 前 SUSPENDED → 自動 reject + 解釋；meetup 單強制重揀新分店 + dialog 顯示新地址；換完可再換（每次全套 flow，audit trail 全留，建議 3 次後轉客服）；T3 移除鑑定師 propose 一步就擋；未 custody 就換走嘅單唔入舊鑑定師任何統計。

## F. Analytics（新 domain `order` — 要 founder review 先落 registry）

`auth_change_requested` / `auth_change_accepted` / `auth_change_rejected` / `auth_change_expired` / `auth_change_cancelled`

## G. 待拍板

1. 窗口界線「capture 前准、capture 後唔准」接唔接受
2. ONLINE_ESCROW 換人要買家重做 3DS 授權 — 體驗成本接唔接受（差額授權複雜好多，建議唔做）
3. 連續換人軟上限 3 次後轉客服 — 鬆緊啱唔啱
4. Timeout 24 小時（跟 Offer 一致）定 T3 高價單縮短
5. `order` domain analytics events 批唔批

# 鑑定師帳戶生命週期 + 治理 — Proposal（2026-07-08 Coordinator）

> Founder ask：全方位 authenticator registration flow — 申請 / approve / 改權限 / manager / remove-ban / 邀請機制。

## 現狀基礎（地基已對）

- `AuthenticatorStatus` enum 已係 `PENDING / ACTIVE / SUSPENDED / REMOVED` — 同狀態機吻合，唔使改
- `Authenticator.storeName` 已存在 — schema 已支援「店」概念，只欠 staff 帳戶
- Admin 已有兩級 RBAC（`requireAdmin` / `requireOpsAdmin`）+ `AdminAction` audit log — 全部沿用，唔起第二套
- `/onboarding` 5-step wizard UI 已做齊但**零 backend** — 現存最大 gap

## 1. 申請 — Open + Invite 雙軌，invite 唔跳審批

- Open application：`/onboarding` 保持公開（主增長渠道）
- Invite：admin 生成（BD 外展）+ ACTIVE 鑑定師 referral code（純 tracking / 未來獎勵，**冇審批捷徑** — 防 collusion + 保持中立姿態）
- 交件：KYC、專長 category、年資、資歷文件、店舖/分店、E&O 保險證明+到期日、自訂 fee rate

## 2. 審批 — 新 model `AuthenticatorApplication`

```
SUBMITTED → NEEDS_MORE_INFO → SUBMITTED
SUBMITTED → APPROVED（建 Authenticator row ACTIVE + User roles 加 AUTHENTICATOR）
SUBMITTED → REJECTED（終態；可重新申請=新 row，舊留底 audit）
SUBMITTED → WITHDRAWN
```

- `OPS_AGENT` 睇 queue；`OPS_ADMIN+` 先可以 approve/reject（跟 KYC queue pattern）
- Vetting checklist：身份、E&O 有效期、資歷 vs category、fee rate 對照基準
- **Copy 必寫**：「審核只核實身分與資歷真確性，唔代表平台為鑑定結果背書」（L'Oréal v eBay）
- Audit：`AdminAction` `authenticator.approve` 等字串值

## 3. 權限管理

| 變更 | 觸發 | 機制 |
|---|---|---|
| 加 category 專長 | 鑑定師 | 交資歷 → mini-review queue |
| 減 category | 鑑定師 | 即時生效 |
| Fee rate | 鑑定師 | 即時生效；偏離基準 >2x flag 事後 review（AI monitor = backlog） |
| Tier 3 資格 | — | 唔加獨立 gate（ACTIVE 即合資格，避免管理負擔） |
| Active ↔ Suspended | Admin OPS_ADMIN+ | 見 §5 |

## 4. Manager — 建議「店內 staff role」（唔係 platform account manager）

新 model `AuthenticatorStaff`：一個 `Authenticator`（對外具名責任主體）下多個登入帳戶：
- **OWNER** — 原申請人，E&O 簽約人，法律最終責任；唔可被移除，轉移要 admin 介入
- **MANAGER** — OWNER 邀請；管分店、邀請/移除 STAFF、睇 earnings；唔可改 fee rate / E&O
- **STAFF** — 只做鑑定工作台（queue / 上傳證據 / 落 verdict）

**星級 / completedCount / disputeRate 掛喺店（Authenticator）層面** — 對外單一具名責任主體，符合中立姿態。Order 加 `submittedByStaffId` 內部追蹤（唔對外顯示）。

Platform-side account manager（BD/CRM 跟進）明確排除 — `AdminAction` note 已夠。

## 5. Remove / Ban / 自願離開

```
PENDING → ACTIVE / ACTIVE → SUSPENDED（可逆，admin 或自願暫停接單）
SUSPENDED → ACTIVE / ACTIVE|SUSPENDED → REMOVED（終態：ban 或自願退出）
```

**In-flight orders（最重要 edge case）**：
- Suspend/Remove 唔自動影響 IN_PROGRESS 單（escrow 已 hold）；新單 server 只揀 ACTIVE
- 舊單 admin 手動：(a) reassign 或 (b) `order.forceRefund`（現有 AdminAction）
- 自願退出：server block 直至無未完成單；UI 明示「你仲有 N 張未完成單」
- **歷史必留底**：REMOVED 只 flip status 唔刪 row；公開 profile 唔可以 404 — 顯示「已終止服務」+ 過往評價/完成數照顯示

## 6. 邀請機制 — 新 model `AuthenticatorInvite`

`code` / `createdByUserId` / `createdByType(ADMIN|REFERRAL)` / `targetEmail?` / `expiresAt`(14日) / `maxUses`(1) / `usedCount` / `status(ACTIVE|EXPIRED|REVOKED)`。落地：`/onboarding?invite=CODE` 預填 + 顯示「透過邀請加入」，審批流程不變。

## Admin Portal UI Scope

1. 鑑定師申請 queue（抄 kyc-queue pattern）— approve / reject / 需補交 + reviewer note
2. 鑑定師名單（抄 admin/users pattern）— filter by status/category，detail drawer（profile+分店+staff+AdminAction 史）
3. Drawer actions：Suspend / Unsuspend / Remove（OPS_ADMIN+ 先見）
4. Invite 管理：生成 / 列出 / revoke

## Schema Impact（名，唔寫 code）

- 新 `AuthenticatorApplication` / `AuthenticatorStaff` / `AuthenticatorInvite`
- `Order.submittedByStaffId?`
- `AuthenticatorStatus` **不變**
- `AdminAction.action` 加 `authenticator.*` 字串值

## Phasing

**MVP（Phase 3 延伸）**：Application model + admin 審批 queue + wizard 接 backend、Suspend/Remove + in-flight 阻擋、REMOVED 公開頁顯示
**Later**：`AuthenticatorStaff` 多帳戶（規模細可後延）、Invite referral 獎勵、fee AI monitor

## 待 Founder 拍板

- ✅/❌ Manager = 店內 staff role（Coordinator 建議）vs platform account manager — **schema 完全唔同，必須先拍板**
- MVP 分期接唔接受（staff 概念延後）

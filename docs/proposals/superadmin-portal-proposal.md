# Superadmin Portal 方案

> Status: **Draft — 待 Founder 拍板**
> Created: 2026-06-03

---

## 現狀

`apps/admin`（port 3002）已有骨架：8 個 sidebar nav、8 個頁面，但**全部 stub 數據，完全冇接 API**。Schema 已有 `OPS_AGENT` / `OPS_ADMIN` / `SUPER_ADMIN` 三個 admin 角色，但 API 層冇任何 admin-gated endpoint。

---

## 需要管理嘅功能

### 高頻（每日）
- SLA 監控：鑑定超時預警
- 爭議跟進：DISPUTED 訂單處理
- 內容審核：商品下架

### 中頻（每週）
- 鑑定師申請審批：PENDING → ACTIVE / 拒絕
- E&O 保險到期警報：30/14/7 天提醒，逾期自動 SUSPEND
- 用戶封號/解封

### 低頻（每月）
- 財務對帳：escrow balance、平台收入、鑑定師 payout
- 數據匯出 CSV
- 平台設定（費率等）

---

## 頁面結構（8 頁）

### 1. Overview Dashboard
- 4 格 KPI：Active listings / 本月 GMV / SLA 達標率 / Open disputes
- SLA Watch block：超時預警訂單列表（紅/橙/綠燈號）
- 新申請 block：PENDING 鑑定師

### 2. Authenticators 鑑定師管理（重點）
- Tab：全部 / PENDING / ACTIVE / SUSPENDED / 保險即將到期
- 詳情頁：三步驟 stepper（基本資料核實 → 文件審核 → 批准決定）
- 操作：批准 / 暫停 / 恢復 / 永久移除
- **starRating / completedCount / disputeRate 只讀不可手改**（法律要求）

### 3. Users 用戶管理
- 搜尋（email / displayName）
- KYC 手動核實（Stage 1 workaround）
- 封號/解封（需填理由）
- Schema 加 `bannedAt: DateTime?`

### 4. Orders 訂單管理
- 篩選：狀態/日期/鑑定師
- 詳情頁：完整 timeline（8 個 timestamp）
- Admin override：強制退款 / 釋放 escrow / 下架關聯 listing

### 5. Disputes 爭議管理
- 需要新增 `Dispute` model（stage / assignedOps / notes）
- 6 個 stage：AWAITING_REVIEW → CONTACTING_AUTH → SECOND_OPINION → ESCALATED → RESOLVED
- 三欄 layout：事實紀錄 / ops 工作紀錄 / 可用行動

### 6. Finance 財務
- Escrow balance / 待 payout / 平台收入
- 鑑定師 payout 列表 +「標記已付款」
- 交易紀錄 + CSV 匯出

### 7. Content Review 內容審核
- 審核佇列：AI 標記 / 人工舉報
- 批准 / 下架（需填理由）

### 8. Analytics
- 6 格 KPI 接真實 aggregate query
- CSV 匯出（向投資者 reporting）

---

## 權限矩陣

| 操作 | OPS_AGENT | OPS_ADMIN | SUPER_ADMIN |
|------|-----------|-----------|-------------|
| 查看 Dashboard/Users/Orders | ✅ | ✅ | ✅ |
| 封號/解封 | ❌ | ✅ | ✅ |
| 鑑定師審批/暫停 | ❌ | ✅ | ✅ |
| 鑑定師永久移除 | ❌ | ❌ | ✅ |
| 強制退款 | ❌ | ✅ | ✅ |
| Finance 查看/payout | ❌ | ✅ | ✅ |
| Analytics/CSV 匯出 | ❌ | ✅ | ✅ |
| 平台設定 | ❌ | ❌ | ✅ |
| 內容下架 | ✅ | ✅ | ✅ |

---

## API Endpoints（全部 `/admin` prefix + RolesGuard）

### 鑑定師
```
GET    /admin/authenticators?status=PENDING
GET    /admin/authenticators/:id
PATCH  /admin/authenticators/:id/status   { status, notes }
GET    /admin/authenticators/eo-expiring?days=30
```

### 用戶
```
GET    /admin/users?q=&kyc=
PATCH  /admin/users/:id/ban              { reason }
PATCH  /admin/users/:id/unban
PATCH  /admin/users/:id/kyc              { status }
```

### 訂單
```
GET    /admin/orders?status=&from=&to=
GET    /admin/orders/:id
PATCH  /admin/orders/:id/force-refund    { reason }
PATCH  /admin/orders/:id/release-escrow
```

### 商品
```
PATCH  /admin/listings/:id/remove        { reason }
PATCH  /admin/listings/:id/flag
```

### 爭議
```
GET    /admin/disputes?stage=
POST   /admin/disputes/:id/notes
PATCH  /admin/disputes/:id/stage
PATCH  /admin/disputes/:id/resolve       { outcome, notes }
```

### 財務
```
GET    /admin/finance/summary
GET    /admin/finance/payouts
PATCH  /admin/finance/payouts/:authId/mark-paid
GET    /admin/analytics/export?from=&to=  (CSV)
```

---

## Schema 補充

### Dispute Model（新增）
```prisma
model Dispute {
  id            String        @id @default(cuid())
  orderId       String        @unique
  order         Order         @relation(...)
  reason        String
  stage         DisputeStage  @default(AWAITING_REVIEW)
  assignedOpsId String?
  notes         DisputeNote[]
  outcome       String?
  createdAt     DateTime      @default(now())
  resolvedAt    DateTime?
}

model DisputeNote {
  id        String   @id @default(cuid())
  disputeId String
  authorId  String
  content   String
  createdAt DateTime @default(now())
}

enum DisputeStage {
  AWAITING_REVIEW
  CONTACTING_AUTH
  SECOND_OPINION
  ESCALATED
  RESOLVED_REFUNDED
  RESOLVED_CONFIRMED
}
```

### User Model 加
```prisma
bannedAt DateTime?
```

---

## 分期

### MVP（2-3 週）
1. Admin 登入頁（JWT 驗 admin role）
2. `RolesGuard` middleware
3. Authenticators 頁接真實 API（列表 + 暫停/批准）
4. Overview SLA Watch block 接真實數據
5. E&O 到期高亮

### Phase 2
1. Users 管理（搜尋 + 封號 + KYC）
2. Orders 詳情 + 強制退款
3. Dispute model + 完整爭議頁
4. Finance 接真實 aggregate + CSV 匯出
5. Content Review 審核佇列
6. Audit log（所有 admin 操作記錄）

### Backlog
- Analytics 圖表
- 平台費率設定頁
- 批次操作
- Email 通知 trigger
- Admin 2FA

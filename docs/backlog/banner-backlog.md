# Emergency Banner — Phase 2 Backlog

> Phase 1（emergency banner core：CRUD + 3 severities + audience + 60s polling + admin portal page）於 2026-06-30 完成。以下係 project-coordinator 建議、暫緩 Phase 2 items。用嘅時候由此文件重新啟動 planning。

## 1. OPS_AGENT approval flow

**問題**：而家 `OPS_AGENT / OPS_ADMIN / SUPER_ADMIN` 全部可以直接 publish banner，無 second-eye check。緊急文案容易錯（typo、法律 wording 不當、audience 揀錯）。

**建議**：
- `OPS_AGENT`：可以 CREATE + EDIT 但 status 只能係 `DRAFT`
- `OPS_ADMIN / SUPER_ADMIN`：可以 approve DRAFT → ACTIVE
- 額外 status column: `DRAFT | PENDING_REVIEW | ACTIVE | INACTIVE`
- Admin UI 加「待審批」tab 同 `[批准] [退回]` action button

**Effort**：schema 加 status field，API 加 approve endpoint，admin UI 加 tab + action buttons。約 1 個 dev day。

## 2. BannerAuditLog model

**問題**：多個 admin 一齊 manage banners，冇 trail 見到「邊個幾時 publish 咩」，出事後 root cause 難查。

**建議 schema**：
```
model BannerAuditLog {
  id        String       @id @default(cuid())
  bannerId  String
  actorId   String       // User.id
  action    String       // CREATE | UPDATE | ACTIVATE | DEACTIVATE | DELETE
  before    Json?        // snapshot before change (null on CREATE)
  after     Json?        // snapshot after change (null on DELETE)
  createdAt DateTime     @default(now())

  banner    Banner       @relation(fields: [bannerId], references: [id])
  actor     User         @relation(fields: [actorId], references: [id])
}
```

Admin UI 加 「Banner 詳情」入面一個 timeline component 顯示歷史 change diff。

**Effort**：schema + service transaction 每次 mutation 寫入 log + timeline UI。約 1 dev day。

## 3. `messageEn` fallback（雙語）

**問題**：Phase 1 只支援繁中。tourist / expat 買家見唔明重要 emergency 訊息。

**建議**：
- Banner 加 `messageEn String?`（nullable，admin 選填）
- Consumer app 讀取 `navigator.language` 判斷 fallback：`zh-*` → `message`，其他 → `messageEn ?? message`
- Admin form 加第二個 textarea「English message (optional)」

**Effort**：schema + form + consumer language detect。約 0.5 dev day。

## 4. WebSocket push（sub-10s latency）

**問題**：Phase 1 用 60s polling。真正緊急（例如活躍嘅詐騙攻擊）60s 可能太慢。

**選項**：
- **A. 擴 existing `/chat` socket namespace** — 需要 unauthed 用戶都連得到，破壞現有 auth model
- **B. 新開一個 `/system` public namespace**（唔需 JWT），只 broadcast banner events — cleaner，但要多開一個 gateway module
- **C. Server-Sent Events (SSE)** — HTTP 單向，唔使 WebSocket。`GET /banners/stream` keep-alive。呢個係最簡單方案。

**建議揀 C（SSE）**：無需 socket infra，unauthed 用戶接得到，`EventSource` browser API 原生支援。

**Effort**：新 SSE endpoint + banner service publish event on mutation + client `EventSource` connect / auto-reconnect。約 1.5 dev day（含 fallback poll for older browsers）。

## 5. Promo strip system（獨立 feature，唔共用 Banner model）

**問題**：Founder 未來可能想 push 「新用戶首單九折」/「Rolex 專場」等 promotional strips。Coordinator ruling：promo strips 需要 audience segment / A/B / conversion tracking，同 emergency banners 混一起會 muddle model。

**建議獨立 model**：
```
model PromoStrip {
  id            String
  headlineHtml  String        // 有限 HTML（<strong>）
  ctaText       String
  ctaHref       String
  audience      SegmentJson   // 複雜條件：new_user / has_purchased / tier_x_buyer / ...
  variant       String?       // for A/B ("A" | "B" | null)
  startsAt      DateTime
  endsAt        DateTime
  clickCount    Int           @default(0)
  impressions   Int           @default(0)
  ...
}
```

Placement 亦不同：promo strip 通常喺 home page hero 下方，唔係全站 sticky top。

**Effort**：完整 feature，1 sprint。屬於 P2 growth marketing 而唔係 P1 platform reliability，暫緩。

## 6. DB-persistent dismiss（跨裝置 sync）

**問題**：Phase 1 用 localStorage 記低 dismissed banners。用戶換裝置後又見返。critical banners（詐騙警告）用戶睇完唔會想再見到。

**建議**：
- 新 table `UserBannerDismiss (userId, bannerId, dismissedAt)`
- 用戶登入時 `GET /banners?includeDismissed=false` 由 server side 過濾
- Unauth 用戶仍然用 localStorage（唔變）

**Effort**：0.5 dev day。等 Phase 1 usage stats 見到有多少 user 抱怨先值得做。

## 7. Rich content（link inside banner）

**問題**：Phase 1 純 plain text。有時候 admin 想寫「詳情請按此」加超連結。

**建議**：schema 加 nullable `actionUrl String?` + `actionText String?`（例：「查看詳情」）。UI render 一個 inline button 而唔係 raw HTML anchor，避免 XSS。

**Effort**：0.5 dev day。

## 8. Impression / dismiss analytics

**問題**：admin 唔知每條 banner 有幾多用戶睇過、有幾多人 dismiss。

**建議**：Phase 1 已埋 `impressions Int @default(0)` field（TBD 需要 schema 補），consumer 用 `POST /banners/:id/impression` beacon 上報一次（per session）。Admin UI 顯示 impression + dismiss rate。

**Effort**：1 dev day。

---

## 開始 Phase 2 嘅時候

1. 確認 Phase 1 已 stable 一段時間（至少 2 星期實際 admin 使用）
2. 由呢文件揀項目，如未過期，spawn coordinator 再 refine 一次（產品需求可能變）
3. 更新 schema.prisma 前 review 現有 Banner model 有冇需要 refactor

**File anchors:**
- Phase 1 code lives in:
  - `apps/api/src/banners/`
  - `apps/consumer/components/banner-bar.tsx`
  - `apps/authenticator/components/banner-bar.tsx`
  - `apps/admin/app/banners/page.tsx`
  - `apps/api/prisma/schema.prisma` (Banner model + BannerSeverity + BannerAudience enums)

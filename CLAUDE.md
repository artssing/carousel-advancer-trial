# CLAUDE.md — Authentik HK Project State

> Last updated: 2026-06-03

## 新 session 接手指引

1. 讀完本檔 → 2. 讀 `docs/business-plan.md` → 3. 讀 `HANDOFF.md`（新機 setup）→ 4. 掃 `.claude/agents/`（code-reviewer / qa-tester，含 founder rulings）
- **唔好**重新問已決定嘅嘢或重跑 plan mode — 全部已 persist。
- **Founder 語言**：繁體中文（香港）。回應都用繁中。

## Project 一句話

香港 C2C 二手交易平台，按品類強制/可選第三方鑑定（>HKD 10k 強制），平台**中立做撮合 + escrow**，鑑定錯誤由具名星級鑑定師按合約 + E&O 保險承擔。

## 核心法律姿態（最重要）

**平台 = information intermediary**。所有 authenticity claim 歸屬具名鑑定師，UI/copy 唔可以講「我哋保證」/「by Authentik」。星級純演算法派生（完成單數 + 爭議率），不可手改。Ref: L'Oréal v eBay (EU)。

**收費**：鑑定師自訂 fee rate（% of 貨價）+ 最低收費。`CATEGORIES[].authFeeRate` 退居 AI 監控基準 + onboarding 預設。平台費 1.5% 不變。

**Tier**（`packages/utils/src/tier.ts`）：
- Tier 1 < HKD 1,000 — 純撮合
- Tier 2 HKD 1,000–9,999 — 可選鑑定
- Tier 3 ≥ HKD 10,000 — 強制鑑定，server 拒絕無鑑定師落單

## Flow v2（2026-06-01 founder 拍板，Phase 1 已完成）

### 4 個已確認決定

1. **鑑定師自訂收費**：`Authenticator.feeRatePct` / `feeMinHKD`。Order 有鑑定師時用該鑑定師 rate；無則 authFee = 0。
2. **交收方式**：賣家 declare → 買家揀。`SHIP` / `MEETUP_AUTH` / `MEETUP_3WAY` / `MEETUP_DIRECT`。Tier 3 唔准 `MEETUP_DIRECT`。
3. **付款方式**：`ONLINE_ESCROW`（mock hold）/ `OFFLINE_CASH`（限 meetup，UI 警示）。真 escrow = backlog。
4. **鑑定師公開檔案**：評分、評價、收費、店址、專長、鑑定數、dispute rate、active listings。

### 分期

- **Phase 1 ✅ 已完成**：schema + migration + seed + 收費邏輯 + API + consumer checkout + 鑑定師檔案頁 + sell 交收偏好 + orders 三重 tab（買入/賣出/鑑定）+ portal profile/earnings 接 API。
- **Phase 2 ✅ 已完成**：
  - ✅ 買家評價 UI（`POST /orders/:id/review`，1-5 星 + comment，orders 頁 inline form）
  - ✅ Meetup state machine（面交跳過 ship steps、`complete-meetup` 直達 COMPLETED + escrow 放款、情境化 progress bar）
- **Phase 3 進行中**：鑑定師 portal 重構
  - ✅ Bugfix：Earnings 收入 filter 修正（AUTH_PASSED 等狀態）、Dashboard disputeRate + 本月收入、Inbox 三層分組 + 面交入口、Sidebar active state + mobile bottom nav
  - 🔲 UX polish：鑑定工作台 INCONCLUSIVE 說明、Profile 分拆 + E&O 警示
- **Backlog**：真 escrow、AI 收費監控、Stripe/FPS、SF Express。

> ⚠️ 已知未修 bug：
> - **JWT_SECRET module-load ordering**：`auth.module.ts` 用 `JwtModule.register` 早過 ConfigModule load `.env`。Workaround：`cd apps/api && set -a; . ./.env; set +a && npx nest start`。建議改 `registerAsync`。
> - **Repo-wide lint 壞咗**（pre-existing）：`npm run type-check` 先係權威 gate。

## Monorepo 結構

```
apps/
  consumer/       Next.js 14 · port 3008 · 買 + 賣
  authenticator/  Next.js 14 · port 3001 · 鑑定家（onboarding 仍 stub）
  admin/          Next.js 14 · port 3003 · 內部 ops（暫無接 API）
  api/            NestJS 10 · port 4000 · Prisma + Postgres + JWT
packages/
  ui/     Shared components    config/   Tailwind + tsconfig
  utils/  tier, fees, format   api-client/ TS types
```

## 未做

- Stripe（mock `POST /payments/:orderId/confirm`）、Sumsub KYC（auto-VERIFIED）、SF Express
- Authenticator onboarding 頁、Admin portal 接 API
- 鑑定師商店 / 鑑定家 portal 前端 UI 重構（Phase 3）
- Flow v2 Phase 2 meetup state machine / Backlog
- iOS (Swift) — Stage 2、Android (Kotlin) — Stage 3

## Common commands

```bash
npm install
npm run dev                   # all
npm run dev:consumer          # 3008
npm run dev:api               # 4000
npm run dev:authenticator     # 3001
npm run db:up / db:down
cd apps/api && npx prisma migrate dev
cd apps/api && npx tsx prisma/seed.ts
npm run type-check
```

## UAT / PROD 環境（2026-06-24 founder 拍板，已完成）

兩套本地環境可**同時並存**，唔同 port + 唔同 database（同一 Postgres container）。Topology SSOT 喺 `scripts/env-config.sh`（start.sh / stop.sh 共用，唔好喺 script 內重複寫 port）。

| | API | Consumer | Authenticator | Admin | Postgres DB (:5432) | env file |
|---|---|---|---|---|---|---|
| **prod**（default） | 4000 | 3008 | 3001 | 3003 | `authentik` | `apps/api/.env.prod` |
| **uat** | 4010 | 3018 | 3011 | 3013 | `authentik_uat` | `apps/api/.env.uat` |

```bash
./start.sh            # = ./start.sh prod
./start.sh uat        # 開 UAT（首次自動建 authentik_uat db + seed）
./start.sh prod && ./start.sh uat   # 兩套一齊行
./stop.sh uat         # 只停 UAT（Postgres + PROD 不受影響）
./stop.sh prod        # 只停 PROD
./stop.sh             # = ./stop.sh all（停兩套 + Postgres）
```

- 前端用 `next dev -p <port>` 直接起（唔經 package.json hardcode 嘅 -p），並由 start.sh 注入 `NEXT_PUBLIC_API_URL` 等指向該環境 API。
- `.env.prod` / `.env.uat` 係 gitignored，committed 版本係 `*.example`。新機 copy example 即用。
- Schema 同步用 `prisma db push --accept-data-loss`（呢個 project schema SSOT 係 schema.prisma 經 db push，唔係 migration；fresh db 用 migrate deploy 會缺 column 如 emailVerified）。
- ⚠️ **stop 必須殺 `nest --watch` supervisor**：`nest start --watch` 嘅 app 係 child（bind port），supervisor 唔 bind port。淨係 port-kill 會令 supervisor respawn child → 環境「自己番生」。`./stop.sh <env>` 經 port listener 嘅 parent（nest/npx）殺埋 supervisor；前端用 `next dev -p <port>` argv pkill。Lesson：任何用 watcher/supervisor 嘅 dev process，stop 要殺成棵 tree 唔淨係 port listener。
- Fresh seed 有圖：`seed.ts` `pics()` 返 deterministic `picsum.photos/seed/...`（ListingThumb onError fallback gradient，offline 都唔爆）。browse card 用 `coverUrl ?? images[0]`。

### 環境角色 + Release workflow（2026-06-24 founder 拍板 — 必須遵守）

> **「所有嘢喺 UAT 測試完，先 deploy 去 PROD。」** PROD 唔係玩具場，係交付目標。

| 環境 | 角色 | 資料 | Auto-seed |
|------|------|------|-----------|
| **UAT** | 測試 / 驗收場 | demo / 測試 data（可隨時 reset、reseed、亂玩）| ✅ 空就 auto-seed |
| **PROD** | Deploy 目標 | **保持 clean**；只經真實使用或 explicit promote 入 data | ❌ **永不 auto-seed**（`start.sh` 已 gate） |

**Workflow**：開發 → `./start.sh uat` 測試/驗收 → 通過 → 至 deploy 去 PROD。

**DB 管理 script**（都會先寫備份去 `.backups/`，可還原）：
```bash
scripts/db-copy.sh prod uat     # 將 PROD 資料 migrate 落 UAT（攞真實資料測試）
scripts/db-copy.sh uat  prod    # promote：UAT 驗收完嘅資料 deploy 上 PROD
scripts/db-wipe.sh prod         # 清空 PROD data（保留 schema）
# 還原：drop+create 該 db 後 `psql -d <db> < .backups/<file>.sql`
```

⚠️ **重要 caveat（唔好被誤導）**：呢個 UAT/PROD split 只隔離 **data + schema + port**，**唔隔離 code** —— 兩套行緊**同一個 working tree**（同一份 `next dev` / `nest` source）。所以改 code 會即時喺兩個環境生效；「UAT 先測」保護嘅係**資料**同**可重複驗收流程**，唔係 code-level staging。

### Backlog — 完整 release pipeline（仍未做）

要達到「真正 UAT 測完先上 PROD」嘅 code-level isolation，仲缺：

1. **Version control 釘版本**
   - PROD branch（e.g. `release/prod`）只接收已通過 UAT 嘅 commit；`main` = UAT 流動 HEAD
   - Tag 每個 PROD release（`v0.x.y`）+ 自動 changelog
   - PR template 強制：UAT 驗收 checklist、screenshot、reviewer sign-off
2. **Per-env build artifact**
   - UAT 行 `next dev` / `nest start --watch`（即改即見，hot reload）
   - PROD 行 **build artifact**：`next build && next start` + `nest build && node dist/main.js`（鎖定版本，code change 唔會即時 leak）
   - `start.sh prod` 改用 artifact mode；artifact 由 CI 產生 + 簽 hash
3. **CI/CD automation**（GitHub Actions / 同等）
   - Push `main` → run `npm run type-check` + lint + 任何 unit/integration test → 自動 deploy 去 UAT
   - Merge `main → release/prod` 觸發 PROD deploy（行 `db push` schema sync、唔 seed、reload artifact）
   - 失敗自動 rollback（保留前一個 artifact + 自動 restore `.backups/` 嘅 DB snapshot）
4. **真雲端 PROD**（最終態）：managed Postgres（Neon / Supabase）+ R2 object storage + 真 Stripe / Sumsub，唔再 mock；UAT 用 staging-tier 同類 service。
5. **DB migration discipline**：而家用 `prisma db push`，去 PROD 之前要切換去 `prisma migrate` workflow（write migration files、reviewable、reversible），先唔會「fresh DB 缺欄」呢類 bug 上雲端重演。

## Demo accounts

詳細列表喺 **`docs/demo-accounts.md`**。Quick seed：

```bash
./seed-demo.sh    # 建立 / reset 全部 demo accounts + scenarios
```

**主要帳號**（全部 password = `password123`）：

- 買家：`alice@demo.hk` / `bob@demo.hk` / `carol@demo.hk`（已有 PENDING offer）/ `dave@demo.hk`（KYC PENDING）
- 賣家：`tom@demo.hk`（多 listings）/ `jenny@demo.hk`（Tier 3 高價）
- 鑑定師：`milan@` / `procheck@` / `cardlab@authentik.hk`
- Legacy：`seller@authentik.hk`（持有 165+ seed listings）

Pre-seeded listings (DEMO-A 到 DEMO-E) + Carol PENDING offer scenario，詳見 `docs/demo-accounts.md` 嘅 10 個 test playbook。

## 重要文件

| 用途 | 路徑 |
|------|------|
| 商業 plan | `docs/business-plan.md` |
| Tier logic | `packages/utils/src/tier.ts` |
| Fee 計算 | `packages/utils/src/categories.ts` |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Order state machine | `apps/api/src/orders/orders.service.ts` |
| Consumer API client | `apps/consumer/lib/api.ts` |
| Brand title-matching (sell auto-detect) | `packages/utils/src/brands.ts` (`matchBrandFromTitle` / `matchBrandAcrossCategories`) |
| Buyer search query parsing (browse smart search) | `packages/utils/src/search.ts` (`parseSearchQuery`) |

## Browse smart search（2026-06-24 founder 拍板，已完成）

客人可以**一次過打曬**品牌+品類+物料+condition（例：「Chanel 手袋 Caviar 金扣」）：
- `parseSearchQuery()`（SSOT，`packages/utils/src/search.ts`）由 query 抽出 **category**（category keyword，或由品牌反推，例 Birkin→handbag），**自動套做 filter + 可移除 chip**（透明可逆，唔 silent override）；其餘字（品牌/型號/顏色/condition）留做 ranked search terms。
- API `listings.list()` 改為 **tokenized 多 term match**（每個 term 喺 title|description|brand 任一中 = AND），取代舊「整句單一 substring match title」（舊行為一打多個字就 0 result）。
- `sort=relevance`：有 query 時 default 排序，in-memory 評分（title +3 / brand +2 / desc +1 / 整句 bonus），catalog 規模細用 JS ranking，大個再上 Postgres FTS。
- Condition（全新/9成新/二手…）冇結構化欄位 → 純文字 token 搜 title+description（founder 揀 MVP，無 migration）。

## Founder rulings

- Consumer port = **3008**
- Admin dark theme 係**故意**
- Money rounding 用 server `Order.totals.*`，唔可以 client 重算
- Stub data 喺未接 API 時係**故意**

## Process rulings（2026-06-04）

- **UI/UX gap 一發現必須 spawn coordinator agent**，連 root cause 一齊講畀 coordinator（明示「呢類錯誤之前出過」）。所有 enhancement 必須考慮返之前出現過嘅問題（avoid regression、複用 existing pattern）。Bug fix 可以直接做；enhancement／feature suggestion 要先通知 founder。
- **絕對唔可以重覆犯同樣 UX 錯誤**。已知 pattern 必須複用，唔好重新發明。

## 已建立 platform-neutral UI patterns（重用！）

| Pattern | 例子 | 教訓 |
|---------|------|------|
| Grid card 高度對齊 | `browse/page.tsx`、`seller/[id]/page.tsx` | 用 `flex flex-col` + `min-h-[2.5rem]` title + `mt-auto` price，唔好淨係靠 line-clamp |
| Algorithm-derived 信任指標 | `tier-pill.tsx` | 唔可以 platform-issued badge（「Top Seller」/「Trusted」）—— L'Oréal v eBay |
| 中立 disclaimer copy | `seller/[id]/page.tsx` 底 | 公開 profile 一定要寫平台中立、不擔保 |
| IM drawer mini-card | `conversation-drawer.tsx` | Drawer/modal 顯示資料就必須提供 navigation；唔好留 dead-end（IM Phase 2 教訓）|
| Seed detect | `start-all.sh` | 用 `docker compose exec psql` 查，`prisma db execute` 唔 return data |
| Single source of truth for catalogs | `packages/utils/src/categories.ts` | 加新 field 入 `CategoryConfig` 唔好喺 page 自己定義 list；用 `browseCategories()` / `sellCategories()` / `categoryById()` 等 helper。每個 page 用咩 derive 出黎 |
| Mobile horizontal scroll strip | `app/page.tsx` 嘅 category / 最新上架 strip | 標準 class set：`flex overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain`。`touch-pan-x` 畀 mobile browser 知呢個係 horizontal carousel；`overscroll-x-contain` 防 swipe 到盡頭 chain 去 body 觸發 iOS edge-swipe back nav |

## 已知 UX bugs 教訓（**絕對唔可以再犯**）

1. **Dead-end drawer**：IM drawer 顯示 listing title/seller name 但唔 clickable → 用戶撞牆。Fix：永遠提供 navigation link。
2. **Card height 不對齊**：listing grid 因為 title 長短不一令 price 高低唔同 → 觀感似 bug。Fix：上面 grid pattern。
3. **重 seed**：start script 用錯誤 query 偵測 user count → 每次 restart 覆蓋資料。Fix：上面 seed detect pattern。
4. **Cross-app links**：authenticator portal 用 `next/link` 去 consumer 路由 → 404。Fix：用 `<a target="_blank">` + `NEXT_PUBLIC_CONSUMER_URL`。
5. **JWT_SECRET module-load 次序**：`JwtModule.register` 早過 ConfigModule load `.env` → undefined。Workaround：`set -a; . ./.env; set +a`。長遠：改用 `registerAsync`。
6. **Authorisation WHERE clause 漏 role**：`listConversations` / `getUnreadCount` 只 check buyer/seller，唔包 authenticator → 鑑定師永遠睇唔到自己 mediate 嘅對話。Fix：寫每個 multi-role query 都要 cover 晒 buyer/seller/authenticator 三方。Lesson：每加一個 user role 入 conversation/order，所有相關 query 都要 review WHERE clause。
7. **Flex item 唔 horizontal stretch**：`flex-row` parent 入面個 flex child 默認只 cross-axis (vertical) stretch，唔會自動 horizontal fill。即使 child 內部 `items-center justify-center`，盒子本身唔夠闊就會貼住左邊望落只 vertical center。Fix：empty state / full-pane child 要加 `w-full` 或 `flex-1`。
8. **Catalog 重複定義（SSOT 違反）**：category list 喺 5 個地方各自 hardcode（sell / browse / home / top-nav / utils package），label 同 enabled flag 唔同→ 上架揀唔到首頁見到嘅 category。Fix：`packages/utils/src/categories.ts` 加齊 `emoji`/`shortLabel`/`apiEnum`/`enabledInBrowse`/`enabledInSell` 各 field，每頁用 `browseCategories()` / `sellCategories()` derive。Lesson：任何「畀 user 揀」嘅 enum-like data（category / district / verdict / status），SSOT 必須在 `packages/utils`，加新 derived property 入 config，唔好 page 自己定義 parallel list。
9. **`useState(() => URL)` 唔 reactive**：Next.js client-side Link nav 唔 unmount page → initializer 只跑一次 → URL 變但 state 唔變 → UI 唔更新。Fix：用 `useSearchParams()` hook 由 URL 直接 derive `category` / `searchQuery` 等 reactive value。Lesson：任何用 URL state 嘅 page，永遠用 `useSearchParams()`，唔可以 `useState(() => readUrl())`。
10. **`packages/*` refactor 後唔 rebuild dist**：consumer/authenticator 用 `dist/` compile output，唔係直接 read src。改完 `packages/utils/src/categories.ts` 加新 export 之後唔 rebuild → `is not a function` runtime error。Fix：改完 packages 後 run `npx tsc -p tsconfig.build.json` 喺 package 入面，或者 `turbo run build --filter=@authentik/utils`。長遠：start.sh 加 `turbo build` 步驟，或者 setup workspace 直接 read src（tsconfig paths）。
11. **Visual-only placeholder button 冇 wire onClick**：「上傳鑑定影片」button 全程冇 `onClick` / `onChange`，純粹 hover effect 模樣。仲用 Camera (image) icon 配「影片」copy → 用戶撳唔到 + icon 唔對。Fix：必須有 hidden `<input type="file">` + button trigger fileInput.click() + 真實 onChange handler。Lesson：UI 入面任何 button 都要 spot-check 有冇真實 handler，唔可以「先 mock 之後再 wire」當完成。Mock placeholder 必須加明顯 disabled 樣或者寫住「(coming soon)」，唔可以扮 work。
12. **Direct DB write 冇 WebSocket broadcast**：offers.service 用 `tx.message.create` 直接寫 sentinel message，但 connected clients 透過 `socket.on('message')` 接收，所以 server 必須主動 emit 先見到。同類問題：`insertSystemMessage` 由 service 寫 DB 但唔行 gateway。Fix：加 `gateway.broadcastToConversation(conversationId, msg)` helper，每個 server-side message insert 完之後 call 一次。Lesson：任何「server 寫 message」嘅 path 都要諗埋 push 去 connected clients，唔係 client `send` 為唯一 entrypoint。
13. **Param 名 vs 實際語義唔對齊**：`MessagesService.insertSystemMessage(orderId, body)` 接受嘅其實係 conversationId（callers 全部傳 conversation.id），但 `findUnique({ where: { orderId } })` 用呢個值 → null → silent fail。**整個 SYSTEM message feature 從來冇 work 過**直到呢次 fix。Lesson：param 改用途之後一定要 rename + 改 query 邏輯，唔好留錯名容易 silent fail；同時所有 server-side 「write-then-fetch-nothing」path 都要加 visibility（log / test）。
14. **Buyer-centric framing 套到 seller 行為錯**：OfferCard 「節省」只 make sense for buyer-proposed lower price；seller 自己提議低價時顯示「節省」邏輯衝突。Fix：UI framing 同 role 綁定（`offer.proposedByRole === 'BUYER'` 先 show 節省）。Lesson：寫雙向 feature（buyer ↔ seller）必須先諗各自 user model，唔可以只 lens 其中一邊。
15. **Counter-chain depth ≠ overall round number**：用 `parent.roundNumber + 1` 只 reflect counter chain depth，但用戶 mental model 係「呢場議價我講到第幾輪」（包括 withdrawn/rejected 嘅重 propose）。Fix：`roundNumber = totalOffersInConversation + 1`。Lesson：display number 必須對應 user 嘅 mental model，唔可以淨係 reflect data structure linkage。
16. **「Destructive action 冇 confirm」**：撤回 / delete / 取消 訂單呢類 irreversible 操作必須有 confirmation step。Inline 2-step（panel + 「確認」/「取消」buttons）比 `window.confirm()` 更好—— UX consistent + 可以解釋後果。Lesson：任何 status 轉 terminal 嘅 action（withdraw / reject / refund / dispute），即便係 actor 自己嘅 data，都要二次確認。
17. **Mobile horizontal scroll strip 唔郁**：`overflow-x-auto` 加 `scrollbar-hide` 喺 desktop OK，但 mobile swipe 唔郁 —— 因為 browser 收到 swipe 時唔知呢個 element 想 claim horizontal pan，default 行 vertical scroll 優先。Fix：加 `touch-pan-x overscroll-x-contain`。`touch-pan-x` 明示 horizontal carousel；`overscroll-x-contain` 防 chain 去 body 觸發 iOS edge-swipe back nav。Lesson：所有 mobile horizontal strip 必須齊呢 4 個 class：`flex overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain`。

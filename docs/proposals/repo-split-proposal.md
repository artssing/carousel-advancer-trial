# Repo 拆分 + CI/CD 交接 Proposal

> 起草：2026-08-10 · 狀態：**已決策 2026-08-14,執行中**

## 決策紀錄（2026-08-14）

| 問題 | 決定 |
|---|---|
| 拆到咩程度 | **3 個 repo**：`certifine-api`(backend + `packages/domain`,由佢發版) · `certifine-web`(3 個 portal + ui/config/web-kit/api-client) · `certifine-infra`(compose · Jenkinsfile · ci/ · scripts/ · docs/qa/) |
| Registry | **GitHub Packages** |
| P0 CODEOWNERS | **即刻做** — 已完成，`.github/CODEOWNERS` |
| P1 swagger + 生成 api-client | **做** |

**由 4 個改成 3 個嘅理由：** 原方案有獨立 `certifine-shared`。重新數過之後
（見下面 §1 修訂），API 真正 import 嘅係 **18 個 symbol、8 個檔案**，而嗰 8 個
全部係 **business rule**（tier / 平台費 / 訂單狀態機 / 提款上限 / analytics
白名單）—— 而 business rule 嘅權威本來就係 API：server 執行，前端只係跟住顯示。
所以 `domain` 住喺 `certifine-api` 入面、由嗰度發版，慳返一個 repo、一條
pipeline、一份 `CLAUDE.md`，同時「邊個 own domain」呢條問題自然有答案。

代價同原方案一樣：改 domain 要發版 + 前端 bump。冇變差。

---

> 以下為 2026-08-10 原文（除 §1 表格已按 2026-08-14 重新量度更新）。
> 觸發：founder「backend / frontend / docker db 全部同一個 directory，frontend 同事好易 commit 到 backend 嘅嘢，我需要分開，同埋 Jenkins 應該由 CI/CD team 做」

---

## 0. 先講一句唔中聽嘅

「同事會 commit 錯嘢」呢個問題，**唔一定要拆 repo 先解決得到**（CODEOWNERS + branch protection 一日搞掂）。但拆 repo 解決嘅係另外兩件事 —— **獨立 deploy** 同 **團隊邊界** —— 呢兩樣係現有 monorepo 真係做唔到嘅，而你講明「我認為有必要做」。所以以下按「要拆」去寫，同時列清楚代價，唔會扮冇成本。

**最大代價一句講完：** `@authentik/utils` 有 **112 個 import 點**，其中 **27 個喺 API**。佢係唯一一個真正跨越 frontend/backend 界線嘅嘢。拆咗之後，改一次 tier 門檻 = 三個 repo、三個 PR、一次版本發布。呢個係拆分嘅真正帳單，唔係 CI script。

---

## 1. 現況量度（唔係估，係數出嚟）

| Workspace | 性質 | `@authentik/utils` | `@authentik/ui` |
|---|---|---:|---:|
| `apps/consumer` | Next.js 買+賣 | 53 | 33 |
| `apps/authenticator` | Next.js 鑑定師 | 28 | 12 |
| `apps/admin` | Next.js ops | 4 | 11 |
| `apps/api` | NestJS + Prisma | **27** | 0 |

其他事實：

- **前端完全冇 import `@prisma/client`** —— 資料層邊界本身已經好乾淨，呢個係拆分最有利嘅條件。
- `packages/api-client` 得 **124 行**，types 手寫 —— 而家靠同一個 repo「一齊改」保持同步。拆咗就冇咗呢個保護。
- `packages/ui`、`packages/config`：純前端，零 backend 使用者 —— **乾淨可拆**。
- `packages/utils`：16 個檔案，入面 `tier.ts` / `categories.ts` / `analytics-events.ts` / `money.ts` 係 **business SSOT，前後端都要**；`chat-time.ts` / `search.ts` 等偏前端。**佢係一個檔案袋，唔係一個 package**。
- Jenkins 已經存在（`Jenkinsfile` 薄殼 + `ci/ci-run.sh`），已經係 6 個 stage，type-check 做 gate。**唔係由零開始。**
- 部署：`docker-compose.deploy.yml` 一個檔養住 9 個 service（prod 4 + uat 4 + cloudflared）。

---

## 2. 目標拓撲：3 個 repo

```
certifine-api        apps/api（NestJS + Prisma schema + seed）
                     + packages/domain（18 個 symbol）+ CANON.md → 發版上 GitHub Packages
                                                                 → 出 api image
certifine-web        3 個 portal + ui · config · web-kit · api-client → 出 3 個 web image
certifine-infra      compose · Jenkinsfile · ci/ · scripts/ · docs/qa/ · cloudflared
```

> **2026-08-10 修訂：** 初稿寫 `certifine-shared` 裝 `utils + ui + config + api-client`。數完 API 實際用咩之後改咗 —— 見 §3.1。跨 repo 共用面積由「4 個 package」縮到「18 個 function」。
>
> **2026-08-14 決策：** 再取消埋獨立嘅 `certifine-shared` repo —— 見文件開頭嘅決策紀錄。`domain` 併入 `certifine-api`，由 4 個 repo 變 3 個。下面 §3.5 / §4 提到 `shared` 嘅地方，一律讀成「`certifine-api` 入面嘅 domain package」。

### 點解唔係「每個 end 一個 repo」（即 5 個，三個前端各自一個）

三個前端係**同一個技術棧、同一班人、共用 56 個 `@authentik/ui` import**。拆散佢哋 = 你要為每個共用 component 改動開三次 PR，收益零。**前端邊界應該係「web vs api」，唔係「portal vs portal」。** 想再拆嘅話留到有第二隊前端人先。

### 點解 infra 要獨立

呢個先係真正回應「Jenkins 應該由 CI/CD team 做」：CI/CD team **擁有 `certifine-infra`**，有得改 pipeline、compose、secrets，但**冇得改產品 code**；產品 repo 嘅開發者相反。權責同 repo 邊界對齊，唔使靠人自律。

---

## 3. 最難嗰忽：`certifine-shared` 嘅合約

拆分成敗全部押喺呢度。三個做法：

| 做法 | 點運作 | 好 | 唔好 |
|---|---|---|---|
| **A. 私有 npm registry** | GitHub Packages 或自 host Verdaccio，`@certifine/utils@1.4.0` | 標準、版本清楚、可 rollback | 要養 registry；改一次 SSOT 要發版 |
| **B. Git submodule** | 各 repo pin 一個 commit | 唔使 registry | submodule 係出名嘅地雷，新同事一定中招 |
| **C. 唔拆，複製** | 前後端各有一份 | 最簡單 | tier 門檻兩邊唔同步 = 錢計錯。**否決** |

**建議 A**，而且配一個關鍵動作：

### 3.1 先切開 `utils`，再拆 repo

數過 API 真正 import 嘅 symbol —— **18 個，散落 17 個檔案入面嘅 8 個**
（2026-08-14 重新量度；原文寫 16 個，中間加咗 `orderGroup` / `TabRole` 等）：

> **更正：** 原文寫 `money.ts → calculateOrderFees`。實際 `calculateOrderFees`
> 喺 `categories.ts`；`money.ts` API 完全冇用，係純前端。



| utils 檔案 | API 用到 | 兩份唔同步會點 |
|---|---|---|
| `tier.ts` | `tierForPrice` | 銀碼。買家見一個數，server 收另一個數 |
| `categories.ts` | `calculateOrderFees` · `categoryByApiEnum` | 同上 |
| `order-status.ts` | `needsMyAction` · `orderGroup` · `TabRole` | badge 同列表對唔到數（2026-08-14 實際踩過） |
| `payout-methods.ts` | `PAYOUT_MIN_HKD` · `PAYOUT_MAX_HKD` · `PayoutMethodTypeKey` · `validatePayoutAccount` · `generatePayoutReference` · `payoutMethodDisplayLabel` | 前端 validate 過關，server 拒收 |
| `analytics-events.ts` | `isAnalyticsEventName` · `AnalyticsEventEnvelope` | 白名單。前端射 API 唔認嘅 event，靜靜地掉咗 |
| `phone.ts` | `normalizeHKPhone` · `isPhoneIdentifier` | normalize 要逐個 byte 一樣，唔係就查唔到 |
| `conditions.ts` | `gradesAtLeast` | 成色門檻兩邊唔同 |
| `brands.ts` | `normalizeForMatch` | 同 `phone.ts` |
| `money` `search` `mtr` `districts` `prices` `shipping` `chat-time` `chat-preview` | **零** | — |

```
@certifine/domain    上面 18 個 symbol（8 個檔案）
                     ← 前後端共用。改得少，改嗰陣好緊要。要版本控制。要發版。
                     ← 2026-08-14 決策：住喺 certifine-api repo，由佢發版。
ui · config · api-client · web-kit（其餘 9 個檔案）
                     ← 零 backend 使用者 → 直接住喺 certifine-web，唔使發版、唔使 registry。
```

咁做之後：

- **API 只依賴一個好薄嘅 package**，而 domain 係全 repo 最少改動嘅部分。
- 改 `mtr.ts` / 改一個 button 嘅 style **再唔係跨 repo 事件** —— 呢啲先係日日改嘅嘢。
- 跨 repo 發版嘅痛楚由「每次改 utils」縮到「每次改 business rule」。

呢個係令拆分長期捱得住嘅關鍵決定。**共用面積唔係越大越好，係越細越好。**

### 3.2 `api-client` 應該改成生成，唔係手寫

而家 124 行手寫 types，靠 monorepo 隱性同步。拆咗之後呢個保護消失，前後端 drift 只係時間問題。

**建議：** API 加 `@nestjs/swagger`（NestJS 原生，DTO 已經有 class-validator，成本細），CI 出 `openapi.json`，`certifine-web` 用 `openapi-typescript` 生成 client。**契約由 API 單向產生，前端唔准手改。** 呢個同時解咗你 backlog 入面 37 個未 typed `@Body()` —— 因為要出 swagger，就要有 DTO。

---

## 3.5 `CLAUDE.md` 點跟住拆（founder 問：「有冇辦法跟番每個 repo 分番開佢需要嘅嘢？」）

有，而且**唔應該複製四份**。複製 = 四份會各自漂移，半年後冇人知邊份先啱 —— 呢個同 §3 講 `tier.ts` 唔可以複製係同一個道理。

分三層：

### 層 1 · CANON（唯一真理，只寫一次）

放喺 `certifine-shared/CANON.md`，**跟住 npm package 一齊發布**。內容：

- Identity：Certifine、平台中立、legal framing（information intermediary / L'Oréal v eBay）
- 「UI/copy 唔可以講『我哋保證』」呢條紅線
- Tier / 收費模型
- Founder rulings 索引
- 「回應一律用繁體中文（香港）」

**點分發：** `certifine-api` 同 `certifine-web` 兩個都已經 `npm i @certifine/domain`，所以 canon 自然到位，各 repo 嘅 `CLAUDE.md` 開頭寫一行：

```markdown
@node_modules/@certifine/domain/CANON.md
```

好處：canon **跟 package 版本走**。你 pin `@certifine/domain@2.1.0`，就一定攞到嗰個版本嘅 canon —— 冇額外工具、冇 submodule、冇 sync script，用返你已經有嘅發布機制。

`certifine-infra` 唔裝 npm dep，佢自己揸一份 canon 嘅 pointer（或者 CI 一行 `curl` registry 攞）。

### 層 2 · 每個 repo 自己嗰份

| Repo | `CLAUDE.md` 要有咩 | 從而家邊度嚟 |
|---|---|---|
| **shared** | domain package 嘅 SSOT 紀律、發版規矩、**「改完必 rebuild `tsc -p tsconfig.build.json`」** | 現有「SSOT」+「rebuild」兩條 |
| **api** | Prisma schema SSOT、`db push` 唔用 migration、order state machine 位置、**soft delete only**、**money rounding 由 server 出**、`db push` 會俾 `apps/api/.env` 蓋過呢個陷阱 | 現有 rules 嘅 backend 半邊 |
| **web** | **改 UI 前必讀 `lessons.md` 20 條**、portal 色 token（`brand-*` 綠 / `authBrand-*` 靛藍）、analytics event 必 tag、「UI/UX gap 一發現必 spawn coordinator」、「絕對唔可以重覆犯同樣 UX 錯誤」 | 現有 rules 嘅 frontend 半邊 |
| **infra** | UAT/PROD 表、`start.sh`/`stop.sh`、**「UAT 測完先 deploy PROD」**、CI-RUNBOOK、`docs/qa/` 全套、demo accounts、**「build `api-uat` 咩都唔會 build」** | 現有「UAT/PROD 環境」+ commands 全段 |

現有 `CLAUDE.md` 大約六成內容**天然屬於單一 repo**，拆完每份反而更短、更準 —— 而家 frontend 同事每次都要讀埋 Prisma 同 compose 嘅規矩。

### 層 3 · lessons / rulings 呢啲長文

`docs/lessons.md`（前端）跟 web；`docs/founder-rulings.md` 係跨界 → 跟 **shared**，同 canon 一齊發布；`docs/qa/` 全套跟 infra；`docs/proposals/`（呢份包括在內）跟 infra 或者開一個細嘅 `certifine-docs`。

### 一條紀律

各 repo 嘅 `CLAUDE.md` **唔准重寫 canon 入面嘅嘢**，只准 `@` import 加自己嗰段。發現有人抄咗一段 canon 落 repo-local，當 review blocker 處理 —— 同「page 唔准 hardcode enum」一模一樣嘅規矩。

---

## 4. Jenkins：pipeline 點分

每個 repo 一條 pipeline，`certifine-infra` 多一條 deploy pipeline。

```
certifine-shared   PR: type-check + test
                   merge to main: semantic-release 發版 → 通知下游
certifine-api      PR: type-check + unit + prisma validate + swagger diff
                   merge: build image, tag <git-sha>, push registry → 通知 infra
certifine-web      PR: type-check + build 3 個 app + Playwright(現有 browser lane)
                   merge: build 3 image, tag <git-sha>, push → 通知 infra
certifine-infra    deploy job: 收 image tag → 部署 UAT → 行完整 QA regression
                   → 人手 approve → 部署 PROD
```

四條鐵律，唔跟就會出事：

1. **Image tag 用 git sha，唔用 `latest`。** 而家 `latest` 令「部署咗邊個版本」冇答案。
2. **`deploy.yml` 嘅 image tag 由 deploy job 寫入，唔係人手改。**
3. **UAT 一定要行 `docs/qa/` 全套先入到 PROD gate**（已經有現成嘅 138 case + browser lane + empty-body smoke，直接搬過去）。
4. **保留「build `api-uat` 咩都唔會 build」呢個陷阱嘅防護**（見 `docs/qa/runbook.md`）—— 拆 repo 之後 image 由 registry 嚟，呢個陷阱自然消失，但要喺交接文件寫明點解。

### 跨 repo 整合測試放邊

拆 repo 最典型嘅回歸：各 repo 綠燈，合埋一齊爆。所以 **`certifine-infra` 要有一條 nightly integration job**：拉最新三個 image、起完整 UAT stack、行 curl lane + browser lane。呢條 job 係唯一睇得到「成個系統」嘅地方，唔可以慳。

---

## 5. 遷移計劃（5 個 phase，可以每個 phase 停低）

| Phase | 做咩 | 完成即使停低都有價值 |
|---|---|---|
| **P0 · 即刻做** | 現有 monorepo 加 `CODEOWNERS`（`apps/api/` → backend owner，`apps/consumer\|authenticator\|admin/` → frontend owner）+ branch protection 要 owner approve | **今日就解決「commit 錯嘢」**，零風險 |
| **P1** | `utils` 切成 `domain` / `web-kit`；API 加 swagger、出 `openapi.json`；`api-client` 改生成 | 邊界喺 monorepo 入面**先驗證過**，唔使賭 |
| **P2** | 起私有 registry，`certifine-shared` 用 `git subtree split` 分出去（**保留 git history**），發第一版 | 共用層獨立，其餘照舊 |
| **P3** | `certifine-api` 分出去，Jenkins 出 image 上 registry；compose 改成食 registry image | 後端獨立 deploy |
| **P4** | `certifine-web` 分出去；`certifine-infra` 收 compose + Jenkinsfile + `ci/` + `scripts/` + `docs/qa/`，交俾 CI/CD team | 拆分完成 |

**P0 + P1 應該即刻做，唔理最後拆唔拆。** P1 嗰個邊界工作，喺 monorepo 做錯係一個 PR 改返，拆咗 repo 做錯係三個 repo 改返。

history 用 `git subtree split -P apps/api -b split-api`，唔好 `cp -r` —— blame 冇咗就查唔到「點解當初咁寫」，而你嘅 code 大量靠註釋記住 founder ruling。

---

## 6. 拆完之後會變差嘅嘢（老實列）

| 而家 | 拆完 |
|---|---|
| 改 tier 門檻：1 個 PR | 3 個 PR + 一次發版 + 兩次 bump |
| 「呢個版本」= 一個 commit sha | 4 個 sha 嘅組合，要 infra 記錄 |
| `npm run type-check` 一次過驗晒全部 | 各 repo 各自驗；跨 repo 錯漏靠 integration job |
| 本地開發：`npm run dev` | 要 `npm link` 或食已發布版本；新人 onboarding 明顯變難 |
| 一個 QA scope 系統 | scope 要跟住 repo 分家（`docs/qa/scope/backend|frontend` 已經分好，呢步反而順） |

呢啲唔係反對理由，係**交接文件必須寫低**嘅嘢。CI/CD team 接手嗰陣冇呢張表，佢哋會重新踩一次晒。

---

## 7. 要你決策

1. **拆到咩程度** —— 建議 4 repo（web 三個 portal 唔再拆）。你同意？定要 5 repo？
2. **registry 揀邊個** —— GitHub Packages（免養機）定自 host Verdaccio（唔想 code 上雲）？
3. **P0 即刻做定等埋** —— CODEOWNERS 我今日就可以落，唔阻住任何嘢。
4. **API swagger（P1）做唔做** —— 建議做，順手解埋 backlog 嗰 37 個未 typed body。
5. **CI/CD team 幾時接手** —— 交接應該喺 P4，定 P2 就開始一齊做？

---

## 附：關聯文件

- `docs/proposals/cicd-jenkins-n8n-proposal.md` —— 現有 pipeline 設計
- `docs/proposals/release-pipeline-backlog.md` —— release 流程 backlog
- `docs/qa/README.md` —— QA 系統（拆分後歸 `certifine-infra`）
- `docs/qa/runbook.md` —— 部署陷阱，交接必讀

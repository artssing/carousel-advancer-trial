# 香港 C2C 認證交易平台 — 完整商業及技術 Plan

## 1. Context（為什麼做這件事）

香港現有 C2C 平台（Carousell、Facebook Marketplace、LINE 香港買賣群組）核心痛點：
- **假貨氾濫**：名牌手袋、波鞋、電子產品（特別是 iPhone、AirPods、Switch 卡帶）、潮流玩具（Labubu、Bearbrick）、化妝品、補健品 — 買家難以辨真偽。
- **無 escrow / 無保障**：見面交收靠運氣，網上交易靠信任，糾紛無人跟進。
- **Carousell 的 CarouPay + Carousell Certified 只覆蓋極少品類**（主要球鞋、奢侈品手袋），且驗貨外判，流程慢、覆蓋窄。

**我們的定位（平台中立 + 鑑定師責任制）**：

平台 = **純撮合 + 資訊中介 + escrow 託管**。**鑑定真偽的法律及賠償責任完全由鑑定方承擔**，平台只負責提供工具、流程、評分、escrow，及在鑑定方違約時協助買家追討。

**分級鑑定方案（買家自選）**
- **Tier 1 — Match-only（< HKD 1,000）**：純撮合 + escrow。買賣雙方自願見面 / 寄送。
- **Tier 2 — Optional Authentication（HKD 1,000 – 10,000）**：買家可於下單時加錢選擇鑑定師。
- **Tier 3 — Mandatory Authentication（> HKD 10,000）**：強制經至少 1 個（買家可付費選 2 個）平台註冊鑑定師鑑定後才放款。

**鑑定方網絡（核心競爭力）**
- 邀請各品類具公信力的**實體店 + 行業 KOL** 加入鑑定師網絡：
  - 手袋：Milan Station、典當業老行尊、IG 二手手袋大 V
  - 球鞋：Sole Classics、Kick Lounge、球鞋鑑定 YouTuber
  - Pokemon Card：旺角信和卡店、PSA grader、TCG KOL
  - iPhone / 電子：旺角先達 / 灣仔電腦城知名店、3C YouTuber
- **每個鑑定師 / 鑑定店須**：
  1. 簽合約承擔鑑定錯誤的全部賠償責任（合約由我們律師起草，賠償上限 = 鑑定物件成交價的 1.5–2 倍）
  2. 自行購買 / 平台撮合**鑑定師專業責任保險**（authenticator's E&O insurance），保費由鑑定師自付
  3. 接受平台 KYC + 業界背景審查

**星級制（Authenticator Star Rating）**
- ⭐ 5 級制（1–5 星），基於：成交鑑定單數、買家評價、爭議率、複核準確率、入網年資
- **5 星鑑定師**：享平台首頁推薦位、優先派單、抽佣減免（如平台只抽 0.5%）、可參與大額 / 限量品鑑定
- **品牌價值給鑑定師**：星級會公開顯示在鑑定報告上 → 提升該鑑定師 / 實體店在行內知名度 → 帶動其本身生意（這是吸引他們加入的核心 incentive）
- **降星 / 除名機制**：鑑定錯 1 次降 1 星，連續 2 次重大錯誤 → 終身停用 + 公開除名
- **複核機制**：買家若不服，可付費要求 2 個其他 5 星鑑定師複核

費用由賣家按品類 % 支付。**主要目標客群是 Tier 3 — 一萬蚊以上的高價值物品**。

**Intended outcome**：以「保證真貨 C2C」做 wedge，搶 Carousell 高價值品類市佔率，建立 HK 最值得信任的二手平台。

---

## 2. 香港市場分析（試點難度 + 競爭優勢）

### 2.1 市場規模參考數據
- 香港人口 ~750 萬，智能手機普及率 >95%。
- Carousell 香港宣稱有 >300 萬註冊用戶（全港），MAU 估計 80–120 萬。
- 二手經濟年增長：HK 二手市場估值 ~HKD 30–40 億（含 C2C + 寄賣店）。
- 高價值品類（奢侈品 + 球鞋 + 電子）佔 C2C GMV 約 35–45%。

### 2.2 我們對比其他平台

| 維度 | Carousell HK | FB Marketplace | 紅 booth / 寄賣店 | **我們** |
|------|-------------|----------------|------------------|----------|
| 認證 | 限指定品類，外判 | 無 | 有，但要實體寄存 | **每單可選 / 高價必選，全品類** |
| Escrow | CarouPay（部份） | 無 | 無 | **預設 escrow** |
| 假貨責任 | 賣家 | 買家自負 | 寄賣店 | **鑑定師（合約 + 保險） — 平台中立** |
| 手續費 | 上架免費，CarouPay 抽 % | 無 | 寄賣抽 20–40% | **賣家付鑑定費（按品類 3–8%）+ 平台 1.5%** |
| 速度 | 即時上架，慢交收 | 即時 | 慢 | **上架即時，鑑定 24–72h** |

### 2.3 香港試點的真實難度（誠實版）

**法律 / 合規**
- 收授金錢 = **需考慮 Money Service Operator（MSO）牌照**（海關），或用持牌支付夥伴（Stripe HK / PayMe / FPS 代收代付）規避自行持牌。
- 個人資料（私隱條例 PDPO）— 用戶 KYC 必須合規。
- **平台責任邊界（重要 — 即使 T&C 免責，仍有殘餘風險）**：
  - 我們的設計是把鑑定責任完全推給鑑定師（合約 + 鑑定師自購 E&O 保險）。**但律師必須確認**香港 **商品說明條例 (Cap. 362) + 貨品售賣條例 (Cap. 26)** 下，若平台「主動撮合 + 持有資金（escrow） + 推薦鑑定師（星級）」，是否仍可被視為「業務交易參與者」而承擔部份法定責任。
  - 國際判例參考：eBay 在歐盟 / 美國多次被認定為「passive marketplace」可免責，但在 L'Oréal v eBay (EU) 等案件中，若平台「主動推廣」就會被認定為共同責任方。**星級制 + 推薦位 = 主動推薦的風險**。
  - **緩解方案**：T&C 明確列明平台是 information intermediary、星級為純演算法生成、escrow 為第三方支付夥伴持有；鑑定報告由鑑定師簽名（電子簽名）發出；保留鑑定師違約追償權給買家直接行使。
- **產品責任保險（platform 自身）**：平台仍建議買一份基本 General Liability Insurance（年費 HKD 5–15 萬，比原本 30–80 萬大幅下降），保護平台本身免被 nuisance lawsuit 拖垮。**鑑定錯誤的主要保險（E&O）由鑑定師自購，不入平台 cost。**
- 商品說明條例：假貨涉刑事，平台需有清晰下架及通報海關流程。

**營運**
- 鑑定師人才稀缺：香港具公信力的鑑定師主要在球鞋（如 Sole Classics、Kick Lounge 背景）、奢侈品（如 Milan Station 系前員工、典當業背景）。需 1 對 1 招聘 + 培訓 + 簽約獨家或 part-time。
- 鑑定場地：旺角 / 觀塘 / 荃灣設 1–2 個收貨點 + 中央鑑定倉（觀塘工廈 ~1500 呎，月租約 HKD 25–40k）。
- 物流：與順豐 / SF Express 合作 cash-on-delivery + signature required。

**信任建立**
- 冷啟動雞蛋問題：無賣家就無買家。需 **補貼前 1000 個賣家鑑定費 + 邀請 KOL（如球鞋 YouTuber、二手手袋 IG）做首批 verified seller**。

**技術**
- 多端開發（web + iOS + Android）成本高，**建議第一階段用 React Native + Web（Next.js）共用 70% 邏輯**，第二階段才考慮原生優化。

### 2.4 我們的核心優勢
1. **由業界 KOL / 實體店做鑑定方**：買家信的不是平台，而是該品類最有名的人 / 店。平台只負責撮合 + 提供工具。
2. **星級制 = 鑑定師個人品牌放大器**：對鑑定師而言，加入我們網絡是免費的 marketing channel，星級會被行內 + KOL 圈子看到。這令我們能用**低薪甚至零底薪 + 分成**簽下頂尖鑑定師（vs Carousell 要付全職 salary）。
3. **平台輕資產 + 法律低風險**：因為不背鑑定責任，平台可極速擴張品類（每加一個品類 = 簽 3–5 個該品類 KOL 鑑定方即可），不需自建鑑定團隊。
4. **品類橫向擴展**：Carousell Certified 只做球鞋手袋，我們從 day 1 涵蓋 Pokemon Card、iPhone、手袋等 HK 高價值二手品類。
5. **鑑定即內容**：每單鑑定生成「鑑定報告 + 短片 + 鑑定師署名」，鑑定師可轉發到自己 IG / YouTube → organic distribution。

### 2.5 使用人數估算（HK 試點，第一年，**高價值定位**）

因為我們聚焦 Tier 3（>HKD 10k）為主要利潤池，用戶基數會比 mass-market 小，但 GMV 高、毛利好。

**Bottom-up（保守 / 自費起步版本）**
- 行銷預算有限（每月 HKD 5–15 萬），透過 KOL（手袋 IG、Pokemon Card YouTuber、二手 iPhone 群組）+ 內容行銷觸及 ~5–10 萬目標受眾 / 月。
- 第一年註冊用戶 **2 萬 – 5 萬**（精準高消費群體）。
- MAU 25–35% → **6,000 – 17,000 MAU**。
- 月成交（高價值）**200 – 600 單**，平均單價 **HKD 6,000**（混合 Tier 1/2/3）。
- 月 GMV **HKD 120 萬 – 360 萬**，年 GMV **HKD 1,500 萬 – 4,000 萬**。
- 平台收入（混合費率 ~5%）≈ **年 HKD 75 萬 – 200 萬**。

**Benchmark（樂觀 — 若手袋 / Pokemon Card 社群口碑爆發）**
- 第一年註冊 **5 萬 – 8 萬**，月 GMV 衝 HKD 500–800 萬。

**建議 BP 使用數字（F&F 輪預算）**
- 第一年註冊 **3 萬**、MAU **8,000**、月成交 **350 單**、年 GMV **HKD 2,500 萬**、年平台收入 **HKD 125 萬**。
- 第一年計劃性虧損 **HKD 600 萬 – 900 萬**（受 F&F 輪 HKD 100–300 萬 限制 → 必須 6 個月內推出 demo 並開始籌種子輪 / A 輪，否則資金鏈斷裂）。
- **關鍵**：用 lean team + 外判鑑定中心初期（如與 Milan Station / Sole Classics / Pokemon 卡店合作分成）大幅壓低 Phase 1 burn rate 至 HKD 35–45 萬 / 月。

---

## 3. 產品架構（Web + iOS + Android）

### 3.1 核心用戶角色
1. **Buyer（買家）** — 瀏覽、出價、付款、選擇鑑定師、收貨、評價（含鑑定師評價）。
2. **Seller（賣家）** — 上架、寄送至買家選擇的鑑定點、收款。
3. **Authenticator（鑑定師 / 鑑定店，第三方）** — 接收物品、鑑定、拍片、出電子簽名報告、放行。**承擔所有鑑定錯誤的法律與賠償責任。**
4. **Admin / Ops** — 撮合、爭議調解（中立角色，不背賠償）、KYC、鑑定師審批與星級維護、客服。
5. **Authenticator Onboarding（內部 BD）** — 接觸 + 簽約新鑑定店 / KOL，是 day 1 最關鍵的營運角色。

### 3.2 核心 user flow（Tier 3，>HKD 10k 強制鑑定）
```
賣家上架（提供品類、聲稱真偽、要價）
   → 系統 / 買家依價格決定鑑定 tier
   → 買家下單 + 從該品類星級鑑定師清單中選 1 個（或付費選 2 個複核）
   → 買家付款（資金入第三方 escrow，平台只持索引）
   → 賣家寄到該鑑定師指定地點（SF 上門收件）
   → 鑑定師收貨 → 全程錄影 → 鑑定 → 上傳電子簽名報告（SLA 24–72h）
   → 真：直接寄出買家、放款、扣鑑定費 + 平台費 + 鑑定師分成
   → 假：退回賣家 → 買家全額退款 → 賣家黑名單 / 通報海關
   → 鑑定錯（買家事後發現）：
       1. 平台啟動爭議流程，付費請另外 2 個 5 星鑑定師複核
       2. 若確認原鑑定錯誤 → 鑑定師按合約 + 自購 E&O 保險賠買家
       3. 鑑定師降星 / 除名
       4. **平台不出賠償金，只協助追討**
```

### 3.3 技術 stack 建議

**Backend**
- Node.js (NestJS) 或 Python (FastAPI) — 視團隊熟悉度。建議 **NestJS + TypeScript** 與前端統一語言。
- PostgreSQL（主資料）+ Redis（cache、queue）+ S3-compatible object storage（鑑定相 / 影片）。
- 支付：**Stripe HK + PayMe for Business + FPS**（HK 用戶必備 FPS）。
- 訊息推送：FCM（Android）+ APNs（iOS）+ SendGrid（email）+ Twilio（SMS）。
- KYC：**ADVANCE.AI / Sumsub HK**（支援香港身份證 OCR + 人臉比對）。
- Search：Algolia 或 Meilisearch（self-host 慳錢）。

**Frontend（Web + Native mobile，最佳 UX 路線）**
- **Web (Stage 1 先做)**：**Next.js 14 + TypeScript + Tailwind + shadcn/ui**。
- iOS (Stage 2)：**Swift + SwiftUI**（iOS 16+）。
- Android (Stage 3)：**Kotlin + Jetpack Compose**（minSdk 26）。
- 共用 design tokens（JSON 透過 Style Dictionary 同步到三端）。
- API 用 OpenAPI 3.1 規範自動 codegen client（三端共用 type-safe API）。
- **代價接受**：開發成本 + 50%，換取最佳 native UX（HK 高消費用戶對 native app 流暢度敏感）。Stage 1 web 先 launch 拿到 traction 後，種子輪資金 close 再開 mobile native team。

### 3.3.1 Web 三大 portal 設計（Stage 1 必須交付）

Web 需做成 **subdomain / route prefix 區隔的 3 個獨立應用**，共享 design system + 共享 API。

#### Portal A — Consumer Portal（普通用家：買家 + 賣家共用 portal，role 切換）
- 路徑：`www.{brand}.com`
- 主要功能：
  - 註冊 / 登入 / KYC（Sumsub）
  - 首頁：分類瀏覽、搜尋、Featured（5 星鑑定師認證商品）
  - 商品詳情頁：顯示鑑定 tier、賣家信譽、可選鑑定師清單
  - 上架商品（賣家模式）：標題、描述、相、價格、品類、申報真偽
  - 購物車 + checkout（Stripe / FPS / PayMe）
  - 訂單追蹤：付款 → 寄至鑑定師 → 鑑定中 → 鑑定報告 → 寄出 → 收貨 → 評價
  - 鑑定報告查閱（PDF + video）
  - 爭議申請流程
  - 個人 dashboard：買賣記錄、收藏、消息（chat）
  - 評價系統（評賣家 + 評鑑定師）

#### Portal B — Authenticator Portal（鑑定家專屬）
- 路徑：`auth.{brand}.com`
- 主要功能：
  - 鑑定師 / 鑑定店註冊申請 + 業界背景審查上載
  - 簽電子合約（含賠償責任條款 + E&O 保險證明上載）
  - 鑑定師個人 / 店面 profile（公開頁面，顯示星級、累積鑑定數、品類專長、實體店地址 / 營業時間）
  - 待處理鑑定 inbox（按 SLA 倒數）
  - 鑑定工作流：收貨確認 → 拍片 → 填鑑定報告 template（按品類有不同 checklist）→ 電子簽名 → 提交
  - 收入儀表板：本月鑑定數、收入、星級走勢
  - 同行排行榜（gamification — 推動鑑定師更活躍）
  - 爭議處理介面：被申訴時可上載額外證據
  - 行銷工具：自動生成「我剛鑑定了 XXX」social media post（含品牌 watermark），鑑定師可一鍵分享到自己 IG / FB

#### Portal C — Admin / Ops Portal（內部團隊）
- 路徑：`admin.{brand}.com`（VPN / SSO + 2FA 強制）
- 主要功能：
  - 用戶管理：搜尋、KYC 審批、封號
  - 鑑定師管理：審批入網、調整星級、強制停權、查看 E&O 保險到期日
  - 訂單管理：所有訂單 timeline、強制介入（緊急退款）
  - 爭議仲裁工作流：分配仲裁員、複核鑑定師指派、最終裁決紀錄
  - 財務：escrow 結算對帳、鑑定師分成出糧、平台收入報表
  - 內容審核：上架商品 AI flag + 人工複核
  - Analytics：GMV、MAU、conversion funnel、鑑定 SLA 達成率、假貨偵測率
  - 客服 ticket 系統（或整合 Intercom / Zendesk）

**共用底層**
- 統一 auth service（JWT + RBAC：roles = buyer, seller, authenticator, ops_agent, ops_admin, super_admin）
- 統一 design system（基於 shadcn/ui 客製化）
- 統一 monorepo（Turborepo）：`apps/consumer`、`apps/authenticator`、`apps/admin`、`packages/ui`、`packages/api-client`、`packages/utils`

**DevOps**
- AWS Hong Kong region（ap-east-1）或 GCP asia-east2 — 數據在港，符合本地用戶預期。
- IaC：Terraform。
- CI/CD：GitHub Actions + Vercel（web preview）+ EAS（RN build）。
- 監控：Sentry + Datadog（或 Grafana Cloud 慳錢）。

### 3.4 系統 module 拆分
1. Auth + KYC service
2. Listing + Search service
3. Order + Escrow + Payment service
4. Authentication workflow service（鑑定師排程、SLA 計算、影片儲存、報告生成）
5. Logistics integration（SF API）
6. Messaging（chat between buyer / seller / authenticator）
7. Notification service
8. Admin / Ops dashboard（內部 web）
9. Insurance claim service
10. Analytics + fraud detection

---

## 4. 鑑定費定價策略（按品類 market-based）

> **政策更新（2026-06-01，founder 拍板）**：定價模式由「平台按品類統一收費」改為**鑑定師自訂收費** —— 每位鑑定師自己定 fee rate（% of 成交價）+ 最低收費，專業（星級 / 評價）直接影響佢可以收幾多。下表嘅品類 % 退居「**建議範圍 / AI 監控基準**」（日後由 AI 監控、偏離過多會被檢視）兼鑑定師 onboarding 預設值。**此改動不影響平台中立法律姿態** —— 中立講的是 authenticity claim 與星級（星級仍純演算法生成、不可手改），與定價無關。真正的 AI 收費監控／調節列入 backlog。

**分配**：鑑定費 → 鑑定師 70–80%、平台 20–30%（撮合 + 工具 + escrow 服務費）。額外平台抽 1.5% 交易費。

| 品類 | 鑑定費（賣家付，% of 成交價） | 最低收費 |
|------|----------|---------|
| **奢侈品手袋 / 銀包**（MVP） | 6–8% | HKD 200 |
| **iPhone / iPad / MacBook**（MVP） | 3–4% | HKD 80 |
| **Pokemon Card / TCG**（MVP，graded + raw） | 6% | HKD 100 |
| 名錶（Phase 2） | 8% | HKD 500 |
| 球鞋（Phase 2） | 5% | HKD 80 |
| 潮玩（Phase 3） | 4% | HKD 50 |
| 一般低價貨品 (<HKD 1,000) | 可選，不強制 | — |

平台再抽 **1.5% 交易費**（買家或賣家可選承擔，預設賣家）。

---

## 5. 團隊架構（含 QA、Code Reviewer、Designer）

### 5.1 Lean 創始期團隊（0–6 個月 MVP，F&F 輪 budget，**8–10 人**）

考慮到 F&F 輪 HKD 100–300 萬限制 + native 三端開發人手需求，必須極度精簡：

**Leadership (2)**
- Founder / CEO（你）— 商業 + 籌資 + 對外 + 親自做客服 / 鑑定協調
- **CTO / Co-founder（equity 為主，低薪）** — 技術領導 + 架構 + 兼 backend lead

**Product + Design (1.5)**
- **Lead Product Designer × 1** — UX flow、design system、品牌視覺、UI 細節（一人兼）
- Founder 兼任 PM 角色（節省 1 個 PM 位）

**Engineering (Stage 1，4 人 — web only) — 因為 Stage 1 不做 mobile，team 可細**
- Backend Engineer × 1–2（senior，CTO 兼任 + 另聘 1 mid）
- **Web / Frontend Engineer × 2**（要做 3 個 portal，工作量大；建議 1 senior + 1 mid）
- DevOps / Infra：外判（用 Vercel + AWS managed services）或 CTO 兼任，**Stage 1 唔請專職**
- iOS / Android engineers **Stage 2 / 3 才招聘**（種子輪 close 後）

**Quality (1)**
- **QA Lead × 1** — 制定 test plan、手動 regression、release gate、與 Ops 對接做 end-to-end 鑑定流程驗證
- 自動化 QA Engineer 延後至 Phase 2（種子輪後）

**Code Reviewer**
- **由 CTO + Backend senior 輪流擔任**，無獨立 headcount。所有 PR 必須 1 個 senior reviewer + CI gate（lint / type check / unit test / coverage > 60%）。
- 敏感模組（escrow / payment / KYC）要求 2 人 review。

**Operations + BD (2)**
- **Authenticator BD / Network Manager × 1（關鍵角色）** — 全職，負責簽約鑑定店 / KOL、管理星級制、處理鑑定師糾紛。Day 1 必須到位。
- Ops / Logistics（part-time freelance，0.5 FTE）— 對接 SF + 鑑定點派貨流程
- **沒有自家 Lead Authenticator** — 所有鑑定外判給網絡夥伴（Milan Station、Sole Classics、信和卡店、KOL 等），按單付分成
- Founder 必須親自每週去鑑定點 2 次 + 每月參加 1 場業界活動，建立關係 + 招攬新鑑定師

**Growth + CS (1)**
- Growth / Marketing × 1（Month 4 加入，preparing for public launch）
- Customer Support：Founder + 兼職 freelancer 處理（首半年）

### 5.2 Budget 試算（F&F 輪 6 個月 burn rate）

| 項目 | 月成本 (HKD) |
|------|-------------|
| 7 人薪酬（Stage 1 web-only，平均 35k，部份 equity discount） | 245,000 |
| 鑑定夥伴分成 + 場地 | 30,000 |
| 雲端 + 工具（AWS / Stripe / Sumsub / Sentry） | 25,000 |
| 法律 + 會計 + 保險（攤銷） | 35,000 |
| 行銷（首 4 個月低，第 5–6 月加碼） | 20,000 – 80,000 |
| 雜項 | 20,000 |
| **月 burn rate（Stage 1）** | **~375,000 – 435,000** |

6 個月燒 **HKD 225–260 萬** — 在 F&F 輪 HKD 300 萬上限以內，留 HKD 40–75 萬 buffer。**必須 Month 5 開始 pitch 種子輪**，目標 Month 7 close USD 1.5–2M 種子輪後再開 mobile team（Stage 2/3）。

### 5.2 重點角色職責

**QA Lead**
- 制定每個 release 的 test plan（功能、escrow 邊界、支付、退款、KYC、鑑定 workflow）。
- 維護 staging 環境 + test data。
- Release sign-off gate — 沒有 QA approval 不能上 prod。
- 與 Ops 合作做 end-to-end 模擬（含實體鑑定流程）。

**Code Reviewer / Tech Lead**
- 所有 PR 必須 1 個 senior reviewer + 自動 CI（lint、type check、unit test、coverage > 70%）。
- 維護 architecture decision records（ADRs）。
- 定期 codebase audit（每月 1 次安全 + 性能 review）。
- 對 escrow / payment / KYC 等敏感模組，要求 2 人 review。

**Lead Product Designer**
- 建立 design system（Figma）+ 共用元件庫（shadcn/ui customized）。
- 負責 brand identity — 信任感是首要設計目標（多用 verified badge、authenticator photo、video proof UI）。
- 主導用戶研究（首 50 個 beta user 訪談）。

---

## 6. 可執行 Roadmap（F&F 輪版本，18 個月）

### Phase 0 — 籌備（Month 0–1，極速 setup）
- 公司註冊（HK Limited）、開銀行戶口、申請 BR。
- **一次性法律諮詢（HKD 40–60k）**：MSO 必要性、PDPO、商品說明條例、平台責任邊界 → 出 compliance memo。
- 招聘 CTO（equity heavy）+ Lead Designer + 1 backend / 1 iOS / 1 web engineer。
- 與 Milan Station / Sole Classics / 信和 Pokemon 卡店各 2–3 間談分成合作 LOI。
- 拿保險 indicative quote。

### Stage 1 — Web MVP（Month 1–5，三 portal 全做）
- **Web only**：Consumer Portal + Authenticator Portal + Admin Portal（見 §3.3.1）。
- Backend API、escrow（Stripe Connect + FPS）、KYC（Sumsub）、SF 物流整合。
- **分級鑑定 workflow** 完整跑通（Tier 1/2/3）。
- 品類 MVP：**奢侈品手袋 + iPhone + Pokemon Card** 3 個。
- 鑑定流程：賣家寄至買家選的鑑定店（與 Milan Station / Sole Classics / 信和卡店等合作夥伴），鑑定店員工於 Authenticator Portal 上載片 + 報告。
- Closed beta（Month 4–5）：邀請 100–300 個 seed user + 8–15 個 onboarded 鑑定師 / 鑑定店。
- **Month 5 開始 pitch 種子輪**（USD 1.5–2M），用 MVP traction + GMV 數據說故事。

### Stage 2 — iOS Native App + 公開 launch（Month 5–10）
- 開 iOS team（1 senior + 1 mid Swift engineer）。
- iOS 完整覆蓋 Consumer Portal 功能（鑑定師 + admin 不出 mobile，繼續用 web）。
- 公開 launch + PR（HK01、Unwire、明周、IG influencer 20+）。
- 補貼首 500 單鑑定費（30–50% off）。
- 加品類：名錶、球鞋。
- 種子輪 close 後招人到 14–16 人。
- 目標 Month 10：註冊 1.5 萬、MAU 4,500、月成交 200 單、月 GMV HKD 130 萬。

### Stage 3 — Android Native App + Scale（Month 10–18）
- 開 Android team（Kotlin + Jetpack Compose）。
- 加品類至 7–8 個（潮玩、化妝品）。
- 自動化 fraud detection + 自動化 KYC review。
- A 輪籌資（USD 5–8M）。
- 目標 Month 18：註冊 4 萬、MAU 1.2 萬、月成交 600 單、月 GMV HKD 400 萬。

---

## 7. 主要風險

| 風險 | 緩解 |
|------|------|
| 鑑定錯誤導致信任崩潰 | 鑑定師合約強制 E&O 保險 + 公開鑑定影片 + 雙人複核機制 + 降星 / 除名 |
| **法律灰色地帶（即使 T&C 免責，平台仍可能被認定共同責任）** | 律師審核 T&C；星級用純演算法 + 公開；鑑定報告由鑑定師簽名；保留買家直接向鑑定師追討權；買 GL 保險 HKD 5–15k |
| **鑑定師不肯簽賠償合約 / 拒買 E&O 保險** | 階梯式 onboarding：新鑑定師先做低價單（<HKD 5k），累積信任後才升 Tier 3；平台撮合團體 E&O 保單以降低個人保費；星級制給予知名度作補償 |
| MSO 牌照風險 | 用持牌支付夥伴代收代付，escrow 由 Stripe Connect / PayMe Business 處理 |
| 鑑定師招聘困難 | 預算上要肯比市場價高 20–30%，加 equity，且早期 founder 親自接觸球鞋 / 奢侈品社群 |
| Carousell 跟進做認證 | 速度 + 品類橫向 + 本地化體驗（HK-only） |
| 假貨賣家鑽漏洞（鑑定通過後寄假貨） | 全程拍攝 + 序號 + 防偽貼紙 + 從鑑定中心直送買家（賣家不再經手） |
| 資金鏈斷裂 | Phase 1 嚴控 burn rate，鑑定中心初期可外判 / 共用 workspace |

---

## 8. Verification（如何驗證 plan 推進是否成功）

**Phase 1 完成指標（Month 6）**
- [ ] MVP 跑通完整 happy path：seller 上架 → buyer 付款 → 鑑定通過 → 出貨 → 放款，全程可在 staging 完成。
- [ ] 鑑定中心收 / 出 100 件實物無重大事故。
- [ ] Closed beta NPS > 40，至少 50 個有機推薦。
- [ ] Security audit 通過（第三方 pentest）。
- [ ] QA 完成 E2E 自動化覆蓋核心 flow。

**Phase 2 完成指標（Month 9）**
- [ ] 公開上線後 30 天內無 P0 incident。
- [ ] 鑑定 SLA 達成率 > 90%（72h 內完成）。
- [ ] 假貨偵測率 100%（zero 漏網事件，或漏網即時保險賠付）。

**Phase 3 完成指標（Month 18）**
- [ ] 月 GMV > HKD 300 萬。
- [ ] 鑑定毛利率 > 50%。
- [ ] 鑑定師 utilization > 70%。
- [ ] App store 評分 > 4.5。

---

## 9. 下一步建議（即時可做，按優先順序）

1. **Founder 客戶 / 鑑定夥伴訪談（Week 1–2）** — 親身去 Milan Station、Sole Classics、信和 Pokemon 卡店 / 旺角 K-11 卡店、二手手機舖（如 Wilson Communication），了解鑑定真實成本 + 痛點 + 合作意願。這比法律意見更先做，因為決定整個 unit economics。
2. **法律諮詢（Week 2–3，HKD 40–60k）** — ONC / Deacons / Howse Williams，出 compliance memo。
3. **保險 quote（Week 3–4）** — AIG HK / Chubb HK / QBE，先拿口頭 indicative。
4. **招聘 CTO + Lead Designer（Week 1–6 並行）** — Equity 為主，找有 marketplace 或 fintech 背景的。
5. **Pitch deck + financial model（Week 4–8）** — 用本 plan 數字做基礎，為 Month 5 種子輪做準備。
6. **Clickable Figma prototype（Week 6–10）** — Lead Designer 主導，做 demo 給 F&F 投資人 + 潛在種子輪 VC 看。

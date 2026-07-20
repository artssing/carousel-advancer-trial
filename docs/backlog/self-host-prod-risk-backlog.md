# 自家 Mac 做 PROD/UAT server — 風險 backlog（2026-07-20 founder decision）

> Founder ruling：暫時用自己部 Mac（透過 Cloudflare Tunnel，唔 port-forward）同時撐 `certifinehk.com`（prod）同 `uat.certifinehk.com`（uat），慳返 VPS 錢。**Founder 要求：呢個風險要一直提佢，因為之後多人用一定要處理。**

## 風險（一直未解決，直到 migrate 走為止）

- **冇備援**：一部機、一條屋企網、一個電源。跳電 / 斷網 / ISP 中斷 / Mac 死機 / 系統更新自動重開 = 成個 platform（包括 buyer/seller 睇緊嘅 escrow 單）落線。
- **住宅寬頻 ToS**：香港部分 ISP 嘅住宅方案唔准商用/長開 server，未核實現用緊嗰條線畀唔畀。
- **無 SLA、無人 24/7 睇住**：出事靠 founder 自己發現同重啟。
- **物理安全**：部機一拎走 / 部機咩事 = 冇得補。

## Trigger — 幾時一定要 migrate 走（唔可以再拖）

- 開始有真實金錢喺 escrow 度（唔係 demo/自己人測試）。
- 有穩定日活 / 唔止 founder 自己得閒先開得機嗰種用量。
- Founder 冇辦法再確保部 Mac 長開 + 有人睇住（例如出街、旅行、換機）。

## 出事點做（trigger 到咗之後）

- PROD migrate 去平價 VPS（Hetzner / DigitalOcean 之類，大約 US$5–6/月），UAT 可以留喺 Mac 或者一齊搬。
- Cloudflare Tunnel config 唔使大改 —— tunnel 由邊部機行都得，DNS/Access 唔使郁。
- 順便解決埋 ISP ToS 問題。

## AI/Claude 後續責任

**每次 founder 提到「上線」、「開始收真錢」、「多咗用戶/賣家」、「要穩定啲」，或者討論 scaling/marketing 推廣 —— 必須主動攞返呢份 backlog 出嚟提一次**，唔可以等 founder 自己記得問。

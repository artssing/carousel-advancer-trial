# Admin Portal Gap Audit（2026-07-08 Coordinator）

> Founder goal：admin portal 完全控制平台，唔使 terminal / psql 直接改 data。

## A. 現有 inventory（真接 API）

| 頁 | 能力 |
|---|---|
| Overview `/` | 6 KPI counts |
| Users `/users` | 搜尋/filter/drawer、suspend、KYC override、role、密碼 reset、notes（12 endpoints，最完善） |
| KYC Queue `/users/kyc` | approve/reject |
| Banners `/banners` | full CRUD |
| Disputes `/disputes` | **只讀** list，冇 resolve action |
| Platform Config | key/value JSON 編輯（generic 但 raw JSON） |
| Finance `/finance` | 只讀 summary 數字，冇 action |
| Price Changes | audit list + suspicious flag |

**四頁假嘢**：Authenticators / Orders / Content Review / Analytics — hardcode fake data 或 placeholder，零 API。
**另一盲點**：`AdminAction` audit log 一直寫緊，但**冇頁睇** — 而家要 psql 先答到「邊個做過咩」。

## B. Gap list（P0 = 日常 ops 卡住）

| Domain | 而家點做 | 要起咩 | P |
|---|---|---|---|
| **Disputes resolve** | 直接 call API / 落 DB | `PATCH /admin/disputes/:id/resolve`（refund buyer / release escrow + resolution note）；detail 睇 `OrderEvidence` | **P0** |
| **Orders** | psql 查單 | `GET /admin/orders[/:id]`（state machine timeline + Payment 史）+ force-refund / release-escrow（卡 SLA/寄失單用） | **P0** |
| **Listing 下架** | 直接 DB 寫 `REMOVED` | listing 搜尋+detail + `PATCH /admin/listings/:id/remove`（強制 reason，audit log） | **P0** |
| **Payout queue** | 銀行過數後人手 UPDATE DB | `GET /admin/finance/payouts` + mark PROCESSING/SUCCEEDED/FAILED（真實每週/每日 ops） | **P0** |
| **Authenticators** | 全人手 DB（status / E&O 到期冇 UI） | 照 [authenticator-lifecycle-proposal.md](authenticator-lifecycle-proposal.md) 起 | **P0/P1** |
| **Audit log viewer** | psql | `GET /admin/audit-log` + filterable 只讀頁 | P1 |
| **Config typed controls** | raw JSON textarea（易 fat-finger 掂錢） | 常用 key（payout fee / toggles）出 typed control | P1 |
| **Analytics 真數** | 假數（誤導） | 接真 aggregate query | P2 |
| **Reviews 查閱** | psql | 掛喺 dispute detail 內顯示相關 review | P2 |
| **Finance CSV export** | — | 投資者報表用 | P2 |

## C. Admin 必須「冇」嘅嘢（法律紅線）

1. **冇星級編輯器** — starRating / completedCount / disputeRate 演算法派生，只可 suspend/remove 人，永冇得改分
2. **冇金額自由輸入** — 所有錢動作 = server 計嘅 state transition（force-refund / release-escrow），冇 free-text amount field
3. **冇平台自家 verdict override** — resolution note 必須歸屬具名鑑定師 verdict，唔可以包裝成平台判斷（L'Oréal v eBay）
4. **冇無 reason 嘅 destructive action** — 全部強制 reason 落 `AdminAction`（跟 user suspend 現有 bar）
5. **Env/DB ops（db-copy / db-wipe / seed）留喺 CLI** — 「wipe PROD」button 喺 web UI 係擴大 blast radius，唔係日常 ops

## D. Build order

1. **Phase 1（P0）**：Disputes resolve → Orders list/detail/override → Payout queue → Listing remove
2. **Phase 2（P1）**：Authenticators CRUD（照 lifecycle proposal）→ Audit log viewer → Config typed controls
3. **Phase 3（P2）**：Analytics 真數、CSV export、Reviews in dispute view

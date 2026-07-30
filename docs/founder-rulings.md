# Founder Rulings — Certifine

> 已決定嘅 design / product / engineering decisions。唔好再問。

## 法律 + 平台定位

- **Product 名：Certifine**（2026-07-20 拍板；面向國際，唔好加「HK」落 brand）。
- User-facing 全用 Certifine；內部仲有 `@authentik/*` scope / DB 名 / demo email — founder 已表明之後要大執清晒（唔想再見 authentik 字眼），計劃見 `docs/backlog/purge-authentik-internals.md`，未執之前唔好散裝改。
- **平台 = information intermediary**（L'Oréal v eBay）：所有 authenticity claim 歸具名鑑定師（合約 + E&O 保險承擔），UI/copy 唔可以講「我哋保證」；星級純演算法派生（完成單數 + 爭議率），不可手改。
- **收費**：鑑定師自訂 fee rate（% of 貨價）+ 最低收費（`Authenticator.feeRatePct`/`feeMinHKD`；無鑑定師 authFee=0）。平台費 1.5%。

## Tier

`packages/utils/src/tier.ts`：
- T1 <$1k 純撮合
- T2 $1k–9,999 可選鑑定
- T3 ≥$10k 強制鑑定（server 拒無鑑定師落單）

## Soft delete only

customer 刪除一律 soft（status flip + `removedAt`/`removedByRole`）；hard delete 只限 admin 落 DB，永不開 API。ADMIN 下架賣家還原唔到。

## Money rounding

用 server `Order.totals.*`，client 唔准重算。

## UI quirks（intentional）

- Admin dark theme 係故意
- stub data 未接 API 時係故意
- consumer port = 3008

## Process

- **UI/UX gap 一發現必須 spawn coordinator**（連 root cause）。Bug fix 直接做；enhancement 先通知 founder。
- **絕對唔可以重覆犯同樣 UX 錯誤**；已知 pattern 必須複用（全文 `docs/lessons.md`）。

## Analytics governance

新 feature 有用戶可見互動 = 必須：
1. 加 event 入 registry（`packages/utils/src/analytics-events.ts`）
2. update spec Changelog
3. wire tracking
先算完成。冇 tagging = review blocker。全新 domain 要 founder review。

## Checkout/付款 rulings

- 過期後重行成個流程（冇一鍵重開）
- 買家過期率 = admin-only 指標（customer 不可見）
- 換鑑定師方向 = 准，但買賣雙方同意（proposal 待批）

## Listing 可見性 rulings

- **2026-07-30（REVERSES 2026-06-11 Q1）**：交易中（RESERVED）件貨 **唔可以** 出現喺 global browse/search — 買家見到都買唔到，浪費注意力＋似壞 app。Global browse/search 只留 `ACTIVE`。`listings.service.ts:list()` where = `status: ACTIVE`。
- RESERVED / SOLD 仍可經 direct URL 到達；**seller 公開 profile** 係唯一刻意 show ACTIVE+RESERVED+SOLD 嘅 public grid（社會證明），卡左上角 45° corner ribbon 標記 `已預留` / `已售出`。
- **Product card 左上角 ribbon system**（`product-card.tsx`）：**只係交易狀態**，互斥，優先 SOLD > RESERVED。已售出=slate 灰（相 dim 但卡仍可 click 入 detail）、已預留=amber。
- **卡上冇 tier / verification ribbon**（founder 2026-07-30）：買家 checkout 已知 Tier-3 強制鑑定，落 tag 只係呃 attention 引人入去，無意義。「已驗證」badge 只有喺 **賣前鑑定 flow** 存在（賣家上架前搵鑑定師攞 cert）+ Listing 加 cert 欄位先有意義 → backlog。未有之前卡上唔做任何 authenticity claim（平台中立）。

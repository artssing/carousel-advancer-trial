# Known issues register

> Founder 判過一次嘅嘢入呢度。之後每次 run 撞返同一條，報告只會喺
> 「Known, unchanged ×N」一行帶過，**唔會再入 Outstanding 搶你注意力**。

## 點運作

1. Run 撈到 MISMATCH → 報告列做 Outstanding，附二選一問題。
2. Founder 判 disposition，寫入下面張表。
3. 之後 run 撞返同一條、而且 evidence 對得上 → 靜音。
4. **Evidence 唔同咗** → 強制重新彈出做 Outstanding，因為情況變咗，舊嘅判斷唔一定仲啱。

`evidence` 一欄記低當時實際見到咩。呢個係防止 register 腐爛嘅機制 ——
唔可以淨係記個 case ID 就當永久靜音。

## Disposition

| 值 | 意思 |
|---|---|
| `bug-open` | 真 bug，未修。已入 backlog |
| `accepted` | 知道，但接受現狀（有理由） |
| `stale-case` | 唔係 bug，係條 case 舊咗。跟住要 `/qa sync` 執返條 case |
| `fixed` | 修咗。下次 run 應該轉返 match；連續兩次 match 就可以刪走呢行 |

---

## Register

| ID | 一句 | 首次見 | evidence 指紋 | disposition | 判於 |
|---|---|---|---|---|---|
| WA-06 | wallet confirm 冇 DTO binding，缺 `intentId` 回 500 唔係 400 | 2026-08-01 | `500 Internal server error` | ☐ 待判 | — |
| CC-01 | checkout Review 個總數 client 自己加（`Order` response 冇 total 欄位可用） | 2026-08-02 | `page.tsx:290` 自行 sum；server total 只喺 `create-intent` 出 `amountHKD` | ☐ 待判 | — |
| CC-06 | `GET /orders` 冇分頁，一次回 35 個，前端 in-memory 篩 | 2026-08-02 | 裸 array 35 個，頁面冇 paging 控制 | ☐ 待判 | — |
| CB-03 | 成色標註三種寫法（`賣家申報` / `賣方申報` / 規格表冇標） | 2026-08-02 | listing detail `:770` 用賣方；`:845` 冇標 | ☐ 待判 | — |
| AP-02 | 5 個 authenticator component hardcode consumer 綠 `brand-*` | 2026-08-02 | photo-uploader / offer-card / 2×wallet / messages；CSS 已 ship 落 container | ☐ 待判 | — |

**呢五條要你逐條判**，判完先靜得到音。每條嘅二選一問題：

- **WA-06** — 補 DTO validation（真 bug），定係接受 500（case 改寫成 expect 500）？
- **CC-01** — `Order` response 應該加 `totalHKD`（真 bug），定係 client 加數可接受（case 要改）？
- **CC-06** — `/orders` 應該加分頁（真 bug），定係 35 條以內唔使理（case 改成有上限先算）？
- **CB-03** — 統一做「賣家申報」並補返規格表（真 bug），定係三種寫法各有場景（case 要改）？
- **AP-02** — 5 個 component 換 `authBrand-*`（真 bug），定係嗰幾個位刻意用 consumer 色（case 要改）？

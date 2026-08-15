# CANON — Certifine 唯一真理

> 跟 `@certifine/domain` 一齊發布。三個 repo 都裝呢個 package，所以各自嘅
> `CLAUDE.md` 只需要喺開頭寫一行：
>
> ```markdown
> @node_modules/@certifine/domain/CANON.md
> ```
>
> **唔准將呢度任何一段抄落 repo-local 嘅 `CLAUDE.md`。** 抄咗 = 兩份會漂移，
> 半年後冇人知邊份先啱 —— 同 `tier.ts` 唔可以有兩份係一模一樣嘅道理。發現有
> 人抄，當 review blocker 處理。

## Identity

**Certifine** —— 面向國際，brand 唔加「HK」。
香港 C2C 二手平台，按品類強制／可選第三方鑑定。平台中立，做撮合 + escrow。

## 法律 framing（紅線）

平台係 **information intermediary**（L'Oréal v eBay）。**所有 authenticity
claim 歸具名鑑定師**，唔係平台。

**UI／copy 永遠唔可以講「我哋保證」**，或者任何令人以為平台自己做咗鑑定嘅寫法。
呢條唔係文案偏好，係法律位置。

## 收費模型

- 鑑定師自訂 fee（`Authenticator.feeRatePct` / `feeMinHKD`）；冇鑑定師 → `authFee = 0`
- 平台費 1.5%
- **Money rounding 一律用 server 出嘅 `Order.totals.*`，client 唔准重算**

## Tier

| Tier | 價格 | 鑑定 |
|---|---|---|
| T1 | < $1,000 | 純撮合 |
| T2 | $1,000–9,999 | 可選 |
| T3 | ≥ $10,000 | 強制 |

SSOT：`@certifine/domain` 嘅 `tierForPrice()`。

## 跨 repo 通則

- **SSOT**：enum-like 嘅嘢（category / district / status / event 名）一律出自
  `@certifine/domain` 或者 `@certifine/web-kit`，page 唔准自己 hardcode
- **Soft delete only**：customer 刪除一律 soft；hard delete 只限 admin DB
- **新 feature 有用戶可見互動 = 必須 tag analytics event**（白名單：
  `@certifine/domain` 嘅 `analytics-events`）。冇 tagging = review blocker
- **回應一律用繁體中文（香港）**
- **UI copy 用書面語，唔用口語**（founder 2026-08-14）

## Founder rulings

全文喺 `certifine-infra` 嘅 `docs/founder-rulings.md`。呢度只放跨 repo 都要跟嘅
幾條；其餘按 repo 分。

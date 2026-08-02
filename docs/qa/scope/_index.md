# Scope Index — selector → scope 檔

> **Agent 第一個讀嘅就係呢個檔。** 解析完 selector 之後，只讀對應嗰幾個 scope 檔，
> 唔好讀晒成個 `scope/`。

## 點解析 selector

1. Selector 完全等於下面 `feature` 一欄 → 讀嗰個 feature 兩層（backend + frontend）嘅檔。
2. Selector 係 `backend` / `frontend` → 讀嗰一層全部。
3. Selector 係 `full` → 讀晒全部。
4. Selector 對唔上 → **唔好靠估**。列返有咩 feature 可以揀，然後停。

## 對照表

| feature | backend scope | frontend scope | owners（sync 睇呢啲路徑） |
|---|---|---|---|
| `auth` | `backend/auth.md` | — | `apps/api/src/auth/**`, `apps/api/src/users/**` |
| `listings` | `backend/listings.md` | `frontend/consumer-browse.md` | `apps/api/src/listings/**`, `apps/consumer/app/browse/**`, `apps/consumer/components/product-card.tsx` |
| `sell` | `backend/listings.md` | `frontend/consumer-sell.md` | `apps/consumer/app/sell/**`, `apps/consumer/app/my-listings/**` |
| `checkout` | `backend/orders-checkout.md` | `frontend/consumer-checkout.md` | `apps/api/src/orders/**`, `apps/api/src/payments/**`, `apps/consumer/app/checkout/**` |
| `share` | `backend/share-storage.md` | `frontend/consumer-share.md` | `apps/api/src/storage/**`, `apps/consumer/components/share-ig-modal.tsx`, `apps/consumer/app/s/**`, `apps/consumer/lib/listing-og.ts` |
| `analytics` | `backend/analytics.md` | — | `apps/api/src/analytics/**`, `packages/utils/src/analytics-events.ts`, `apps/*/lib/analytics.ts` |
| `wallet` | `backend/wallet.md` | — | `apps/api/src/wallet/**`, `apps/consumer/app/account/**` |
| `authenticator` | `backend/authenticator.md` | `frontend/authenticator-portal.md` | `apps/api/src/authenticators/**`, `apps/authenticator/**` |
| `admin` | `backend/admin.md` | `frontend/admin-portal.md` | `apps/api/src/admin/**`, `apps/admin/**` |
| `i18n` | — | `frontend/i18n.md` | `locales/**`, `packages/utils/src/locales/**`, `apps/*/app/api/locale/**` |

## 跨 feature 嘅嘢

- `packages/utils/**` — SSOT（tier / category / search / analytics registry）
- `packages/ui/**` — 共用 component（`TierPill`、`Pill`、`Button`…）

**兩層保險，唔靠記性：**

1. 凡有 case 靠某個共用檔，就寫落嗰個 scope 嘅 `owners`。同一個檔出現喺幾個 scope 係
   **正常**（`tier-pill.tsx` 而家喺 browse / sell / checkout 三個）—— 重覆好過漏。
2. 但寫漏一定會發生，所以 `sync` **每次都額外 diff 一次 `packages/`**（shared sweep），
   由 agent 判斷關唔關自己事。Sweep 撈到嘅檔要順手補入 `owners`。

即係話：`owners` 係快線，sweep 係安全網。**唔准**因為「呢個 package 檔冇人寫落 owners」
就當佢冇改過。

## Layer 分工

- **backend**：直接打 `https://uat-api.certifinehk.com/api`，用 curl。快、穩、易寫 assertion。凡係邏輯／權限／狀態機，一律擺 backend。
- **frontend**：睇 server-rendered HTML（meta、SSR 內容），加上真人操作先驗到嘅嘢（modal、表單、鍵盤）。**唔好**喺 frontend 重覆 backend 已經覆蓋咗嘅邏輯。

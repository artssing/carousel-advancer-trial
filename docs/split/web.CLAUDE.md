# CLAUDE.md — certifine-web

@node_modules/@certifine/domain/CANON.md

> 呢個 repo = 三個 portal（consumer 3008 · authenticator 3001 · admin 3003）
> + `ui` · `config` · `web-kit` · `api-client`。
> **Prisma / API code 唔喺呢度。**

## 每 session 必知

- **改 UI／component 前：讀 `docs/lessons.md` 全文 20 條。** 唔係參考，係規矩
- **絕對唔可以重覆犯同樣 UX 錯誤** —— 已知 pattern 必須複用
- **Portal 色 token**：consumer `brand-*` 綠 / authenticator `authBrand-*` 靛藍。
  撈亂 = QA AP-02
- **改 `@certifine/ui` 後必 rebuild**：`npx tsc -p tsconfig.build.json`
- **page 唔准 hardcode 中文** —— 一律入 `locales/ssot.json` 再
  `npx tsx scripts/compile-locales.ts`
- **新 feature 有用戶可見互動 = 必須 tag analytics event**（見 CANON）
- **UI/UX gap 一發現必須 spawn coordinator**（連 root cause）。Bug fix 直接做；
  enhancement 先通知 founder
- `npm run type-check` 先係權威 gate

## 契約

`@certifine/api-client` 由 **api repo** 生成同發版。**`schema.ts` 唔准手改。**
API 加咗 route 而呢邊未 bump = `check-api-contract-coverage` 會紅。

## 本機開發

見 `docs/local-dev.md` —— API 要行起先，前端先有嘢打。

## 唔喺呢個 repo

Prisma · order state machine → `certifine-api`
compose · `start.sh` · `docs/qa/` → `certifine-infra`

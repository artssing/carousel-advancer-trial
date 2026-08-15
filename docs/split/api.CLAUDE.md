# CLAUDE.md — certifine-api

@node_modules/@certifine/domain/CANON.md

> 呢個 repo = NestJS API + Prisma + `packages/domain`（發版上 GitHub Packages）。
> **前端嘅嘢唔喺呢度。** 見唔到 `apps/consumer` 係正常。

## 每 session 必知

- **Schema SSOT = `prisma/schema.prisma`**，用 `prisma db push --accept-data-loss`，
  **唔用 migration**。改錯直接冇資料
- ⚠️ `db push` 會俾 `apps/api/.env` 蓋過 —— 以為改緊 UAT 實際改咗本機，中過
- **Order state machine 喺 `src/orders/orders.service.ts`** —— 全 repo 最貴嗰忽
- **Soft delete only**（見 CANON）
- **Money rounding 由 server 出**（見 CANON）
- **DTO 嘅 `@ApiProperty` 由 codemod 出**：`npx tsx scripts/add-api-property.ts`。
  CI 會 `--check`，漏跑 = 生成嘅契約同實際 DTO 唔一致
- **全局 ValidationPipe 開咗 `whitelist` + `forbidNonWhitelisted`**，但**只喺
  參數係 class 嗰陣先生效**。加 DTO = 嗰條 route 由「乜都收」變「拒收未宣告欄位」
- `@certifine/domain` 改完要 **bump 版本 + 發版**，web 先食到

## Commands

```bash
npm run dev            # nest start --watch
npm run type-check     # 權威 gate（repo-wide lint 壞咗）
npm run api:contract   # 重新生成 openapi.json + api-client schema
npx prisma db push --schema=prisma/schema.prisma
```

## 發版

`packages/domain` 同 `packages/api-client` 各自 semver，撳 tag 發：
`domain-v0.2.0` / `api-client-v0.2.0`。詳見 `docs/domain-package-release.md`。

## 唔喺呢個 repo

compose · `start.sh` · `docs/qa/` · deploy env → `certifine-infra`
三個 portal · `lessons.md` → `certifine-web`

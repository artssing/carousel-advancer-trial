# 本機開發（拆 repo 之後）— P4 pre-flight ⑧

> 拆完之後 `npm run dev` **唔會再一次起四個嘢**。呢份文件寫兩個方向，因為兩個
> 方向係相反嘅，只寫一個就一定有人撞。

## 方向 A — 改前端（最常見）

前端要一個**穩定、唔會熱重載**嘅 API 喺度應機。

```bash
# certifine-infra —— 起 postgres + api（食 GHCR image，唔 build）
bash ci/ci-run.sh dockerpull uat
bash ci/ci-run.sh deploy uat        # api-uat 聽 4010

# certifine-web
npm install                          # 會由 registry 攞 @certifine/domain + api-client
npm run dev                          # consumer 3008 / authenticator 3001 / admin 3003
```

前端打 `http://localhost:4010/api`（`NEXT_PUBLIC_API_URL`）。

**點解唔係開兩個 terminal 各自 `npm run dev`：** 你改 button 嘅時候唔想 API 熱
重載；而 API 起身要 Prisma client、要 DB 連得通，每次都係摩擦。Docker 起一次就
唔使再理。

## 方向 B — 改 API

倒轉：API 行本機，前端食本機 API。

```bash
# certifine-infra —— 只要 DB
docker compose -f docker-compose.yml up -d postgres

# certifine-api
npm install
cp env/api.example.env .env          # 填 DATABASE_URL 指本機 postgres
npx prisma db push --schema=prisma/schema.prisma
npm run dev                          # 4000

# certifine-web（如果要一齊睇）
NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run dev
```

⚠️ **`apps/api/.env`（本機）同 `env/api.prod.env`（infra）係兩件事。**
撈亂咗 = 本機 dev server 打緊 production 個 `DATABASE_URL`。

## 改 `@certifine/domain` 要點做

呢個係拆完之後最大嘅日常分別。domain 住喺 **api repo**，web 食已發布版本：

```bash
# certifine-api
# 1. 改 packages/domain/src/*.ts
# 2. bump packages/domain/package.json 個版本
# 3. merge，然後撳 tag：
git tag domain-v0.2.0 && git push origin domain-v0.2.0

# certifine-web
npm i @certifine/domain@0.2.0
```

**想跳過發版試嘢**（只限本機，唔好 commit 條 link）：

```bash
cd certifine-api/packages/domain && npm link
cd certifine-web && npm link @certifine/domain
# 試完： npm unlink @certifine/domain && npm install
```

⚠️ `npm link` 會令 web 食緊你本機未發布嘅 domain。**Push 之前一定要 unlink 再
`npm install`**，唔係 CI 綠而你本機紅（或者相反），而你會搵好耐。

## 改 API 契約要點做

API 加／改 route → `npm run api:contract` → commit → 發
`api-client-v0.x.y` → web `npm i @certifine/api-client@0.x.y`。

web 嗰邊 `check-api-contract-coverage` 會喺 CI 捉到「打緊一條契約冇宣告嘅 route」，
即係通常代表你未 bump。

## Port 一覽

| | 本機 dev | infra uat | infra prod |
|---|---|---|---|
| api | 4000 | 4010 | 4000 |
| consumer | 3008 | 3018 | 3008 |
| authenticator | 3001 | 3011 | 3001 |
| admin | 3003 | 3013 | 3003 |

⚠️ 本機 api（4000）同 infra prod api（4000）**撞 port**。同時開會有一個起唔到 —— 改 API 嗰陣先 `./stop.sh prod`，或者本機用 `API_PORT=4001`。

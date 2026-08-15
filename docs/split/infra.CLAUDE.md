# CLAUDE.md — certifine-infra

> 呢個 repo = compose · `ci/` · `scripts/` · `docs/qa/` · deploy env · cloudflared。
> **一行 product code 都冇，亦都 build 唔到任何 image** —— 呢個係特登嘅：
> 冇 source = 冇人可以喺 infra 改到產品行為。image 一律 pull。

## 環境

| | API | Consumer | Auth | Admin | DB | env |
|---|---|---|---|---|---|---|
| prod | 4000 | 3008 | 3001 | 3003 | `authentik` | `env/api.prod.env` |
| uat | 4010 | 3018 | 3011 | 3013 | `authentik_uat` | `env/api.uat.env` |

- `./start.sh [prod|uat]` / `./stop.sh [prod|uat|all]`；topology SSOT =
  `scripts/env-config.sh`
- **UAT 測完先 deploy PROD。** UAT 亂玩得；PROD 保持 clean、永不 auto-seed
- `scripts/db-copy.sh uat prod` promote（先寫 `.backups/`）
- split 只隔離 data + port，唔隔離 code

## Deploy

```bash
bash ci/ci-run.sh dockerpull uat   # 由 ghcr.io/certifine 拉
bash ci/ci-run.sh deploy uat
bash ci/ci-run.sh smoke uat
```

Image 由 **api repo** 同 **web repo** 嘅 workflow build。出 release 嗰陣由呢邊
決定版本號，傳落兩邊 build workflow 嘅 `version` input，再記低邊三個 sha。

## 陷阱（讀 `docs/CI-RUNBOOK.md` 全文）

- ⚠️ **絕對唔好加 `--remove-orphans`** —— jenkins / n8n 同一個 project 名下，
  會被當 orphan 剷走（= CI 剷自己）
- ⚠️ `--no-deps` 唔係可有可無：冇佢 `up --force-recreate` 會拖住 dependency
  一齊重啟，2026-08-11 就係咁令一次 UAT deploy 靜靜咁 deploy 埋 PROD
- ⚠️ `docker compose --dry-run` 喺呢件事上面報錯過兩次，唔好信
- ⚠️ `docker info` 會 **hang**（唔係 fail）當 Docker Desktop 半死 —— 見
  `scripts/docker-health.sh`

## QA

`docs/qa/` 全套喺呢度。`/qa run` 用 `qa-*` 帳號，**唔用 demo 帳號**。
UAT 開 qa order 可以，**用完要刪**。

## 唔喺呢個 repo

任何 product code。要改 API 行為去 `certifine-api`，改介面去 `certifine-web`。

# 部署安全 — Backlog

> 開咗呢個檔係因為 2026-08-11 一次 **UAT deploy 意外將新 code 推咗上 PROD**。
> 呢類問題唔屬於任何 feature，之前散喺 tooling / prod-not-live 兩度，冇人 own。

---

## P1 — `api-prod` 同 `api-uat` 共用 `certifine-api:latest`

**嚴重度：P1（founder 2026-08-11 拍板）。任何 PROD 重啟 = 一次冇人決定過嘅 PROD deploy。**

### 症狀（2026-08-11 實際發生）

跑 `ci/ci-run.sh dockerbuild uat` + `deploy uat` 之後：

```
$ curl http://api-prod:4000/api/version
{"commit":"7a8f8a8e…","env":"production","startedAt":"2026-08-11T06:18:52Z"}
```

PROD API 行咗 UAT 嗰個 build。冇人叫過佢咁做。

### Root cause 有兩層

**第一層（已修 2026-08-11）** —— `ci/ci-run.sh` 個 `deploy` step 逼 `postgres`
`--force-recreate`，但 `api-prod` 有 `depends_on: postgres (service_healthy)`，
所以 compose 連 `api-prod` 一齊重啟。個 script 自己句 comment 寫住「另一 env /
tunnel / postgres 唔郁」，同條命令自相矛盾。已將 `postgres` 由 `--force-recreate`
名單移走（`up` 仍然會確保佢起咗身，佢係 dependency）。

**第二層（未修 — 就係呢條 backlog）** —— `docker-compose.deploy.yml` 入面：

```yaml
api-prod:
  build: { context: ., dockerfile: apps/api/Dockerfile }
  image: certifine-api:latest      # ← PROD

api-uat:
  image: certifine-api:latest      # ← UAT 借同一個 tag，冇自己 build section
```

`certifine-api:latest` 係 **mutable tag**。UAT build 一 run，個 tag 就指向新
image。PROD 容器唔會即刻換（佢揸住 image id），但**下次任何原因重啟都會食新
code**：機器重開、docker daemon restart、crash 之後 `restart: unless-stopped`
自動拉起、或者好似今次咁被 dependency 拖住。

即係話第一層只係堵咗其中一條路。**第二層唔修，呢件事一定會再發生，而且下次
多數係喺冇人望住嘅時候**（半夜重啟）。

### 修法（未做，要 founder 決定形態）

方向係 **PROD 釘死喺 immutable tag**，UAT 先用浮動 tag。例如：

```yaml
api-prod:
  image: certifine-api:${PROD_API_TAG:?PROD 一定要指定 tag}
```

配合 `ci/ci-run.sh`：`dockerbuild` 額外 `docker tag certifine-api:latest
certifine-api:$(git rev-parse --short HEAD)`，PROD deploy 明確傳 tag。

要諗清楚：

- `api-uat` 冇 `build:` section 係刻意嘅（借 prod 個 image，慳一次 build）。
  釘死之後，UAT 用邊個 tag？可能要畀 `api-uat` 自己一個 `:uat` tag，代價係
  API 要 build 兩次。
- 三個前端已經係 `:prod` / `:uat` 分開，只有 API 共用。所以呢條只影響 API。
- `docs/qa/runbook.md` 個「確認部署真係生效」步驟要跟住更新。

### 而家嘅狀態（要 founder 決定）

- PROD API **仍然行緊 `7a8f8a8`**。`apps/api` 由上一個 PROD 版本到 `7a8f8a8`
  嘅 diff 係 **51 行新增、0 行刪改**（淨係 `/api/version` module），schema 冇改，
  所以行為上等於冇變 —— 但呢個係事後查出嚟嘅運氣，唔係設計保證。
- Rollback image 影低咗：`certifine-api:rollback-2026-08-11`（同埋三個前端）。
- 決定：**留住 7a8f8a8**，定係**揀返 rollback tag**？

---

## P2 — PROD 前端從來冇 publish 過

見 `docs/backlog/prod-not-live-backlog.md`。同上面相關：因為 PROD 得個 API
容器行緊，冇前端，所以今次意外嘅實際 blast radius 細。**呢個係僥倖，唔係防護。**
PROD 前端一上線，同一個機制就會影響真用戶。

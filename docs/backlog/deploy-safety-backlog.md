# 部署安全 — Backlog

> 開咗呢個檔係因為 2026-08-11 一次 **UAT deploy 意外將新 code 推咗上 PROD**。
> 呢類問題唔屬於任何 feature，之前散喺 tooling / prod-not-live 兩度，冇人 own。

---

## ✅ 已修 2026-08-11 — `api-prod` 同 `api-uat` 共用 `certifine-api:latest`

**原本嚴重度 P1（founder 2026-08-11 拍板）。已經結構性解決，記錄留住做將來嘅前車之鑑。**

### 點修（founder 2026-08-11：「PROD同UAT既deploy唔可以係同一件事」）

```yaml
api-prod:  build → certifine-api:prod   # PROD 專用
api-uat:   build → certifine-api:uat    # 自己 build，唔再借
           depends_on: api-prod          # ← 刪走
```

`ci/ci-run.sh` 個 UAT `BUILD_SVCS` 由 `api-prod` 改做 `api-uat` —— 之前 UAT build
嘅係 PROD 嗰個 service，所以一次 UAT build 就改到 PROD 個 tag。三個前端本來就
`:prod` / `:uat` 分開，只有 API 共用，而家對齊。代價：API build 兩次。

加埋每次 build 落一個釘死嘅 sha tag（`certifine-api:uat-bf05931`）。浮動 tag 答
「呢個 env 最新係邊個」，sha tag 答「嗰次 build 去咗邊」—— rollback 要後者，而
佢唔會被下次 build 蓋走。

**驗證方法（唯一可信嗰個）**：deploy 前後對 `docker inspect certifine-api-prod
--format '{{.State.StartedAt}}'`。實測 before = after，PROD 完全冇被郁。
**唔好信 `docker compose --dry-run`** —— 佢喺呢件事上面連續報錯兩次，兩次都話
`api-prod Running`，兩次都 recreate 咗。

### 仲有兩件事

1. `certifine-api:latest` 個 tag 仲喺度，而且 PROD 容器嘅 config 仍然寫住佢
   （個容器係改 compose 之前起嘅）。內容上 `:latest`、`:prod` 同容器行緊嗰個
   係同一個 image id，所以下次 PROD recreate 會平順轉去 `:prod`。之後可以清走
   `:latest`，避免有人再手動用佢。
2. **PROD API 而家行緊 `96e8599`**（今日兩次意外重啟造成）。founder 2026-08-11：
   「PROD可以唔郁住，因為未真係有人用」。要揀返舊版就用
   `certifine-api:rollback-2026-08-11`。

---

## 原本嘅記錄（root cause 分析）

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

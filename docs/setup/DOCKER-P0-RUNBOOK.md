# Docker P0 Runbook — 容器化 app stack（本地測試）

> 由 CI/CD proposal Phase 0 產生。呢步只係「將 4 個 app 容器化 + 用 production artifact 跑得起」，仲未接 Jenkins/n8n。
> **全部改動都係新增檔案**，revert 好簡單（見底）。

## 產出檔案

```
.dockerignore
apps/api/Dockerfile              + apps/api/docker-entrypoint.sh
apps/consumer/Dockerfile
apps/authenticator/Dockerfile
apps/admin/Dockerfile
docker-compose.app.yml
.env.compose.prod  /  .env.compose.uat   （無 secret，port + public URL）
```

## 前置

1. Docker Desktop 行緊（`docker version` 有嘢）。
2. `apps/api/.env.prod` / `.env.uat` 已經有（你已有 ✅）。
3. Postgres container 起咗（沿用現有 compose，兩個 DB 喺同一 container）：
   ```bash
   docker compose -f docker-compose.yml up -d postgres
   ```

## 起 PROD stack（本地）

```bash
# build + up（第一次冷 build，4 個 Next app 約 5–10 分鐘）
docker compose --env-file .env.compose.prod -p authentik up -d --build

# 睇 log
docker compose -p authentik logs -f api
```

驗收（smoke test）：
```bash
curl -f http://localhost:4000/api/listings   >/dev/null && echo "API ok"
curl -f http://localhost:3008                 >/dev/null && echo "consumer ok"
curl -f http://localhost:3001                 >/dev/null && echo "authenticator ok"
curl -f http://localhost:3003                 >/dev/null && echo "admin ok"
```

## 起 UAT stack（同時並存，唔撞 PROD）

```bash
docker compose --env-file .env.compose.uat -p authentik_uat up -d --build
# API 4010 / consumer 3018 / auth 3011 / admin 3013
```

## 停 / 清

```bash
docker compose -p authentik      down      # 停 PROD stack（唔郁 postgres）
docker compose -p authentik_uat  down      # 停 UAT stack
```

## ⚠️ 已知 P0 限制（P1/P3 再處理）

- **NEXT_PUBLIC_* build-time inline**：改咗 API port 要 `--build` 重 build 前端，唔係改 env 即生效。
- **無 /health endpoint**：暫用 `/api/listings` 做 smoke test；P1 加一個輕量 `/api/health`。
- **db push（`RUN_DB_PUSH=1`）**：container 起動會 `prisma db push --accept-data-loss`。上 cloud 前要轉 `prisma migrate deploy`（proposal Phase 3）。
- **Image 未 standalone 化**：暫時 copy 成個 `/repo`（image 偏大）。P1 可加 Next `output:'standalone'` 瘦身。
- 呢步 **唔會取代** 你而家 `./start.sh`（dev / hot-reload 流程原封不動）。容器化係畀 pipeline deploy 用嘅另一條路。

## Revert（如有問題即刻還原）

呢批全部係**新增檔案**，直接刪走即可，唔影響任何現有 code：
```bash
docker compose -p authentik down; docker compose -p authentik_uat down
rm -f .dockerignore docker-compose.app.yml .env.compose.prod .env.compose.uat
rm -f apps/api/Dockerfile apps/api/docker-entrypoint.sh
rm -f apps/consumer/Dockerfile apps/authenticator/Dockerfile apps/admin/Dockerfile
```
完整 working-tree 快照（連你未 commit 嘅改動）：`.backups/worktree-before-cicd-p0-*.tar.gz`
還原指引：`.backups/RESTORE-cicd-p0-*.txt`

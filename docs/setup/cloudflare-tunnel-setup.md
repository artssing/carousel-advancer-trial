# certifinehk.com 上線 — 全 Docker + Cloudflare Tunnel（founder 部 Mac 做 server）

> 目標：`certifinehk.com`（PROD）+ `uat.certifinehk.com`（UAT）由 founder 部 Mac 供應，
> **成個 stack 全部 Docker**（8 個 app container + Postgres + tunnel），唔 port-forward、唔自己搞 SSL。
> Domain `certifinehk.com` 已喺 Cloudflare Registrar 注冊、DNS 由 Cloudflare 管、`cs@certifinehk.com`
> Email Routing 已 forward 去 founder email — **email routing 唔好郁**。
>
> 決定（founder 2026-07-20）：全 Docker（B）· admin 第一日就 Cloudflare Access 鎖 · PROD+UAT 都
> STRIPE_MODE=mock（in-process，唔開 gateway container）。

---

## 架構

```
              Cloudflare edge (SSL 自動)
                     │  named tunnel「certifine」
        ┌────────────┴─────────────┐
        ▼  certifine-tunnel container (compose 網內)
  ┌──────────────────────────────────────────────┐
  │ compose network                                │
  │  consumer-prod:3008   api-prod:4000            │
  │  authenticator-prod:3001  admin-prod:3003      │
  │  consumer-uat:3008    api-uat:4000  …          │
  │  postgres:5432 (DB: authentik + authentik_uat) │
  └──────────────────────────────────────────────┘
```

cloudflared **喺 compose 網內**，用 service DNS 名（`consumer-prod:3008`…）連 app —
**唔用 `host.docker.internal`**（嗰個係「app 喺 host 行」先需要）。

| Hostname | → service | env |
|---|---|---|
| `certifinehk.com` | `consumer-prod:3008` | prod |
| `api.certifinehk.com` | `api-prod:4000` | prod |
| `auth.certifinehk.com` | `authenticator-prod:3001` | prod |
| `admin.certifinehk.com` | `admin-prod:3003` | prod ⚠️ Access |
| `uat.certifinehk.com` | `consumer-uat:3008` | uat |
| `uat-api.certifinehk.com` | `api-uat:4000` | uat |
| `uat-auth.certifinehk.com` | `authenticator-uat:3001` | uat |
| `uat-admin.certifinehk.com` | `admin-uat:3003` | uat ⚠️ Access |

---

## 已經幫你 wire 好（唔使再改）

- `docker-compose.deploy.yml`（repo root）：8 app + tunnel service。跟 base `docker-compose.yml`
  （Postgres）一齊行。
- **公網 URL / CORS / OAuth redirect** 已喺 compose `environment` / build `args` 設好指去
  `*.certifinehk.com`（呢個係之前 doc 最大 gap — 唔改前端會 call 返 localhost）。
- Secret（JWT_SECRET / GOOGLE_CLIENT_SECRET / DB pw）留喺 gitignored `apps/api/.env.prod`
  `.env.uat`，compose `env_file` 讀；container 專屬值（`DATABASE_URL` 指 `postgres` service、
  公網 CORS）由 `environment` override。
- **PROD + UAT 都 STRIPE_MODE=mock**（in-process）→ 唔使 gateway container，亦避開遠端瀏覽器
  連唔到 `localhost:4252`。真 Stripe-shape gateway 日後開 `pay.` subdomain 再加。

---

## ⚠️人手 Step A — Google OAuth console（agent 做唔到，founder 撳）

上公網前，去 [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services →
Credentials → 你個 OAuth client，加：

- **Authorized redirect URIs**：
  - `https://api.certifinehk.com/api/auth/google/callback`
  - `https://uat-api.certifinehk.com/api/auth/google/callback`
- **Authorized JavaScript origins**：`https://certifinehk.com`、`https://uat.certifinehk.com`

唔加 = Google 登入會 `redirect_uri_mismatch`。（email/password 登入唔受影響。）

---

## ⚠️人手 Step B — Cloudflare Tunnel 授權（agent 做到呢步會暫停）

```bash
mkdir -p ~/cloudflared-config
docker run -it --rm -v ~/cloudflared-config:/etc/cloudflared \
  cloudflare/cloudflared:latest tunnel login
```

Terminal 印一條 `https://dash.cloudflare.com/…` — **founder 本人開瀏覽器揀 `certifinehk.com` 撳
Authorize**（帳戶授權唔可以代做）。完成後 `~/cloudflared-config/cert.pem` 出現，agent 檢查到呢個檔
存在就繼續。

---

## Step C — 建 tunnel + config.yml + DNS route

```bash
# 1. 建 named tunnel（記低印出嚟嘅 UUID）
docker run -it --rm -v ~/cloudflared-config:/etc/cloudflared \
  cloudflare/cloudflared:latest tunnel create certifine
```

`~/cloudflared-config/config.yml`（`<UUID>` 換返上面嗰組；ingress 指 **compose service 名**）：

```yaml
tunnel: certifine
credentials-file: /etc/cloudflared/<UUID>.json

ingress:
  - hostname: certifinehk.com
    service: http://consumer-prod:3008
  - hostname: api.certifinehk.com
    service: http://api-prod:4000
  - hostname: auth.certifinehk.com
    service: http://authenticator-prod:3001
  - hostname: admin.certifinehk.com
    service: http://admin-prod:3003
  - hostname: uat.certifinehk.com
    service: http://consumer-uat:3008
  - hostname: uat-api.certifinehk.com
    service: http://api-uat:4000
  - hostname: uat-auth.certifinehk.com
    service: http://authenticator-uat:3001
  - hostname: uat-admin.certifinehk.com
    service: http://admin-uat:3003
  - service: http_status:404
```

```bash
# 2. 每個 hostname 加 DNS route（一次過）
for h in certifinehk.com api.certifinehk.com auth.certifinehk.com admin.certifinehk.com \
         uat.certifinehk.com uat-api.certifinehk.com uat-auth.certifinehk.com uat-admin.certifinehk.com; do
  docker run -it --rm -v ~/cloudflared-config:/etc/cloudflared \
    cloudflare/cloudflared:latest tunnel route dns certifine "$h"
done
```

---

## Step D — Build + 起 stack

```bash
cd <repo>
./stop.sh all                      # 釋放 host 上 3008/4000… 免同 container port map 撞
# authentik_uat DB 已存在；如係全新機先要：
#   docker compose up -d postgres && \
#   docker compose exec -T postgres psql -U authentik -d postgres -c 'CREATE DATABASE authentik_uat'

docker compose -f docker-compose.yml -f docker-compose.deploy.yml build   # 6 前端 image 各自 build（NEXT_PUBLIC_* 唔同）
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d
docker compose -f docker-compose.yml -f docker-compose.deploy.yml ps       # 全部應該 Up；tunnel HEALTHY
```

---

## ⚠️人手 Step E — Cloudflare Access 鎖 admin（第一日就做）

`admin.` / `uat-admin.` 係 ops 後台，唔可以裸曝公網。去 Cloudflare dashboard →
**Zero Trust → Access → Applications → Add application (Self-hosted)**：

- App 1 domain `admin.certifinehk.com`、App 2 `uat-admin.certifinehk.com`
- Policy：Allow，Include → Emails → 你 / team 嘅 email（免費到 50 users）
- 撳落 admin subdomain 會先彈 Cloudflare 登入頁，過咗先入到個 app

（consumer / api / auth 係俾真用戶用，唔加 Access。）

---

## Step F — 驗證

1. `https://certifinehk.com`、`https://uat.certifinehk.com` 開到頁 + 登入到（Google + password）
2. `https://api.certifinehk.com/api/listings?limit=1` 回 JSON
3. `https://admin.certifinehk.com` 先彈 Cloudflare Access 登入
4. Cloudflare dashboard → Zero Trust → Networks → Tunnels：`certifine` = HEALTHY

---

## ⚠️ 已知限制 / 之後要做

- **Docker Desktop 一定要開住** tunnel 先行；Docker 設定剔「Start when you log in」做到接近開機自啟
  （唔係 launchd 級保證）。
- 用 founder 自己部 Mac 做 PROD：冇備援、跳電/斷網即落線 — 詳 `docs/backlog/self-host-prod-risk-backlog.md`。
  本 doc 只解決「點接得通」，唔改變嗰個風險判斷。
- **Schema sync 用 `prisma db push`**（entrypoint `RUN_DB_PUSH=1`）；上真 cloud 前應轉
  `prisma migrate deploy`（見 release-pipeline backlog）。
- **NEXT_PUBLIC_* build 時焗死**：改公網域名 = 要重 build 前端 image。
- **App 出 email**（提款 OTP 等）而家仲係 dev code `888888`，未接真 SMTP — 同 `cs@` inbound routing
  係兩件事，要真發信另計。
- UAT 網上卡數（真 Stripe-shape）暫時唔行（mock in-process）；要測就日後開 `pay.` subdomain 駁 gateway。
- `docs/backlog/purge-authentik-internals.md`：DB 名 / `@authentik/*` scope 仲係舊名 — 大執嗰陣呢份
  doc 嘅 `DATABASE_URL` / service 名要一齊改。

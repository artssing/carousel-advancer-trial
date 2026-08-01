# PROD 前台未上線 — Backlog

> 2026-08-01 盤點。**起 PROD 之前一定要行完呢張單。**
> 而家真正對外服務嘅得 UAT；PROD 只有 API 喺度跑。

## 現況

| 項 | 狀態 |
|---|---|
| `uat.certifinehk.com` | ✅ 200,正常 |
| `certifinehk.com`（apex） | ❌ DNS 完全解唔到（`dig` 冇 record，唔係 cache 問題） |
| `certifine-api-prod` | ✅ Up |
| `certifine-consumer-prod` / `authenticator-prod` / `admin-prod` | ❌ compose 定義咗,但一個都冇起 |

即係 PROD 前台從來未 publish 過。UAT 一直行得,所以平時睇唔出。

---

## 起 PROD 要做啲乜

### 1. DNS（Cloudflare dashboard）

apex `certifinehk.com` + 三個 portal hostname 要加 CNAME 指去個 named tunnel。
UAT 嗰四條已經行緊,照抄同一個 pattern。

### 2. 起三個 prod frontend container

```bash
docker compose -p carousel-advancer-trial \
  -f docker-compose.yml -f docker-compose.deploy.yml \
  up -d consumer-prod authenticator-prod admin-prod
```

⚠️ **`api-uat` 有 `depends_on: api-prod`** —— 郁 api-uat 會連 api-prod 一齊 restart。
反過嚟亦要小心:唔好順手 `--force-recreate` 成個 stack。

### 3. Tunnel ingress

確認 dashboard 個 named tunnel 有 prod 四條 hostname 嘅 route,唔係淨係 uat 嗰四條。

### 4. 上線前 checklist

- [ ] PROD DB 保持 clean（**永不 auto-seed** —— CLAUDE.md 規矩）
- [ ] `prisma db push` 已行(留意 `SharePreview.uploaderId` 呢類新欄位)
- [ ] `.env.prod` 嘅 R2 / Stripe / JWT secret 齊
- [ ] Stripe 由 test key 轉真 key（見 `docs/backlog/` Stripe 項）
- [ ] Google OAuth redirect URI 有 prod domain
- [ ] CORS 容許 prod origin
- [ ] 自家 Mac 做 PROD 嘅風險 —— 見 `self-host-prod-risk-backlog.md`,上線前要 founder 再拍板

---

**Founder 指示（2026-08-01）**：要起 PROD 嗰陣提返佢跟呢張單。

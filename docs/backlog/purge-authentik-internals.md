# Backlog — 全面清走「authentik」內部字眼（大執）

> Founder 2026-07-20：「authentik 呢個要 remark，之後要大執，我唔想再見到 authentik 呢啲字眼。」
> User-facing 已全部改晒 Certifine（2026-07-20）；下面係內部識別，要一次過安排 downtime 執，
> **唔好散裝改**（每項都有連鎖影響）。

## 要執嘅清單

| 位置 | 現況 | 改法 + 風險 |
|------|------|------------|
| Package scope | `@authentik/ui` `utils` `config` `api-client` | 全 repo import 改 `@certifine/*` + 各 package.json name + tsconfig paths；純機械但檔案量大，type-check 做 gate |
| DB 名 | `authentik` / `authentik_uat` | `ALTER DATABASE RENAME` + `.env.*` DATABASE_URL + `scripts/env-config.sh` + db-copy.sh；要停 API 做 |
| Docker | container `authentik-postgres`、compose project 名、POSTGRES_USER=authentik | compose down/up 重建 volume 或 rename；連帶 start.sh/stop.sh/seed-demo.sh 嘅 `docker compose exec -U authentik` |
| Demo 帳號 email | milan/procheck/cardlab/seller@authentik.hk | seed.ts + seed-demo.sh + docs/demo-accounts.md + DB 現有 rows（UPDATE User SET email）；改完要通知所有測試緊嘅人 |
| Env vars / URLs | `.env.*` 內 DATABASE_URL、CORS_ORIGIN 註釋 | 跟 DB rename 一齊做 |
| Code 雜項 | `authentik-robots-noindex` meta id、log prefix、README/docs 全文 | grep -ri authentik 清尾 |
| Git repo 名 | github.com/artssing/carousel-advancer-trial | 順手一齊諗埋（repo 名本身都唔係 product 名） |

## 執行建議

1. 一個獨立 branch 一次過做晒 package scope + code 雜項（無 runtime 影響嗰批）
2. DB/docker/demo email 另一個 batch，揀冇人用 UAT 嘅時段，跟 runbook 逐步（backup 先行）
3. 每 batch 完：`npm run type-check` + `./start.sh uat` 全綠 + QA smoke
4. 做之前同 founder 確認新 email domain（certifine.hk 定 certifine.com — 面向國際可能想用 .com）

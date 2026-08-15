# `env/` — deploy configuration（repo-split P4 ④）

呢個目錄**屬於 `certifine-infra`**。理由好簡單:**run 嗰個先需要佢**。
拆完之後 `certifine-api` 冇 compose、唔會 deploy,冇道理揸住 production secret。

| 檔 | Tracked? | 入面有咩 |
|---|---|---|
| `compose.prod.env` · `compose.uat.env` | ✅ commit | 純 topology:port、DB 名、public URL、image tag。**從來冇 secret** |
| `api.prod.env` · `api.uat.env` | ❌ 永不 commit | `JWT_SECRET` · `GOOGLE_CLIENT_SECRET` · `DATABASE_URL` · R2 key |
| `tunnel.env` | ❌ 永不 commit | `TUNNEL_TOKEN` |
| `*.env.example` | ✅ commit | 只有 key 名,冇值 |

## 本機開發唔關呢度事

`apps/api/.env`(未 tracked)先係本機 dev 用嗰個,佢跟住 **api repo** 走,
唔喺呢個目錄。搞混咗就會攞住 production `DATABASE_URL` 落本機。

## 搬過嚟嗰陣做過咩(2026-08-15)

原本住喺 `apps/api/.env.prod` / `.env.uat`,而 compose 用 `env_file:` 指住嗰個
路徑 —— **infra 拆走之後嗰個路徑唔存在**,deploy 即刻死。所以先喺 monorepo
入面搬好、驗證過 UAT deploy 得,先至拆。

真值係 `cp` 過嚟嘅,**冇經 git** —— 佢哋由頭到尾都未入過版本控制(`.gitignore`
第 13–14 行),所以 history 入面冇嘢要清。

## 新環境點開

```bash
cp env/api.uat.env.example env/api.uat.env    # 再填返啲值
cp env/tunnel.env.example  env/tunnel.env
```

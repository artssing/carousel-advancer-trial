# 開發工具 / 環境 — Backlog

## 1. `project-coordinator` subagent launch 即死

**症狀**：spawn 即刻收到
> Agent terminated early due to an API error: There's an issue with the selected model (deepseek-v4-pro). It may not exist or you may not have access to it.

**Root cause（2026-07-31 查到）**：agent frontmatter 本身冇問題（`model: sonnet`）。
壞喺 `~/.claude/settings.json` —— 佢將 `ANTHROPIC_BASE_URL` 指去 DeepSeek，再 map
`sonnet` → `deepseek-v4-pro`（拎唔到）。所以**所有** `model: sonnet` 嘅 agent 都死，
唔止 coordinator。

**Workaround（已驗證行得）**：spawn 時加 `model: "opus"`（map 去 `deepseek-v4-flash`，拎到）。
**真修法**：改 `~/.claude/settings.json` 嗰堆 `ANTHROPIC_DEFAULT_*_MODEL`，或者將 3 個
agent frontmatter 改做 `opus`。呢個係 founder 自己部機嘅全域設定，未經同意冇郁。

**影響**：CLAUDE.md 寫明「UI/UX gap 一發現必須 spawn coordinator」，founder 亦成日叫「同 Coordinator 傾」。而家個 agent 用唔到，UX proposal 要 inline 做（founder 照樣收到 ranked proposals + 要 sign-off 嘅位）。

**修法**：改 `.claude/agents/project-coordinator.md` frontmatter 個 model 做拎到嘅 model（sonnet / opus）。順手 check 埋 `.claude/agents/` 其他 agent 係咪同一個壞 model。

---

## 2. Repo root 有殘留檔

未 track、應該係工具意外寫低：
- `undefined.png`
- `undefined.meta.json`

確認冇用就刪，或者查下邊個 script 寫出嚟（filename 係 `undefined` 即係有個變數冇賦值）。

---

## 3. Repo-wide lint 壞（已知）

CLAUDE.md 已記低：`npm run type-check` 先係權威 gate。修 lint config 未排期。

---

## 4. 部署陷阱：`build api-uat` 唔會 rebuild API（2026-08-01 中招）

`docker-compose.deploy.yml` 入面 **`api-uat` 冇 `build:` section** —— 佢直接用
`api-prod` build 出嘅 `certifine-api:latest`。所以:

```bash
# ❌ 表面成功,實際乜都冇 rebuild
docker compose ... build api-uat

# ✅ 要 build 個 image owner
docker compose ... build api-prod
docker compose ... up -d --force-recreate api-prod api-uat
```

中招症狀:consumer 有新 code,API 行緊舊 code,行為對唔上,好易 debug 錯方向。
驗證方法:`docker images | grep certifine-api` 睇個 tag 幾時建,或者
`docker exec certifine-api-uat grep -rl <新函數名> dist/`。

## 5. `prisma db push` 會被 `apps/api/.env` 蓋過

`set -a; . ./.env.uat` export 出嚟嘅 `DATABASE_URL` **入唔到** —— prisma 讀返
`apps/api/.env`(指住 PROD DB)蓋過去。一定要 inline:

```bash
DATABASE_URL="postgresql://…/authentik_uat?schema=public" npx prisma db push
```

出事嗰陣佢照樣印「Your database is now in sync」,所以要自己 verify:
`docker exec authentik-postgres psql -U authentik -d authentik_uat -c "\d \"SharePreview\""`

**PROD DB 連 `SharePreview` 張 table 都未有**(從來未 push 過)—— 上 PROD 前要補,
見 `prod-not-live-backlog.md`。

---

## Playwright fixtures 用緊 demo 帳號（2026-08-11 發現）

`docs/qa/browser/tests/fixtures.ts` 個 `ACCOUNTS` 寫死 `alice@demo.hk` /
`tom@demo.hk` —— 直接違反 2026-08-02「QA 唔准掂 demo 帳號」嘅 ruling，而且
買賣雙方明明有 `qa-buyer` / `qa-seller` 替身，冇任何理由借。

影響三個舊 spec：`browse-mobile` / `seller-profile` / `share-modal`。
新寫嘅 i18n spec 已經用 `docs/qa/browser/tests/i18n-helpers.ts` 嘅 `qa-*`。

改咗要重跑嗰三條驗返，所以未順手改。

## 動態 Tailwind class 全 repo scan（founder 2026-08-10 要求，未做）

`bg-${theme}-600` 呢種寫法 Tailwind 掃唔到（佢掃 source 文字），class 會被 purge。
`RS-10` 而家只守住 `packages/ui/src/components/conversation-pane.tsx` 一個檔。

Founder：「之後要搵機會 code scan 睇下邊個係咁樣寫，要全部執過」。
建議做成 `static` rule，grep pattern 大概係 `` `[a-z-]+-\$\{ `` 落 `className` 入面。

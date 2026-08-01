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

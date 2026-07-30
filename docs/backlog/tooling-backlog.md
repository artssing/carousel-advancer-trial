# 開發工具 / 環境 — Backlog

## 1. `project-coordinator` subagent launch 即死

**症狀**：spawn 即刻收到
> Agent terminated early due to an API error: There's an issue with the selected model (deepseek-v4-pro). It may not exist or you may not have access to it.

試過喺 Agent call 加 `model` override，**一樣死**（override 唔蓋過 agent frontmatter）。2026-07-30 試咗兩次都係。

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

---
name: qa
description: Run or update the Certifine regression suite. Dispatches the qa-tester subagent against docs/qa/scope/ — either one feature/layer, the whole project, or a scope sync. Trigger with /qa run <feature>, /qa run full, or /qa sync <feature|all>.
---

# QA regression

Dispatch to the **qa-tester** subagent. Do not run the cases yourself — the
whole point is to keep the case detail out of the main session's context.

`ARGUMENTS` is `<mode> <selector>`:

| Input | Meaning |
|---|---|
| `run` | **default** — only what changed since the last report, plus smoke (~10–15 min) |
| `run share` | one feature, both layers |
| `run backend` / `run frontend` / `run static` | one layer |
| `run full` | everything — release gate only, 142 min on 2026-08-02 |
| `sync share` / `sync all` | update scope files from code changes |

No arguments at all → `run` (diff-scoped). Only ask which when the selector is
given but matches nothing.

## Before dispatching a `run`

Confirm the code under test is actually deployed to UAT. This is the single
most expensive mistake in this repo — a full run takes ~11 minutes and is
worthless if the container is serving old code.

```bash
docker images | grep certifine          # when was each image built?
docker exec certifine-api-uat grep -rl "<new symbol>" dist/
```

Remember `api-uat` has **no `build:` section** — it uses the image built by
`api-prod`. `docker compose build api-uat` silently rebuilds nothing.

If the deployment is stale, say so and offer to rebuild before spawning.

## Dispatch

Spawn `qa-tester` with the mode and selector, and tell it which change is
under test so it can verify the deployment. It reads its own scope files.

For `sync`, remind it the **shared sweep is mandatory**: every scope file is
diffed against `packages/` as well as its own `owners`, because an `owners`
list always lags behind what a scope actually depends on. Anything the sweep
finds relevant gets added to `owners` on the spot.

## After it returns

Relay the outstanding mismatches, and keep the `Known, unchanged` line as one
line — those were already ruled on and must not re-consume attention. For each one, state plainly that it is
**either a regression or a stale case** and let the founder decide — never
present a mismatch as a confirmed bug, and never start fixing before that
call is made. If the founder rules that a case is stale, run `/qa sync` for
that feature rather than editing the scope file by hand.

## Founder rulings the agent must not re-litigate

- Daily runs are diff-scoped; untouched code is not re-verified every time
  (2026-08-02). The smoke set plus a release-gate `full` covers the risk.
- `browser` lane runs Playwright in a throwaway container; the image is removed
  after every run. Purely visual cases stay `manual`.
- QA uses the `qa-*` accounts, never the demo ones.
- Restoring the UAT DB from a snapshot before a `full` run is allowed, but only
  when explicitly asked for — it destroys anything the founder parked on UAT.

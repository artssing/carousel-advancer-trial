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
| `run share` | one feature, both layers |
| `run backend` / `run frontend` | one layer, all features |
| `run full` | everything |
| `sync share` / `sync all` | update scope files from code changes |

No arguments → ask which, listing the features from `docs/qa/scope/_index.md`.

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

## After it returns

Relay the outstanding mismatches. For each one, state plainly that it is
**either a regression or a stale case** and let the founder decide — never
present a mismatch as a confirmed bug, and never start fixing before that
call is made. If the founder rules that a case is stale, run `/qa sync` for
that feature rather than editing the scope file by hand.

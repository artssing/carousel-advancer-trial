# Backlog — 完整 release pipeline（未做）

> 由 CLAUDE.md 搬出嚟（2026-07-14）。目標：達到「真正 UAT 測完先上 PROD」嘅 code-level isolation
>（而家 UAT/PROD split 只隔離 data + schema + port，唔隔離 code — 同一個 working tree）。

1. **Version control 釘版本**
   - PROD branch（e.g. `release/prod`）只接收已通過 UAT 嘅 commit；`main` = UAT 流動 HEAD
   - Tag 每個 PROD release（`v0.x.y`）+ 自動 changelog
   - PR template 強制：UAT 驗收 checklist、screenshot、reviewer sign-off
2. **Per-env build artifact**
   - UAT 行 `next dev` / `nest start --watch`（即改即見，hot reload）
   - PROD 行 **build artifact**：`next build && next start` + `nest build && node dist/main.js`（鎖定版本，code change 唔會即時 leak）
   - `start.sh prod` 改用 artifact mode；artifact 由 CI 產生 + 簽 hash
3. **CI/CD automation**（GitHub Actions / 同等）
   - Push `main` → run `npm run type-check` + lint + test → 自動 deploy 去 UAT
   - Merge `main → release/prod` 觸發 PROD deploy（行 `db push` schema sync、唔 seed、reload artifact）
   - 失敗自動 rollback（保留前一個 artifact + 自動 restore `.backups/` 嘅 DB snapshot）
4. **真雲端 PROD**（最終態）：managed Postgres（Neon / Supabase）+ R2 object storage + 真 Stripe / Sumsub；UAT 用 staging-tier 同類 service。
5. **DB migration discipline**：而家用 `prisma db push`，去 PROD 之前要切換去 `prisma migrate` workflow（migration files reviewable、reversible），先唔會「fresh DB 缺欄」bug 上雲端重演。

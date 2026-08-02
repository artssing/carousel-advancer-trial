---
layer: frontend
feature: admin
owners:
  - apps/admin/**
  - packages/ui/src/components/language-switcher.tsx
last_synced_commit: 3b8dfcd
---

# Admin portal — Frontend

## Lane budget

`curl` 1 · `static` 1 · `browser` 3 · `manual` 0 —— 2 `verified` · 3 `unverified`（browser，未有 spec）。

- [MP-01] `curl` `verified` — Root 同 `/login` 都 200
  - `curl -o /dev/null -w '%{http_code}\n' https://uat-admin.certifinehk.com/` 同 `/login`
  - 實測 2026-08-03：兩條都 200
  - 理由：最平嘅 smoke，deploy 冇生效即刻睇得出

- [MP-02] `static` `verified` — Dark ops 主題（`bg-slate-950` 系）真係喺 CSS 同 server-rendered HTML 入面
  - `grep -n "bg-slate-950" apps/admin/app/globals.css` → `:6 @apply bg-slate-950 text-slate-100 antialiased`
  - `curl -s https://uat-admin.certifinehk.com/login | grep -o "bg-slate-950\|bg-slate-900"` → `3 × bg-slate-950`、`1 × bg-slate-900`
  - ⚠️ 呢條只講「class 名喺 CSS／HTML 入面」，唔講畫面睇落有幾 dark。
  - 附註（未有 case 覆蓋）：登入頁個語言 switcher 著住 **consumer 淺色 token**
    （`border-line-2 bg-white text-neutral-text-muted`）貼喺 `bg-slate-950` 上面 —— 同 [AP-02]
    係同一類問題（共用 component 帶住 consumer 色去第二個 portal）。要唔要開 case 由 founder 定
  - 理由：Admin 係 ops 工具，dark 主題係刻意嘅識別；改錯咗會同 consumer 混淆

- [MP-03] `browser` `unverified` — Analytics 頁出到真數據，唔係 placeholder
  - 未有 Playwright spec。API 側有真數：`GET $API/analytics/admin/overview` →
    `{"membersOnline":0,"guestsOnline":1,"authenticatorsOnline":0,"asOf":"…"}`（真值，唔係寫死）
  - 理由：admin 睇住個數做決定，render 咗個 placeholder 落去係最危險嘅「睇落正常」

- [MP-04] `browser` `unverified` — 5-tab IA 郁得
  - 未有 Playwright spec。底層 endpoint 見 [AD-01]
  - 理由：九條 API 全部 200 唔代表五個 tab 全部撳得入

- [MP-05] `browser` `unverified` — 非 admin 帳號入唔到
  - 未有 Playwright spec。API 側見 [AU-11] 矩陣（買家／鑑定師 token 打 `/admin/*` 全部 403）
  - 理由：API 403 之後 UI 應該踢返去 login，唔係停喺一版空 dashboard

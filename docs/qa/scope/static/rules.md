---
layer: static
feature: rules
owners:
  - apps/**
  - packages/**
last_synced_commit: bc2a357
---

# CLAUDE.md 規則 lint — Static

呢層唔驗 feature，驗**你自己定落嘅規矩有冇被違反**。全部 lane `static`：
一個 grep 就答到，agent 最強嗰場。

2026-08-02 個 full run 靠 agent 順手撞到四件呢類嘢 —— 靠撞唔係系統。呢個檔就係
將「撞到」變成「每次一定查」。

## Lane budget

`static 8`

---

- [RS-01] `static` `verified` — **`apps/*/app/**` 唔准 hardcode tier 門檻**
  - `grep -rnE '(>=|>) ?(10000|1000)\b' apps/*/app --include=*.tsx | grep -v tierForPrice`
  - 一律行 `packages/utils/src/tier.ts` 個 `tierForPrice`。門檻散落各處，改一次價錢政策就要捉蟲
  - 已知違反：`apps/consumer/app/checkout/**:337`（2026-08-02 報告）

- [RS-02] `static` `verified` — **`apps/authenticator/**` 唔准出現 consumer 綠 `brand-`**
  - `grep -rn 'brand-[0-9]' apps/authenticator --include=*.tsx | grep -v authBrand`
  - 鑑定師 portal 行 `authBrand-*` 靛藍。兩套色撈埋等於冇咗 portal 身分
  - 已知違反：photo-uploader、offer-card、兩個 wallet component、messages（2026-08-02 報告）

- [RS-03] `static` `verified` — **`apps/admin/**` 唔准出現 consumer 淺色 token**
  - `grep -rn 'bg-surface-1\|text-ink\b' apps/admin --include=*.tsx`
  - Admin 係 dark ops 主題。已知違反：admin 登入頁個語言 switcher（共用 component 帶住
    consumer 色入嚟 —— 同 RS-02 同一個根）

- [RS-04] `static` `verified` — **平台唔准 assert 真偽**
  - `grep -rn '我哋保證\|我們保證\|平台保證\|保證真貨\|保證正品' apps packages --include=*.tsx --include=*.ts --include=*.json`
  - 應該係零命中。所有 authenticity claim 歸具名鑑定師（CLAUDE.md 法律 framing）

- [RS-05] `static` `verified` — **成色標註寫法統一**
  - `grep -rno '賣家申報\|賣方申報' apps --include=*.tsx | sed 's/.*://' | sort | uniq -c`
  - 應該只有一種寫法。2026-08-02 撈到三種：`賣家申報`、`賣方申報`、同埋規格表**完全冇標**
  - 冇標註 = 冇歸屬，係三個入面最嚴重嗰個

- [RS-06] `static` `verified` — **analytics event 一定喺白名單**
  - `grep -rhno "track('[a-z_]*'" apps/*/app apps/*/components --include=*.tsx | sed "s/.*track('//;s/'.*//" | sort -u`
    出嚟嘅每個名都要喺 `packages/utils/src/analytics-events.ts` 個 `ANALYTICS_EVENTS` 入面
  - CLAUDE.md：冇 tagging = review blocker；自由命名 = 破壞 SSOT

- [RS-07] `static` `verified` — **customer 資料唔准 hard delete**
  - `grep -rn '\.delete(\|deleteMany' apps/api/src --include=*.ts | grep -viE 'admin|session|token|analytics|sharepreview'`
  - Soft delete only；hard delete 只限 admin 直接落 DB

- [RS-08] `static` `verified` — **enum-like 選項唔准 page 自己 hardcode**
  - `grep -rn "'HANDBAG'\|'SNEAKER'\|'WATCH'\|中西區\|灣仔區" apps/*/app --include=*.tsx`
  - category / district / status / event 名一律出自 `packages/utils`

---

## False positive 點處理

Grep-based assertion 一定會撈到註解、design sample、i18n key。**唔好為咗清零而改
grep 到冇嘢命中** —— 咁樣等於閹咗個 rule。正路做法係喺條 case 下面寫低 allowlist 路徑，
講明點解嗰幾個唔算違反。

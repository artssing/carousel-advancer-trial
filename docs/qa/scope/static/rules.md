---
layer: static
feature: rules
owners:
  - apps/**
  - packages/**
  # ── 呢兩個檔已經俾 `packages/**` 蓋住，但點名寫低，因為 2026-08-11 之後
  #    RS-09 / RS-10 / RS-11 三條 case 嘅 assertion 直接釘住佢哋 ──
  - packages/ui/src/components/conversation-pane.tsx
  - packages/ui/src/components/language-switcher.tsx
last_synced_commit: 21f183f
---

# CLAUDE.md 規則 lint — Static

呢層唔驗 feature，驗**你自己定落嘅規矩有冇被違反**。全部 lane `static`：
一個 grep 就答到，agent 最強嗰場。

2026-08-02 個 full run 靠 agent 順手撞到四件呢類嘢 —— 靠撞唔係系統。呢個檔就係
將「撞到」變成「每次一定查」。

## Lane budget

`static 11` —— 全部 `verified`。
（舊 budget 寫住 8，但實際已經有 9 條 RS-01…RS-09；2026-08-11 加 RS-10 / RS-11 之後係 11。）

---

- [RS-01] `static` `verified` — **`apps/*/app/**` 唔准 hardcode tier 門檻**
  - `grep -rnE '(>=|>) ?(10000|1000)\b' apps/*/app --include=*.tsx | grep -v tierForPrice`
  - 一律行 `packages/utils/src/tier.ts` 個 `tierForPrice`。門檻散落各處，改一次價錢政策就要捉蟲
  - 已知違反：`apps/consumer/app/checkout/**:337`（2026-08-02 報告）

- [RS-02] `static` `verified` — **`apps/authenticator/**` 唔准出現 consumer 綠 `brand-`**
  - `grep -rn 'brand-[0-9]' apps/authenticator --include=*.tsx | grep -v authBrand`
  - 鑑定師 portal 行 `authBrand-*` 靛藍。兩套色撈埋等於冇咗 portal 身分
  - **實測 2026-08-11（sync）：0 命中。** 2026-08-02 嗰批（photo-uploader、offer-card、
    兩個 wallet component、messages）喺 `2da4e21` 執咗；messages 個 body 則係喺 `b7e6aaa`
    整個搬咗去 `packages/ui`。**Baseline 由「已知違反」變 0，唔係 mismatch**
  - ⚠️ **盲點**：0 有一半原因係啲 class 搬咗出 `apps/authenticator` —— 共用
    ConversationPane 而家同時帶住兩個 portal 嘅色，呢條 grep 睇唔到佢。嗰嚿由 **RS-10** 守

- [RS-03] `static` `verified` — **`apps/admin/**` 唔准出現 consumer 淺色 token**
  - `grep -rn 'bg-surface-1\|text-ink\b' apps/admin --include=*.tsx`
  - Admin 係 dark ops 主題
  - **實測 2026-08-11（sync）：0 命中。**
  - ⚠️ **盲點**：舊版寫嘅「已知違反：admin 登入頁個語言 switcher」**從來唔係呢條命令捉到**——
    `LanguageSwitcher` 住喺 `packages/ui`，唔喺 `apps/admin`。條 grep 由頭到尾都見唔到佢。
    admin 真係 mount 緊嘅共用 component 由 **RS-11** 守

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

- [RS-09] `static` `verified` — **已經 wire 咗 i18n 嘅檔唔准再有中文字面值**（app pages/components **+ 共用 component**）
  - ```bash
    for f in $(grep -rl createT apps/*/app apps/*/components packages/*/src/components --include='*.tsx'); do
      grep -nE '[一-鿿。、「」！？：；]' "$f" | grep -vE '^[0-9]+:[[:space:]]*(//|\*|/\*)' | sed "s|^|$f:|"
    done
    ```
    要 per-file tally 就 pipe 落 `| awk -F: '{print $1}' | sort | uniq -c | sort -rn`
  - 有 `createT` = 已經 wire，之後再喺同一個檔 hardcode 中文，英文用戶就會見到一版半中半英 ——
    而呢種倒退唔會令 build 炸，冇人查就會一路蝕
  - 未 wire 嘅頁／component **唔算違反**（清單見 `docs/backlog/i18n-backlog.md` 第 3 項）——
    呢條 rule 守嘅係「做完唔好倒退」，唔係「全部要即刻做完」

  **2026-08-11 改動 ①：路徑加咗 `packages/*/src/components`**（founder ruling）。
  原本兩個限制（路徑只有 `apps/**` + 只掃 import 咗 `createT` 嘅檔）夾埋，令
  `packages/ui/src/components/conversation-pane.tsx`（1,386 行、90 條 `ui.conversation.*` key，
  兩個 portal 共用）**冇任何檢查睇住**。而家喺清單入面。
  `packages/*/src/components` 而唔係 `packages/**`：全 repo 得 `packages/ui/src/components` 一個目錄有 `.tsx`
  （2026-08-11 `find` 過），寫成呢個 glob 係為咗將來多一個 package 都自動入網。

  **2026-08-11 改動 ②：gate 照舊係 `createT`，唔係路徑。**
  呢個係故意嘅 —— `chip.tsx`（1）、`tier-pill.tsx`（3）、`language-switcher.tsx`（4）
  身上都有硬編中文，但佢哋**一個都冇 import `createT`**（2026-08-11 實測：`packages/ui/src` 入面
  只有 `conversation-pane.tsx` 有），即係「未 wire」，按上面條 rule 本來就唔算違反。
  用路徑做 gate 會即刻多 8 個檔／35 行永久假陽性；用 `createT` 做 gate 佢哋自然出局，
  將來邊個檔一 wire 就自動入網 —— 唔使有人記得改條 case。
  `--include='*.tsx'` 亦都必要：`packages/utils/src/locales/data.ts` 入面有 2,943 條中文
  （佢**係**本字典），佢係 `.ts`，永遠入唔到呢條清單。

  **2026-08-11 改動 ③：`grep -P` → `grep -E`。**
  QA box 個系統 grep 係 BSD grep，冇 `-P`（`grep: invalid option -- P`），原本條命令
  喺 non-interactive shell 行唔到。`\s*\d+` 改咗 POSIX `[0-9]+[[:space:]]*`，
  字元 class 同判定**一模一樣**，GNU / BSD / ugrep 三邊都行到（要 `LC_ALL` 係 UTF-8）。

  - **標點一定要包埋**：`。` `、` 唔喺 `一-鿿` 範圍。2026-08-10 codemod 就係咁漏咗
    法律行尾嗰粒 `。`，英文版變咗 `Privacy Policy .`。淨係 grep 漢字係唔夠嘅
  - **註解係預期噪音**：條 grep 濾走 `//` 同 `*` 開頭嘅行，但濾唔到 `{/* … */}`、
    多行註解同行尾註解。睇報告嗰陣自己跳過，**唔好為咗清零而改條 grep**
  - **Baseline（實測 2026-08-11 sync，`21f183f`）：46 個檔入清單，合計 165 行命中。**

    | 檔 | 行 | | 檔 | 行 |
    |---|---:|---|---|---:|
    | `consumer/app/sell/page.tsx` | 44 | | `consumer/components/footer.tsx` | 3 |
    | `consumer/app/orders/page.tsx` | 26 | | `consumer/app/seller/[id]/page.tsx` | 3 |
    | `consumer/app/listing/[id]/page.tsx` | 25 | | `consumer/app/login/page.tsx` | 3 |
    | `authenticator/app/scan/page.tsx` | 12 | | `consumer/app/account/profile/page.tsx` | 3 |
    | **`packages/ui/…/conversation-pane.tsx`** | **5** | | `consumer/app/page.tsx` | 2 |
    | `consumer/components/share-ig-modal.tsx` | 4 | | `consumer/app/my-listings/page.tsx` | 2 |
    | `consumer/app/orders/[id]/page.tsx` | 4 | | `consumer/app/checkout/[orderId]/page.tsx` | 2 |
    | `consumer/app/browse/page.tsx` | 4 | | `consumer/app/account/wallet/page.tsx` | 2 |
    | `authenticator/app/inbox/page.tsx` | 4 | | `consumer/app/about/page.tsx` | 2 |
    | `consumer/components/top-nav.tsx` | 3 | | `consumer/components/wallet/cashout-wizard.tsx` | 1 |
    | `consumer/components/product-card.tsx` | 3 | | `consumer/components/station-picker.tsx` | 1 |
    | `consumer/components/offer-card.tsx` | 3 | | `consumer/components/qr-handover-card.tsx` | 1 |
    | | | | `consumer/app/authenticator/[id]/page.tsx` | 1 |
    | | | | `consumer/app/account/wallet/methods/page.tsx` | 1 |
    | | | | `authenticator/app/page.tsx` | 1 |

  - **參考數（唔係 assertion）**：同一組檔剝走 `//` / `/* */` / `{/* */}` 之後剩 **89 行 / 13 個檔**
    —— 即係話 165 入面約 76 行係註解噪音。集中喺 `sell 36` · `orders 25` · `listing 10` ·
    `scan 8` 四個檔，其餘九個檔各 1–2 行。列出嚟純粹係方便睇報告嗰陣分辨「新增嗰行係註解定係字串」
  - Expected：**每個檔嘅數唔准升**。升咗就貼出新增嗰幾行，並且講明係註解定係真字面值。
    數跌 = 有人做咗嘢，順手喺呢度改個數，**唔係 mismatch**
  - 已知真·字面值（唔係註解，2026-08-11 實測）：
    - `apps/authenticator/app/scan/page.tsx:253-254`、`app/page.tsx:162` ——
      用 `locale === 'en' ? 'Seller' : '賣家'` 嘅 inline ternary 而唔係 ssot key。
      **翻譯散落喺 page，唔喺 SSOT**，語言切換行得但改字要入 code 搵。應該收返入 `locales/ssot.json`
    - `apps/authenticator/app/scan/page.tsx:174/349/351/356/366` —— UAT-only token 面板 + error string
    - `apps/consumer/app/sell/page.tsx`（36）、`orders/page.tsx`（25）、`listing/[id]/page.tsx`（10）
      —— 三版係**半 wire**（有 `createT`，但仲有大截未收）。同 IN-12 個 page-scan baseline
      （sell 29 / orders 19）數字唔同係正常：呢條數**行**，IN-12 數**字串**
    - `apps/consumer/app/login/page.tsx:198` —— `Dev demo：` 用全形冒號，英文版都係全形。
      Dev-only 面板，優先度最低
    - `packages/ui/src/components/conversation-pane.tsx:342` —— 行尾註解 `// 初次載入訊息 shimmer`，
      唔係 UI 字串（另外四行係 `{/* … */}` JSX 註解：`786` `1002` `1044` `1341`）
  - **同 IN-13 嘅界線（`docs/qa/scope/frontend/i18n.md`）**：呢條收
    **已經 wire（有 `createT`）**嗰批，IN-13 收 `packages/ui` 入面**未 wire（冇 `createT`）**嗰批。
    IN-13 條 script 2026-08-11 加咗 `if 'createT' in src: continue`，
    所以 `conversation-pane.tsx` 由 IN-13 移交咗俾呢條 —— **冇任何一行 source 兩邊都報得到**

- [RS-10] `static` `verified` — **共用 ConversationPane 唔准喺 token table 以外寫死 portal 色**
  - ```bash
    python3 - <<'PY'
    import re
    src=open('packages/ui/src/components/conversation-pane.tsx').read().split('\n')
    whole='\n'.join(src)
    blk=re.search(r'const THEME_TOKENS = \{[\s\S]*?\n\} as const;', whole)
    start=len(whole[:blk.start()].split('\n')); end=start+len(blk.group(0).split('\n'))-1
    auth=blk.group(0).split('authenticator: {',1)[1]
    print('THEME_TOKENS lines', start, '-', end)
    print('authenticator table 入面漏咗 consumer 綠:', re.findall(r'(?<!auth)\bbrand-\d', auth))
    out=[(i+1,l.strip()) for i,l in enumerate(src)
         if re.search(r'(?<!auth)(?<!auth-)\bbrand-\d', l) and not (start<=i+1<=end)]
    print('THEME_TOKENS 以外嘅 brand-N:', len(out))
    for i,l in out: print('  ',i,l)
    PY
    ```
  - **實測 2026-08-11（sync）：`THEME_TOKENS lines 44 - 67` · `authenticator table 入面漏咗 consumer 綠: []` ·
    `THEME_TOKENS 以外嘅 brand-N: 0`**
  - Expected：**後兩項都要空／0**（硬零）
  - 點解要新開一條，而唔係擴闊 RS-02：`b7e6aaa` 之後 ConversationPane 個 body
    由 `apps/authenticator/components/`（929 行）搬咗去 `packages/ui`，兩個 portal 經
    `theme="consumer"` / `theme="authenticator"` prop 食同一份 body。
    即係話**鑑定師 portal render 緊嘅綠色 class 而家一行都唔喺 `apps/authenticator` 入面**，
    RS-02 條 grep 永遠見唔到。
    但**唔可以**簡單將 RS-02 擴闊去 `packages/ui` —— `button` / `badge` / `input` /
    `confirm-dialog` / `otp-input` / `listing-thumb` 身上嘅 `brand-*` 係
    「共用 primitive 嘅 consumer 預設值」，係合法嘅，擴闊即刻多 8 個檔永久假陽性。
    真正要守嘅係**呢個檔**嘅約束：綠色只准住喺 `THEME_TOKENS.consumer` 入面，
    一旦有人喺 JSX 直接寫 `bg-brand-600`，兩個 portal 都會著綠 —— 呢條就係捉嗰樣
  - ⚠️ `static` 到此為止：條 case 只講「source 入面有／冇」。
    「鑑定師 portal 畫面真係靛藍」係 browser lane 嘅事（`docs/qa/scope/frontend/i18n.md` IN-17 個 spec 順路）

- [RS-11] `static` `verified` — **admin 掛住嘅共用 component 唔准帶 consumer 淺色 token**
  - ```bash
    grep -nE 'bg-surface-1|text-ink([^-a-z]|$)' \
      packages/ui/src/components/language-switcher.tsx \
      packages/ui/src/components/confirm-dialog.tsx
    ```
    （清單點嚟：`grep -rn '@authentik/ui' apps/admin --include='*.tsx'`。
    admin 加咗新 import 就要順手加入上面條命令 —— 呢個係人手步驟，寫低咗）
  - 範圍 = admin 真係 import 緊嘅兩個共用 component（2026-08-11 實測
    `grep -rn '@authentik/ui' apps/admin`：`LanguageSwitcher`（`app/layout.tsx:5`）
    同 `ConfirmDialog`（7 版）。**唔係**成個 `packages/ui`）
  - **實測 2026-08-11（sync）：1 行命中** ——
    `language-switcher.tsx:54`（`hover:text-ink focus:text-ink`）
  - Expected：**維持 1 行，而且淨係嗰行**
  - **Allowlist / 點解嗰行唔算違反**：`:54` 喺 `variant === 'select'` 條分支入面，
    嗰個 variant 只有 consumer footer 用（`apps/consumer/components/footer.tsx`）。
    Admin / authenticator 行預設 `button` variant（`:72-81`），
    嗰段係 `bg-transparent border-current/20` —— 刻意借主場色。
    **唔准**因為想清零而刪咗嗰行 `text-ink`（會整衰 consumer footer hover）
  - 點解要新開一條：RS-03 條 grep 只掃 `apps/admin`，但 admin 個語言掣同確認 dialog
    嘅 class 一行都唔喺 `apps/admin` 入面 —— RS-03 自己張「已知違反」都寫住
    「admin 登入頁個語言 switcher（共用 component 帶住 consumer 色入嚟）」，
    即係**嗰條違反從來唔係佢自己條命令捉到嘅**。呢條就係補返個窿
  - 理由（歷史）：`b7e6aaa` 將個掣由 `bg-white` 改做 `bg-transparent border-current/20`，
    2026-08-02 admin 深色底嗰嚿白色團就係咁嚟。修好咗，但冇任何嘢阻止佢重新長返出嚟

---

## False positive 點處理

Grep-based assertion 一定會撈到註解、design sample、i18n key。**唔好為咗清零而改
grep 到冇嘢命中** —— 咁樣等於閹咗個 rule。正路做法係喺條 case 下面寫低 allowlist 路徑，
講明點解嗰幾個唔算違反。

---

## Sweep 記錄（2026-08-11，`bc2a357..21f183f`，selector `rules`）

`owners` 係 `apps/** packages/**`，所以 owners diff 已經包住 shared sweep；
但照規矩獨立行多次 `git diff bc2a357..HEAD -- packages/`，5 個檔：

| 檔 | 關唔關事 | 處置 |
|---|---|---|
| `packages/ui/src/components/conversation-pane.tsx` | **關（三條）** — 新增 1,386 行；自己 `createT`；同時帶住 `brand-*` 同 `authBrand-*` 兩套 token | RS-09 擴闊路徑收咗佢；新開 **RS-10** 守 token table；點名入 `owners` |
| `packages/ui/src/components/language-switcher.tsx` | **關** — `bg-white` → `bg-transparent border-current/20`，admin/authenticator mount 緊佢 | 新開 **RS-11**；點名入 `owners` |
| `packages/ui/src/index.ts` | **唔關** — 淨係 re-export，冇 class 冇字串，冇 case 靠佢 | 不變 |
| `packages/ui/package.json` | **唔關（呢個 scope 而言）** — 新增 `@authentik/utils` dep。RS-09 靠 `createT` 出現喺 source，唔靠 package.json | 不變（`frontend/i18n.md` 已經收咗） |
| `packages/utils/src/locales/data.ts` | **唔關，但要主動擋** — 2,943 條中文嘅 generated 字典。如果 RS-09 條 grep 冇 `--include='*.tsx'`，佢會即刻炸出幾千行假陽性 | 已經喺 RS-09 寫明點解要 `*.tsx` |

### 逐條 case 過一次 sweep（其餘）

- **RS-01**（tier 門檻）· **RS-04**（保證真偽）· **RS-05**（成色標註）· **RS-06**（analytics 白名單）·
  **RS-07**（hard delete）· **RS-08**（enum hardcode）—— sweep 五個檔冇一個掂到呢六條嘅 assertion。
  一行講完，冇加 case。
- **RS-02 / RS-03** —— 兩條都出現咗同一種盲點（見各自條 case 個 ⚠️）：
  portal 色 token 搬咗入 `packages/ui`，兩條只掃 `apps/*` 嘅 grep 追唔到。
  已經新開 RS-10 / RS-11 補窿，**兩條原 case 嘅路徑冇改**（擴闊佢哋去成個 `packages/ui`
  會即刻多十幾行永久假陽性 —— 共用 primitive 帶 consumer 預設色係合法嘅）。

### 刻意留低、冇動嘅嘢

- `packages/ui/src/components/pill.tsx:26` 有 `text-ink`（consumer 淺色 token）。
  Admin 冇 import `Pill`（2026-08-11 `grep -rn '@authentik/ui' apps/admin` 得
  `ConfirmDialog` 同 `LanguageSwitcher`），所以**唔喺 RS-11 範圍**。
  將來 admin 一 import `Pill` 就要加入 RS-11 條清單 —— 記低喺呢度，唔開 case。
- ConversationPane 嘅 `text-ink`（`:763/768/773/777`，4 處）同樣冇動：
  鑑定師 portal 係白卡主題（見 `confirm-dialog.tsx:24` 個 header），`text-ink` 喺嗰度係啱嘅；
  而佢根本唔喺 admin。**唔係違反，唔入任何 case。**
- RS-09 條 baseline 由「4 個檔」升到「46 個檔 / 165 行」，**唔係倒退**：
  `bc2a357` 之後嗰 20 幾個 i18n commit 將幾十版 page wire 咗 `createT`，
  佢哋一 wire 就自動入咗 RS-09 個網（sell / orders / listing 三版係半 wire）。
  呢個係 gate 照設計運作，唔係產品變差。**冇喺呢度判係咪 bug** —— 落到 `/qa run` 先報。

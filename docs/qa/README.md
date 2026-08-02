# QA Regression System

> Founder ruling 2026-08-02。呢個系統嘅存在理由：**每次改完嘢唔使人手諗要 test 咩**。

## 三個角色，分工唔可以混

| 角色 | 做乜 | 唔做乜 |
|---|---|---|
| **qa-tester subagent** | 行 case、記錄 actual result、出報告列 outstanding issues | **唔判斷係咪 bug**、唔改 code、唔改 scope 判斷 |
| **Founder / coordinator** | 睇報告，決定「呢個係 bug」定「actual 先啱，scope 舊咗」 | — |
| **主 session（Claude）** | 拍板之後先去 fix，或者去 sync scope | — |

**點解要咁分**：scope 一定會落後於 code。QA 見到 expected 同 actual 唔同，好可能係**個 case 舊咗**，唔係件貨壞咗。今次 2026-08-01 個 full run 就係咁 —— 佢報 FAIL，但實情係部署未生效，唔係 code 有問題。QA 自己判斷會誤導人。

所以報告嘅語氣一律係 **「MISMATCH：expected X，actual Y」**，唔係「BUG」。

---

## 檔案結構

```
docs/qa/
  README.md          ← 你而家睇緊呢個
  runbook.md         ← 環境、帳號、部署陷阱（每次開跑前必讀）
  known.md           ← founder 判過嘅 issue，之後靜音唔再搶注意力
  scope/
    _index.md        ← selector → scope 檔嘅對照表（agent 第一個讀嘅嘢）
    backend/*.md     ← API 層 case
    frontend/*.md    ← 畫面層 case
    static/*.md      ← CLAUDE.md 規則 lint（grep 就答到）
  browser/           ← Playwright（browser lane），Docker 入面跑
  reports/           ← 每次 run 出嘅報告（YYYY-MM-DD-<selector>.md）
```

每個 scope 檔開頭有 frontmatter：

```yaml
---
layer: backend | frontend | static
feature: share
owners:                      # 呢節 scope 覆蓋緊邊啲檔
  - apps/api/src/storage/**
last_synced_commit: 8029541  # sync 嗰陣只讀呢個 commit 之後嘅 diff
---
```

`last_synced_commit` 係慳 token 嘅關鍵 —— sync 唔會 re-read 成個 codebase，淨係讀 delta。

---

## 四個 mode

### 1. Run — 預設，只驗改動咗嘅嘢

```
/qa run
```

**呢個係日常用嗰個。** Agent：讀上一份報告個 HEAD → `git diff <上次>..HEAD` →
用各 scope 檔嘅 `owners` 反查中招嘅檔 → 只跑嗰幾個 **+ 一組固定 smoke**（登入、
browse 200、tier 邊界 999/1000/9999/10000、下單→付款 happy path、role 403 矩陣）。
典型 10–15 分鐘。

**放棄咗嘅嘢**：冇郁過嘅 code 唔會每次重驗。佢可以因為環境／data／dependency
靜靜壞咗而捉唔到 —— 所以 smoke 集永遠跑，加上 release 前跑 full。
Founder 2026-08-02 接受呢個取捨，理由係現況更差：舊做法係「重驗咗，但當中
38 條係假重驗」。

### 2. Run — by function

```
/qa run share
/qa run backend          # 成個 backend layer
```

指定 feature 或者 layer。改完一樣嘢想即刻驗返嗰樣就用呢個。

### 3. Run — full

```
/qa run full
```

讀晒所有 scope 檔。**Release gate 同大 refactor 專用**，唔係日常。
Baseline（2026-08-02 實測）：134 條、142 分鐘。太耐嘅話要按 feature 分片並行跑。

### 4. Sync — 更新 scope

```
/qa sync share
/qa sync all
```

Agent：對每個目標 scope 檔，由佢個 `last_synced_commit` 起計，diff **兩組路徑**：

1. 佢自己個 `owners`
2. `packages/`（**shared sweep**，強制，唔可以跳）

**只讀有變嘅檔**，加／改／刪 case，然後更新 `last_synced_commit`。兩組都空就即刻收工。

Shared sweep 嘅存在理由：`owners` 一定會落後 —— 有人用咗個新 component 但唔記得寫落去，
嗰個檔就永遠隱形。2026-08-02 就係咁：`tier-pill.tsx` 得 browse 一個 scope 認頭，
但 sell 同 checkout 都有 case 靠佢，改咗 label 佢哋一世唔知。

Sweep 見到有關嘅檔，**要順手加返入 `owners`** —— 下次就唔使靠 sweep 執返。
大部分時候 sweep 嘅結論係「同我無關」，一行講完就算，唔好為咗交功課砌 case 出嚟。

Sync **淨係改 scope 檔**，唔會改 code，唔會判斷邊個 case 係 bug。

---

## Case 格式

```markdown
- [SB-02] `curl` `verified` — 文字檔扮 `image/png` 上載 → **400 只接受圖片檔案**
  - `POST /api/share-previews` -F 'file=@fixtures/not-an-image.txt;type=image/png' -F 'listingId=<id>'
  - 理由：magic-byte sniff，唔可以信 client 報嘅 mimetype
```

每條一定要有 **lane** 同 **status** 兩個標記。

### Lane —— 邊個驗、點驗

| lane | 意思 | 邊個行 |
|---|---|---|
| `curl` | 打 API，assertion 睇 status／body | qa-tester |
| `static` | grep source／container bundle 就答到 | qa-tester |
| `browser` | 一定要 rendered DOM 或者真撳落去 | browser lane |
| `manual` | 要人眼判斷（視覺、色感、手感） | founder，release checklist |

**Lane 一定要老老實實標。** `static` 嘅 assertion 只准講「source／bundle 入面有／冇某個字串」，
**唔准**寫「所以個畫面應該係咁」 —— grep 到個 class 名唔等於畫面 render 成點。
要講畫面就係 `browser`。

報告會照 lane 出 budget，跑之前就知道今次覆蓋幾多，唔會跑完先話你知有幾多條冇驗。

### Status —— 驗過未

- `unverified` — `sync` 新產出，**未曾真係跑通過**。唔計入報告總數，只列做「新增待確認」。
- `verified` — 至少成功執行過一次（match 定 mismatch 都算），route／body／assertion 證實打得通。
- `pending` — 暫時冇 surface 造得到嗰個 state，等將來。唔計入總數。

**點解要呢個 gate**：case 由讀 code 同記憶寫出嚟就會錯，而錯咗嘅 case 唔止嘥時間 ——
2026-08-02 有條 case 個 body key 估錯，API 回 **500**，睇落同真 bug 一模一樣。
**一條寫錯嘅 case 可以偽造出一個 product bug**，呢個仲危險過漏測。

### 其他規矩

- ID（`<前綴>-<兩位數>`）**永不重用** —— 刪咗留空號，舊報告先對得返。
- 每條要寫**理由**，唔係淨係寫步驟。sync 嗰陣先分得出「呢條仲有冇意義」。
- Expected 用**粗體**。
- `curl` case 要寫**成條 copy 得走嘅指令**（method + path + 最少 body），行嘅人唔使入 codebase 翻。
- **任何數字門檻都要寫死 input 同計時起訖點。** 反例：「upload 3 秒內完成」——
  9KB 圖 1.8 秒、4.4MB 圖 7.5 秒，同一條 case 兩個相反結論。要寫成
  「用 `docs/qa/fixtures/share-1080x1350.png`（9.4KB），由 request 發出到收到 201，**< 3s**」。
- 一條 case 只可以有**一個**結論。一半 API 一半畫面嘅要拆兩條（一條 `curl`、一條 `browser`）。

---

## Known issues register

Founder 判過一次嘅 mismatch 入 `known.md`，之後 run 撞返同一條就只喺
「Known, unchanged ×N」一行帶過，唔會再入 Outstanding。

**點解要有**：WA-06 喺 08-01 報過、scope 檔自己都記低咗未修，08-02 又再食一次
founder 注意力。報告要分得出「新嘢」同「舊嘢」，唔係每次由零 triage。

Register 每行記低當時嘅 **evidence 指紋**。actual 同記錄唔同咗就強制重報 ——
呢個係防止 register 腐爛（code 修好咗但 register 冇更新，靜音咗本應重報嘅嘢）。

---

## 每次 run 留低嘅測試數據

2026-08-02 一次 full run 造出：9 件 listing、4 張 order、1 個 payment、
5 個 share preview、**2 個 payout intent（其中一個係 tom 名下 HK$100 PROCESSING）**、
約 20 行 analytics、2 個 admin action。

呢啲嘢會反過來污染測試結果（admin finance 數字、analytics aggregate），
所以規矩係：

1. **QA 唔准用 demo 帳號** —— 用 `qa-buyer@demo.hk` / `qa-seller@demo.hk` /
   `qa-auth@authentik.hk`。demo 帳號要保持乾淨俾你 demo。
2. 每次 run 生成 run-id（`qa-20260802-a`），listing title 前綴同 analytics
   `anonymous_id` / `session_id` 一律用佢，事後認得返。
3. **Full run 之前**由乾淨 snapshot 還原 UAT DB（行現有 `scripts/db-copy.sh`）。
   一次過解決殘留，唔使逐類寫 cleanup。
   **要明示先做** —— 還原會炸走你人手放喺 UAT 嘅嘢，唔可以自動。

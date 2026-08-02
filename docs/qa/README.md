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
  scope/
    _index.md        ← selector → scope 檔嘅對照表（agent 第一個讀嘅嘢）
    backend/*.md     ← API 層 case
    frontend/*.md    ← 畫面層 case
  reports/           ← 每次 run 出嘅報告（YYYY-MM-DD-<selector>.md）
```

每個 scope 檔開頭有 frontmatter：

```yaml
---
layer: backend | frontend
feature: share
owners:                      # 呢節 scope 覆蓋緊邊啲檔
  - apps/api/src/storage/**
last_synced_commit: 8029541  # sync 嗰陣只讀呢個 commit 之後嘅 diff
---
```

`last_synced_commit` 係慳 token 嘅關鍵 —— sync 唔會 re-read 成個 codebase，淨係讀 delta。

---

## 三個 mode

### 1. Run — by function

```
/qa run share
/qa run checkout
/qa run backend          # 成個 backend layer
/qa run frontend
```

Agent：讀 `_index.md` → 解析 selector → **只讀對應嗰幾個 scope 檔** → 行 case → 出報告。
平、快，改完一個 feature 就跑呢個。

### 2. Run — full

```
/qa run full
```

讀晒所有 scope 檔。Baseline（2026-08-01 實測）：約 75K token、53 個 tool call、11 分鐘。
Release 前 / 大 refactor 之後先跑。

### 3. Sync — 更新 scope

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
- [S-01] 文字檔扮 `image/png` 上載 → **400**
  - `POST /api/share-previews`，body = 純文字，Content-Type: image/png
  - 理由：magic-byte sniff，唔可以信 client 報嘅 mimetype
```

- ID（`<前綴>-<兩位數>`）**永不重用** —— 刪咗就留空號，咁樣舊報告嘅編號先對得返。
- 每條要寫**理由**，唔係淨係寫步驟。sync 嗰陣先分得出「呢條仲有冇意義」。
- Expected 用**粗體**，方便報告對照。

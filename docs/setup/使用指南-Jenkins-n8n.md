# Jenkins + n8n 使用指南（完全唔識 IT 都睇得明）

> 呢份 doc 講你部電腦上面套「自動發佈系統」係咩、幾時幫到你、日常點行、撞到問題點算，
> 同埋 n8n（自動通知）點開點用點自己改。全部用大白話，唔使識 IT。

---

## 一、呢套嘢係咩？（一個比喻）

想像你開緊一間餐廳：

- **Jenkins = 一個唔識攰嘅後廚助手。** 你每次改完個餐牌（改 code），佢就自動幫你：檢查食材有冇問題 → 煮好 → 擺盤 → 試味 → 端出去。一句指令，佢由頭做到尾，做錯一步就即刻停手嗌你，唔會搞出一碟壞嘢畀客人。

- **n8n = 一個傳話 + 提醒嘅機械人。** Jenkins 做完，n8n 就 send 個訊息去你手機（WhatsApp / Telegram）話你知「搞掂喇」定「出事喇」。佢仲可以喺上 PROD（正式環境）之前，send 個「批唔批准？」畀你撳。

簡單講：**你負責改嘢，佢哋負責幫你檢查、發佈、通知。**

---

## 二、佢實際幫你做咩？（自動流水線 8 步）

你每次叫佢部署，佢會自動行以下 8 步。**任何一步唔掂，佢即刻停，唔會繼續整爛嘢：**

| 步 | 佢做緊咩（人話） |
|---|---|
| 1 | 抄一份你嘅 code 出嚟做（**唔會搞你正在改緊嗰份**） |
| 2 | 裝返需要嘅工具 |
| 3 | **檢查 code 有冇打錯 / 漏嘢**（打錯字即刻捉到，唔會發佈壞版本） |
| 4 | 確保資料庫（database）行緊 |
| 5 | 將 4 個 app（買賣、鑑定、後台、API）**打包成可以真正上線嘅版本** |
| 6 | **（淨係 PROD 先有）停低，等你親手撳「批准」** |
| 7 | 開返啲 server（真正部署） |
| 8 | 自動試下打唔打得開（開唔到就當失敗） |

全部做完 → 綠色 ✅ 成功。中間有紅色 ❌ → 停低通知你，冇嘢被搞爛。

---

## 三、咩情況下佢會幫到你？

**任何以下情況，佢都幫到手：**

- **改完嘢想快啲試** → 一句 `./ci.sh build uat`，唔使自己 build、自己開 4 個 server。
- **驚上正式環境（PROD）搞爛嘢** → PROD 有「批准」關卡，一定要你親手撳先會上。
- **唔小心改壞咗 code（打錯字、漏咗嘢）** → 第 3 步即刻捉到，**根本唔會發佈個壞版本**。
- **成日唔記得要 build 邊幾個部分** → 佢自動順住次序 build 晒，唔會漏。
- **想一邊開發、一邊留住一個穩定版本畀人睇 / demo** → 你 dev 用一套 port，Jenkins 部署用另一套 port，**兩個同時行，唔會爭**。
- **唔喺電腦前都想知成功定失敗** → n8n 自動 send 去你 WhatsApp / Telegram。
- **想每晚自動檢查系統仲行唔行** → n8n 可以定時去 check，出事先嗌你。
- **同事接手 / 自己隔幾個月返嚟** → 唔使記一大堆步驟，睇呢份 doc + 幾句指令就搞掂。

---

## 四、日常點行？（照住做就得）

> 所有指令都喺你個 project 資料夾（`carousel-advancer-trial`）入面，開 Terminal `cd` 入去先行。

### 🟢 開工（開電腦之後行一次）

```bash
docker compose -f docker-compose.yml up -d postgres   # 起資料庫
./ci.sh start                                         # 起 Jenkins + n8n
```

起好之後：
- **Jenkins 網頁**：http://localhost:8080　（帳號 **admin** / 密碼 **admin**）
- **n8n 網頁**：http://localhost:5678

### 🚀 部署去 UAT（測試環境，日常用呢個）

```bash
./ci.sh build uat
```

- 睇住佢跑：開 http://localhost:8080 → 撳 `authentik-pipeline` → 撳最新嗰次 build → Console Output。
- 部署好之後，UAT 網站喺：
  - 買賣：http://localhost:3118
  - 鑑定師：http://localhost:3111
  - 後台：http://localhost:3113

### 🔒 部署去 PROD（正式環境，要批准）

```bash
./ci.sh build prod
```

- 佢會跑到一半**停低等你批准**。
- 入 http://localhost:8080 → 個 build 度會有粒「**Deploy PROD**」掣，撳咗先會真正上線。
- PROD 網站喺 3108 / 3101 / 3103。

### 🌙 收工

```bash
./ci.sh stop        # 停 Jenkins + n8n（你嘅資料唔會冇）
```

---

## 五、所有指令一覽（Cheat Sheet，可以印出嚟貼堂）

| 指令 | 做咩 | 幾時用 |
|---|---|---|
| `./ci.sh start` | 起 Jenkins + n8n | 開電腦後 |
| `./ci.sh stop` | 停 Jenkins + n8n | 收工 |
| `./ci.sh status` | 睇下係咪行緊 | 唔知有冇開親 |
| `./ci.sh build uat` | 部署去 UAT | 改完嘢想試 |
| `./ci.sh build prod` | 部署去 PROD（要批准） | 正式上線 |
| `./ci.sh rebuild uat` | 同 build uat 一樣（改完再試） | fix 完再跑 |
| `./ci.sh savelog` | 將最新 build log 存落檔案 | fail 咗要搵人幫手 |
| `./ci.sh password` | 攞 Jenkins 密碼 | 唔記得密碼 |
| `./ci.sh logs jenkins` | 睇 Jenkins 系統 log | Jenkins 自己有問題 |
| `./ci.sh fresh uat` | 完全重來（少用） | 改咗 pipeline 結構先要 |

---

## 六、撞到問題 / Fail 咗點算？（三步）

**唔使自己 debug，跟住做：**

1. 行 `./ci.sh savelog`（佢會將錯誤 log 存落 `.ci-logs/latest.log`）
2. 同 Claude 講一句「**fail 咗**」
3. Claude 會直接讀個 log 檔幫你搵原因、改好 → 你再行 `./ci.sh rebuild uat`

就係咁簡單，唔使你 copy 一大堆嘢。

---

## 七、n8n：點開、點用、點自己改

### n8n 係咩？
一個「唔使寫 code 就砌到自動化」嘅工具。喺呢度佢負責：Jenkins 一 build 完，就 send 通知去你手機；仲可以定時做嘢（例如每晚 check 系統）。

### 點開？
瀏覽器去 **http://localhost:5678**（`./ci.sh start` 之後就開到）。第一次會叫你設定一個 n8n 帳號（自己揀 email + 密碼，記住佢）。

### Jenkins 同 n8n 點連埋？
已經幫你駁好咗：**Jenkins 每次 build 完，會自動 send 結果去 n8n**（成功 / 失敗、邊個環境、link）。你淨係要喺 n8n 整一個「收到之後 send 去我手機」嘅流程（叫 workflow），Activate 咗就收到。

👉 詳細一步步（Telegram 快速版 + WhatsApp 正式版）睇：**`docs/setup/n8n-通知設定.md`**

### 點自己改 / 加新自動化？
n8n 入面一個「workflow」= 一串積木（叫 node），由左到右一格接一格。例如通知 workflow：

```
[收到 Jenkins 通知] → [send 去 WhatsApp]
```

你可以自己加積木，例如：
- **只想失敗先通知**：中間加一個「如果 status = failure」嘅判斷格。
- **每晚自動 check 網站開唔開到**：加一個「定時（每日 00:00）」→「開網站」→「開唔到就通知」。
- **上 PROD 之前要你手機撳批准**：加「send 兩個掣（批 / 唔批）」→ 你手機撳咗先繼續。

改法：喺 n8n 撳 `+` 加 node → 揀你要嘅動作 → 用線連埋 → 撳右上 **Save** + **Active**。改壞咗唔緊要，改返轉頭就得，唔會影響 Jenkins。

---

## 八、成套嘢係點連埋一齊（一張圖）

```
   你改完 code
        │
        ▼   ./ci.sh build uat
   ┌─────────────┐        ┌──────────────┐
   │   Jenkins   │───────▶│     n8n      │──▶  你手機
   │ 檢查+打包+   │ build  │  收到通知     │    (WhatsApp /
   │ 部署+試開    │ 完通知 │  send 去手機  │     Telegram)
   └─────────────┘        └──────────────┘
        │
        ▼
   UAT 網站 (3118…)  /  PROD 網站 (3108…，要批准)
```

---

## 附：兩套環境一覽

| | 你 dev（`start.sh`，即改即見） | Jenkins 部署（打包好嘅版本） |
|---|---|---|
| UAT 買賣網 | http://localhost:3018 | http://localhost:3118 |
| UAT API | http://localhost:4010 | http://localhost:4110 |
| PROD 買賣網 | http://localhost:3008 | http://localhost:3108 |

兩套用唔同 port，**可以同時行，唔會爭**。

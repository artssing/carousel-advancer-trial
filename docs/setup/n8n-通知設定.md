# n8n 通知設定：Jenkins build 完自動 send 去你手機

> 目標：每次 Jenkins build 完（成功 / 失敗），你手機收到一個訊息。
> **WhatsApp 係正式方案，但 setup 較長；建議先用 Telegram（5 分鐘搞掂）跑通，再慢慢換 WhatsApp。**

---

## 通知係點流動嘅（睇一眼就明）

```
Jenkins build 完
   │  自動 POST 去 →  http://n8n:5678/webhook/build-status
   ▼
n8n workflow：[收到] → [send 去 WhatsApp / Telegram]
   ▼
你手機收到：「Authentik build success · uat · #12」
```

Jenkins 嗰邊**已經幫你設定好**（`N8N_NOTIFY_URL`）。你淨係要喺 n8n 整「收到之後 send」嗰個 workflow。

> ⚠️ 設定完 `N8N_NOTIFY_URL` 之後，要行一次 `./ci.sh start` 令 Jenkins 讀到個新設定（只需一次）。

---

## 方案 A：Telegram（快，建議先用）

### 1. 開一個 Telegram bot（攞 token）
1. 喺 Telegram 搜 **@BotFather** → 開對話 → send `/newbot`
2. 跟指示改名 → 佢會畀你一串 **token**（似 `123456:ABC-xxx`），copy 低。

### 2. 攞你自己嘅 chat id
1. 喺 Telegram 搜 **@userinfobot** → send 任何嘢 → 佢會回你一個 **Id**（一串數字），copy 低。
2. （記得同你個新 bot 先講句嘢，佢先 send 到畀你。）

### 3. 喺 n8n import 個現成 workflow
1. 開 http://localhost:5678 → 左上 **⋯ / Workflows** → **Import from File**
2. 揀你 project 入面嘅 **`ci/n8n/notify-webhook.example.json`**
3. 開入面 **「Send Telegram」** 個 node → 將 `<<<TELEGRAM_BOT_TOKEN>>>` 同 `<<<TELEGRAM_CHAT_ID>>>` 換成你上面攞到嘅值
4. 右上 **Save** → 撳 **Active**（右上個掣，變綠色）

### 4. 測試
- 隨便 `./ci.sh build uat` 一次，build 完你 Telegram 就會收到訊息。
- 收唔到？睇下方「排查」。

---

## 方案 B：WhatsApp（正式，setup 較長）

WhatsApp 唔似 Telegram「攞個 token 就得」，因為佢係 Meta（Facebook）嘅商業平台。要準備：

### 1. 一次性設定（喺 Meta 嗰邊）
1. 有個 **Facebook / Meta Business** 帳戶。
2. 去 **developers.facebook.com** → 建一個 App → 加 **WhatsApp** 產品。
3. Meta 會免費畀你一個**測試電話號碼** + 一個 **Phone Number ID** + 一個**臨時 access token**（copy 低）。
4. 喺 WhatsApp 設定度，將**你自己個手機號碼**加做「收件人（recipient）」（佢會 send 個驗證碼畀你確認）。
5. **建一個 message template**（因為系統主動 send（唔係你先 send），WhatsApp 規定要用預先批核嘅 template）。
   - 例：template 名 `build_status`，內容 `Authentik build {{1}} · {{2}} · #{{3}}`
   - 交 Meta 審批（通常好快）。

### 2. 喺 n8n 設定
1. 開你 import 咗嗰個 workflow。
2. **刪走「Send Telegram」個 node**，換上 n8n 內置嘅 **「WhatsApp Business Cloud」** node（撳 `+` 搜 WhatsApp）。
3. 撳個 node → **Credential** → 新增 → 填你嘅 **access token** + **Phone Number ID**。
4. Operation 揀 **Send（template message）** → 揀你批核咗嘅 `build_status` template → 將 `{{1}}{{2}}{{3}}` 對應去 `status / env / build`（收到嘅資料喺 `$json.body.status` 等）。
5. Recipient 填**你自己個 WhatsApp 號碼**（連國碼，例 `85298765432`）。
6. Save → Active。

### 3. 測試
`./ci.sh build uat` → build 完你 WhatsApp 應該收到。

> 💡 臨時 access token 24 小時會過期；長用要喺 Meta 整一個**永久 token**（System User token）。呢步較技術，可以到時搵 Claude 幫。

---

## 進階：只想「失敗」先通知

喺 workflow 中間加一個 **IF** node：
- 條件：`{{$json.body.status}}` **等於** `failure`
- 只將「失敗」嗰邊駁去 send node → 咁成功就唔會嘈你。

---

## 排查（收唔到通知）

1. **workflow 有冇 Active？**（右上要綠色）—— 冇 Active，`/webhook/build-status` 唔會收。
2. **Jenkins 讀咗新設定未？** —— 加咗 `N8N_NOTIFY_URL` 後要 `./ci.sh start` 一次。
3. **睇 Jenkins log 有冇 send** —— build 完個 console 尾會寫「跳過通知」（代表冇設 URL）定 send 咗。
4. **Telegram：** 有冇同個 bot 先講過嘢？ chat id / token 啱唔啱？
5. **WhatsApp：** template 批核咗未？access token 過咗期未？recipient 驗證咗未？

搞唔掂就 `./ci.sh savelog` + 同 Claude 講，我幫你睇。

# n8n workflows — 逐個點砌

> n8n 行喺 http://localhost:5678（由 `./ci.sh start` 起）。
> 呢度 4 個 workflow：**通知**已有 importable JSON；其餘畀 node-by-node 指引（自己砌最穩，唔怕 import 版本唔夾）。

n8n 同 Jenkins 喺**同一個 docker 網絡**，所以 n8n 入面叫 Jenkins 用 `http://jenkins:8080`（唔係 localhost）。要叫返 host 上嘅 app service（health check）就用 `http://host.docker.internal:<port>`。

先決：喺 Jenkins 攞一個 **API token**（右上你名 → Security → Add new token），n8n 要用嚟觸發 build。

---

## 1. 通知（Jenkins → Telegram/WhatsApp）  ← 有 JSON

1. n8n → Workflows → **Import from File** → `ci/n8n/notify-webhook.example.json`。
2. 開 "Send Telegram" node，填返你嘅 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
   （Telegram：同 @BotFather 開 bot 攞 token；chat id 同 @userinfobot 攞）。
3. Activate workflow → copy 個 Webhook URL（例：`http://localhost:5678/webhook/build-status`）。
4. 去 Jenkins → Manage Jenkins → System → 加 **Global environment variable**
   `N8N_NOTIFY_URL` = 但 Jenkins 喺容器內 → 用 `http://n8n:5678/webhook/build-status`。
   （Jenkinsfile 個 post block 會 POST status/env/build/url 去呢度。）

> **換做 WhatsApp**：將 "Send Telegram" 換成 n8n 內置 **WhatsApp Business Cloud** node
> （填 WABA credential + 已審批 template）。其餘 wiring 一樣。詳見 proposal §4.1。

---

## 2. Webhook 觸發 Jenkins（GitHub push → build）

Nodes：
- **Webhook**（POST, path `github-push`）
- **IF**（`{{$json.body.ref}}` 含 `refs/heads/main` → UAT；含 `refs/heads/release/` → 行 approve 分支）
- **HTTP Request**：
  - Method POST
  - URL `http://jenkins:8080/job/authentik-pipeline/buildWithParameters?ENVIRONMENT=uat`
  - Authentication → Basic Auth：user = 你 Jenkins 帳號、password = Jenkins **API token**
  - Header：Jenkins 開咗 CSRF 就要先 GET `/crumbIssuer/api/json` 攞 crumb（或喺 Jenkins job 設定關 "Prevent Cross Site Request Forgery" 的 API exception）。

要畀 GitHub 打到入嚟（localhost 冇 public IP）：
```bash
# 用你 repo 已有嘅 cloudflared 開一條 tunnel 指向 n8n
docker run --rm cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:5678
# 攞到 https://xxxx.trycloudflare.com → GitHub repo → Settings → Webhooks
#   Payload URL: https://xxxx.trycloudflare.com/webhook/github-push
#   Content-type: application/json ； events: Just the push event
```

---

## 3. Approve gate（PROD deploy 確認）

兩個做法，揀一個：

**A. 簡單（P1 已 work）**：Jenkinsfile 已有原生 `input` step —— PROD build 會停喺 Jenkins 度等你入去撳 "Deploy PROD"。n8n 只負責**通知你「有嘢等批」**（workflow 1 收到 status=pending 就 send）。

**B. 全 n8n 驅動**：
- Jenkins 觸發前，n8n 送一個帶 **兩個 Webhook URL**（approve / reject）嘅訊息去 Telegram/WhatsApp。
- 你撳 approve → 打去 n8n 另一條 Webhook → HTTP Request POST 去 Jenkins
  `http://jenkins:8080/job/authentik-pipeline/buildWithParameters?ENVIRONMENT=prod&DEPLOY=true`。

建議先用 A，之後先升 B。

---

## 4. 定時 health check（nightly / 每 5 分鐘）

Nodes：
- **Schedule Trigger**（cron，例 `*/5 * * * *`）
- **HTTP Request** ×1：GET `http://host.docker.internal:4000/api/listings`（PROD API）
  - 設 "Continue On Fail" 開
- **IF**：`{{$json.error}}` 存在或 status ≠ 200 → 出事
- **Send Telegram/WhatsApp**：「⚠️ PROD API 冇回應」

同一個 workflow 可加多幾個 HTTP node 查 consumer/auth/admin port。
另可加一條 Schedule → **Execute Command / SSH** 跑 `scripts/db-copy.sh prod uat`（每朝攞真資料落 UAT）。

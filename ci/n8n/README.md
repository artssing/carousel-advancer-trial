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

## 4. 定時 health check + build stamp  ← 有 JSON

Import `ci/n8n/health-check.example.json`，填 Telegram token / chat id，Activate。

**佢查嘅唔係「死咗未」，係「四個容器行緊邊個 commit」** —— API + consumer +
authenticator + admin 各自 GET `/api/version`。

點解要咁：`/api/listings` 返 200 **只證明個 container 未死，唔證明新 code 上咗**。
2026-08-10 實測：UAT container 係 8 日前嘅 image，`/api/listings` **200 ALIVE**，
但 `/api/version` **404**。淨查 liveness 嗰種 health check 會一路綠，而件事其實壞緊。

四種情況分開講（唔好合併 —— 常見嗰個同罕見嗰個撈埋，founder 就唔會再睇）：

| 情況 | 意思 |
|---|---|
| 連唔到 | 嗰個 container 真係死咗 |
| 404 | 個 image 舊過 2026-08-10（`/api/version` 嗰陣先加），即 deploy 未生效 |
| `commit` = `unknown` / `dev` | 有人喺 `ci/ci-run.sh` 以外 build，冇蓋章 → 下次 deploy 驗唔到 |
| 四個 commit 唔一致 | **部分 deploy** —— 例如淨係重 build 咗 api，前端仲係舊 |

點解四個都要查：四個獨立 image 獨立 tag。2026-08-10 實測，四個 UAT image
build 時間橫跨 **18 個鐘 41 分**。而且大部分改動喺前端 —— 淨查 API 等於乜都冇驗到。

正常就**唔出聲**。冇嘢壞都響嘅 alert，教識人無視 alert。

用 service 名 `api-uat:4000`，唔用 `host.docker.internal` —— deploy stack 冇 host port map
（founder 2026-07-20），而且 n8n 同 app 喺同一個 `carousel-advancer-trial_default` 網絡，
行嘅係 cloudflared 同一條路徑。
（舊版呢度寫 `4110`，邊個 env 都唔係 —— 大概亦係佢從來冇被 import 過嘅原因。）

## 5. Deploy verify（deploy 完即刻對數）  ← 有 JSON

Import `ci/n8n/deploy-verify.example.json`。

```bash
curl -X POST http://n8n:5678/webhook/deploy-verify \
  -H 'Content-Type: application/json' \
  -d "{\"env\":\"uat\",\"commit\":\"$(git rev-parse HEAD)\"}"
```

Caller 講佢 deploy 咗邊個 commit，API 講佢行緊邊個，唔一樣就 ❌。
喺 Jenkinsfile deploy 之後打呢條，就唔使靠望 `docker images` 個日期估。

`ci/ci-run.sh smoke` 已經內置同一個對數（唔使 n8n 都會 fail），
呢個 workflow 係俾你手動 deploy／喺手機收通知嗰陣用。

另可加一條 Schedule → **Execute Command / SSH** 跑 `scripts/db-copy.sh prod uat`（每朝攞真資料落 UAT）。

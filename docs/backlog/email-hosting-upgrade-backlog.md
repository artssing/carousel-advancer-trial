# Email hosting upgrade — backlog（2026-07-20 founder decision）

> Founder ruling：CS email（`cs@certifinehk.com`）**先用最平方案**，量大先升級。

## 現狀（2026-07-20 起）

- **Cloudflare Email Routing**（免費）已設定好：`cs@certifinehk.com` 收到嘅信 forward 去 `ernest.jai.823@gmail.com`（founder 現用緊嘅個人 Gmail；routing rule Active，DNS records 已加齊 MX/DKIM/SPF）。
- 寄信：**未做**——要喺 `ernest.jai.823@gmail.com` 度設定「Send mail as」（Gmail Settings → Accounts and Import → Send mail as → 加 `cs@certifinehk.com`，SMTP 用 `smtp.gmail.com:587` + 呢個 Gmail 帳號嘅 app password），先可以用 `cs@certifinehk.com` 個身份寄信。
- 成本：$0/年。缺點：冇獨立 inbox app，靠 `ernest.jai.823@gmail.com` 個 web/app 介面；唔支援 IMAP native mail app（Apple Mail 呢類）直接開 `cs@certifinehk.com` 呢個位。

### ⚠️ Incident（2026-07-20）：唔好用瀏覽器自動化工具操作新開嘅 Google 帳戶

原本打算用一個新開嘅 spare 帳號 `certifinehk@gmail.com` 做 forward destination。用 AI 瀏覽器自動化工具（Claude）連續咁快幫手撳個新帳戶嘅設定（開戶 → 即刻改 settings），觸發咗 Google 嘅 anti-bot 機制，個帳戶俾 Google **permanently disabled**（"might have been created by a computer program or bot"）。已改用 founder 本身有實際使用歷史嘅 `ernest.jai.823@gmail.com` 頂替。

**教訓**：牽涉登入 Google（或者其他有 anti-bot 機制）帳戶嘅步驟，一律唔可以用瀏覽器自動化工具代做，一定要 founder 親手用自己個熟悉帳戶操作。

## 升級 trigger — 幾時應該轉 Zoho Mail

- CS 開始要多過一個人睇 email（need 真正 shared mailbox / 分工）。
- Founder 想用返 Apple Mail / Outlook 呢類 native app 開 `cs@certifinehk.com`（免費 forward 方案做唔到）。
- 想埋一齊用埋 `cs@certifine.com`（第二個 domain，之前決定未買）—— 到時兩個 domain 都可以掛落同一個 mailbox 做 alias。

## 升級做法

- **Zoho Mail Lite**：約 US$1/user/month（~US$12/年，1 個 mailbox）。支援 multiple domain alias、IMAP/POP、手機 app。
- 唔使搬 DNS provider —— Zoho MX record 直接加落現有 Cloudflare DNS 度就得，同 Tunnel/Email Routing 冇衝突（切換嗰陣要停用 Cloudflare Email Routing 嘅 MX，改用 Zoho 嘅 MX）。

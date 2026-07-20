# Google SSO Setup — Authentik HK

P0 ruling (founder 2026-06-11): Google only. Apple / Facebook = backlog.

**2026-07-07 update**：UAT + PROD dual-env setup 用**單一 Google OAuth client + 兩個 redirect URI**（founder ruling）。同一對 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 落兩個 `.env` 檔，只 redirect URI 唔同。

## 1. Google Cloud OAuth client 建立

1. 開 [Google Cloud Console](https://console.cloud.google.com/) → 建立新 project（e.g. `authentik-hk`），或者揀返之前個 project
2. **APIs & Services → OAuth consent screen**：
   - **User Type**：External
   - **App name**：`Authentik HK`
   - **User support email**：你個 email
   - **Authorised domains**：`localhost`（dev）—— 上 production 加真 domain
   - **Scopes**：`email`、`profile`、`openid`
   - **Test users**：加你 Gmail（External app 喺 Testing mode 只可 test users 登入）
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**：
   - **Application type**：**Web application**
   - **Name**：`Authentik HK Web`
   - **Authorized redirect URIs**：⚠ **一定要加齊 UAT + PROD 兩條**，否則某個 env callback 會被 Google reject
     ```
     http://localhost:4000/api/auth/google/callback       ← PROD API
     http://localhost:4010/api/auth/google/callback       ← UAT API
     ```
   - 之後上 production 再加：
     ```
     https://api.authentik.hk/api/auth/google/callback
     ```
4. 撳「CREATE」→ 彈出 modal 顯示 `Client ID` + `Client Secret`。**呢兩個值我幫唔到你 paste**（safety rule），你自己複製落下一步 §2 兩個 .env 檔

## 2. 設 env vars（**兩個 env 一齊填**）

**`apps/api/.env.prod`**（PROD API :4000 / Consumer :3008）：
```bash
GOOGLE_CLIENT_ID="xxx-yyy.apps.googleusercontent.com"        # ← 同一個 client_id
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"                    # ← 同一個 client_secret
GOOGLE_REDIRECT_URI="http://localhost:4000/api/auth/google/callback"  # ← :4000（PROD）
NEXT_PUBLIC_CONSUMER_URL="http://localhost:3008"
```

**`apps/api/.env.uat`**（UAT API :4010 / Consumer :3018）：
```bash
GOOGLE_CLIENT_ID="xxx-yyy.apps.googleusercontent.com"        # ← 同一個 client_id（同 .env.prod 一樣）
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"                    # ← 同一個 client_secret（同 .env.prod 一樣）
GOOGLE_REDIRECT_URI="http://localhost:4010/api/auth/google/callback"  # ← :4010（UAT，唯一分別）
NEXT_PUBLIC_CONSUMER_URL="http://localhost:3018"
```

**關鍵**：兩個 env 用**同一個 CLIENT_ID + SECRET**，只有 `GOOGLE_REDIRECT_URI` 端口唔同。呢個係 dual-env 靠 Google Console `Authorized redirect URIs` 內個 whitelist 分辨兩個 callback。

⚠ Production：
- `GOOGLE_REDIRECT_URI` 必須同 Google Console redirect URI **完全一致**（連 http/https、port、trailing slash 都一樣）
- Trycloudflare quick mode 嘅 random URL 每次都唔同，**唔可以用** —— Google 唔接受 wildcard
- 解決：買 domain + named tunnel

## 3. 重啟 API server

`.env` 只喺 boot 時 load 一次，所以：
```bash
./stop.sh uat && ./start.sh uat     # 重啟 UAT
./stop.sh prod && ./start.sh prod   # 重啟 PROD
```

## 4. 點 work

```
[Login page] 撳「Google 登入」
   ↓
[GET /api/auth/google?redirect=/orders]
   ↓ (302)
[Google consent screen]
   ↓ (user 同意)
[GET /api/auth/google/callback?code=...&state=...]
   ↓ Verify state JWT, exchange code, decode id_token
   ↓
   ├─ Found OAuthAccount → 直接 issue JWT → redirect to /login#token=...
   ├─ Found User by email (verified) → issue link-pending token → /auth/link-confirm
   └─ New email → issue complete-pending token → /auth/complete-profile
```

3 種 outcome 對應 3 種 redirect。Consumer login page 由 hash `#token=` 抽 JWT，存 localStorage，redirect 用戶去原本目標頁。

## 5. Schema impact

```
User.passwordHash   String?    (was String — now nullable for SSO-only users)
User.emailVerified  Boolean    (NEW, default false)

OAuthAccount {
  id, userId, provider, providerUserId, createdAt
  @@unique([provider, providerUserId])
}
```

## 6. Linking policy (founder OQ-1 = A)

| 場景 | 行為 |
|---|---|
| 同 email 已 register email/password user | 跳 `/auth/link-confirm` 要 user 確認；同意 → link 兩個帳戶，`User.emailVerified = true` |
| 同 email 但 Google `email_verified=false` | Reject — 強制用 password 登入 |
| 新 email | 跳 `/auth/complete-profile` — **mandatory** 填 displayName + avatar 確認，先 create user |
| 已 link 嘅 Google account | 直接 issue JWT |

## 7. 已知 limitations / Backlog

- ❌ SSO-only user 仲未有「設定密碼」flow（backlog）→ 只能用 Google 登入
- ❌ Profile 頁未有「連接的帳戶」section（P1 → backlog）
- ❌ Apple Sign-in（iOS app 出之前必須做）
- ❌ Facebook Login
- ❌ 現有 email user 加 emailVerified flag 但 UI 暫時唔 surface（per OQ-5 A）

## 8. Test 流程

### PROD env（Consumer :3008）
1. 設好 `.env.prod` `GOOGLE_*` vars
2. `./stop.sh prod && ./start.sh prod`
3. 開 `http://localhost:3008/login`
4. 撳「Google 登入」→ Google consent → 揀帳戶
5. **新 email**：跳 complete-profile，填名 → 註冊完成
6. **同 email 已存在**：跳 link-confirm，撳確認 → linked

### UAT env（Consumer :3018）
同 PROD 步驟，將 3008 換 3018、`.env.prod` 換 `.env.uat`、`stop/start.sh prod` 換 `stop/start.sh uat`。

**如果 test 到 UAT flow 成功，可以確認 Google Console redirect URI whitelist 兩條都 work。**

## 9. Troubleshooting

| 問題 | 原因 | 修 |
|---|---|---|
| Google 出 `redirect_uri_mismatch` error | Google Console `Authorized redirect URIs` 冇加曬 :4000 + :4010 兩條 | 返 Console 加齊，等 5 分鐘 propagate |
| Callback 返到 `/login?ssoError=missing_code_or_state` | State JWT expired 或 tampered | 撳返 Google 登入重試 |
| Callback 返到 `/login?ssoError=<msg>` | 睇 API log 詳細 error | 常見：`GOOGLE_CLIENT_SECRET` 打錯 |
| 「Google SSO 未配置」500 error | 三個 env vars 有一個 missing | Grep `.env`，重啟 API |
| PROD work、UAT 唔 work（或反之） | 兩個 env 嘅 `GOOGLE_REDIRECT_URI` 端口打錯 | .env.prod 一定 :4000，.env.uat 一定 :4010 |

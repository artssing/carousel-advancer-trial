# Google SSO Setup — Authentik HK

P0 ruling (founder 2026-06-11): Google only. Apple / Facebook = backlog.

## 1. Create Google Cloud OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create a new project (e.g. `authentik-hk-dev`)
2. **APIs & Services** → **OAuth consent screen**:
   - User Type: External
   - App name: `Authentik HK (Dev)`
   - User support email: 你個 email
   - Authorised domains: `localhost` (dev) — production add 真 domain
   - Scopes: `email`, `profile`, `openid`
   - Test users: 加你 Gmail（External app 喺 Testing mode 限制只可 test users 登入）
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**
   - Name: `Authentik HK Dev`
   - **Authorized redirect URIs**：
     ```
     http://localhost:4000/api/auth/google/callback
     ```
   - 之後上 production 加：
     ```
     https://api.authentik.hk/api/auth/google/callback
     ```
4. Copy `Client ID` + `Client Secret`

## 2. 設 env vars

`apps/api/.env` 加：

```bash
GOOGLE_CLIENT_ID="xxx-yyy.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"
GOOGLE_REDIRECT_URI="http://localhost:4000/api/auth/google/callback"

# Consumer URL for redirect after Google callback (where login page lives)
NEXT_PUBLIC_CONSUMER_URL="http://localhost:3008"
```

⚠ Production：
- `GOOGLE_REDIRECT_URI` 必須同 Google Console redirect URI **完全一致**
- Trycloudflare quick mode 嘅 random URL 每次都唔同，**唔可以用** — Google 唔接受 wildcard
- 解決：買 domain + named tunnel（背景參考 `coordinator SSO 提案 J 段`）

## 3. 點 work

```
[Login page] 撳「用 Google 帳戶登入」
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

3 種 outcome 對應 3 種 redirect。Consumer login page 從 hash `#token=` 提取 JWT，存入 localStorage，redirect 用戶去原本目標頁。

## 4. Schema impact

```
User.passwordHash   String?    (was String — now nullable for SSO-only users)
User.emailVerified  Boolean    (NEW, default false)

OAuthAccount {
  id, userId, provider, providerUserId, createdAt
  @@unique([provider, providerUserId])
}
```

## 5. Linking policy (founder OQ-1 = A)

| 場景 | 行為 |
|---|---|
| 同 email 已 register email/password user | 跳 `/auth/link-confirm` 要 user 確認；同意 → link 兩個帳戶，`User.emailVerified = true` |
| 同 email 但 Google `email_verified=false` | Reject — 強制用 password 登入 |
| 新 email | 跳 `/auth/complete-profile` — **mandatory** 填 displayName + avatar 確認，先 create user |
| 已 link 嘅 Google account | 直接 issue JWT |

## 6. 已知 limitations / Backlog

- ❌ SSO-only user 仲未有「設定密碼」flow（backlog）→ 只能用 Google 登入
- ❌ Profile 頁未有「連接的帳戶」section（P1 → backlog）
- ❌ Apple Sign-in（iOS app 出之前必須做）
- ❌ Facebook Login
- ❌ 現有 email user 加 emailVerified flag 但 UI 暫時唔 surface（per OQ-5 A）

## 7. Test 流程

1. 設好 `.env` GOOGLE_* vars
2. 重啟 API：`cd apps/api && set -a; . ./.env; set +a && npx nest start`
3. 開 `http://localhost:3008/login`
4. 撳「用 Google 帳戶登入」
5. Google consent → 揀帳戶
6. **新 email**：跳 complete-profile，填名 → 註冊完成
7. **同 email 已存在**：跳 link-confirm，撳確認 → linked

---
layer: backend
feature: auth
owners:
  - apps/api/src/auth/**
  - apps/api/src/users/**
last_synced_commit: 3b8dfcd
---

# Auth — Backend

## Lane budget

`curl` 8 · `static` 0 · `browser` 0 · `manual` 0 —— 全部 `verified`。

> 共用變數：`API=https://uat-api.certifinehk.com/api`。
> 攞 token：`curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.hk","password":"password123"}'`

---

- [AU-01] `curl` `verified` — 正確 email + password → **201** + `accessToken`
  - `POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"alice@demo.hk","password":"password123"}'`
  - 理由：登入係所有其他 case 嘅前置條件，佢一崩成份報告都行唔到

- [AU-02] `curl` `verified` — 密碼錯（**要夠 6 個字**）→ **401 Invalid credentials**
  - `POST $API/auth/login -d '{"email":"alice@demo.hk","password":"wrongpassword999"}'`
  - ⚠️ 用短過 6 個字嘅密碼（例如 `wrong`）會回 **400 password must be longer than or equal to 6 characters**，
    嗰個係 DTO validation，唔係 auth 判斷。落手用短密碼會誤報。
  - 理由：認證失敗一定要係 401，唔可以漏任何額外資訊出去

- [AU-03] `curl` `verified` — 唔存在嘅 email → **401，訊息同 AU-02 逐字一樣**
  - `POST $API/auth/login -d '{"email":"nobody-xyz@demo.hk","password":"wrongpassword999"}'`
  - 理由：如果「查無此人」同「密碼錯」分得出，等於送咗個帳號 enumerate 工具俾人

- [AU-04] `curl` `verified` — `GET /me` 帶 token → **200** + 自己 profile
  - `GET $API/me -H "Authorization: Bearer $TOKEN"`
  - ⚠️ route 係 `/api/me`，**唔係** `/api/auth/me`（2026-08-02 實測確認）
  - 理由：所有 portal 開頁第一件事就係打呢條

- [AU-05] `curl` `verified` — `GET /me` 冇 token → **401**
  - `GET $API/me`
  - 理由：guard 掛漏咗嘅話會靜靜雞漏返自己資料

- [AU-06] `curl` `verified` — 亂作／過期 token → **401**
  - `GET $API/me -H "Authorization: Bearer garbage.token.here"`
  - 理由：JWT 驗簽失敗要當冇登入，唔可以 500

- [AU-07] `curl` `verified` — 註冊重覆 email → **409 Email already registered**，唔可以 500
  - `POST $API/auth/register -H 'Content-Type: application/json' -d '{"email":"alice@demo.hk","password":"password123","displayName":"dup test"}'`
  - ⚠️ DTO 個 key 係 **`displayName`**（唔係 `name`）；用錯 key 會回 400 `property name should not exist`，
    睇落好似「重覆 email 被擋」但其實係 validation 擋咗，未行到 unique 檢查
  - 理由：unique constraint 要喺 service 層攔住，唔可以靠 DB 拋 exception 變 500

- [AU-11] `curl` `verified` — **角色隔離矩陣**：每條 endpoint × 每種身分 → 下表嘅 status
  - 一次過行：
    ```bash
    for ep in /orders/authenticator-inbox /admin/overview /admin/users \
              /analytics/admin/overview /authenticators/me/branches; do
      for who in ADMIN BUYER AUTHR NONE; do ... done   # 見下表
    done
    ```
    逐條：`curl -s -o /dev/null -w '%{http_code}' $API<ep> -H "Authorization: Bearer $TOKEN"`
  - **實測矩陣（2026-08-03 UAT）**：

    | endpoint | admin@demo.hk | 買家 alice | 鑑定師 milan@authentik.hk | 冇 token |
    |---|---|---|---|---|
    | `GET /orders/authenticator-inbox` | 403 | 403 | **200** | 401 |
    | `GET /admin/overview` | **200** | 403 | 403 | 401 |
    | `GET /admin/users` | **200** | 403 | 403 | 401 |
    | `GET /analytics/admin/overview` | **200** | 403 | 403 | 401 |
    | `GET /authenticators/me/branches` | 403 | 403 | **200** | 401 |

  - ⚠️ 鑑定師 inbox 唔喺 `/authenticators/*` —— 佢係 `GET /orders/authenticator-inbox`
    （`orders.controller.ts:18`）。2026-08-02 個 run 試錯三條路先搵到。
  - 理由：呢個係全站唯一一條「跨 portal 越權」嘅總關卡。以前 AU-08 / AU-09 / AU-10 /
    [AD-02] / [AN-11] / [AT-02] 六條 case 講緊同一件事，實際上係同一批 curl 一次過答晒，
    分開寫只會令「幾多條 case」失真。而家全部指返呢一條。
  - 取代咗：AU-08、AU-09、AU-10（已刪，ID 留空號）

## 已刪嘅 ID（永不重用）

- **AU-08 / AU-09 / AU-10** — 2026-08-03 併入 [AU-11] 矩陣。

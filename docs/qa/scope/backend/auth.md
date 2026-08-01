---
layer: backend
feature: auth
owners:
  - apps/api/src/auth/**
  - apps/api/src/users/**
last_synced_commit: 8029541
---

# Auth — Backend

- [AU-01] `POST /auth/login` 正確 email + password → **201** + `accessToken`
- [AU-02] 密碼錯 → **401 Invalid credentials**
- [AU-03] 唔存在嘅 email → **401**（唔可以話「查無此人」—— 咁樣等於幫人 enumerate 帳號）
- [AU-04] `GET /me` 帶 token → **200**
  - ⚠️ route 係 `/api/me`，**唔係** `/api/auth/me`
- [AU-05] `GET /me` 冇 token → **401**
- [AU-06] 亂作嘅 / 過期 token → **401**
- [AU-07] 註冊：重覆 email → **409 / 400**，唔可以 500

## 角色隔離

- [AU-08] 買家 token 打鑑定師 endpoint → **403**
- [AU-09] 買家 token 打 admin endpoint → **403**
- [AU-10] 鑑定師 token 打 admin endpoint → **403**

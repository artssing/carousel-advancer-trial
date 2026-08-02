---
layer: backend
feature: share
owners:
  - apps/api/src/storage/**
  - apps/api/prisma/schema.prisma
last_synced_commit: 3b8dfcd
---

# Share / Storage — Backend

`POST /share-previews` 上載生成卡，`GET /share-previews/:id` 俾 crawler 讀。
Storage driver 行 Cloudflare R2（`STORAGE_DRIVER=s3`）。

## 上載保護

- [SB-01] 冇 token 上載 → **401**
  - 上載會寫入公開 bucket，一定要有身分先做得
- [SB-02] 文字檔扮 `image/png`（Content-Type: image/png，body 係純文字）→ **400 只接受圖片檔案**
  - Client 報嘅 mimetype 信唔過，要 magic-byte sniff
- [SB-03] 真 PNG → **201**，`imageUrl` 以 `.png` 結尾
- [SB-04] 真 JPEG → **201**，`imageUrl` 以 `.jpg` 結尾
- [SB-05] 惡意檔名 `a.png/../../evil` + 真 PNG → **201**，key 係乾淨 `<uuid>.png`
  - Key 由 sniff 到嘅 MIME 決定，唔可以由 client 檔名決定（path traversal）
- [SB-06] 唔存在嘅 `listingId` → **404**
- [SB-07] 冇 `listingId` → **400 缺少 listingId**
- [SB-08] 上載成功後，DB 條 row 有 `uploaderId` = 登入嗰個 user 嘅 id
  - 賣家以外嘅人都上載得（買家 share 人哋件貨係主要用法），所以唔驗 ownership，改為記低邊個上載，出事追得返

## 讀取

- [SB-09] `GET /share-previews/:id` **唔帶** Authorization → **200** + `{id, imageUrl, listingId}`
  - Facebook / WhatsApp crawler 一定係登出狀態
- [SB-10] 唔存在嘅 id → **404**

## R2

- [SB-11] 上載返嘅 `imageUrl` 喺 `media-uat.certifinehk.com` domain
- [SB-12] 直接 GET 嗰條 URL → **200**，`content-type` 係真嘅圖片類型

## 已知留低嘅垃圾

UAT bucket 有舊 code 年代上載嘅 `.sh` 文字檔（`79752550-f774-4651-9989-020779feed73.sh`）。
**唔係 bug** —— 係 2026-08-01 之前冇 sniff 嗰陣留低。清理見 `docs/backlog/social-share-backlog.md` #7。

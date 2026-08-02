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

## Lane budget

`curl` 12 · `static` 0 · `browser` 0 · `manual` 0 —— 全部 `verified`。

> Fixture（2026-08-03 加入 repo）：
> - `docs/qa/fixtures/share-1080x1350.png` — 真 PNG，1080×1350，**6,218 bytes**
> - `docs/qa/fixtures/tiny.jpg` — 真 JPEG，**160 bytes**
> - `docs/qa/fixtures/not-an-image.txt` — 純文字，**21 bytes**
>
> `$L` = 任何一件存在嘅 listing id。

## 上載保護

- [SB-01] `curl` `verified` — 冇 token 上載 → **401**
  - `POST $API/share-previews -F "file=@docs/qa/fixtures/share-1080x1350.png" -F "listingId=$L"`
  - 理由：上載會寫入公開 bucket，一定要有身分先做得

- [SB-02] `curl` `verified` — 文字檔扮 `image/png` → **400 只接受圖片檔案**
  - `POST $API/share-previews -H "Authorization: Bearer $TOKEN" -F "file=@docs/qa/fixtures/not-an-image.txt;type=image/png" -F "listingId=$L"`
  - 理由：Client 報嘅 mimetype 信唔過，要 magic-byte sniff

- [SB-03] `curl` `verified` — 真 PNG → **201**，`imageUrl` 以 `.png` 結尾
  - `POST $API/share-previews -H "Authorization: Bearer $TOKEN" -F "file=@docs/qa/fixtures/share-1080x1350.png" -F "listingId=$L"`
  - 實測：`…/5291d5b0-0c3c-4379-ba8f-49200ae2d579.png`
  - 理由：正路 happy path，同時證明 sniff 冇誤殺真圖

- [SB-04] `curl` `verified` — 真 JPEG → **201**，`imageUrl` 以 `.jpg` 結尾
  - `POST $API/share-previews -H "Authorization: Bearer $TOKEN" -F "file=@docs/qa/fixtures/tiny.jpg" -F "listingId=$L"`
  - 實測：`…/03c60d0d-4012-4c7f-a655-a40f78cf309e.jpg`
  - 理由：副檔名要由 sniff 出嚟嘅 MIME 決定，兩種格式都要行過先算數

- [SB-05] `curl` `verified` — 惡意檔名 + 真 PNG → **201**，key 係乾淨 `<uuid>.png`
  - `POST $API/share-previews -H "Authorization: Bearer $TOKEN" -F "file=@docs/qa/fixtures/share-1080x1350.png;filename=a.png/../../evil" -F "listingId=$L"`
  - 實測：key = `40842f13-41f5-428d-bb65-a40d89fcb72a.png`，檔名完全冇入到 key
  - 理由：Key 由 sniff 到嘅 MIME 決定，唔可以由 client 檔名決定（path traversal）

- [SB-06] `curl` `verified` — 唔存在嘅 `listingId` → **404 Listing not found**
  - `-F "listingId=does-not-exist-999"`
  - 理由：孤兒 share preview 會令 `/s/:id` 頁爆

- [SB-07] `curl` `verified` — 冇 `listingId` → **400 缺少 listingId**
  - 淨係 `-F "file=@…"`，唔帶 listingId
  - 理由：multipart 冇 DTO validation，要 controller 自己攔，好易漏

- [SB-08] `curl` `verified` — 上載成功後，DB 條 row 有 `uploaderId` = 登入嗰個 user
  - `docker exec authentik-postgres psql -U authentik -d authentik_uat -tAc "select id,\"uploaderId\",\"listingId\" from \"SharePreview\" where id='<新 id>'"`
  - 實測：`cmsc1jvbf000sy4lv1lj46tyy | cmpzo1rum0002fo9wgz2mwapt`（alice）—— alice 唔係件貨賣家都上載到
  - 理由：賣家以外嘅人都上載得（買家 share 人哋件貨係主要用法），所以唔驗 ownership，
    改為記低邊個上載，出事追得返

## 讀取

- [SB-09] `curl` `verified` — `GET /share-previews/:id` **唔帶** Authorization → **200** + `{id, imageUrl, listingId}`
  - `GET $API/share-previews/cmsc1jvbf000sy4lv1lj46tyy`
  - 理由：Facebook / WhatsApp crawler 一定係登出狀態，加咗 guard 就冇曬 preview

- [SB-10] `curl` `verified` — 唔存在嘅 id → **404**
  - `GET $API/share-previews/nope-xyz`
  - 理由：畀個 500 出去等於同 crawler 講「呢個站壞咗」

## R2

- [SB-11] `curl` `verified` — 上載返嘅 `imageUrl` 喺 `media-uat.certifinehk.com` domain
  - 睇 [SB-03]/[SB-04]/[SB-05] 三條 response
  - 理由：driver 一 fallback 去 local disk，URL 就會變 localhost，OG image 出唔到街

- [SB-12] `curl` `verified` — 直接 GET 嗰條 URL → **200**，`content-type` 係真嘅圖片類型
  - `curl -o /dev/null -w '%{http_code} %{content_type}\n' https://media-uat.certifinehk.com/5291d5b0-….png`
  - 實測：`200 image/png` / `200 image/jpeg`
  - 理由：bucket public-read 同 content-type metadata 兩件事都要啱，Facebook 先讀得到

## 已知留低嘅垃圾

UAT bucket 有舊 code 年代上載嘅 `.sh` 文字檔（`79752550-f774-4651-9989-020779feed73.sh`）。
**唔係 bug** —— 係 2026-08-01 之前冇 sniff 嗰陣留低。清理見 `docs/backlog/social-share-backlog.md` #7。

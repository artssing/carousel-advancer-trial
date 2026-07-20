# Authenticator evidence media upload — backend backlog

> Status: 🟡 **Backlog**
> Saved: 2026-06-04
> Trigger: founder 發現「上傳鑑定影片」button 完全冇 wire，只係 visual placeholder + 用錯 Camera icon（係 image，唔係 video）
> 已完成嘅部分: 即時修返前端 — 真正 file picker + accept video/image + 50MB cap + 已揀檔案 list + 提交時 enforce 至少 1 個

## 已修（前端）✅

- 真正 `<input type="file" accept="video/*,image/*" multiple>` hidden + button trigger
- Selected files 顯示 list（thumb if image / FileVideo icon if video）+ 名 + size MB + 移除 X
- Submit verdict 之前 validate `evidence.length > 0`，唔夠就 error「請至少上載一個鑑定影片 / 圖片證據」
- 50MB / 檔案 cap（video 可以大）
- Cleanup `URL.revokeObjectURL` on remove + unmount
- 標題改為「鑑定證據（影片 / 圖片）」，icon 統一（meetup → Video，ship → Upload）
- 明確 disclosure：證據檔案目前只 store local browser、提交前唔好離開呢頁

## 仲未做（backlog）— 真正後端上傳

**現況限制**：
- 冇 storage infra（S3 / Cloudflare R2 / Supabase Storage / GCS）
- Order schema 冇 evidence media field
- 鑑定 verdict 提交 API（`PATCH /orders/:id/verdict`）目前只接受 `{ verdict, notes }`
- 用戶 refresh 或關 tab 就 lose 證據檔案

**要做嘅 work**：

### 1. Storage decision（選一個）

| 選項 | Pros | Cons |
|------|------|------|
| S3 / R2 / GCS | 標準、可 stream video | 要 IAM / signed URL flow |
| Supabase Storage | Postgres ecosystem | vendor lock-in |
| Cloudinary | 自動 video transcode + CDN | 收費高 |
| Self-host MinIO | 控制權 | ops overhead |

### 2. Backend

- Add `OrderEvidence` Prisma model：`{ id, orderId, uploaderUserId, mediaUrl, mimeType, sizeBytes, kind: VIDEO|IMAGE, createdAt }`
- `POST /orders/:id/evidence/presigned-url` → return upload URL（client direct upload to S3, server 唔做 proxy）
- `POST /orders/:id/evidence/commit` → 寫入 OrderEvidence 行（client 上傳完先 commit）
- `GET /orders/:id` include 返 evidence list（buyer + seller + authenticator 都可以睇）
- `PATCH /orders/:id/verdict` validate 至少 1 個 evidence 已 commit

### 3. Frontend

- File select → request presigned URL → direct PUT 上傳到 storage
- Progress indicator per file（XHR.upload.onprogress）
- Commit 成功之後 mark evidence as「已上傳」
- Failure handling + retry
- Submit verdict 之前 confirm 所有檔案都已 commit（唔係仲 pending）

### 4. Buyer / seller 可見性

- Order detail page（buyer + seller view）應該見到鑑定證據（video player + 圖片 lightbox）
- 任何爭議 / dispute review 都會睇返呢個 archive

### 5. 法律 / retention

- 證據檔案 retention 期：至少 2 年（match 鑑定師合約 + E&O claim window）
- 鑑定師事後唔可以刪、唔可以改
- Admin 可以 access for dispute review

## 防 regression check（implement 時）

- [ ] 上傳途中關閉 tab 唔可以 lose 進度（resumable upload or server-side draft）
- [ ] Video file size 上限 reasonable（500MB?）— signed URL 流程支援
- [ ] Image / video MIME 真 detection（用 server-side magic bytes，唔信 client）
- [ ] 防止 verdict 提交但 evidence 仲 uploading（race condition）
- [ ] 唔同 role 嘅可見性：authenticator 唔應該見其他 order 嘅 evidence

## Phase split

| Sub-item | Priority | 預估 |
|---|---|---|
| 前端 file picker + local state | ✅ Done | — |
| 50MB cap + 提交 enforce | ✅ Done | — |
| Storage infra（S3 / R2）setup | High | 半日 |
| `OrderEvidence` schema + migration | High | 1 小時 |
| Presigned URL endpoint | High | 半日 |
| 上傳流程（progress / commit） | High | 半日 |
| Buyer / seller view 顯示 evidence | Medium | 半日 |
| Admin dispute view | Medium | backlog（admin portal 仲未接 API）|

**Total ≈ 2-3 日** 真正 production-ready evidence upload。

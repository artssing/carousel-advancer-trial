# 社交分享 — Backlog

> 2026-07-30 / 07-31 完成咗核心分享功能（見下面「已完成」）。呢度記低刻意押後嘅 items。
> 開工前先讀「已完成」一節，唔好重做。

## 已完成（唔好重做）

| 功能 | 位置 |
|---|---|
| IG 分享 wizard（多選相 collage、Story/Feed、兩款 template） | `apps/consumer/components/share-ig-modal.tsx` |
| 底色 picker（由主相抽 dominant 色 darken 成候選） | 同上 `extractPalette()` |
| Watermark 右上角（唔再同 title 重疊） | 同上 `drawWatermark()` |
| Option A：圖 + 文字經 `navigator.share`（手機系統 sheet） | 同上 `share()` |
| Option B：WhatsApp / Facebook 連結掣（電腦手機都用得） | 同上 `shareLink()` |
| Listing 頁 OpenGraph / Twitter meta | `apps/consumer/app/listing/[id]/layout.tsx` |
| `SharePreview` model + `POST/GET /share-previews` | `apps/api/src/storage/share-previews.controller.ts` |
| `/s/[id]` 分享落地頁（og:image = 生成卡，真人 JS redirect 返 listing） | `apps/consumer/app/s/[id]/` |
| Cloudflare R2 storage driver | `apps/api/src/storage/storage.service.ts`（`STORAGE_DRIVER=s3`） |
| 1200×630 OG 卡（FB/WhatsApp 用嘅闊版），撳先上載 + cache | `compositeOg()` |

R2 配置：bucket `certifine-media`(prod) / `certifine-media-uat`，custom domain `media.certifinehk.com` / `media-uat.certifinehk.com`。Secrets 喺 `apps/api/.env.prod` / `.env.uat`（gitignored）。

---

## 1. Messenger 分享掣 —— 等 Facebook App ID

**問題**：founder 想要 Messenger 掣（同 WhatsApp / Facebook 並排）。Messenger desktop web 分享**必須**有一個註冊咗嘅 Facebook App ID，project 而家冇。

**做法**（App ID 到手之後）：
- `NEXT_PUBLIC_FB_APP_ID` 加落 `docker-compose.deploy.yml` consumer build args（prod + uat 兩 block，同 `NEXT_PUBLIC_API_URL` 同一位）
- Desktop：`https://www.facebook.com/dialog/send?app_id=<ID>&link=<encoded>&redirect_uri=<encoded>`
- Mobile deep link：`fb-messenger://share?link=<encoded>`
- 品牌色 `#0084FF`，styling 跟 WhatsApp(`#25D366`) / Facebook(`#1877F2`)
- **只喺 env 有值先 render 粒掣**，避免 ship 個壞掣

**Effort**：~30 分鐘。

---

## 2. ~~分享 flow 冇 analytics tagging~~ ✅ 2026-07-31 做咗

4 個 event 已入 registry SSOT + wire 好：`share_modal_opened` / `share_step_advanced` /
`share_bg_color_selected` / `share_action_completed`（channel = native / download /
copy_caption / link_whatsapp / link_facebook）。

**仲欠**：`docs/proposals/analytics-tagging-spec.md` 個 Changelog 未補呢 4 個 event。

---

## 3. SharePreview / R2 物件冇生命週期管理

**問題**：每次撳 share 就 create 一行 `SharePreview` + 一個 R2 物件，**永遠唔會清**。長遠會無限增長。

**注意**：唔可以亂刪 —— 舊 Facebook post 仲 reference 緊條 `/s/:id`，刪咗 preview 圖就爛。要揀策略：
- 保留 1 年（社交 post 通常一個月內冇人再睇，但爛圖好核突）
- 或者永久保留（1200×630 JPEG ~56KB，10 萬次分享 = 5.6GB，R2 好平）

**建議**：先加 admin 統計睇增長速度，夠數據先定 TTL。

---

## 4. 清 UAT bucket 測試垃圾

`certifine-media-uat` 有 ~8 個測試檔（~11MB），係 2026-07-30 一個短暫嘅 eager-upload 版本洗低（嗰個版本 step 3 一 render 就上載，已修正為撳先上載）。PROD bucket 乾淨。

安全刪 —— UAT 冇真用戶分享過。

---

## 5. Twitter / X 掣

Founder 提過 Carousell 有。同 Facebook 一樣 pattern：
`https://twitter.com/intent/tweet?text=<caption>&url=<shareUrl>`
`/s/:id` 已經有 `twitter:card=summary_large_image` + `twitter:image`，即刻用得。

**Effort**：~15 分鐘。未決定要唔要做。

---

## 6. Listing 頁 og:image 用返 OG 卡

而家 `/listing/:id` 個 `og:image` = 商品第一張相（未經設計）。可以考慮 server-side 生成同一款 1200×630 卡（價錢 + 標題 + watermark）做 listing 頁 og:image，咁**任何人直接貼 listing link**（唔止經 share wizard）都有靚 preview。

要 server-side canvas（`@napi-rs/canvas` 或 `satori`）+ cache。**Effort**：1-2 日。

---

## 7. UAT 測試垃圾（2026-08-01 QA 之後）

除咗原本 #4 嗰批,QA regression 又留低:
- 8 個 SharePreview row + R2 object,**其中一個係 `.sh` 文字檔**(舊 code 未有 magic-byte sniff 嗰陣上載,`79752550-f774-4651-9989-020779feed73.sh`,content-type 報 image/png)
- listing `cmsak25i100015vcny20a29k7`(RESERVED)、order `cmsak2xyg00045vcnwb74usd3`(PAID)、2 個未確認嘅 cashout intent

清理要 founder 明確指名個 bucket 授權。

---
layer: frontend
feature: share
owners:
  - apps/consumer/components/share-ig-modal.tsx
  - apps/consumer/app/s/**
  - apps/consumer/app/listing/[id]/layout.tsx
  - apps/consumer/lib/listing-og.ts
last_synced_commit: 3b8dfcd
---

# Share wizard + OG meta — Frontend

## Lane budget

`curl` 7 · `static` 1 · `browser` 13 · `manual` 1（共 22 條）
—— 12 `verified`（7 curl + 1 static + 4 browser 有 spec）· 9 `unverified`（browser）· 1 `manual`（未標）。

## Wizard（要真人操作，登入狀態）

- [SF-01] `browser` `unverified` — 撳「分享」開到 modal，**四邊都係圓角**
  - 未有 Playwright spec
  - 理由：`rounded-2xl` 加 `overflow-hidden` 嘅組合好易俾內層 override 走

- [SF-02] `browser` `unverified` — 內容長到要 scroll 嗰陣，scrollbar 出現都唔會整方咗右邊兩隻角
  - 未有 Playwright spec。內層 `overflow-y-auto` 同外層 `rounded-2xl overflow-hidden` 要分開
  - 理由：呢個 regression 返嚟過（`docs/lessons.md`），淨係喺有 scrollbar 嗰個 state 先睇得出

- [SF-03] `browser` `verified` — Modal 開住嗰陣，**背景唔郁**（body scroll lock）
  - Spec：`docs/qa/browser/tests/share-modal.spec.ts`（`getComputedStyle(document.body).overflow === 'hidden'`）
  - 理由：背景照 scroll 會令用家以為 modal 冇開／撳錯位

- [SF-04] `browser` `verified` — 撳 **Esc** 關到 modal
  - Spec：`docs/qa/browser/tests/share-modal.spec.ts`
  - 理由：Esc 係鍵盤用家唯一嘅退路

- [SF-22] `browser` `verified` — 關咗 modal 之後，**背景 scroll 返轉頭**
  - Spec：`docs/qa/browser/tests/share-modal.spec.ts`
  - cleanup 係還原開 modal 之前嗰個 `body.style.overflow`，唔係硬 set `''`
  - 理由：鎖住冇解返會令成版頁死咗，症狀同「modal 開唔到」完全唔同，要獨立驗

- [SF-05] `browser` `unverified` — Step 1 揀相：最多 4 張，揀多過一張就顯示排位數字
  - 未有 Playwright spec
  - 理由：上限同排位係生成卡版面嘅前提，揀第 5 張要有明確反饋

- [SF-06] `manual` — Step 3 預覽出到圖，浮水印喺**右上角**，唔壓住標題
  - 要人眼睇 canvas 出嚟嘅 pixel，DOM 查唔到浮水印位置
  - 理由：浮水印壓住標題張卡就冇用，但「壓唔壓住」冇一個機器判得到嘅門檻

- [SF-07] `browser` `unverified` — 底色 picker 由主相抽色，NAVY 永遠排第一
  - 未有 Playwright spec（DOM 入面 swatch 嘅次序查得到）
  - 理由：NAVY 係 fallback，排第一先保證任何相都有一個安全底色

- [SF-08] `browser` `verified` — 桌面（冇 `navigator.canShare`）→ **唔出**「分享圖片 + 文字」掣；
  WhatsApp / Facebook / 下載 / 複製文案照出
  - Spec：`docs/qa/browser/tests/share-modal.spec.ts`
  - 理由：撳一粒喺桌面必定失敗嘅掣係最差嘅第一印象

## 撳 WhatsApp / Facebook

- [SF-09] `browser` `unverified` — 撳落去 **即刻** 開新 tab（同步，唔等 upload）
  - 未有 Playwright spec。驗法：stub `window.open` 記低 call 時間，同 click 事件時間比
  - 理由：等 await 完先開會俾彈出視窗攔截，用家見到「乜都冇發生」

- [SF-10] `browser` `unverified` — 新 tab 未 upload 完之前顯示「準備緊分享圖片…」，唔係一片空白
  - 未有 Playwright spec
  - 理由：白 tab 會令人即刻閂咗佢，share 就流失咗

- [SF-11] `curl` `verified` — 用 `docs/qa/fixtures/share-1080x1350.png`（**6,218 bytes**，1080×1350 PNG），
  由 request 發出到收到 **201**，**< 3s**
  ```bash
  curl -o /dev/null -w '%{time_total}\n' -X POST $API/share-previews \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@docs/qa/fixtures/share-1080x1350.png" -F "listingId=<id>"
  ```
  - 計時起訖：**curl `%{time_total}`** —— 由 TCP 連線開始到 201 body 收齊為止。
    **唔包括** wizard 喺 client 側 render canvas + encode 嘅時間（嗰段係 [SF-09]/[SF-12] 嘅範圍）。
  - 實測 2026-08-03，同一個 fixture 連跑四次：**2.19s · 1.53s · 1.55s · 1.43s**
  - ⚠️ 舊寫法（「Upload 喺 3 秒內完成」）**唔可證偽**：2026-08-02 量到 9.4KB 圖 1.8s、
    4.4MB 圖 7.5s —— 同一條 case 兩個相反結論。所以而家 payload 同計時點都寫死。
  - 理由：壞咗嗰陣係 22s（用家一定走咗）。門檻要 pin 死一個 payload 先做得住 regression gate

- [SF-12] `browser` `unverified` — Upload 期間粒掣顯示 spinner + 「準備緊…」，兩粒掣都 disable
  - 未有 Playwright spec
  - 理由：唔 disable 就會連環撳，upload 幾次

- [SF-13] `browser` `unverified` — 撳完 WhatsApp 再撳 Facebook → **唔會**再 upload 多次（`shareUrl` cache 到）
  - 未有 Playwright spec。驗法：數 network 入面 `POST /share-previews` 嘅次數
  - 理由：每撳一次就 upload 一次會浪費 R2 同用家時間

- [SF-14] `browser` `unverified` — 改咗底色／格式／樣式之後再 share → cache 作廢，會重新 upload
  - 未有 Playwright spec
  - 理由：cache 過度就會分享咗一張同畫面唔同嘅舊卡，呢個比冇 cache 仲差

## OG meta（server-rendered，crawler 睇嘅嘢）

> 呢批用現成 share preview `cmsc1jvbf000sy4lv1lj46tyy` 驗過（2026-08-03）。

- [SF-15] `curl` `verified` — `/s/:id` 個 HTML 有 `og:image` 指住上載嗰張卡
  - `curl -s https://uat.certifinehk.com/s/<sharePreviewId> | grep -o '<meta property="og:image"[^>]*>'`
  - 實測：`content="https://media-uat.certifinehk.com/5291d5b0-0c3c-4379-ba8f-49200ae2d579.png"`
  - 理由：呢張圖就係整個 share feature 嘅成品，冇咗佢分享出去係一條白連結

- [SF-16] `curl` `verified` — `/s/:id` 有 `twitter:card = summary_large_image`
  - `… | grep -o '<meta name="twitter:card"[^>]*>'` → `content="summary_large_image"`
  - 理由：冇呢個 tag 就算有 og:image 都會出細細張縮圖

- [SF-17] `curl` `verified` — `/s/:id` 個 description 以 **`香港第三方鑑定二手平台`** 結尾
  - `… | grep -o '<meta property="og:description"[^>]*>'`
  - 實測：`content="HK$800 · MONG_KOK · 香港第三方鑑定二手平台"`
  - 理由：唔可以係「認證」—— 貼喺商品標題價錢下面會讀成「呢件貨已認證」，即係平台自己發真偽聲明

- [SF-18] `static` `verified` — 全個 repo grep 唔到 `香港認證二手交易平台`
  - `grep -rn "香港認證二手交易平台" . --exclude-dir=node_modules --exclude-dir=.next`
  - 實測 2026-08-03：唯一 hit 係 QA 檔本身（呢條 case 嘅文字 + 舊報告），product code 乾淨
  - 理由：舊字眼一旦有人 copy 返出嚟就會靜靜雞散返出去，要 grep gate 住

- [SF-19] `curl` `verified` — `/listing/:id` 個 `og:description` 有 `HK$` 價錢（行 `formatHKD` SSOT）
  - `curl -s https://uat.certifinehk.com/listing/<id> | grep -o '<meta property="og:description"[^>]*>'`
  - 實測：`content="HK$800 · MONG_KOK · 香港第三方鑑定二手平台"`
  - 理由：價錢格式化行 SSOT，唔可以每個 surface 自己 `toLocaleString`

- [SF-20] `curl` `verified` — `/s/:id` **唔可以** server redirect（否則 og:image 冇咗）
  - `curl -o /dev/null -w '%{http_code} redirect=%{redirect_url}\n' https://uat.certifinehk.com/s/<id>`
  - 實測：`200 redirect=`（空）—— 冇 server redirect
  - Client redirect 存在：`app/s/[id]/redirect-client.tsx:14 window.location.replace(href)`；
    **真人入去跳唔跳返 listing** 呢半要 browser，未行（見下面 note）
  - 理由：crawler 唔行 JS，所以 redirect 一定要留喺 client；一改成 server redirect
    所有已分享出去嘅連結即刻冇曬 preview
  - 註：呢條淨係斷「冇 server redirect」。「真人會跳返 listing」未有 case／spec 覆蓋

- [SF-21] `curl` `verified` — `/s/<唔存在嘅 id>` → 唔會爆，落返 `/browse`
  - `curl -s https://uat.certifinehk.com/s/nonexistent-xyz` → 200，HTML 入面有 `browse`
  - 理由：過期／打錯嘅分享連結一定會出現，唔可以畀個 500 頁人睇

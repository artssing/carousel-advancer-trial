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

## Wizard（要真人操作，登入狀態）

- [SF-01] 撳「分享」開到 modal，**四邊都係圓角**
- [SF-02] 內容長到要 scroll 嗰陣，scrollbar 出現都唔會整方咗右邊兩隻角
  - 內層 `overflow-y-auto` 同外層 `rounded-2xl overflow-hidden` 要分開
- [SF-03] Modal 開住嗰陣，**背景唔郁**（body scroll lock）
- [SF-04] 撳 **Esc** 關到 modal
- [SF-22] 關咗 modal（Esc／背景／X 任何一種）之後，**背景 scroll 返轉頭**
  - cleanup 係還原開 modal 之前嗰個 `body.style.overflow`，唔係硬set `''`。
    鎖住冇解返會令成版頁死咗，症狀同「modal 開唔到」完全唔同，要獨立驗
- [SF-05] Step 1 揀相：最多 4 張，揀多過一張就顯示排位數字
- [SF-06] Step 3 預覽出到圖，浮水印喺**右上角**，唔壓住標題
- [SF-07] 底色 picker 由主相抽色，NAVY 永遠排第一
- [SF-08] 桌面（冇 `navigator.canShare`）→ **唔出**「分享圖片 + 文字」掣；WhatsApp / Facebook / 下載 / 複製文案照出

## 撳 WhatsApp / Facebook

- [SF-09] 撳落去 **即刻** 開新 tab（同步，唔等 upload）
  - 等 await 完先開會俾彈出視窗攔截。驗法：stub `window.open` 記低 call 時間
- [SF-10] 新 tab 未 upload 完之前顯示「準備緊分享圖片…」，唔係一片空白
- [SF-11] Upload 喺 **3 秒內**完成（2026-08-01 實測 1.8s；之前壞嗰陣係 22s）
- [SF-12] Upload 期間粒掣顯示 spinner + 「準備緊…」，兩粒掣都 disable
- [SF-13] 撳完 WhatsApp 再撳 Facebook → **唔會**再 upload 多次（`shareUrl` cache 到）
- [SF-14] 改咗底色／格式／樣式之後再 share → cache 作廢，會重新 upload

## OG meta（server-rendered，crawler 睇嘅嘢）

- [SF-15] `/s/:id` 個 HTML 有 `og:image` 指住上載嗰張卡
- [SF-16] `/s/:id` 有 `twitter:card = summary_large_image`
- [SF-17] `/s/:id` 個 description 以 **`香港第三方鑑定二手平台`** 結尾
  - 唔可以係「認證」—— 貼喺商品標題價錢下面會讀成「呢件貨已認證」
- [SF-18] 全個 repo grep 唔到 `香港認證二手交易平台`
- [SF-19] `/listing/:id` 個 `og:description` 有 `HK$` 價錢（行 `formatHKD` SSOT）
- [SF-20] `/s/:id` 真人入去會 client-side redirect 返 listing（**唔可以** server redirect，否則 og:image 冇咗）
- [SF-21] `/s/<唔存在嘅 id>` → 唔會爆，落返 `/browse`

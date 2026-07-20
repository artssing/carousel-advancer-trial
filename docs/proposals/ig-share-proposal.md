# IG Share Feature — Proposal（2026-07-08 Coordinator）

> Founder ask：seller 出 post 後一鍵 share 去佢 IG shop。技術上做唔做到？

## 1. 技術現實（2026）

| 路線 | 可行性 |
|------|--------|
| **IG Content Publishing API（真自動 post）** | 只限 Professional account（Business/Creator + 連 Facebook Page）；要過 Meta App Review 攞 `instagram_content_publish`（幾星期 + screencast + privacy review）；**personal account 完全 post 唔到**。Casual C2C 賣家大多 personal — 呢條路排除佢哋 |
| **IG Shop / product tagging API** | 要 approved IG Shop + Meta Commerce Manager catalog + eligibility review（二手奢侈品類可能被 extra scrutiny）。Enterprise 級 setup，唔現實 |
| **Share-intent / deeplink（推薦）** | 平台生成 branded image + caption，seller 經 OS share sheet 自己㩒兩下出 IG。全部 account type 用到，唔使 Meta review |
| **Web Share API** | Mobile browser `navigator.share({ files, text })` 開 native share sheet（IG 喺列）。Desktop 唔支援 file share，fallback = 下載圖 + 複製 caption |

**Story vs Feed**：Story 有 clickable link sticker（全 account type）= 最佳導流 vector；Feed caption 冇 clickable link（link-in-bio 問題）— 只有品牌曝光價值。

## 2. 建議

**MVP 行 share-intent + Web Share API。** 理由：
- API auto-publish 排除大多數賣家（personal account）
- Meta review 幾星期 lead time + 持續 compliance 負擔
- 真目標（分發 + 導流返平台）用 Story link sticker deeplink 更直接 — auto-post feed 根本冇 clickable link
- 符合平台中立 posture：seller 自己 publish，唔係平台代發

## 3. UX 設計（MVP）

**入口（兩個，同一 component）**
- Sell success moment：「分享去 Instagram」secondary CTA 喺「查看商品」旁
- My-listings card action：share icon 喺 編輯/查看 旁（減價後 re-share）

**Share asset**（client-side canvas 合成）
- 1080×1080（feed）/ 1080×1920（story）：cover photo + title + HKD 價 + 細 platform wordmark（attribution 唔係 endorsement）+ QR / short link `authentik.hk/l/{shortId}?utm_source=ig&ref={sellerId}`
- Tier 3：「由 {鑑定師名} 鑑定」— 永不「Authentik 保證/認證」

**Caption template**（自動入 clipboard）
```
{title}
HKD {price}
成色：{condition}
{tier3 ? `由 ${authenticatorName} 鑑定` : ''}
睇多啲：{shortLink}
#AuthentikHK #香港二手 #{brandTag}
```

**Mobile flow**：㩒掣 → canvas 生成（~1s）→ `navigator.share` → share sheet 揀 IG → Story composer 已載圖 → seller 自己加 link sticker（IG 唔畀 pre-place）→ 出。Toast：「圖片已就緒，caption 已複製」。

**Desktop flow**：modal — 圖 preview + 下載圖片 + 複製文案 + 指示。

## 4. 平台中立（必守）

- Wordmark = 角落「via Authentik HK」；禁「Authentik 保證真品」/「Authentik 認證」
- Tier 3 authenticity 歸屬具名鑑定師
- Tier 1/2：asset 完全冇 authenticity claim；成色 = 賣家申報（複用 sell page 現有 disclaimer copy）
- 平台生成 hashtag 避 `#authentic` / `#verified`

## 5. 分期

| 期 | 內容 |
|----|------|
| **MVP（而家）** | Canvas asset + Web Share API + desktop fallback + 兩個入口 + UTM short link。冇 Meta app、冇 OAuth。日計唔係星期計 |
| **Phase 2（MVP 有 adoption 先）** | Professional account seller 加 optional「connect Instagram」OAuth + Graph API auto-publish（要 Meta App Review）。Additive — share sheet 留做 fallback |
| **Backlog** | IG Shop catalog sync — heavy + 二手奢侈品 eligibility 風險。除非 IG 變 primary acquisition channel 先諗 |

## 實施 scope（sizing）

- 1 個 shared share-sheet component（asset generation + `navigator.share` + fallback），sell + my-listings 兩處用
- Client-side canvas（唔使新 backend endpoint；server-rendered asset = nice-to-have）
- 1 個 short-link redirect route（或 MVP 直接用 listing route + query param）

**Priority**：Medium — 低風險分發 lever，但唔係 transaction funnel blocker，唔應該搶 Phase 3 鑑定師 portal polish 優先次序。

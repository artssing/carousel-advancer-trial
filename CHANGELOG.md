# Changelog

Certifine 每個 release 一段。頂嗰段就係而家四個 container 應該行緊嘅版本。

## 點運作

- **版本號 SSOT = repo root 個 `VERSION` 檔**（一行,例如 `0.1.0`）。
- `ci/ci-run.sh dockerbuild` 會讀佢,經 `APP_VERSION` build arg 燒入四個 image,
  四個 `/api/version` 都會答返同一個號碼。
- 三個 portal 嘅版本 badge 就係讀嗰個 endpoint。**改咗 `VERSION` 但未 rebuild,
  畫面唔會變** —— 呢個係故意嘅:badge 講嘅係「而家行緊乜」,唔係「repo 寫住乜」。

## 幾時 bump

| 改咩 | 郁邊個位 | 例 |
|---|---|---|
| 用戶見到嘅新 feature | minor | 0.1.0 → 0.2.0 |
| 修 bug / 文案 / 內部重構 | patch | 0.1.0 → 0.1.1 |
| 未開台之前 | 一律 0.x | 正式開台先出 1.0.0 |

Bump 嘅動作:改 `VERSION` → 喺呢度開新一段 → 一齊 commit → build + deploy。
**版本號同 commit 唔係二選一**:版本號答「邊個 release」,commit sha 答「嗰個
release 嘅邊次 build」。同一個 v0.1.0 deploy 兩次,version 一樣但 sha 唔同 ——
所以 rollback 用嘅釘死 tag 係 `certifine-<app>:<env>-<sha>`,唔係版本號。

---

## 0.1.0 — 2026-08-12

第一個有版本號嘅 build。之前嘅 build 冇版本概念,由呢度起計。

### 新增
- **版本顯示**:三個 portal 都見到自己個 build 嘅版本號。買賣家 footer 只見
  `v0.1.0`;鑑定師 sidebar 同 admin 額外顯示 commit 短碼;撳一下 copy 完整 sha。
- **Admin Fleet versions 表**:四個服務（consumer / authenticator / admin / api）
  嘅版本、build 時間、commit 一表睇晒,版本唔一致會紅。
- **Footer Facebook / Instagram 連結**。

### 修正
- 鑑定師個出價卡(OfferCard)之前係一份 fork,從來冇接 i18n —— 英文介面之下
  仲係中文,而且冇跟「撤回/拒絕一律出確認 dialog」嘅規矩。而家同買賣家嗰邊
  共用同一個 component,兩樣都修好。

### 內部
- PROD 同 UAT 唔再共用 API image tag。以前一次 UAT build 就會改到 PROD 個
  mutable tag,PROD 下次重啟就會食咗 UAT 嘅 code(2026-08-11 中過兩次)。
- QA 嘅「英文介面唔應該有中文」掃描,而家識得分開「介面文字」同「用戶自己
  寫嘅字」（商品標題、賣家名唔會再被當成漏翻譯）。

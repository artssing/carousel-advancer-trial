# ConfirmDialog v2 — 統一確認彈窗 設計 + 全平台 Audit（2026-07-12 Coordinator）

> Founder ask：所有 confirm 要係「有 alert 感嘅 popup dialog」，唔係 button 變形。
> 原則不變（terminal action 必須二次確認 = lesson #16），**機制升級**：inline strip → modal overlay。

## 現狀

- `packages/ui/src/components/confirm-dialog.tsx` **已存在**，已接 4 位（admin unsuspend、consumer dispute、authenticator verdict ×2）— 呢 4 個係 reference implementation
- 其餘 ~20 位仍係 inline 2-step；**零 `window.confirm()`**
- 現有 component 最大 gap：**唔識 per-portal 變色**（info 寫死 consumer 綠 — 違 lesson #18），冇 icon、冇 focus trap

## Audit：24 位（完整 table 見 Coordinator 報告，重點）

**三個「零確認」真 gap（最急）：**
1. **買家「確認收貨」= 放款畀賣家** — 郁錢不可逆，而家一撳即放 ❗
2. **Reject offer** — 一撳即拒
3. **Admin KYC approve/reject** — 一撳即批/拒

**已係 dialog（唔使郁）**：dispute、verdict ×2、unsuspend
**Inline 要升級做 modal**：soft-delete listing（sell + my-listings）、cancel order、withdraw offer、刪支付方式、刪分店、admin 全部錢類 action（force refund / release / dispute resolve / suspend / content takedown）、banner delete
**唔使 dialog**：restore listing（T4 trivial）、cashout wizard（本身多步 flow，只對齊視覺語言）

## Spec 重點

- **層級**：T1 郁錢/不可逆 = danger 紅 + 必填原因 +（可選 typed confirmation）；T2 不可逆-ish = 標準；T3 可還原 = 輕量 neutral（soft delete 唔使嚇人，寫「可以隨時還原」）；T4 = 唔彈，事後 toast
- **視覺**：overlay 壓暗 + 置中卡（desktop）/ **bottom sheet**（mobile，Carousell 慣例，thumb 位）；**variant icon**（danger 三角/warning/info）— 呢個係「唔覺係 alert」嘅最大解藥；新增「呢個動作會…」consequence line 做獨立 prop
- **Per-portal 色**：consumer 綠 / authenticator 靛藍 / **admin 用 dark slate 卡**（白卡喺 dark 主題會突兀）— 一個 component + portal prop（SSOT）
- **Button 次序**：desktop 確認在右（PayMe/WeChat/Carousell 慣例）；mobile 直排、取消在上（sheet 彈入時 thumb 先掂到安全掣）
- **行為**：初始 focus 落取消（有 reason 欄則 focus textarea）；T1 唔准撳背景 dismiss（Esc 保留 — a11y）；busy state 鎖雙掣
- **Lesson #16 註明升級**，唔刪原則

## 遷移次序

1. 確認收貨放款（零確認 + 郁錢）→ 2. reject offer + KYC → 3. admin 錢類 action → 4. suspend + takedown → 5. consumer 高頻位（delete/cancel/withdraw）→ 6. banner → 7. wizard 視覺對齊

## 待拍板（見 chat 問題）

typed confirmation 範圍 / inline 例外 / admin 卡色 / KYC approve 使唔使彈

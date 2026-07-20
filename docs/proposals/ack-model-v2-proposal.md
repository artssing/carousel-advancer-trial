# Ack Model v2 — 全流程確認機制重設（2026-07-10 founder rulings + Coordinator review）

> Founder 大原則：**有物流 trace / 三方同場就唔使人手 ack；錢跟時間自動放。**

## 新 Flow（待拍板細節見尾）

### SHIP + 鑑定
| 步 | 角色 | 動作 | 證據 | Auto/Manual |
|---|---|---|---|---|
| 1 | 賣家 | 已寄出（畀鑑定師） | **SF 單號必填** + 可選收據相（唔係齋 button — A2） | Manual progress |
| 2 | 鑑定師 | 收件確認（single，**拆咗賣家 ack** — A3） | ≥3 相 + 物品清單 checklist（袋/塵袋/卡） | Manual |
| 3 | 鑑定師 | Verdict | verdict + notes | Manual |
| 4 | 鑑定師 | PASSED 寄出畀買家 | SF 單號 | Manual；寄出即當 SOLD（A4） |
| 5 | System | **T+N 自動 COMPLETED + 放款**，買家唔使 ack | — | Auto（cron sweep，複用 sweepSellerAckTimeout pattern；`autoCompleteAt` 欄位寄出時寫死） |
| 5b | 買家 | 爭議 button（T+N 窗口內） | 相 + 描述 | Manual → DISPUTED，即停 auto-complete |

### SHIP 無鑑定
賣家已寄出（SF 單號必填）→ T+N 自動 COMPLETED + 過數。買家只有爭議 button。

### MEETUP_AUTH
| 步 | 動作 | Ack |
|---|---|---|
| 1 | 賣家到店交貨 — **冇 app step**（C1 拆） | — |
| 2 | 鑑定師 custody 確認（可 scan 賣家 QR 做身份 audit — 唔係 ack） | 🟡 鑑定師 + ≥3 相 |
| 3 | Verdict | 🟡 鑑定師 |
| 4 | **買家出示 60 秒輪換 QR → 鑑定師 scan → portal 彈單 + 商品相 →「確認交收」→ auto-complete + 放款** | 🟡 鑑定師 scan |

### MEETUP_3WAY
鑑定師 開始 + verdict 兩下。**Verdict PASSED = auto COMPLETED + 放款**（建議 verdict UI 加一個「貨物已當面交予買家」checkbox — 一 tap，將「真」同「交咗貨」兩件事分開記錄）。

### MEETUP_DIRECT
零 ack、零佣金。**矛盾位**：而家仲畀揀 ONLINE_ESCROW — 冇人 ack = escrow 冇人放，錢困死。見拍板 Q2。

## QR 取貨機制（Coordinator design）

- **Server-issued 短命 nonce**（唔用 TOTP — 免 shared secret 外洩風險；可 revoke、每單 audit）
- 買家 app 每 60 秒 poll `GET /orders/:id/pickup-token`（買家 JWT）；token 一次性、綁 orderId+buyerId、scan 即 consume
- 鑑定師 portal 鏡頭 scan（`getUserMedia`，唔使裝 app）→ 驗證 → 彈大卡：「比對成功 — 交畀 {買家名}，#單號，{商品相}」+ 單一「確認交收」button
- **商品相必顯示** — 鑑定師眼見對貨先交，防拎錯袋
- **Fallback（買家冇電）**：AWAITING_BUYER_PICKUP 時已 email/SMS 咗 6 位 backup code（唔係 live 生成，死機都有）+ 鑑定師目測核對姓名；manual override 事件 log 低
- **防 replay**：60 秒過期 + 一次性；scan endpoint rate-limit（防爆 6 位碼）；relay 攻擊靠「portal 顯示買家名/KYC 相 + 目測」做第二因素
- **賣家 drop-off 可重用**同一機制（token 加 role: SELLER namespace），同一 scan UI — 但可以後期先做

## Risk flags

- **R1 買家保護降級**（T+N auto-complete）：UI 必須 banner 級倒數「X 日內未有異議自動完成」+ 寄出/T+1 push（IM system message，記住 lesson #12 要 gateway broadcast）
- **R2 賣家 ack 拆除**：SF trace + 鑑定師相 + E&O 承擔 — 殘餘風險可接受；清單 checklist 補位
- **R5 Sweep 要 exclude 已 file dispute 嘅單**（同 tick race 都唔可以 auto-complete）
- **R6 token endpoints 要 rate-limit + 買家 JWT gate**

## 待 Founder 拍板

1. T+N 同現有 72hr `cashoutEligibleAt` 係咪合併做一個鐘？（建議合併）
2. MEETUP_DIRECT：強制 OFFLINE_CASH（建議）定保留 escrow + 買家單 click 放款？
3. N = 2 定 3？純 wall-clock 定 SF tracking-aware（未派到自動延長）？（建議 T+3 + tracking-aware）
4. 爭議 window 內 file dispute → 停 auto-complete 直至 resolve（建議）
5. QR fallback「6 位碼 + 目測姓名」夠唔夠，定要 log HKID 末 4 位？
6. 賣家 drop-off QR 同步出定後期？（建議後期）

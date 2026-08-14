# Backlog — 「已預留 / RESERVED」訂單狀態

> 開立：2026-08-14（founder ruling）
> 狀態：**未做**，等排期。
> 相關：`packages/utils/src/order-status.ts`、`apps/api/prisma/schema.prisma`（`OrderStatus`）、
> `apps/api/src/orders/orders.service.ts`、`apps/consumer/app/orders/page.tsx`

## 起因

2026-08-14 傾訂單頁面 IA 嗰陣，founder 指出而家嘅 `AWAITING_PAYMENT` +
`paymentDeadlineAt`（30 分鐘）**行為上已經係「預留」**，只係個名唔係咁叫，而且
冇做到預留應該做嘅事：件貨仍然搜尋得到。

## 要做乜（founder 描述，參考 Carousell）

一旦買賣雙方講掂數決定線下交易：

1. 雙方可以建立一個**「已預留」**狀態。
2. 呢件貨**其他用戶暫時搜尋唔到** —— 唔會再出現喺 browse / search 結果。
3. 因此賣家唔會再收到其他潛在買家嘅 message —— 佢已經決定賣畀呢個人。
4. 交易完成後，**由當事人自己 mark 返做「已完成」**（唔係系統自動）。

## 同現況嘅分別

| | 而家 `AWAITING_PAYMENT` | 建議 `RESERVED` |
|---|---|---|
| 有冇時限 | 有，30 分鐘（`paymentDeadlineAt`） | 冇 —— 線下交易唔會 30 分鐘搞掂 |
| 上架狀態 | 仍然搜尋得到 | 搜尋唔到（暫時落架） |
| 點結束 | 逾時自動 `PAYMENT_EXPIRED` | 由雙方自己 mark 完成 |
| 訂單頁面 | 顯示 | 待定（見下面未決事項） |

## 未決事項（開工前要 founder 拍板）

- **預留有冇上限？** 冇時限 = 賣家可以無限期霸住件貨唔賣、亦唔完成。Carousell
  容許賣家自己解除預留；我哋要唔要加一個「X 日後自動解除」嘅安全網？
- **邊個可以解除？** 淨係賣家？定買家都可以撤回？
- **同 escrow 點夾？** 線下交易 = 平台唔 hold 錢；咁「已預留」係咪一定係
  `MEETUP_DIRECT` + 無鑑定？如果有鑑定師，件貨要送去鑑定，就唔係純粹預留。
- **平台費點計？** 完全線下、平台唔 hold 錢，收唔收 1.5%？（同 Ack v2 (E)
  `MEETUP_DIRECT` 零 ack 嗰條 ruling 一致嘅話係唔收。）
- **要唔要新 enum，定係 reuse？** 加 `OrderStatus.RESERVED` 係 schema 改動；
  另一個做法係喺 listing 側加 `reservedForUserId`，訂單照走現有 flow。

## 相關已知事實

- 2026-08-14 已經將 `PAYMENT_EXPIRED` 由訂單列表同所有計數剔走（commit
  `550905b`）—— 逾期未付款 = 個 hold 過咗期，唔係一單有結果嘅交易。對話唔受影響。
- `TERMINAL_STATUSES` 而家係 `['COMPLETED', 'REFUNDED', 'PAYMENT_EXPIRED']`。
- 訂單頁面而家分四組：`待處理 / 爭議處理中 / 進行中 / 已完成`（`orderGroup()`）。
  `RESERVED` 落邊一組要一齊決定 —— 直覺係 `進行中`，但佢冇「等緊邊個」呢個
  語義，可能要獨立處理。

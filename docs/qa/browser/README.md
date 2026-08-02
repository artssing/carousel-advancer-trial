# Browser lane — Playwright

`browser` lane 嘅 case 喺呢度執行。qa-tester 冇瀏覽器 tool，但**有 `Bash`** ——
Playwright 出嘅係純文字結果，佢讀得到。所以 browser lane 唔使交返俾人手。

## 點行

```bash
./docs/qa/browser/run.sh              # 全部
./docs/qa/browser/run.sh share        # 只跑 grep 到 "share" 嘅 test
```

Container 行完即刪（`--rm`），**image 亦都行完即刪**（founder 2026-08-02）。
即係每次跑都要重新拉約 1.5GB。慳磁碟，代價係每次多幾分鐘、而且冇網跑唔到。
想改成保留 image 嘅話，改 `run.sh` 尾嗰句 `docker rmi` 就得。

## 邊界

- **打 UAT 公網 URL**，唔起 dev server（CLAUDE.md：呢部機唔行 dev mode）。
- 唔喺部機 `npm install` Playwright —— 全部喺 container 入面行。
- 純視覺嘅嘢（圓角、浮水印位、色感）**唔屬於呢度**，嗰啲係 `manual` lane，
  收喺 release checklist。呢度只放「壞咗會即刻死人」嗰批。

## Flaky 係大敵

一旦 founder 學識「紅色可以無視」，成套嘢就死。所以：

- 情願少幾條，唔好貪多。
- 唔准用 `waitForTimeout` 死等，一律等實際條件（`expect(...).toBeVisible()` 有 auto-retry）。
- 一條 test 只驗一件事，掛咗要一眼睇得出係邊件事。
- 連續 flaky 兩次嘅 test，即刻 skip 咗佢再查，唔好留喺度嘈。

## Case 對照

每個 test 個 title 要以 case ID 開頭（例如 `SF-03 …`），咁報告先對得返 scope。

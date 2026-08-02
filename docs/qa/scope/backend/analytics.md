---
layer: backend
feature: analytics
owners:
  - apps/api/src/analytics/**
  - packages/utils/src/analytics-events.ts
  - apps/consumer/lib/analytics.ts
  - apps/authenticator/lib/analytics.ts
last_synced_commit: 3b8dfcd
---

# Analytics — Backend

Registry SSOT：`packages/utils/src/analytics-events.ts`。**唔喺白名單就要 drop 咗佢。**

## Lane budget

`curl` 10 · `static` 0 · `browser` 0 · `manual` 0 —— 全部 `verified`。

> 共用 helper（copy 得走）：
> ```bash
> ev(){ P="${2:-{\}}"
>   curl -s -X POST $API/analytics/events -H 'Content-Type: application/json' \
>   -d "{\"events\":[{\"event_id\":\"$(uuidgen)\",\"event_name\":\"$1\",
>        \"occurred_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"portal\":\"CONSUMER\",
>        \"anonymous_id\":\"qa-anon\",\"role\":\"GUEST\",\"session_id\":\"qa-sess\",
>        \"page_path\":\"/browse\",\"device\":\"DESKTOP\",\"properties\":$P}]}"; }
> ```
> ⚠️ Payload 一定要係 `{"events":[…]}` 陣列包住，唔係單一 object。

## Ingestion

- [AN-01] `curl` `verified` — 完整 envelope → `{"accepted": 1}`
  - `ev share_modal_opened` → `{"accepted":1}`
  - 理由：envelope 少一個欄位就會靜靜雞被 drop，數據就會憑空少一截

- [AN-02] `curl` `verified` — 未 register 嘅 event name → `{"accepted": 0}`
  - `ev share_bogus_event` → `{"accepted":0}`
  - 理由：白名單係防止有人隨手加個新名，事後冇人知呢條數點解對唔上

- [AN-03] `curl` `verified` — Envelope 唔齊 → **201 + `{"accepted":0}`**，唔可以 500
  - 三種殘缺 body 都試：`{}` · `{"events":"nope"}` · `{"events":[{"event_name":"share_modal_opened"}]}`
  - 實測：三個都 `201 {"accepted":0}`
  - 理由：analytics 係 fire-and-forget，回 500 會令 client retry 風暴

## Share domain

呢四個要 `accepted: 1`：

- [AN-04] `curl` `verified` — `ev share_modal_opened` → accepted 1
  - 理由：wizard 開幾多次係 share funnel 第一格
- [AN-05] `curl` `verified` — `ev share_step_advanced` → accepted 1
  - 理由：分得出用家喺邊一步跌出去
- [AN-06] `curl` `verified` — `ev share_bg_color_selected` → accepted 1
  - 理由：底色 picker 有冇人用，決定要唔要繼續投資落去
- [AN-07] `curl` `verified` — `ev share_action_completed` → accepted 1
  - 理由：funnel 最後一格，冇佢就唔知 share 成功率

- [AN-08] `curl` `verified` — `share_action_completed` 個 `channel` 收得五個值
  - `for c in native download copy_caption link_whatsapp link_facebook; do ev share_action_completed "{\"channel\":\"$c\"}"; done`
  - 實測：五個全部 `accepted 1`
  - ⚠️ 已知：未知值（例如 `bogus_channel`）**一樣** `accepted 1` —— property 值冇白名單，
    只有 event name 有。條 case 只講「五個收得」，所以技術上冇 mismatch，但「未知值應該點」
    未有 ruling。
  - 理由：channel 係 share 報告嘅切法，收唔齊就分唔到邊個渠道有效

## Checkout domain

- [AN-09] `curl` `verified` — 五個 checkout event 全部收
  - `for e in checkout_started checkout_review_viewed checkout_review_confirmed checkout_deadline_warning_shown checkout_completed; do ev $e; done`
  - 實測：五個全部 `accepted 1`
  - 理由：checkout funnel 係最貴嗰條 funnel，斷一格就講唔到流失喺邊

- [AN-10] `curl` `verified` — `checkout_payment_expired` 係 **server-side**（cron 直接落 DB，唔經 client batch）
  - `docker exec authentik-postgres psql -U authentik -d authentik_uat -tAc "select \"anonymousId\",\"sessionId\",portal,count(*) from \"AnalyticsEvent\" where \"eventName\"='checkout_payment_expired' group by 1,2,3"`
  - 實測：`server|server|CONSUMER|4`（另有一條 `qa-0802-anon` 係舊 QA 自己造嘅反例，日後 filter 要排除）
  - 理由：過期一定發生喺用家已經走咗之後，靠 client 報就永遠報唔到

## 已刪嘅 ID（永不重用）

- **AN-11**（「Admin analytics endpoint 200；買家 token → 403」）—— 2026-08-03 併入
  [AU-11] 角色隔離矩陣（`backend/auth.md`）。`/analytics/admin/overview` 喺嗰個矩陣入面。

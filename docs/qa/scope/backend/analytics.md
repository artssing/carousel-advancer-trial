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

## Ingestion

- [AN-01] `POST /analytics/events` 帶完整 envelope（`event_id` / `occurred_at` / `portal` /
  `anonymous_id` / `role` / `session_id` / `page_path` / `device` / `properties`）→ `{"accepted": 1}`
- [AN-02] 未 register 嘅 event name（例如 `share_bogus_event`）→ `{"accepted": 0}`
- [AN-03] Envelope 唔齊 → 唔可以 500

## Share domain（2026-08-01 加）

呢四個要 `accepted: 1`：

- [AN-04] `share_modal_opened`
- [AN-05] `share_step_advanced`
- [AN-06] `share_bg_color_selected`
- [AN-07] `share_action_completed`

- [AN-08] `share_action_completed` 個 `channel` 收得五個值：
  `native` / `download` / `copy_caption` / `link_whatsapp` / `link_facebook`

## Checkout domain

- [AN-09] `checkout_started` / `checkout_review_viewed` / `checkout_review_confirmed` /
  `checkout_deadline_warning_shown` / `checkout_completed` 全部收
- [AN-10] `checkout_payment_expired` 係 **server-side**（cron 直接落 DB，唔經 client batch）

## Admin 查詢

- [AN-11] Admin analytics endpoint 200；買家 token → 403

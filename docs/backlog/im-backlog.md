# IM Backlog

> Low-priority items deferred from Phase 3 IM implementation.

## Low Priority

- **Push notifications**: offline users should receive push (FCM/APNs) when a new message arrives. Prerequisite: device token registration endpoint. See also `docs/proposals/push-notifications.md`.
- **Message reactions**: emoji reactions à la WhatsApp. Requires new DB table `MessageReaction(messageId, userId, emoji)`.
- **Image/file attachments**: upload to R2 / object storage, display inline in bubble. See lesson #11 (placeholder button anti-pattern — do not add until truly wired).
- **Voice messages**: record audio, upload, playback inline.
- **Message search**: full-text search across conversation history.
- **Presence dedup across tabs**: if same user opens multiple tabs, each reconnect broadcasts online/offline independently → flicker. Fix: server-side connection-count per userId; only broadcast offline when count drops to 0.
- **Read receipt granularity**: current impl marks all unread messages in a conv as read on join. WhatsApp marks per-message as user scrolls past. Lower priority for MVP.
- **Typing indicator debounce on server**: throttle typing events server-side to avoid forwarding every keystroke at scale.
- **Conversation archiving / mute**: let users mute noisy convs.
- **Group message multi-device sync**: `seenMessageIds` ref is per-tab; if same user is logged in on two devices, dedup only applies per tab. Server-side event dedup would be cleaner long-term.

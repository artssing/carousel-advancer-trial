/**
 * Analytics event registry — SSOT（docs/proposals/analytics-tagging-spec.md §9）。
 *
 * Governance（founder 2026-07-14 拍板）：
 *  • 所有 tracking 必須用呢度定義嘅 event name + typed properties，
 *    唔准喺 page 自由 `track('random_name', ...)`（lesson #8 SSOT 原則）。
 *  • 新 feature = 加 event 入呢度 + update spec 文件 Changelog，先准上 code。
 *  • 全新 domain 要 founder review；同 domain 加 event 照 pattern 直接加。
 *
 * MVP scope（Phase 1）：session / search / browse(listing_viewed) / checkout
 * 骨幹。其餘 domain（offer/im/wallet/auth_portal/admin/order server-side）
 * 見 spec §10 Phase 2。
 */

// ── Event names（union type = compile-time 白名單）─────────────────────────
export const ANALYTICS_EVENTS = [
  // session domain
  'session_started',
  'session_heartbeat',
  'session_ended',
  'user_login',
  'user_logout',
  'user_signup',
  // browse domain
  'page_view',
  'category_selected',
  'listing_viewed',
  'listing_view_ended',
  // search domain
  'search_performed',
  'search_zero_result',
  'search_filter_removed',
  'search_result_clicked',
  // checkout domain（購買 funnel 骨幹）
  'checkout_started',
  'checkout_review_viewed',
  'checkout_review_confirmed',
  'checkout_deadline_warning_shown',
  'checkout_completed',
  /** SERVER-SIDE：cron sweepPaymentExpired 直接落 DB，唔經 client batch（founder 2026-07-20 ruling #5） */
  'checkout_payment_expired',
  // share domain（社交分享 funnel — 賣家自發引流，MVP 2026-07-31）
  'share_modal_opened',
  'share_step_advanced',
  'share_bg_color_selected',
  'share_action_completed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name);
}

// ── Envelope（每個 event 必帶，spec §1）────────────────────────────────────
export type AnalyticsPortal = 'CONSUMER' | 'AUTHENTICATOR' | 'ADMIN';
export type AnalyticsRole = 'GUEST' | 'BUYER' | 'SELLER' | 'AUTHENTICATOR' | 'ADMIN' | 'MULTI';
export type AnalyticsDevice = 'MOBILE' | 'DESKTOP' | 'TABLET';

export interface AnalyticsEventEnvelope {
  event_name: AnalyticsEventName;
  /** client 產生，去重用 */
  event_id: string;
  /** client-side ISO8601（server 另補 received_at） */
  occurred_at: string;
  portal: AnalyticsPortal;
  anonymous_id: string;
  user_id: string | null;
  role: AnalyticsRole;
  session_id: string;
  page_path: string;
  referrer: string | null;
  device: AnalyticsDevice;
  properties: Record<string, unknown>;
}

// ── Per-event properties（typed payload）──────────────────────────────────
export interface SearchPerformedProps {
  query_raw: string;
  parsed_category: string | null;
  auto_applied_filters: string[];
  remaining_terms: string[];
  result_count: number;
  sort: string;
}

export interface SearchResultClickedProps {
  /** 連返 search_performed 個 event_id（funnel join key） */
  query_id: string;
  listing_id: string;
  result_position: number;
}

export interface ListingViewedProps {
  listing_id: string;
  tier: 1 | 2 | 3;
  price_hkd: number;
  category_id: string;
  source: 'browse' | 'search' | 'seller_profile' | 'direct_link';
}

/** 停留時間（founder 2026-07-14 enhancement）：離開 listing detail 時 fire。 */
export interface ListingViewEndedProps {
  listing_id: string;
  /** clamp 上限 30 分鐘 — 掛機 tab 唔好污染平均數 */
  dwell_seconds: number;
}

export interface CheckoutStartedProps {
  listing_id: string;
  tier: 1 | 2 | 3;
  price_hkd: number;
}

export interface CheckoutCompletedProps {
  order_id: string;
  listing_id: string;
  total_hkd: number;
}

/** Review→Pay 兩步 checkout（founder 2026-07-20）。 */
export interface CheckoutReviewViewedProps {
  order_id: string;
  listing_id: string;
  tier: 1 | 2 | 3;
}

/** 撳「確認訂單，前往付款」— 同時係 30 分鐘 paymentDeadlineAt 起點。 */
export interface CheckoutReviewConfirmedProps {
  order_id: string;
  listing_id: string;
  tier: 1 | 2 | 3;
  total_hkd: number;
}

export interface CheckoutDeadlineWarningShownProps {
  order_id: string;
  remaining_seconds: number;
}

/** SERVER-SIDE event：買家過期率係 admin-only 指標（將來可能用作 ban 判斷 —
 *  founder ruling #3 2026-07-20），customer 睇唔到。 */
export interface CheckoutPaymentExpiredProps {
  order_id: string;
  listing_id: string;
  tier: 1 | 2 | 3;
  total_hkd: number;
  buyer_user_id: string;
}

// ── share domain（分享 funnel）────────────────────────────────────────────
/** 分享對象／方式。link_* = 生成 OG 卡再跳 app；native = navigator.share 帶圖。 */
export type ShareChannel =
  | 'native'
  | 'download'
  | 'copy_caption'
  | 'link_whatsapp'
  | 'link_facebook';

export interface ShareModalOpenedProps {
  listing_id: string;
  /** 賣家喺自己 my-listings 分享，定買家喺 listing 頁分享 */
  entry: 'listing_detail' | 'my_listings';
}

/** step 2 = 揀格式/樣式，step 3 = 預覽。漏斗流失率靠呢個計。 */
export interface ShareStepAdvancedProps {
  listing_id: string;
  step: 2 | 3;
  photo_count: number;
}

export interface ShareBgColorSelectedProps {
  listing_id: string;
  /** hex，用嚟睇有幾多人唔要 default NAVY */
  color: string;
  is_default: boolean;
}

export interface ShareActionCompletedProps {
  listing_id: string;
  channel: ShareChannel;
  format: 'story' | 'feed';
  template: 'photo' | 'clean';
  photo_count: number;
}

export interface UserLoginProps {
  method: 'PASSWORD' | 'GOOGLE';
  /** identity merge（spec §3）：登入前個 anonymous_id */
  previous_anonymous_id: string;
}

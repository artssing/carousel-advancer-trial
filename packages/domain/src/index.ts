/**
 * `@certifine/domain` — the rules both the API and the web must agree on.
 *
 * Membership test, and it is deliberately hard to pass: **two copies of this
 * would be a bug, not just duplication.** Tier thresholds and fees decide
 * money; `needsMyAction` decides a badge the server counts and the page
 * renders; the analytics registry is a whitelist the API rejects against;
 * `normalizeHKPhone` and `normalizeForMatch` have to agree byte for byte or a
 * lookup silently misses.
 *
 * Two things are deliberately NOT here:
 *
 *   - **UI copy.** No `t()`, no locale bundle, no Chinese label helpers. Copy
 *     changes several times a day; rules change a few times a quarter. Once
 *     this package is published from `certifine-api`, every edit to a file in
 *     here costs a version bump on both sides — so copy must not live where it
 *     would drag the rules along with it.
 *   - **Anything with no backend consumer.** `mtr`, `districts`, `prices`,
 *     `shipping`, `chat-time`, `chat-preview`, `search`, `money`, `brands`
 *     stay in the web package. Shared surface should be as small as it can be,
 *     not as large as it could be.
 *
 * Adding an export here is a decision, not a convenience. If the API does not
 * need it, it does not belong.
 */
export * from './tier';
export * from './categories';
export * from './conditions';
export * from './order-rules';
export * from './payout-methods';
export * from './phone';
export * from './analytics-events';
export * from './text';

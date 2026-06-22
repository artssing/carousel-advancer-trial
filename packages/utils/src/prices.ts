/**
 * Strikethrough savings helper — SSOT for price drop display.
 *
 * Founder ruling 2026-06-19 Q1=A: anchor = first-drop frozen price.
 * Q6=A: SOLD listings keep strikethrough so buyers see deal value.
 *
 * Browse card + listing detail + my-listings card all derive savings via this
 * single function — prevents the % calculation drifting between pages
 * (Lesson #8 SSOT).
 */

export interface Savings {
  amountHKD: number;
  pct: number;          // integer percent (rounded)
  display: string;      // "-31%"
  savedDisplay: string; // "慳 HKD 1,700"
}

/**
 * Compute savings when a listing has an original-price anchor.
 *
 * Returns null when:
 *  - originalPriceHKD is null/undefined (no drop ever)
 *  - originalPriceHKD <= salePriceHKD (defensive — shouldn't happen, but safe)
 */
export function formatSavings(
  originalPriceHKD: number | null | undefined,
  salePriceHKD: number,
): Savings | null {
  if (!originalPriceHKD || originalPriceHKD <= salePriceHKD) return null;
  const amount = originalPriceHKD - salePriceHKD;
  const pct = Math.round((amount / originalPriceHKD) * 100);
  return {
    amountHKD: amount,
    pct,
    display: `-${pct}%`,
    savedDisplay: `慳 HKD ${amount.toLocaleString('en-HK')}`,
  };
}

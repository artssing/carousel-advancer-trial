/**
 * Shipping helpers — SSOT (lesson #8).
 *
 * SF tracking P0 (founder 2026-07-10, docs/backlog/sf-tracking-backlog.md):
 * tracking numbers deep-link to SF Express HK's official waybill search so
 * buyers/sellers can check delivery progress without leaving a dead-end text
 * string. P1 (丰橋 route-query API + webhook) is backlog — needs the platform
 * SF monthly account first.
 */

/** SF Express HK 官網查件 deep link（帶單號直入結果頁）。 */
export function sfTrackingUrl(trackingNo: string): string {
  return `https://htm.sf-express.com/hk/tc/dynamic_function/waybill/#search/bill-number/${encodeURIComponent(trackingNo.trim())}`;
}

/**
 * Payment-method SSOT for the consumer app — labels, brand styling, test
 * cards, BIN-detect, Luhn, format helpers.
 *
 * Lesson #8: every checkout component imports from here. No payment-method
 * arrays / test-card lists should be hardcoded in pages or components.
 */

export type PaymentMethodId = 'CARD' | 'ALIPAY_HK' | 'WECHAT_HK' | 'FPS' | 'APPLE_PAY';

export interface PaymentMethodConfig {
  id: PaymentMethodId;
  label: string;
  /** Inline SVG / emoji for tab icon (kept light — real brand SVGs added later) */
  icon: string;
  /** Short marketing tag shown under the tab on desktop */
  tagline: string;
  /** Order in tab strip */
  order: number;
}

export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  { id: 'CARD',       label: '信用卡',     icon: '💳', tagline: 'Visa / MC / Amex / UnionPay', order: 1 },
  { id: 'ALIPAY_HK',  label: 'Alipay HK',  icon: '🅰️', tagline: '掃 QR · 即時付款',           order: 2 },
  { id: 'WECHAT_HK',  label: 'WeChat Pay', icon: '💬', tagline: '香港錢包 · 掃 QR',           order: 3 },
  { id: 'FPS',        label: 'FPS 轉數快', icon: '⚡', tagline: '銀行 app 即時轉賬',          order: 4 },
  { id: 'APPLE_PAY',  label: 'Apple Pay',  icon: '',  tagline: 'Touch ID / Face ID',         order: 5 },
];

export function getPaymentMethod(id: PaymentMethodId): PaymentMethodConfig | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

// ─── Test cards (mock mode — Stripe-compatible test numbers) ───────────────

export type TestCardOutcome = 'success' | 'decline' | 'insufficient' | '3ds_fail';

export interface TestCard {
  number: string;
  brand: CardBrand;
  outcome: TestCardOutcome;
  label: string;
}

export const TEST_CARDS: TestCard[] = [
  { number: '4242424242424242', brand: 'visa', outcome: 'success',      label: '✓ 成功（Visa）' },
  { number: '5555555555554444', brand: 'mc',   outcome: 'success',      label: '✓ 成功（Mastercard）' },
  { number: '378282246310005',  brand: 'amex', outcome: 'success',      label: '✓ 成功（Amex 15 digit）' },
  { number: '4000000000000002', brand: 'visa', outcome: 'decline',      label: '✗ 信用卡被拒' },
  { number: '4000000000009995', brand: 'visa', outcome: 'insufficient', label: '✗ 餘額不足' },
  { number: '4000002500003155', brand: 'visa', outcome: '3ds_fail',     label: '✗ 3DS 驗證失敗' },
];

// ─── Card brand detection (BIN prefix) ─────────────────────────────────────

export type CardBrand = 'visa' | 'mc' | 'amex' | 'unionpay' | 'unknown';

export interface BrandSpec {
  id: CardBrand;
  label: string;
  /** Total digit count (excluding spaces) */
  length: number;
  /** Visual grouping for display (e.g. [4,4,4,4] or [4,6,5] for Amex) */
  groups: number[];
  /** CVV digit count */
  cvvLength: number;
}

export const BRAND_SPECS: Record<CardBrand, BrandSpec> = {
  visa:     { id: 'visa',     label: 'Visa',         length: 16, groups: [4, 4, 4, 4], cvvLength: 3 },
  mc:       { id: 'mc',       label: 'Mastercard',   length: 16, groups: [4, 4, 4, 4], cvvLength: 3 },
  amex:     { id: 'amex',     label: 'Amex',         length: 15, groups: [4, 6, 5],    cvvLength: 4 },
  unionpay: { id: 'unionpay', label: 'UnionPay',     length: 16, groups: [4, 4, 4, 4], cvvLength: 3 },
  unknown:  { id: 'unknown',  label: '',             length: 16, groups: [4, 4, 4, 4], cvvLength: 3 },
};

export function detectBrand(numberDigits: string): CardBrand {
  if (!numberDigits) return 'unknown';
  if (/^4/.test(numberDigits)) return 'visa';
  if (/^5[1-5]/.test(numberDigits) || /^2(2[2-9]|[3-6]\d|7[01]|720)/.test(numberDigits)) return 'mc';
  if (/^3[47]/.test(numberDigits)) return 'amex';
  if (/^62/.test(numberDigits)) return 'unionpay';
  return 'unknown';
}

// ─── Format / validation helpers ──────────────────────────────────────────

/** Strip non-digits. */
export function digitsOnly(input: string): string {
  return input.replace(/\D+/g, '');
}

/** Format card number digits with brand-aware spacing.
 *  e.g. visa  4242424242424242 → "4242 4242 4242 4242"
 *       amex  378282246310005  → "3782 822463 10005"  */
export function formatCardNumber(digits: string, brand: CardBrand): string {
  const groups = BRAND_SPECS[brand].groups;
  const out: string[] = [];
  let cursor = 0;
  for (const g of groups) {
    if (cursor >= digits.length) break;
    out.push(digits.slice(cursor, cursor + g));
    cursor += g;
  }
  return out.join(' ');
}

/** Format MM/YY input — auto-insert "/" after 2 digits. */
export function formatExpiry(digits: string): string {
  const d = digits.slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)} / ${d.slice(2)}`;
}

/** Luhn checksum (modulo 10). Returns true iff valid. */
export function luhnCheck(digits: string): boolean {
  if (!digits || !/^\d+$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Validate MM/YY string (not in the past, valid month). */
export function validateExpiry(mmYY: string): { ok: boolean; reason?: string } {
  const m = mmYY.match(/^(\d{2})\s*\/?\s*(\d{2})$/);
  if (!m) return { ok: false, reason: '到期日格式應為 MM/YY' };
  const mm = parseInt(m[1]!, 10);
  const yy = parseInt(m[2]!, 10);
  if (mm < 1 || mm > 12) return { ok: false, reason: '月份必須 01-12' };
  const now = new Date();
  const expDate = new Date(2000 + yy, mm, 0);    // last day of expiry month
  if (expDate < now) return { ok: false, reason: '卡已到期' };
  return { ok: true };
}

/** Validate cardholder name. */
export function validateCardholderName(name: string): { ok: boolean; reason?: string } {
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, reason: '請輸入持卡人姓名' };
  if (!/^[A-Za-z\s一-鿿.\-']+$/.test(trimmed)) return { ok: false, reason: '姓名格式無效' };
  return { ok: true };
}

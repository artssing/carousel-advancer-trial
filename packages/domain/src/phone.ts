/**
 * HK mobile phone validation + normalisation — SSOT for both frontend and backend.
 *
 * Founder ruling 2026-06-19: HK-only MVP. International numbers = backlog.
 * E.164 format: "+852XXXXXXXX" (8 digits, leading 5/6/8/9 for HK mobile range).
 *
 * Lesson #8 — single source of truth in packages/utils so regex + helpers
 * don't drift between API validation and frontend client-side check.
 */

/** Strict HK mobile E.164 regex. Matches "+85291234567". */
export const HK_PHONE_E164_REGEX = /^\+852[5-9]\d{7}$/;

/** Loose pattern used by login identifier heuristic ("9123 4567", "85291234567" etc.). */
export const HK_PHONE_LOOSE_REGEX = /^(\+?852)?[\s-]?[5-9]\d{3}[\s-]?\d{4}$/;

/**
 * Normalise a user-typed HK phone into strict E.164 "+852XXXXXXXX".
 * Returns null if input cannot be normalised into valid HK mobile.
 *
 * Examples:
 *   "9123 4567"     → "+85291234567"
 *   "+852 9123 4567" → "+85291234567"
 *   "85291234567"   → "+85291234567"
 *   "21234567"      → null  (HK landline, not mobile)
 *   "+1234567890"   → null  (non-HK)
 */
export function normalizeHKPhone(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, '');
  let digits: string;
  if (cleaned.startsWith('+852')) digits = cleaned.slice(4);
  else if (cleaned.startsWith('852') && cleaned.length === 11) digits = cleaned.slice(3);
  else if (cleaned.startsWith('+')) return null; // non-HK country code
  else digits = cleaned;
  if (!/^[5-9]\d{7}$/.test(digits)) return null;
  return `+852${digits}`;
}

/**
 * Format E.164 phone for display: "+85291234567" → "+852 9123 4567".
 */
export function formatHKPhoneDisplay(e164: string): string {
  const m = e164.match(/^\+852(\d{4})(\d{4})$/);
  if (!m) return e164;
  return `+852 ${m[1]} ${m[2]}`;
}

/**
 * Heuristic to determine if a login identifier is a phone or email.
 * Used by smart identifier field (Founder ruling 2026-06-19 Q1=A).
 *
 *  - Contains "@" → email
 *  - Starts with "+" or "852" or pure digits + spaces/dashes → phone
 *  - Otherwise → email (fallback, server will reject if invalid)
 */
export function isPhoneIdentifier(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.includes('@')) return false;
  if (trimmed.startsWith('+')) return true;
  // pure digits / digits with separators
  return /^[\d\s+\-]+$/.test(trimmed);
}

import { t, type TLocale } from './locales';
import { isMeetupOrder, type TabRole } from '@certifine/domain';

/**
 * Order-status DISPLAY copy.
 *
 * The rules — `needsMyAction`, `orderGroup`, `TERMINAL_STATUSES` — live in
 * `@certifine/domain`, because the API decides the same things (the top-nav
 * badge is a server count) and two copies of that logic is how the badge and
 * the list ended up disagreeing on 2026-08-14.
 *
 * The labels were hardcoded Chinese with no `t()` call at all, so the English
 * portal printed 「已付款 · 待面交鑑定」 on an order (QA IN-03). The odd part is
 * that `locales/ssot.json` already carried a complete `utils.orderStatus`
 * namespace — all 31 statuses, meetup overrides and seller CTAs, translated
 * and reviewed — that nothing ever called (QA IN-09). This file now calls it.
 * The two findings were one wire, never connected.
 *
 * `locale` is optional on every function: callers that do not pass it keep
 * getting Chinese, so pages migrate one at a time instead of all breaking at
 * once. That is the same convention `conditionLabel` uses.
 */

/** Statuses in the order they appear in the flow — used for fallbacks only. */
const STATUS_KEYS = [
  'AWAITING_PAYMENT', 'PAID', 'SHIPPED_TO_AUTHENTICATOR',
  'AUTH_RECEIVED_PENDING_SELLER_ACK', 'AUTHENTICATING', 'AUTH_PASSED', 'AUTH_FAILED',
  'SHIPPED_TO_BUYER', 'DELIVERED_PENDING_AUTH_ACK', 'DELIVERED', 'COMPLETED',
  'HANDOVER_TO_AUTH', 'SELLER_ACK_PENDING', 'CUSTODY', 'AWAITING_BUYER_PICKUP',
  'DISPUTED', 'REFUNDED', 'PAYMENT_EXPIRED',
] as const;

/**
 * Label for a status, ignoring delivery method.
 *
 * Kept as a function rather than the old `STATUS_LABEL_BASE` record: a record
 * has to be built at import time, which means picking a locale before the
 * caller knows theirs. Every previous caller read it as `X[status] ?? status`,
 * and that is exactly what this does.
 */
export function statusLabel(status: string, locale?: TLocale): string {
  if (!(STATUS_KEYS as readonly string[]).includes(status)) return status;
  return t(`utils.orderStatus.${status}`, undefined, locale);
}

/** Meetup-aware label — overrides statuses that don't make sense for meetup. */
export function getStatusLabel(
  status: string,
  deliveryMethod?: string | null,
  locale?: TLocale,
): string {
  if (!isMeetupOrder({ deliveryMethod })) return statusLabel(status, locale);
  if (status === 'AWAITING_PAYMENT') {
    return deliveryMethod === 'MEETUP_DIRECT'
      ? t('utils.orderStatus.meetup.AWAITING_PAYMENT_DIRECT', undefined, locale)
      : statusLabel(status, locale);
  }
  if (status === 'PAID') {
    return deliveryMethod === 'MEETUP_DIRECT'
      ? t('utils.orderStatus.meetup.PAID_DIRECT', undefined, locale)
      : t('utils.orderStatus.meetup.PAID_AUTH', undefined, locale);
  }
  if (status === 'AUTH_PASSED') return t('utils.orderStatus.meetup.AUTH_PASSED', undefined, locale);
  return statusLabel(status, locale);
}

/**
 * Short CTA heading + button label for a seller's pending action.
 * Returns null when this order doesn't need one.
 */
export function sellerActionCta(
  o: any,
  locale?: TLocale,
): { heading: string; buttonLabel: string } | null {
  const meetup = isMeetupOrder(o);
  const cta = (key: string) => ({
    heading: t(`utils.orderStatus.sellerAction.${key}.heading`, undefined, locale),
    buttonLabel: t(`utils.orderStatus.sellerAction.${key}.button`, undefined, locale),
  });

  if (o.status === 'SELLER_ACK_PENDING') return cta('SELLER_ACK_PENDING');
  if (o.status === 'AUTH_RECEIVED_PENDING_SELLER_ACK') return cta('AUTH_RECEIVED_PENDING_SELLER_ACK');
  if (!meetup && o.status === 'PAID') return cta('PAID');
  // Meetup drop-off: nothing moves until the seller carries the item in.
  if ((o.deliveryMethod === 'MEETUP_AUTH' || o.deliveryMethod === 'MEETUP_3WAY')
    && o.status === 'PAID') return cta('MEETUP_DROPOFF');
  if (!meetup && o.status === 'AUTH_PASSED') return cta('AUTH_PASSED');
  if (o.status === 'REFUNDED' && o.returnPhotosUploadedAt && !o.returnSellerAckAt) {
    return cta('REFUNDED_RETURN');
  }
  return null;
}

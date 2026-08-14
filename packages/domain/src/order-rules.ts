/**
 * Order-status SSOT — labels + role-aware "needs my action" logic.
 *
 * Every page that needs to ask "does this user need to act on this order?"
 * MUST import from here (lesson #8 catalog SSOT). Pages previously bloated
 * with copy-pasted logic include /orders and now /listing/[id] (seller action
 * surfacing). Future admin / authenticator dashboards should also use these.
 */

export type TabRole = 'buyer' | 'seller' | 'auth';

const MEETUP_DELIVERIES = ['MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT'];

export function isMeetupOrder(o: { deliveryMethod?: string | null }): boolean {
  return MEETUP_DELIVERIES.includes(o.deliveryMethod ?? '');
}

/**
 * Status labels. Written Chinese, not speech (founder 2026-08-14) — these are
 * transaction records, and 「等賣家確認」 reads like a spoken aside where
 * 「待賣家確認」 reads like a record of state. Every label answers the same
 * question in the same shape: what has happened · who is next.
 */
/** Nothing further will happen to the order without human intervention.
 *  PAYMENT_EXPIRED belongs here: the order is dead, not in progress — leaving
 *  it out sorted cancelled orders in among live ones. */
export const TERMINAL_STATUSES = ['COMPLETED', 'REFUNDED', 'PAYMENT_EXPIRED'];

/**
 * Which section of the orders page an order belongs to.
 *
 * Founder 2026-08-14: the page used to be split by ROLE (買入 / 賣出), which
 * made the user answer "am I the buyer or the seller here?" before they could
 * find out the only thing they actually wanted to know — whether anything is
 * waiting on them. Role is metadata on the row now; this is the axis.
 *
 * `disputed` is deliberately its own group rather than a flavour of `active`:
 * money is held, no party can move the order forward on their own, and the
 * resolution is off-platform. It is not "in progress" in any sense the user
 * would recognise.
 */
export type OrderGroup = 'action' | 'disputed' | 'active' | 'done';

export function orderGroup(o: any, userId: string, role: TabRole): OrderGroup {
  if (o.status === 'DISPUTED') return 'disputed';
  if (needsMyAction(o, userId, role)) return 'action';
  if (TERMINAL_STATUSES.includes(o.status)) return 'done';
  return 'active';
}

/**
 * Does this order need an action from this user in the given role?
 *
 * The test is "would this order stall if this person did nothing?" — not "is
 * there a button on the card". Physically turning up somewhere counts; waiting
 * for a courier does not (founder 2026-08-14).
 */
export function needsMyAction(
  o: any,
  userId: string,
  role: TabRole,
): boolean {
  const meetup = isMeetupOrder(o);

  if (role === 'buyer') {
    if (o.status === 'AWAITING_PAYMENT' && o.buyerId === userId) return true;
    // NOT SHIPPED_TO_BUYER: Ack v2 auto-completes at T+3 with no confirmation
    // from the buyer, so the only thing they can do is raise a dispute — an
    // option, not a task. It belongs in 進行中 with the countdown showing.
    if (!meetup && o.status === 'DELIVERED' && o.buyerId === userId) return true;
    if (o.status === 'AWAITING_BUYER_PICKUP' && o.buyerId === userId) return true;
    if (o.deliveryMethod === 'MEETUP_3WAY' && o.status === 'AUTH_PASSED' && o.buyerId === userId) return true;
    if (o.deliveryMethod === 'MEETUP_DIRECT' && o.status === 'PAID' && o.buyerId === userId) return true;
    // Three-way meetup: buyer, seller and authenticator are all at the shop at
    // the same time, so the buyer has an appointment to keep.
    if (o.deliveryMethod === 'MEETUP_3WAY' && o.status === 'PAID' && o.buyerId === userId) return true;
    return false;
  }
  if (role === 'seller') {
    if (!meetup && o.status === 'PAID' && o.sellerId === userId) return true;
    if (!meetup && o.status === 'AUTH_PASSED' && o.sellerId === userId) return true;
    // Meetup drop-off. The item does not move until the seller carries it to
    // the authenticator and presents the drop-off QR — the card already renders
    // that QR here, so treating it as "in progress" was the page contradicting
    // itself.
    if ((o.deliveryMethod === 'MEETUP_AUTH' || o.deliveryMethod === 'MEETUP_3WAY')
      && o.status === 'PAID' && o.sellerId === userId) return true;
    if (o.status === 'AUTH_RECEIVED_PENDING_SELLER_ACK' && o.sellerId === userId) return true;
    if (o.status === 'SELLER_ACK_PENDING' && o.sellerId === userId) return true;
    if (o.status === 'REFUNDED' && o.returnPhotosUploadedAt && !o.returnSellerAckAt && o.sellerId === userId) return true;
    return false;
  }
  if (role === 'auth') {
    if (o.status === 'SHIPPED_TO_AUTHENTICATOR') return true;
    if (meetup && o.status === 'PAID' && o.authenticatorId) return true;
    if (o.status === 'AUTHENTICATING') return true;
    if (o.status === 'HANDOVER_TO_AUTH') return true;
    if (o.status === 'CUSTODY') return true;
    if (o.status === 'DELIVERED_PENDING_AUTH_ACK') return true;
    return false;
  }
  return false;
}


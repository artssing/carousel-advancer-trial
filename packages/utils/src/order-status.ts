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
export const STATUS_LABEL_BASE: Record<string, string> = {
  AWAITING_PAYMENT:                 '待付款',
  PAID:                             '已付款 · 待賣家寄出',
  SHIPPED_TO_AUTHENTICATOR:         '已寄出至鑑定師 · 待鑑定師簽收',
  AUTH_RECEIVED_PENDING_SELLER_ACK: '鑑定師已簽收 · 待賣家確認',
  AUTHENTICATING:                   '鑑定進行中 · 待鑑定師出具結果',
  AUTH_PASSED:                      '鑑定通過 · 待賣家寄出至買家',
  AUTH_FAILED:                      '鑑定未通過 · 安排退回賣家',
  SHIPPED_TO_BUYER:                 '已寄出至買家 · 待買家簽收',
  DELIVERED_PENDING_AUTH_ACK:       '已送達 · 待鑑定師確認開箱紀錄',
  DELIVERED:                        '已送達 · 待買家確認完成',
  COMPLETED:                        '已完成',
  HANDOVER_TO_AUTH:                 '鑑定師接收中 · 拍攝存證',
  SELLER_ACK_PENDING:               '待賣家確認交付',
  CUSTODY:                          '鑑定師保管中',
  AWAITING_BUYER_PICKUP:            '待買家到鑑定師門店取貨',
  DISPUTED:                         '爭議處理中 · 平台客服跟進',
  REFUNDED:                         '已退款',
  // Was missing, so the raw enum `PAYMENT_EXPIRED` printed on screen in
  // English — the one thing the fallback `?? status` is not meant to be for.
  PAYMENT_EXPIRED:                  '逾期未付款 · 訂單已取消',
};

/** Meetup-aware label — overrides statuses that don't make sense for meetup. */
export function getStatusLabel(status: string, deliveryMethod?: string | null): string {
  const meetup = MEETUP_DELIVERIES.includes(deliveryMethod ?? '');
  if (!meetup) return STATUS_LABEL_BASE[status] ?? status;
  if (status === 'AWAITING_PAYMENT') {
    return deliveryMethod === 'MEETUP_DIRECT' ? '待雙方確認' : '待付款';
  }
  if (status === 'PAID') {
    if (deliveryMethod === 'MEETUP_DIRECT') return '已確認 · 待面交';
    return '已付款 · 待面交鑑定';
  }
  if (status === 'AUTH_PASSED') return '鑑定通過 · 待確認完成';
  return STATUS_LABEL_BASE[status] ?? status;
}

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

/** Short, human-friendly CTA heading + button label for a seller's pending action.
 *  Returns null when this order doesn't need a seller action.  */
export function sellerActionCta(o: any): { heading: string; buttonLabel: string } | null {
  const meetup = isMeetupOrder(o);
  if (o.status === 'SELLER_ACK_PENDING') {
    return {
      heading: '鑑定師已影相，請確認商品交付',
      buttonLabel: '睇相片並確認交付 →',
    };
  }
  if (o.status === 'AUTH_RECEIVED_PENDING_SELLER_ACK') {
    return {
      heading: '鑑定師已收件，請確認商品狀況',
      buttonLabel: '睇收件相並確認 →',
    };
  }
  if (!meetup && o.status === 'PAID') {
    return {
      heading: '買家已付款，請安排寄出',
      buttonLabel: '確認已寄出 →',
    };
  }
  if ((o.deliveryMethod === 'MEETUP_AUTH' || o.deliveryMethod === 'MEETUP_3WAY')
    && o.status === 'PAID') {
    return {
      heading: '買家已付款，請將商品送交鑑定師',
      buttonLabel: '查看交收二維碼 →',
    };
  }
  if (!meetup && o.status === 'AUTH_PASSED') {
    return {
      heading: '鑑定通過，請寄出至買家',
      buttonLabel: '確認已寄出至買家 →',
    };
  }
  if (o.status === 'REFUNDED' && o.returnPhotosUploadedAt && !o.returnSellerAckAt) {
    return {
      heading: '鑑定師已拍退貨相，請確認取回',
      buttonLabel: '確認取回貨品 →',
    };
  }
  return null;
}

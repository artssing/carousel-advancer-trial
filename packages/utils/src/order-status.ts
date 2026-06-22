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

export const STATUS_LABEL_BASE: Record<string, string> = {
  AWAITING_PAYMENT:                 '等待付款',
  PAID:                             '已付款 · 等待賣家寄出',
  SHIPPED_TO_AUTHENTICATOR:         '已寄出至鑑定師',
  AUTH_RECEIVED_PENDING_SELLER_ACK: '鑑定師已收件 · 等賣家確認',
  AUTHENTICATING:                   '鑑定中',
  AUTH_PASSED:                      '鑑定通過 · 等待寄出至買家',
  AUTH_FAILED:                      '鑑定不通過 · 退回賣家',
  SHIPPED_TO_BUYER:                 '已寄出 · 等待買家確認',
  DELIVERED_PENDING_AUTH_ACK:       '已送達 · 等鑑定師確認 unboxing',
  DELIVERED:                        '已送達 · 等待確認完成',
  COMPLETED:                        '已完成',
  HANDOVER_TO_AUTH:                 '鑑定師接收中（影相）',
  SELLER_ACK_PENDING:               '等賣家確認交付',
  CUSTODY:                          '鑑定師持貨中',
  AWAITING_BUYER_PICKUP:            '請到鑑定師店取貨',
  DISPUTED:                         '爭議中',
  REFUNDED:                         '已退款',
};

/** Meetup-aware label — overrides statuses that don't make sense for meetup. */
export function getStatusLabel(status: string, deliveryMethod?: string | null): string {
  const meetup = MEETUP_DELIVERIES.includes(deliveryMethod ?? '');
  if (!meetup) return STATUS_LABEL_BASE[status] ?? status;
  if (status === 'AWAITING_PAYMENT') {
    return deliveryMethod === 'MEETUP_DIRECT' ? '等待確認' : '等待付款';
  }
  if (status === 'PAID') {
    if (deliveryMethod === 'MEETUP_DIRECT') return '已確認 · 等待面交';
    return '已付款 · 等待面交鑑定';
  }
  if (status === 'AUTH_PASSED') return '鑑定通過 · 等待確認完成';
  return STATUS_LABEL_BASE[status] ?? status;
}

export const TERMINAL_STATUSES = ['COMPLETED', 'REFUNDED'];

/** Does this order need an action from this user in the given role? */
export function needsMyAction(
  o: any,
  userId: string,
  role: TabRole,
): boolean {
  const meetup = isMeetupOrder(o);

  if (role === 'buyer') {
    if (o.status === 'AWAITING_PAYMENT' && o.buyerId === userId) return true;
    if (!meetup && o.status === 'SHIPPED_TO_BUYER' && o.buyerId === userId) return true;
    if (!meetup && o.status === 'DELIVERED' && o.buyerId === userId) return true;
    if (o.status === 'AWAITING_BUYER_PICKUP' && o.buyerId === userId) return true;
    if (o.deliveryMethod === 'MEETUP_3WAY' && o.status === 'AUTH_PASSED' && o.buyerId === userId) return true;
    if (o.deliveryMethod === 'MEETUP_DIRECT' && o.status === 'PAID' && o.buyerId === userId) return true;
    return false;
  }
  if (role === 'seller') {
    if (!meetup && o.status === 'PAID' && o.sellerId === userId) return true;
    if (!meetup && o.status === 'AUTH_PASSED' && o.sellerId === userId) return true;
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

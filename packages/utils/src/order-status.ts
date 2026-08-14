import { isMeetupOrder, type TabRole } from '@certifine/domain';

/**
 * Order-status DISPLAY copy.
 *
 * The rules — `needsMyAction`, `orderGroup`, `TERMINAL_STATUSES` — moved to
 * `@certifine/domain`, because the API decides the same things (the top-nav
 * badge is a server count) and two copies of that logic is how the badge and
 * the list ended up disagreeing on 2026-08-14.
 *
 * What stayed is the Chinese. Deliberate: these labels were edited three times
 * in one afternoon, and under the repo split every edit to a file inside
 * domain costs a version bump on both sides. Copy churn must not drag the
 * rules along with it.
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
  const meetup = isMeetupOrder({ deliveryMethod });
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

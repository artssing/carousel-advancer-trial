/**
 * Payment orchestration — sits between consumer UI and the Stripe adapter.
 *
 * Flow (ONLINE_ESCROW):
 *   1. Buyer hits /checkout → createIntent() returns clientSecret
 *   2. Buyer card auth via stripe.js → webhook OR confirmFromMock() updates state
 *   3. Order.escrowHeld true; status → PAID
 *   4. Capture trigger fires at AUTH_PASSED / DELIVERED (see orders.service)
 *   5. cancelHold() if buyer/admin cancels before capture
 *   6. refund() for post-capture refund (Phase 2)
 *
 * Lesson #12: every state change broadcasts a SYSTEM message into the order's
 * THREE_WAY conversation (via OrdersService.systemMessage).
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tierForPrice } from '@authentik/utils';
import { stripeAdapter } from './stripe-adapter';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Decide capture mode based on order tier. Tier 1 = instant, else hold. */
  private captureModeForOrder(salePriceHKD: number): 'automatic' | 'manual' {
    return tierForPrice(salePriceHKD) === 1 ? 'automatic' : 'manual';
  }

  /** Create a Payment row + Stripe intent. Called when buyer hits /checkout.
   *  Returns clientSecret for stripe.js to confirm on the buyer's device. */
  async createIntent(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== 'AWAITING_PAYMENT') {
      throw new BadRequestException(`Order status is ${order.status}, not AWAITING_PAYMENT`);
    }
    if (order.paymentMethod !== 'ONLINE_ESCROW') {
      throw new BadRequestException('This order is offline cash, no online payment needed');
    }

    // Reuse existing PENDING_AUTH payment if any (idempotent — buyer refresh)
    if (order.activePaymentId) {
      const existing = await this.prisma.payment.findUnique({ where: { id: order.activePaymentId } });
      if (existing && existing.status === 'PENDING_AUTH') {
        const intent = await stripeAdapter.createIntent({
          amountHKD: existing.amountHKD,
          captureMethod: existing.captureMode as 'automatic' | 'manual',
          metadata: { orderId, userId },
        });
        await this.prisma.payment.update({
          where: { id: existing.id },
          data: { gatewayRef: intent.id },
        });
        return { clientSecret: intent.clientSecret, paymentId: existing.id, amountHKD: existing.amountHKD, mode: stripeAdapter.mode };
      }
    }

    // Buyer pays total = sale + auth fee + platform fee. (sellerNet already excludes.)
    const amountHKD = order.salePriceHKD + order.authFeeHKD + order.platformFeeHKD;
    const captureMode = this.captureModeForOrder(order.salePriceHKD);

    const intent = await stripeAdapter.createIntent({
      amountHKD,
      captureMethod: captureMode,
      metadata: { orderId, userId },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        amountHKD,
        currency: 'HKD',
        status: 'PENDING_AUTH',
        captureMode,
        gatewayRef: intent.id,
        // Mock: 7-day hold expiry (matches Stripe's real-mode limit)
        holdExpiresAt: captureMode === 'manual' ? new Date(Date.now() + 7 * 24 * 3600 * 1000) : null,
      },
    });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { activePaymentId: payment.id },
    });

    return {
      clientSecret: intent.clientSecret,
      paymentId: payment.id,
      amountHKD,
      mode: stripeAdapter.mode,
    };
  }

  /** Mock-mode helper: buyer "confirms" the intent (simulating stripe.js
   *  client-side confirm + webhook callback in one step). Real Stripe wouldn't
   *  expose this — the webhook would fire after stripe.js confirmPayment().
   *  `method` lets the wallet flows (Alipay HK / WeChat HK / FPS / Apple Pay)
   *  share the same endpoint as cards — backend just logs which channel and
   *  returns method-specific copy on failure. */
  async confirmFromMock(
    paymentId: string,
    userId: string,
    testCard?: string,
    method?: 'CARD' | 'ALIPAY_HK' | 'WECHAT_HK' | 'FPS' | 'APPLE_PAY',
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.order.buyerId !== userId) throw new ForbiddenException('Not your payment');
    if (!payment.gatewayRef) throw new BadRequestException('Payment has no gateway ref');

    // Log method on Payment row (audit / analytics for which channel buyer used)
    if (method && payment.method !== method) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { method },
      });
    }

    const intent = await stripeAdapter.confirmIntent({
      intentId: payment.gatewayRef,
      testCard,
    });

    // Map intent.status → PaymentStatus + Order side-effects
    if (intent.status === 'requires_payment_method') {
      // Card declined; payment row keeps PENDING_AUTH so buyer can retry
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          failureCode: intent.failureCode ?? 'unknown',
          failureMessage: intent.failureMessage ?? '付款失敗，請重試',
        },
      });
      return { ok: false, code: intent.failureCode, message: intent.failureMessage };
    }

    if (intent.status === 'succeeded' || intent.status === 'requires_capture') {
      const authorized = intent.status === 'requires_capture';
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: authorized ? 'AUTHORIZED' : 'CAPTURED',
            authorizedAt: new Date(),
            ...(authorized ? {} : { capturedAt: new Date() }),
          },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            escrowHeld: true,
          },
        });
      });
      return { ok: true, status: authorized ? 'AUTHORIZED' : 'CAPTURED' };
    }

    return { ok: false, code: 'unknown_state', message: `Unexpected intent status: ${intent.status}` };
  }

  /** Capture an authorized hold. Called by orders.service at the configured
   *  trigger point (AUTH_PASSED / DELIVERED). No-op for already-captured. */
  async captureForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: 'AUTHORIZED' } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const auth = order.payments[0];
    if (!auth || !auth.gatewayRef) return { skipped: true, reason: 'no AUTHORIZED payment' };

    const intent = await stripeAdapter.captureIntent(auth.gatewayRef);
    if (intent.status !== 'succeeded') {
      throw new BadRequestException(`Capture returned ${intent.status}`);
    }
    await this.prisma.payment.update({
      where: { id: auth.id },
      data: { status: 'CAPTURED', capturedAt: new Date() },
    });
    return { captured: true, paymentId: auth.id };
  }

  /** Cancel an active hold (buyer / admin). Releases escrow without charge. */
  async cancelHold(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: { in: ['AUTHORIZED', 'PENDING_AUTH'] } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Only buyer can cancel hold');

    for (const p of order.payments) {
      if (p.gatewayRef) {
        try { await stripeAdapter.cancelIntent(p.gatewayRef); } catch { /* ignore */ }
      }
      await this.prisma.payment.update({
        where: { id: p.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { escrowHeld: false },
    });
    return { cancelled: true, count: order.payments.length };
  }

  /** Fetch payment summary for buyer UI (status / failure msg). */
  async getStatus(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const isParty = order.buyerId === userId || order.sellerId === userId;
    if (!isParty) throw new ForbiddenException('Not your order');
    const p = order.payments[0] ?? null;
    return {
      orderId,
      orderStatus: order.status,
      escrowHeld: order.escrowHeld,
      payment: p ? {
        id: p.id,
        status: p.status,
        amountHKD: p.amountHKD,
        captureMode: p.captureMode,
        holdExpiresAt: p.holdExpiresAt,
        failureCode: p.failureCode,
        failureMessage: p.failureMessage,
      } : null,
      stripeMode: stripeAdapter.mode,
    };
  }
}

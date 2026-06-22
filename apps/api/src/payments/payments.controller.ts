import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';
import { stripeAdapter } from './stripe-adapter';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Step 1: buyer hits /checkout → server creates Stripe PaymentIntent + Payment row. */
  @Post(':orderId/create-intent')
  createIntent(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
  ) {
    return this.payments.createIntent(orderId, user.userId);
  }

  /** Step 2 (mock-mode only): buyer "confirms" with a test card. In real Stripe
   *  mode, the webhook handles this — the client calls stripe.js confirmPayment(). */
  @Post(':orderId/confirm-mock')
  async confirmMock(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
    @Body() body: {
      paymentId: string;
      testCard?: string;
      method?: 'CARD' | 'ALIPAY_HK' | 'WECHAT_HK' | 'FPS' | 'APPLE_PAY';
    },
  ) {
    if (stripeAdapter.mode !== 'mock') {
      throw new BadRequestException('confirm-mock only available in STRIPE_MODE=mock');
    }
    if (!body?.paymentId) throw new BadRequestException('paymentId required');
    return this.payments.confirmFromMock(body.paymentId, user.userId, body.testCard, body.method);
  }

  /** Cancel an active hold (buyer-initiated). */
  @Post(':orderId/cancel-hold')
  cancelHold(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
  ) {
    return this.payments.cancelHold(orderId, user.userId);
  }

  /** Status polling endpoint for the checkout page. */
  @Get(':orderId/status')
  status(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
  ) {
    return this.payments.getStatus(orderId, user.userId);
  }

  // Legacy mock confirm — keep for backward compat with existing UI button.
  // /orders/:id/pay still hits orders.markPaid directly; flagging removal.
  // @Post(':orderId/confirm') removed — handled now by create-intent + confirm-mock
}

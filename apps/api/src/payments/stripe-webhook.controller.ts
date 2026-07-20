import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { stripeAdapter } from './stripe-adapter';

/**
 * Stripe webhook receiver — NO JwtAuthGuard on purpose: the caller is the
 * gateway (Stripe / apps/mock-stripe), not a user. Authenticity comes from the
 * `stripe-signature` HMAC, verified against STRIPE_WEBHOOK_SECRET via
 * stripe.webhooks.constructEvent. main.ts mounts express.raw() on this route
 * BEFORE the json parser so the exact bytes are available for verification.
 */
@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('stripe')
  async handle(@Req() req: Request, @Headers('stripe-signature') sig?: string) {
    const raw: Buffer | undefined = Buffer.isBuffer(req.body) ? req.body : undefined;
    if (!raw) throw new BadRequestException('Expected raw body');
    let event: { type: string; data: { object: any } };
    try {
      event = stripeAdapter.constructWebhookEvent(raw, sig);
    } catch (e: any) {
      throw new BadRequestException(`Webhook signature verification failed: ${e?.message}`);
    }
    const result = await this.payments.handleGatewayEvent(event);
    return { received: true, ...result };
  }
}

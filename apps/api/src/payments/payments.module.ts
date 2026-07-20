import { forwardRef, Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { OrdersModule } from '../orders/orders.module';

/** Phase 1 ONLINE_ESCROW orchestration. forwardRef breaks circular dep with
 *  OrdersModule — orders.service calls payments.captureForOrder() at
 *  AUTH_PASSED / DELIVERED triggers. */
@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}

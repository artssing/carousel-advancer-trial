import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { OrdersService } from '../orders/orders.service';

// Stage 1 mock payment endpoint.
// In Stage 1.5 this becomes a Stripe PaymentIntent creation + webhook handler.
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':orderId/confirm')
  confirm(@CurrentUser() user: CurrentUserData, @Param('orderId') orderId: string) {
    return this.orders.markPaid(orderId, user.userId);
  }
}

import { forwardRef, Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersCron } from './orders.cron';
import { MessagesModule } from '../messages/messages.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [MessagesModule, forwardRef(() => PaymentsModule)],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService, OrdersCron],
  exports: [OrdersService],
})
export class OrdersModule {}

import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({ imports: [OrdersModule], controllers: [PaymentsController] })
export class PaymentsModule {}

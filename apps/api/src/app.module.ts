import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ListingsModule } from './listings/listings.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { AuthenticatorsModule } from './authenticators/authenticators.module';
import { MessagesModule } from './messages/messages.module';
import { OffersModule } from './offers/offers.module';
import { AdminModule } from './admin/admin.module';
import { WalletModule } from './wallet/wallet.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    OrdersModule,
    PaymentsModule,
    AuthenticatorsModule,
    MessagesModule,
    OffersModule,
    AdminModule,
    WalletModule,
    StorageModule,
  ],
})
export class AppModule {}

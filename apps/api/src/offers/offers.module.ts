import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OffersCron } from './offers.cron';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule],
  controllers: [OffersController],
  providers: [OffersService, OffersCron],
  exports: [OffersService],
})
export class OffersModule {}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { OffersService } from './offers.service';
import { CounterOfferDto, CreateOfferDto } from './dto';

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateOfferDto) {
    return this.offers.createOffer(user.userId, dto.conversationId, dto.priceHKD);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.offers.getOffer(user.userId, id);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.offers.acceptOffer(user.userId, id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.offers.rejectOffer(user.userId, id);
  }

  @Post(':id/counter')
  counter(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: CounterOfferDto,
  ) {
    return this.offers.counterOffer(user.userId, id, dto.priceHKD);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.offers.withdrawOffer(user.userId, id);
  }

  @Get('conversation/:conversationId')
  listForConversation(
    @CurrentUser() user: CurrentUserData,
    @Param('conversationId') conversationId: string,
  ) {
    return this.offers.listForConversation(user.userId, conversationId);
  }
}

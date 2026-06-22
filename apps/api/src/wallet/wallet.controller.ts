import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { WalletService } from './wallet.service';
import type { PayoutMethodTypeKey } from '@authentik/utils';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('balance')
  balance(@CurrentUser() user: CurrentUserData) {
    return this.wallet.getBalance(user.userId);
  }

  // ── Payout methods ──
  @Get('methods')
  listMethods(@CurrentUser() user: CurrentUserData) {
    return this.wallet.listMethods(user.userId);
  }

  @Post('methods')
  createMethod(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: {
      type: PayoutMethodTypeKey;
      accountIdentifier: string;
      bankCode?: string;
      accountName: string;
      isDefault?: boolean;
    },
  ) {
    return this.wallet.createMethod(user.userId, dto);
  }

  @Patch('methods/:id/default')
  setDefault(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.wallet.setDefaultMethod(user.userId, id);
  }

  @Delete('methods/:id')
  deleteMethod(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.wallet.deleteMethod(user.userId, id);
  }

  // ── Payout requests ──
  @Get('requests')
  listRequests(@CurrentUser() user: CurrentUserData) {
    return this.wallet.listRequests(user.userId);
  }

  @Get('requests/:id')
  getRequest(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.wallet.getRequest(user.userId, id);
  }

  @Post('requests')
  createRequest(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: { payoutMethodId: string; amountHKD: number },
  ) {
    return this.wallet.createRequest(user.userId, dto);
  }
}

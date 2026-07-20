import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
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

  // 2FA（founder 2026-07-13）: adding a payout method is ATO step 1, so the
  // old direct `POST /wallet/methods` is replaced by initiate（send OTP）→
  // confirm（code）. See docs/proposals/payout-2fa-proposal.md.
  @Post('methods/initiate')
  initiateAddMethod(
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
    @Body() dto: {
      type: PayoutMethodTypeKey;
      accountIdentifier: string;
      bankCode?: string;
      accountName: string;
      isDefault?: boolean;
    },
  ) {
    return this.wallet.initiateAddMethod(user.userId, dto, req.ip);
  }

  @Post('methods/confirm')
  confirmAddMethod(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: { intentId: string; code: string },
  ) {
    return this.wallet.confirmAddMethod(user.userId, dto.intentId, dto.code);
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

  // 2FA（founder 2026-07-13）: withdrawals require step-up verification. The
  // old direct `POST /wallet/requests` is replaced by initiate → confirm.
  // Static routes MUST be declared before `requests/:id`.
  @Post('requests/initiate')
  initiatePayout(
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
    @Body() dto: { payoutMethodId: string; amountHKD: number },
  ) {
    return this.wallet.initiatePayout(user.userId, dto, req.ip);
  }

  @Post('requests/confirm')
  confirmPayout(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: { intentId: string; code: string },
  ) {
    return this.wallet.confirmPayout(user.userId, dto.intentId, dto.code);
  }

  @Get('requests/:id')
  getRequest(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.wallet.getRequest(user.userId, id);
  }
}

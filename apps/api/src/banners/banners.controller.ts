import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BannerAudience } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { BannersService } from './banners.service';

/** Coerce string query param to BannerAudience; unknown → ALL. */
function coerceAudience(v: string | undefined): BannerAudience {
  if (v === 'BUYERS' || v === 'SELLERS' || v === 'AUTHENTICATORS') return v;
  return 'ALL';
}

@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  /** Public — no JWT required. Consumer + authenticator poll this every 60s. */
  @Get()
  listPublic(@Query('audience') audience?: string) {
    return this.banners.listPublic(coerceAudience(audience));
  }
}

@Controller('admin/banners')
@UseGuards(JwtAuthGuard)
export class AdminBannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.banners.listAll(user.userId);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: any) {
    return this.banners.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: CurrentUserData, @Param('id') id: string, @Body() dto: any) {
    return this.banners.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.banners.remove(user.userId, id);
  }
}

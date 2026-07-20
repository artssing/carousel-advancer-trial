import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { Category, ConditionGrade } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { ListingsService } from './listings.service';
import { CreateListingDto, UpdateListingDto } from './dto';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  list(
    @Query('category') category?: Category,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sort') sort?: string,
    @Query('excludeId') excludeId?: string,
    @Query('brand') brand?: string,
    @Query('conditionMin') conditionMin?: string,
  ) {
    const take = Math.min(Math.max(parseInt(limit ?? '24', 10) || 24, 1), 100);
    const skip = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    const min = minPrice ? parseInt(minPrice, 10) : undefined;
    const max = maxPrice ? parseInt(maxPrice, 10) : undefined;
    const sortVal: 'newest' | 'priceAsc' | 'priceDesc' | 'relevance' =
      sort === 'priceAsc' || sort === 'priceDesc' || sort === 'relevance' ? sort : 'newest';
    const CONDS: readonly ConditionGrade[] = ['BRAND_NEW', 'NEARLY_NEW', 'GOOD', 'LIGHT_USE', 'FAIR'];
    const condMin = conditionMin && CONDS.includes(conditionMin as ConditionGrade)
      ? (conditionMin as ConditionGrade)
      : undefined;
    return this.listings.list(category, take, skip, q, {
      minPrice: Number.isFinite(min!) ? min : undefined,
      maxPrice: Number.isFinite(max!) ? max : undefined,
      sort: sortVal,
      excludeId,
      // Multi-select: `brand=chanel,gucci` (comma-separated) → OR match.
      brands: brand
        ? brand.split(',').map((b) => b.trim()).filter(Boolean)
        : undefined,
      conditionMin: condMin,
    });
  }

  // Must be before :id to avoid being swallowed
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: CurrentUserData) {
    return this.listings.listForSeller(user.userId);
  }

  /** Seller dashboard stats (counts + earnings) */
  @Get('mine/stats')
  @UseGuards(JwtAuthGuard)
  mineStats(@CurrentUser() user: CurrentUserData) {
    return this.listings.sellerStats(user.userId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  get(@Param('id') id: string, @CurrentUser() user?: CurrentUserData) {
    return this.listings.get(id, user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateListingDto) {
    return this.listings.create(user.userId, dto);
  }

  /** Soft delete own listing（founder 2026-07-10：customer 刪除永遠 soft）。 */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  softDelete(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.listings.softDelete(id, user.userId);
  }

  /** Restore own soft-deleted listing（admin 下架嘅唔還原到）。 */
  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard)
  restoreOwn(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.listings.restoreOwn(id, user.userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listings.update(id, user.userId, dto);
  }

  /**
   * Active pending offer count — seller calls this before submitting a price
   * change so the UI can show "您有 N 個未處理嘅議價，確定改價嗎？" dialog
   * (Founder ruling 2026-06-19 Q5).
   */
  @Get(':id/active-offer-count')
  @UseGuards(JwtAuthGuard)
  async activeOfferCount(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    const count = await this.listings.activeOfferCount(id, user.userId);
    return { count };
  }
}

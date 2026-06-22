import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatorStatus, Category, ListingStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAuthenticatorDto } from './dto';

// 買家揀鑑定師時見到嘅公開欄位
const PUBLIC_SELECT = {
  id: true,
  displayName: true,
  storeName: true,
  categories: true,
  starRating: true,
  completedCount: true,
  disputeRate: true,
  feeRatePct: true,
  feeMinHKD: true,
  bio: true,
  yearsExperience: true,
  locationAddress: true,
  district: true,
  businessHours: true,
  acceptsMeetup: true,
  eAndOInsuranceExpiresAt: true,
} as const;

@Controller('authenticators')
export class AuthenticatorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('category') category?: Category) {
    return this.prisma.authenticator.findMany({
      where: {
        status: AuthenticatorStatus.ACTIVE,
        ...(category ? { categories: { has: category } } : {}),
      },
      orderBy: [{ starRating: 'desc' }, { completedCount: 'desc' }],
      select: PUBLIC_SELECT,
    });
  }

  // 鑑定師更新自己收費 + 公開檔案（必須喺 :id route 之前定義，避免被當成 id）
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateAuthenticatorDto,
  ) {
    const auth = await this.prisma.authenticator.findUnique({
      where: { userId: user.userId },
    });
    if (!auth) throw new ForbiddenException('此帳號並非鑑定師');
    return this.prisma.authenticator.update({
      where: { id: auth.id },
      data: { ...dto },
      select: PUBLIC_SELECT,
    });
  }

  // ── Branch CRUD — auth portal scope (JWT, 鑑定師自己) ────────────────
  // Lesson #6: /me/branches scoped to current user's authenticator only;
  //            public /:id/branches returns only isActive.

  @Get('me/branches')
  @UseGuards(JwtAuthGuard)
  async listMyBranches(@CurrentUser() user: CurrentUserData) {
    const auth = await this.prisma.authenticator.findUnique({ where: { userId: user.userId } });
    if (!auth) throw new ForbiddenException('此帳號並非鑑定師');
    return this.prisma.branch.findMany({
      where: { authenticatorId: auth.id },
      orderBy: [{ isPrimary: 'desc' }, { isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  @Post('me/branches')
  @UseGuards(JwtAuthGuard)
  async createBranch(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: {
      name: string;
      fullAddress: string;
      districtKey: string;
      businessHours?: string;
      notes?: string;
      contactPhone?: string;
      contactWhatsapp?: string;
      isPrimary?: boolean;
    },
  ) {
    const auth = await this.prisma.authenticator.findUnique({ where: { userId: user.userId } });
    if (!auth) throw new ForbiddenException('此帳號並非鑑定師');
    if (!dto.name?.trim() || !dto.fullAddress?.trim() || !dto.districtKey?.trim()) {
      throw new BadRequestException('分店名 / 地址 / 區域必填');
    }
    // If marking primary, demote all other primaries first (one primary per auth)
    if (dto.isPrimary) {
      await this.prisma.branch.updateMany({
        where: { authenticatorId: auth.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.branch.create({
      data: {
        authenticatorId: auth.id,
        name: dto.name.trim(),
        fullAddress: dto.fullAddress.trim(),
        districtKey: dto.districtKey,
        businessHours: dto.businessHours?.trim() || null,
        notes: dto.notes?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        contactWhatsapp: dto.contactWhatsapp?.replace(/\D+/g, '') || null,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  @Patch('me/branches/:branchId')
  @UseGuards(JwtAuthGuard)
  async updateBranch(
    @CurrentUser() user: CurrentUserData,
    @Param('branchId') branchId: string,
    @Body() dto: {
      name?: string;
      fullAddress?: string;
      districtKey?: string;
      businessHours?: string;
      notes?: string;
      contactPhone?: string;
      contactWhatsapp?: string;
      isActive?: boolean;
      isPrimary?: boolean;
    },
  ) {
    const auth = await this.prisma.authenticator.findUnique({ where: { userId: user.userId } });
    if (!auth) throw new ForbiddenException('此帳號並非鑑定師');
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.authenticatorId !== auth.id) throw new NotFoundException('Branch not found');
    if (dto.isPrimary) {
      await this.prisma.branch.updateMany({
        where: { authenticatorId: auth.id, isPrimary: true, id: { not: branchId } },
        data: { isPrimary: false },
      });
    }
    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.fullAddress !== undefined ? { fullAddress: dto.fullAddress.trim() } : {}),
        ...(dto.districtKey !== undefined ? { districtKey: dto.districtKey } : {}),
        ...(dto.businessHours !== undefined ? { businessHours: dto.businessHours?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone?.trim() || null } : {}),
        ...(dto.contactWhatsapp !== undefined ? { contactWhatsapp: dto.contactWhatsapp?.replace(/\D+/g, '') || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
      },
    });
  }

  @Delete('me/branches/:branchId')
  @UseGuards(JwtAuthGuard)
  async deleteBranch(
    @CurrentUser() user: CurrentUserData,
    @Param('branchId') branchId: string,
  ) {
    const auth = await this.prisma.authenticator.findUnique({ where: { userId: user.userId } });
    if (!auth) throw new ForbiddenException('此帳號並非鑑定師');
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.authenticatorId !== auth.id) throw new NotFoundException('Branch not found');
    // Reject if any non-terminal order uses this branch (lesson #16 safety)
    const TERMINAL = ['COMPLETED', 'REFUNDED', 'DISPUTED'];
    const blocking = await this.prisma.order.count({
      where: { meetupBranchId: branchId, status: { notIn: TERMINAL as any } },
    });
    if (blocking > 0) {
      throw new BadRequestException(`有 ${blocking} 張進行中訂單使用呢間分店，請完成後再刪除（或暫時停用）`);
    }
    await this.prisma.branch.delete({ where: { id: branchId } });
    return { deleted: true };
  }

  // Public — buyer checkout fetches active branches for chosen authenticator
  @Get(':id/branches')
  async listBranches(@Param('id') id: string) {
    return this.prisma.branch.findMany({
      where: { authenticatorId: id, isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, name: true, fullAddress: true, districtKey: true,
        businessHours: true, notes: true, isPrimary: true,
        contactPhone: true, contactWhatsapp: true,
      },
    });
  }

  // 公開鑑定師檔案：基本資料 + 評價 + 佢賣緊嘅商品
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const authenticator = await this.prisma.authenticator.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!authenticator) throw new NotFoundException('Authenticator not found');

    const [reviews, fullRecord] = await Promise.all([
      this.prisma.authenticatorReview.findMany({
        where: { authenticatorId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, buyerName: true, rating: true, comment: true, createdAt: true },
      }),
      this.prisma.authenticator.findUnique({
        where: { id },
        select: { userId: true },
      }),
    ]);

    // 鑑定師本人作為賣家、現正放售嘅商品
    const activeListings = fullRecord
      ? await this.prisma.listing.findMany({
          where: { sellerId: fullRecord.userId, status: ListingStatus.ACTIVE },
          orderBy: { createdAt: 'desc' },
          take: 12,
          select: { id: true, title: true, priceHKD: true, images: true, category: true },
        })
      : [];

    const avgReviewRating =
      reviews.length > 0
        ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
        : null;

    return {
      ...authenticator,
      reviews,
      reviewCount: reviews.length,
      avgReviewRating,
      activeListings,
    };
  }
}

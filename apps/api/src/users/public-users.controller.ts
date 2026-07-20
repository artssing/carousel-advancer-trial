import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public-facing user info — exposed to logged-in users only (no scraping).
 *
 * Strictly factual data — no platform-issued trust badges. Maintains
 * L'Oréal v eBay neutral-intermediary stance: surface review numbers
 * derived from real interactions, never plat-issued "Trusted Seller".
 *
 * Never exposes:
 *  - email
 *  - real name (only displayName)
 *  - precise address
 *  - dispute rate (internal-only signal)
 */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class PublicUsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Lightweight public profile for IM mini-card + /seller/:id page header */
  @Get(':id/seller-profile')
  async sellerProfile(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        kycStatus: true,
        createdAt: true,
        authenticator: { select: { id: true, storeName: true, starRating: true, completedCount: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Aggregate stats
    const [activeListingsCount, soldAsSellerCount, totalListings, reviewAgg] = await Promise.all([
      this.prisma.listing.count({ where: { sellerId: id, status: 'ACTIVE' } }),
      this.prisma.order.count({ where: { sellerId: id, status: 'COMPLETED' } }),
      this.prisma.listing.count({ where: { sellerId: id } }),
      this.prisma.sellerReview.aggregate({
        where: { sellerId: id },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    // Note: seller review system is Phase C — not yet built. Return null fields
    // so client UI can render "暫無評價" gracefully.
    return {
      id: user.id,
      displayName: user.displayName,
      // KYC: surface only whether VERIFIED, not the full status enum
      kycVerified: user.kycStatus === 'VERIFIED',
      joinedAt: user.createdAt,
      activeListingsCount,
      soldAsSellerCount,
      totalListings,
      // If this user is also an authenticator, expose link to their auth profile
      authenticator: user.authenticator
        ? {
            id: user.authenticator.id,
            storeName: user.authenticator.storeName,
            starRating: user.authenticator.starRating,
            completedCount: user.authenticator.completedCount,
          }
        : null,
      avgRating: reviewAgg._avg.rating,
      reviewCount: reviewAgg._count,
    };
  }

  /**
   * Restricted buyer profile — only viewable by parties of an active (non-terminal)
   * order shared with this buyer. Self-view also allowed.
   *
   * Founder ruling 2026-06-19: Q1=B P1 restricted (only active-order three parties),
   * Q4=A only active orders (COMPLETED/REFUNDED block access).
   *
   * Never exposes: email, real name, address, contact info, buyer rating.
   * Multi-role WHERE clause (Lesson #6): viewer can be buyer/seller/authenticator.
   */
  @Get(':id/buyer-profile')
  async buyerProfile(@Param('id') id: string, @CurrentUser() viewer: CurrentUserData) {
    if (viewer.userId !== id) {
      const sharedOrder = await this.prisma.order.findFirst({
        where: {
          buyerId: id,
          status: { notIn: ['COMPLETED', 'REFUNDED'] },
          OR: [
            { buyerId: viewer.userId },
            { sellerId: viewer.userId },
            { authenticator: { userId: viewer.userId } },
          ],
        },
        select: { id: true },
      });
      if (!sharedOrder) {
        throw new ForbiddenException('此頁面只對 active 交易參與方開放');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, displayName: true, kycStatus: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const completedBuyCount = await this.prisma.order.count({
      where: { buyerId: id, status: 'COMPLETED' },
    });

    return {
      id: user.id,
      displayName: user.displayName,
      kycVerified: user.kycStatus === 'VERIFIED',
      joinedAt: user.createdAt,
      completedBuyCount,
    };
  }

  /** ACTIVE listings of a user — for IM "睇佢仲賣緊咩" + /seller/:id page */
  @Get(':id/listings')
  async sellerListings(
    @Param('id') id: string,
    @Query('limit') limit = '12',
    @Query('offset') offset = '0',
    @Query('q') q?: string,
  ) {
    const take = Math.min(parseInt(limit, 10) || 12, 48);
    const skip = parseInt(offset, 10) || 0;

    // Same tokenized AND-match semantics as listings.list() browse search —
    // each whitespace-separated term must hit title|description|brand.
    const terms = (q ?? '').split(/\s+/).map((t) => t.trim()).filter(Boolean);
    const where = {
      sellerId: id,
      status: 'ACTIVE' as const,
      ...(terms.length
        ? {
            AND: terms.map((t) => ({
              OR: [
                { title: { contains: t, mode: 'insensitive' as const } },
                { description: { contains: t, mode: 'insensitive' as const } },
                { brand: { contains: t, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: {
          id: true,
          title: true,
          priceHKD: true,
          category: true,
          images: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return { items, total, hasMore: skip + items.length < total };
  }
}

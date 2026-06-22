import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const ANONYMOUS_LABEL = '認證買家';
const ADMIN_ROLES = ['OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'];

class SellerReviewDto {
  @IsInt() @Min(1) @Max(5)
  rating!: number;
  @IsOptional() @IsString()
  comment?: string;
  /** Default true (founder ruling 2026-06-11). UI checkbox defaults to anonymous. */
  @IsOptional() @IsBoolean()
  isAnonymous?: boolean;
}

@Controller()
export class SellerReviewsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Buyer reviews seller after a COMPLETED order. */
  @Post('orders/:orderId/seller-review')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
    @Body() dto: SellerReviewDto,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== user.userId) throw new ForbiddenException('只有買家可以評價賣家');
    if (order.status !== 'COMPLETED') throw new BadRequestException('訂單未完成，唔可以評價');
    const existing = await this.prisma.sellerReview.findUnique({ where: { orderId } });
    if (existing) throw new BadRequestException('呢張訂單已經評價過');
    return this.prisma.sellerReview.create({
      data: {
        orderId,
        sellerId: order.sellerId,
        buyerId: order.buyerId,
        rating: dto.rating,
        comment: dto.comment ?? null,
        isAnonymous: dto.isAnonymous ?? true,
      },
    });
  }

  /**
   * Reviews list — buyer name masking per founder ruling 2026-06-11:
   *   default isAnonymous=true → show "認證買家"
   *   EXCEPT: admin / the buyer / the seller-being-reviewed /
   *           the authenticator of that order → see real displayName
   */
  @Get('users/:id/reviews')
  @UseGuards(JwtAuthGuard)
  async listReviews(@Param('id') sellerId: string, @CurrentUser() viewer: CurrentUserData) {
    const reviews = await this.prisma.sellerReview.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        buyer: { select: { id: true, displayName: true } },
        // Need order → authenticator → userId for visibility check
      },
    });

    // Resolve viewer's admin status + the auth user ids for each review's order
    const orderIds = reviews.map((r) => r.orderId);
    const orders = orderIds.length === 0 ? [] : await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        authenticator: { select: { userId: true } },
      },
    });
    const orderAuthMap = new Map<string, string | null>();
    for (const o of orders) orderAuthMap.set(o.id, o.authenticator?.userId ?? null);

    const viewerRec = await this.prisma.user.findUnique({
      where: { id: viewer.userId },
      select: { roles: true },
    });
    const isAdmin = viewerRec?.roles?.some((r) => ADMIN_ROLES.includes(r)) ?? false;

    const ratings = reviews.map((r) => r.rating);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    return {
      total: reviews.length,
      averageRating: avg,
      items: reviews.map((r) => {
        const authUserId = orderAuthMap.get(r.orderId) ?? null;
        const isParty =
          isAdmin
          || r.buyerId === viewer.userId
          || sellerId === viewer.userId
          || (authUserId && authUserId === viewer.userId);
        const showRealName = !r.isAnonymous || isParty;
        return {
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          buyerName: showRealName
            ? (r.buyer?.displayName ?? ANONYMOUS_LABEL)
            : ANONYMOUS_LABEL,
          isAnonymous: r.isAnonymous,
          createdAt: r.createdAt,
        };
      }),
    };
  }
}

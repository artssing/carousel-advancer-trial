import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingStatus, OrderStatus } from '@prisma/client';
import { calculateFees, tierForPrice, type CategoryId } from '@authentik/utils';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrderDto } from './dto';

const CATEGORY_TO_ID: Record<string, CategoryId> = {
  HANDBAG: 'handbag',
  IPHONE: 'iphone',
  POKEMON_CARD: 'pokemon_card',
  WATCH: 'watch',
  SNEAKER: 'sneaker',
  DESIGNER_TOY: 'designer_toy',
  OTHER: 'other',
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromListing(buyerId: string, dto: CreateOrderDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException(`Listing is ${listing.status}, cannot be purchased`);
    }
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Seller cannot buy own listing');
    }

    const tier = tierForPrice(listing.priceHKD);
    if (tier === 3 && !dto.authenticatorId) {
      throw new BadRequestException('Tier 3 listings require an authenticator selection');
    }

    if (dto.authenticatorId) {
      const auth = await this.prisma.authenticator.findUnique({
        where: { id: dto.authenticatorId },
      });
      if (!auth) throw new NotFoundException('Authenticator not found');
      if (auth.status !== 'ACTIVE') {
        throw new BadRequestException('Authenticator is not active');
      }
    }

    const categoryId = CATEGORY_TO_ID[listing.category];
    if (!categoryId) throw new BadRequestException('Unknown category');
    const fees = calculateFees(categoryId, listing.priceHKD);

    // Reserve listing + create order in a transaction
    return this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listing.id },
        data: { status: ListingStatus.RESERVED },
      });
      return tx.order.create({
        data: {
          listingId: listing.id,
          buyerId,
          sellerId: listing.sellerId,
          authenticatorId: dto.authenticatorId ?? null,
          salePriceHKD: listing.priceHKD,
          authFeeHKD: fees.authFee,
          platformFeeHKD: fees.platformFee,
          sellerNetHKD: fees.sellerNet,
          status: OrderStatus.AWAITING_PAYMENT,
        },
      });
    });
  }

  async listForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true, category: true, images: true } },
        authenticator: { select: { id: true, displayName: true, starRating: true } },
      },
    });
  }

  async get(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: true,
        authenticator: { select: { id: true, displayName: true, starRating: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not your order');
    }
    return order;
  }

  async markPaid(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Only buyer can pay');
    if (order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(`Order is ${order.status}, cannot accept payment`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID, paidAt: new Date() },
    });
  }
}

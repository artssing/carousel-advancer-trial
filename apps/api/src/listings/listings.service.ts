import { Injectable, NotFoundException } from '@nestjs/common';
import { Category, ListingStatus } from '@prisma/client';
import { tierForPrice } from '@authentik/utils';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateListingDto } from './dto';

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  list(category?: Category) {
    return this.prisma.listing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { seller: { select: { id: true, displayName: true } } },
    });
  }

  async get(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { seller: { select: { id: true, displayName: true } } },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  create(sellerId: string, dto: CreateListingDto) {
    const tier = tierForPrice(dto.priceHKD);
    return this.prisma.listing.create({
      data: {
        sellerId,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        priceHKD: dto.priceHKD,
        tier,
        images: dto.images ?? [],
      },
    });
  }
}

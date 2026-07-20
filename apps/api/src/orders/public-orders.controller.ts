import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { categoryByApiEnum } from '@authentik/utils';

/**
 * Public read-only aggregates from the orders table.
 *
 * The consumer home page shows a "實時鑑定" trust ticker. Founder ruling
 * 2026-07-02: the ticker MUST use real data (mock data would be a fake
 * authenticity claim, violating our L'Oréal v eBay information-intermediary
 * stance).
 *
 * Only expose fields that are safe to publicly reveal:
 *   - listing title + category shortLabel
 *   - authenticator display name (public brand of a professional)
 *   - passed timestamp (already implicit from ACTIVE marketplace)
 *
 * We DO NOT expose buyer / seller identities, prices, or order IDs.
 */
@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('recent-passed')
  async recentPassed() {
    const orders = await this.prisma.order.findMany({
      where: {
        // Only these statuses imply authentication has passed.
        status: { in: ['AUTH_PASSED', 'DELIVERED', 'COMPLETED'] },
        // Must have an authenticator (rules out MEETUP_DIRECT / Tier-1 skipped)
        authenticatorId: { not: null },
        // Order.authCompletedAt is written when verdict is issued.
        authCompletedAt: { not: null },
      },
      orderBy: { authCompletedAt: 'desc' },
      take: 5,
      include: {
        listing: { select: { title: true, category: true, brand: true } },
        authenticator: { select: { displayName: true } },
      },
    });

    return orders
      .filter((o) => o.listing && o.authenticator && o.authCompletedAt)
      .map((o) => ({
        // Order id truncated → stable opaque key (no info leak).
        key: o.id.slice(-8),
        title: o.listing.title,
        category: categoryByApiEnum(o.listing.category)?.shortLabel ?? '',
        brand: o.listing.brand ?? null,
        authenticatorName: o.authenticator!.displayName,
        passedAt: o.authCompletedAt!.toISOString(),
      }));
  }
}

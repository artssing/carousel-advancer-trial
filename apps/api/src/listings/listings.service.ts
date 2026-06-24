import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Category, ListingStatus, PriceChangeStatus } from '@prisma/client';
import { tierForPrice, normalizeForMatch } from '@authentik/utils';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateListingDto, UpdateListingDto } from './dto';

/** Founder ruling 2026-06-19 Q5/Q1: delay before pending price drop applies. */
const PRICE_DROP_DELAY_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bulk-promote any expired pending price drops.
   *
   * Founder ruling 2026-06-19 Q1=A: first-drop freezes originalPriceHKD.
   * Called lazily before every list/get so cron isn't required for MVP.
   * The N of expired pendings at any moment is small (= traffic of new drops
   * over the past 48h), so per-row promotion is acceptable.
   */
  private async promoteExpiredDrops() {
    const expired = await this.prisma.listing.findMany({
      where: {
        pendingPriceEffectiveAt: { lte: new Date(), not: null },
        pendingPriceHKD: { not: null },
        status: ListingStatus.ACTIVE,  // sold/reserved during pending → handled by `update()`
      },
      select: { id: true, priceHKD: true, pendingPriceHKD: true, originalPriceHKD: true },
    });
    if (expired.length === 0) return;
    await Promise.all(expired.map((l) =>
      this.prisma.$transaction(async (tx) => {
        await tx.listing.update({
          where: { id: l.id, status: ListingStatus.ACTIVE },  // re-check status (race)
          data: {
            priceHKD: l.pendingPriceHKD!,
            tier: tierForPrice(l.pendingPriceHKD!),
            // Freeze the anchor at the price that existed BEFORE this drop.
            // First-drop only — subsequent drops don't overwrite.
            originalPriceHKD: l.originalPriceHKD ?? l.priceHKD,
            pendingPriceHKD: null,
            pendingPriceEffectiveAt: null,
          },
        }).catch(() => null);  // race: row no longer matches → another caller promoted, skip
        await tx.priceChange.updateMany({
          where: { listingId: l.id, status: PriceChangeStatus.PENDING },
          data: { status: PriceChangeStatus.APPLIED, appliedAt: new Date() },
        });
      }),
    ));
  }

  async list(
    category?: Category,
    limit = 24,
    offset = 0,
    q?: string,
    opts?: { minPrice?: number; maxPrice?: number; sort?: 'newest' | 'priceAsc' | 'priceDesc' | 'relevance'; excludeId?: string; brand?: string },
  ) {
    await this.promoteExpiredDrops();

    // Smart search: split the query into terms and require EACH term to appear
    // in title OR description OR brand (case/diacritic-insensitive). This lets a
    // buyer type everything at once — "Chanel 全新 黑色" — instead of the old
    // single-substring match against `title` only (which returned nothing the
    // moment a buyer combined brand + condition + colour). Parsing of the raw
    // query into category + residual terms happens client-side via
    // parseSearchQuery() (SSOT in @authentik/utils); the server just matches.
    const terms = (q ?? '').split(/\s+/).map((t) => t.trim()).filter(Boolean);

    // Founder ruling 2026-06-11: RESERVED listings should still appear in
    // browse/search (Q1). SOLD remains hidden — buyer can still reach via
    // direct URL. DRAFT/REMOVED never appear here.
    const where: any = {
      status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
      ...(category ? { category } : {}),
      ...(opts?.brand ? { brand: opts.brand } : {}),
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
      ...(opts?.excludeId ? { id: { not: opts.excludeId } } : {}),
    };
    if (opts?.minPrice != null || opts?.maxPrice != null) {
      where.priceHKD = {};
      if (opts.minPrice != null) where.priceHKD.gte = opts.minPrice;
      if (opts.maxPrice != null) where.priceHKD.lte = opts.maxPrice;
    }

    // Browse cards only need coverUrl + meta — exclude heavy fields
    // (images[] base64 array, videoUrl base64) for query speed.
    const select = {
      id: true, sellerId: true, category: true, brand: true, title: true,
      priceHKD: true, originalPriceHKD: true, tier: true, status: true, createdAt: true,
      coverUrl: true,           // derived thumbnail (image or video frame)
      videoUrl: false as const, // huge base64, exclude
      videoPosterUrl: true,     // small (thumbnail), include for badge fallback
      videoIsCover: true,
      images: true,             // keep for backward-compat (older clients)
      allowedDeliveryMethods: true,
      sellerDistrict: true,
      seller: { select: { id: true, displayName: true } },
    };
    const decorate = <T extends { videoPosterUrl: string | null }>(it: T) => ({
      ...it,
      hasVideo: !!it.videoPosterUrl,
    });

    // ── Relevance ranking ───────────────────────────────────────────────────
    // Prisma/Postgres can't ORDER BY a computed text-match score without raw
    // SQL / full-text indexes, so for the relevance sort we fetch the matching
    // candidate set, score + sort in memory, then page. Fine at current catalog
    // scale (hundreds of listings); revisit with Postgres FTS / pg_trgm if the
    // catalog grows into the tens of thousands. Only runs when explicitly asked
    // (sort=relevance) AND there are terms to rank by.
    if (opts?.sort === 'relevance' && terms.length) {
      const candidates = await this.prisma.listing.findMany({
        where,
        // need description for scoring; capped so an unfiltered query can't OOM
        select: { ...select, description: true },
        orderBy: { createdAt: 'desc' as const },
        take: 1000,
      });
      const normTerms = terms.map((t) => normalizeForMatch(t));
      const scored = candidates
        .map((it) => {
          const nTitle = normalizeForMatch(it.title);
          const nBrand = normalizeForMatch(it.brand ?? '');
          const nDesc = normalizeForMatch(it.description ?? '');
          let score = 0;
          for (const t of normTerms) {
            if (nTitle.includes(t)) score += 3;
            if (nBrand.includes(t)) score += 2;
            if (nDesc.includes(t)) score += 1;
          }
          // Bonus: title contains the whole query phrase contiguously.
          if (normTerms.length > 1 && nTitle.includes(normTerms.join(' '))) score += 3;
          return { it, score };
        })
        .sort((a, b) => b.score - a.score || b.it.createdAt.getTime() - a.it.createdAt.getTime());
      const total = scored.length;
      const items = scored.slice(offset, offset + limit).map(({ it }) => {
        const { description, ...rest } = it; // drop description from browse payload
        return decorate(rest);
      });
      return { items, total, hasMore: offset + limit < total };
    }

    const orderBy =
      opts?.sort === 'priceAsc'  ? { priceHKD: 'asc' as const }
      : opts?.sort === 'priceDesc' ? { priceHKD: 'desc' as const }
      : { createdAt: 'desc' as const };
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({ where, orderBy, select, take: limit, skip: offset }),
      this.prisma.listing.count({ where }),
    ]);
    return { items: items.map(decorate), total, hasMore: offset + limit < total };
  }

  async listForSeller(sellerId: string) {
    return this.prisma.listing.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Aggregate seller stats — counts by status + lifetime earnings + active orders. */
  async sellerStats(sellerId: string) {
    const [statusGroups, completed] = await Promise.all([
      this.prisma.listing.groupBy({
        by: ['status'],
        where: { sellerId },
        _count: true,
      }),
      this.prisma.order.findMany({
        where: { sellerId, status: 'COMPLETED' },
        select: { sellerNetHKD: true, completedAt: true },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const g of statusGroups) counts[g.status] = g._count;
    const lifetimeEarnings = completed.reduce((s, o) => s + (o.sellerNetHKD ?? 0), 0);
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
    const monthEarnings = completed
      .filter((o) => o.completedAt && o.completedAt >= thisMonth)
      .reduce((s, o) => s + (o.sellerNetHKD ?? 0), 0);
    return {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      active: counts.ACTIVE ?? 0,
      reserved: counts.RESERVED ?? 0,
      sold: counts.SOLD ?? 0,
      removed: counts.REMOVED ?? 0,
      completedOrders: completed.length,
      lifetimeEarnings,
      monthEarnings,
    };
  }

  /**
   * Get a single listing with privacy-aware masking.
   *
   * Visibility rules (founder ruling 2026-06-11):
   *  • DRAFT     → only the seller (404 otherwise)
   *  • REMOVED   → 404 for everyone
   *  • ACTIVE    → fully public
   *  • RESERVED  → public, but for non-parties we MASK buyer/authenticator
   *                identity and the fee breakdown of the in-flight order.
   *                Listing core (title/photos/price/seller/brand) stays public.
   *  • SOLD      → public; attach `actualSalePriceHKD` from the COMPLETED order
   *                (founder ruling: 成交價可以公開).
   */
  async get(id: string, viewerUserId?: string) {
    await this.promoteExpiredDrops();
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { seller: { select: { id: true, displayName: true } } },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const isSeller = !!viewerUserId && viewerUserId === listing.sellerId;
    const isAdmin = !!viewerUserId && (await this.isAdmin(viewerUserId));

    // ── Gate by status ─────────────────────────────────────────────────
    if (listing.status === ListingStatus.DRAFT && !isSeller && !isAdmin) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status === ListingStatus.REMOVED && !isAdmin) {
      throw new NotFoundException('Listing not found');
    }

    // ── Attach order context for RESERVED / SOLD ──────────────────────
    let activeOrder: any = null;
    let isBuyer = false;
    let isAuth = false;
    if (listing.status === ListingStatus.RESERVED || listing.status === ListingStatus.SOLD) {
      // The latest non-terminal-failure order for this listing
      const order = await this.prisma.order.findFirst({
        where: { listingId: listing.id, status: { notIn: ['AUTH_FAILED'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true,
          buyerId: true, sellerId: true,
          authenticatorId: true,
          salePriceHKD: true, authFeeHKD: true, platformFeeHKD: true, sellerNetHKD: true,
          authenticator: { select: { id: true, userId: true, displayName: true } },
          buyer: { select: { id: true, displayName: true } },
        },
      });
      activeOrder = order;
      isBuyer = !!order && !!viewerUserId && order.buyerId === viewerUserId;
      isAuth = !!order?.authenticator && !!viewerUserId && order.authenticator.userId === viewerUserId;
    }

    // ── Build response ────────────────────────────────────────────────
    const base: any = { ...listing };
    // Founder ruling 2026-06-19 Q4=A: pending price drop is INVISIBLE to
    // buyers/non-sellers — prevents "wait for price drop" behaviour that
    // depresses conversion.
    if (!isSeller && !isAdmin) {
      base.pendingPriceHKD = null;
      base.pendingPriceEffectiveAt = null;
    }

    if (listing.status === ListingStatus.RESERVED) {
      const isParty = isSeller || isBuyer || isAuth || isAdmin;
      base.reservation = activeOrder ? {
        // Always-public reservation marker — so card/page can show banner
        status: activeOrder.status,
        orderId: isParty ? activeOrder.id : null,
        buyer: isParty ? activeOrder.buyer : null,
        authenticator: isParty ? activeOrder.authenticator : null,
        // Fee breakdown — only parties see it
        breakdown: isParty ? {
          salePriceHKD: activeOrder.salePriceHKD,
          authFeeHKD: activeOrder.authFeeHKD,
          platformFeeHKD: activeOrder.platformFeeHKD,
          sellerNetHKD: activeOrder.sellerNetHKD,
        } : null,
      } : null;
    }

    if (listing.status === ListingStatus.SOLD) {
      // 成交價公開 (founder ruling)
      base.actualSalePriceHKD = activeOrder?.salePriceHKD ?? null;
      base.soldAt = activeOrder ? null : null; // (placeholder, parties get more detail via /orders)
    }

    return base;
  }

  /** Admin check — true if user has any admin role. */
  private async isAdmin(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    if (!u) return false;
    return u.roles.some((r) => r === 'OPS_AGENT' || r === 'OPS_ADMIN' || r === 'SUPER_ADMIN');
  }

  create(sellerId: string, dto: CreateListingDto) {
    const tier = tierForPrice(dto.priceHKD);
    const images = dto.images ?? [];
    // Founder ruling 2026-06-21: 強制至少一張圖片或一段影片
    if (images.length === 0 && !dto.videoUrl) {
      throw new BadRequestException('請至少上載一張商品圖片或一段影片');
    }
    const videoIsCover = !!dto.videoIsCover && !!dto.videoUrl;
    // OQ-1=B: derive coverUrl at write time so browse query stays light
    const coverUrl = videoIsCover ? (dto.videoPosterUrl ?? null) : (images[0] ?? null);
    return this.prisma.listing.create({
      data: {
        sellerId,
        category: dto.category,
        brand: dto.brand?.trim() || null,
        title: dto.title,
        description: dto.description,
        priceHKD: dto.priceHKD,
        tier,
        images,
        videoUrl: dto.videoUrl ?? null,
        videoPosterUrl: dto.videoPosterUrl ?? null,
        videoIsCover,
        coverUrl,
        ...(dto.allowedDeliveryMethods?.length
          ? { allowedDeliveryMethods: dto.allowedDeliveryMethods }
          : {}),
        sellerDistrict: dto.sellerDistrict ?? null,
      },
    });
  }

  /**
   * Update an existing listing — only the seller, and only while ACTIVE
   * (once RESERVED/SOLD, listing details lock to preserve order audit trail).
   */
  async update(listingId: string, sellerId: string, dto: UpdateListingDto) {
    const existing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true, sellerId: true, status: true,
        priceHKD: true, originalPriceHKD: true,
        pendingPriceHKD: true, pendingPriceEffectiveAt: true,
      },
    });
    if (!existing) throw new NotFoundException('Listing not found');
    if (existing.sellerId !== sellerId) {
      throw new ForbiddenException('唔可以修改其他賣家嘅商品');
    }
    if (existing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('商品已被預訂或已售出，唔可以修改');
    }

    // Founder ruling 2026-06-19 Q2: single edit entry; server classifies.
    //   newPrice < currentPrice → schedule price-drop (48h delay)
    //   newPrice ≥ currentPrice (or unchanged) → instant DIRECT_EDIT
    //   Q3: no cooldown / no minimum drop amount
    let priceChangeKind: 'NONE' | 'DROP' | 'DIRECT' = 'NONE';
    let nextPrice: number | undefined;
    if (dto.priceHKD !== undefined && dto.priceHKD !== existing.priceHKD) {
      nextPrice = dto.priceHKD;
      priceChangeKind = nextPrice < existing.priceHKD ? 'DROP' : 'DIRECT';
    }

    // Build update data — only fields that were sent.
    const data: any = {};
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.brand !== undefined) data.brand = dto.brand?.trim() || null;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (priceChangeKind === 'DROP') {
      // Schedule pending drop; current priceHKD stays put until effectiveAt.
      data.pendingPriceHKD = nextPrice;
      data.pendingPriceEffectiveAt = new Date(Date.now() + PRICE_DROP_DELAY_MS);
    } else if (priceChangeKind === 'DIRECT') {
      data.priceHKD = nextPrice;
      data.tier = tierForPrice(nextPrice!);
      // Any existing pending drop is superseded by the new direct edit.
      if (existing.pendingPriceHKD != null) {
        data.pendingPriceHKD = null;
        data.pendingPriceEffectiveAt = null;
      }
    }
    if (dto.images !== undefined) data.images = dto.images;
    if (dto.videoUrl !== undefined) data.videoUrl = dto.videoUrl ?? null;
    if (dto.videoPosterUrl !== undefined) data.videoPosterUrl = dto.videoPosterUrl ?? null;
    if (dto.videoIsCover !== undefined) data.videoIsCover = !!dto.videoIsCover;
    if (dto.allowedDeliveryMethods !== undefined) {
      data.allowedDeliveryMethods = dto.allowedDeliveryMethods;
    }
    if (dto.sellerDistrict !== undefined) data.sellerDistrict = dto.sellerDistrict ?? null;

    // Re-derive coverUrl whenever any media field changes (Lesson #8 SSOT).
    if (data.images !== undefined || data.videoIsCover !== undefined || data.videoPosterUrl !== undefined || data.videoUrl !== undefined) {
      const finalImages = data.images ?? (await this.prisma.listing.findUnique({ where: { id: listingId }, select: { images: true } }))?.images ?? [];
      const finalIsCoverVideo = data.videoIsCover !== undefined ? data.videoIsCover : undefined;
      // Need full row to compute when only partial fields sent
      const cur = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: { videoIsCover: true, videoPosterUrl: true, videoUrl: true },
      });
      const effectiveVideoIsCover = finalIsCoverVideo ?? cur?.videoIsCover ?? false;
      const effectivePoster = data.videoPosterUrl !== undefined ? data.videoPosterUrl : cur?.videoPosterUrl ?? null;
      const effectiveVideoUrl = data.videoUrl !== undefined ? data.videoUrl : cur?.videoUrl ?? null;
      data.coverUrl = effectiveVideoIsCover && effectiveVideoUrl ? effectivePoster : (finalImages[0] ?? null);
    }

    return this.prisma.$transaction(async (tx) => {
      // Audit log: write PriceChange row + supersede any prior PENDING.
      if (priceChangeKind !== 'NONE') {
        if (existing.pendingPriceHKD != null) {
          await tx.priceChange.updateMany({
            where: { listingId, status: PriceChangeStatus.PENDING },
            data: {
              status: PriceChangeStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelReason: 'SUPERSEDED',
            },
          });
        }
        await tx.priceChange.create({
          data: {
            listingId,
            sellerId,
            oldPriceHKD: existing.priceHKD,
            newPriceHKD: nextPrice!,
            status: priceChangeKind === 'DROP' ? PriceChangeStatus.PENDING : PriceChangeStatus.DIRECT_EDIT,
            effectiveAt: priceChangeKind === 'DROP' ? new Date(Date.now() + PRICE_DROP_DELAY_MS) : null,
            appliedAt: priceChangeKind === 'DIRECT' ? new Date() : null,
          },
        });
      }
      const updated = await tx.listing.update({
        where: { id: listingId },
        data,
        include: { seller: { select: { id: true, displayName: true } } },
      });
      return {
        ...updated,
        priceChangeApplied: priceChangeKind,  // client uses this for toast/UI hint
      };
    });
  }

  /**
   * Count active offers for a listing — used by client edit dialog to warn
   * seller before changing price (Founder ruling 2026-06-19 Q5).
   */
  async activeOfferCount(listingId: string, sellerId: string): Promise<number> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true },
    });
    if (!listing || listing.sellerId !== sellerId) {
      throw new ForbiddenException('Not your listing');
    }
    return this.prisma.offer.count({
      where: { listingId, status: 'PENDING' },
    });
  }
}

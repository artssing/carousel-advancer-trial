import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingStatus, MessageRole, OfferStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/messages.gateway';

/** Default expiry — 24h. Future: per-category via packages/utils/categories.ts. */
const DEFAULT_OFFER_EXPIRY_HOURS = 24;
/** After ACCEPTED, buyer must place order within this window or listing reverts. */
const PAYMENT_DEADLINE_HOURS = 12;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly gateway: MessagesGateway,
  ) {}

  /** Insert SYSTEM message + immediately broadcast via WebSocket so
   *  connected clients see it without manual refresh. */
  private async systemMessage(conversationId: string, body: string) {
    const msg = await this.messages.insertSystemMessage(conversationId, body);
    if (msg) await this.gateway.broadcastToConversation(conversationId, msg);
    return msg;
  }

  // ─── Create / counter ───────────────────────────────────────────────────

  /** Propose a new offer (or counter, if parentOfferId given). */
  async createOffer(userId: string, conversationId: string, priceHKD: number, parentOfferId?: string) {
    if (priceHKD <= 0) throw new BadRequestException('Price must be positive');

    // Load conversation + listing for authorization
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { listing: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (!conv.listingId || !conv.listing) {
      throw new BadRequestException('議價只可以喺商品查詢對話入面進行（未落單）');
    }
    if (conv.listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('商品已預訂或售出，唔可以議價');
    }
    // Determine viewer role
    const isBuyer = conv.buyerId === userId;
    const isSeller = conv.sellerId === userId;
    if (!isBuyer && !isSeller) throw new ForbiddenException('Not a party to this conversation');

    const role: MessageRole = isBuyer ? MessageRole.BUYER : MessageRole.SELLER;

    // Reject if another PENDING offer exists in this conversation
    const pending = await this.prisma.offer.findFirst({
      where: { conversationId, status: OfferStatus.PENDING },
    });
    if (pending && pending.id !== parentOfferId) {
      throw new ConflictException('呢個對話已經有議價待回覆，請先處理');
    }

    if (parentOfferId) {
      const parent = await this.prisma.offer.findUnique({ where: { id: parentOfferId } });
      if (!parent || parent.conversationId !== conversationId) {
        throw new BadRequestException('父議價無效');
      }
      // counter-offer must be from the OPPOSITE party of the parent
      if (parent.proposedByUserId === userId) {
        throw new BadRequestException('唔可以還價自己嘅出價');
      }
    }

    // Round number = overall count of offers in this conversation + 1.
    // Withdrawn / rejected / counter rounds all count as a real "round" in the
    // negotiation. This matches user mental model better than parent-chain depth.
    const overallCount = await this.prisma.offer.count({ where: { conversationId } });
    const roundNumber = overallCount + 1;

    // Transaction: mark parent as COUNTERED (if any), insert child offer + sentinel message
    const result = await this.prisma.$transaction(async (tx) => {
      if (parentOfferId) {
        await tx.offer.updateMany({
          where: { id: parentOfferId, status: OfferStatus.PENDING },
          data: { status: OfferStatus.COUNTERED, respondedAt: new Date() },
        });
      }
      const offer = await tx.offer.create({
        data: {
          conversationId,
          listingId: conv.listingId!,
          proposedByUserId: userId,
          proposedByRole: role,
          priceHKD,
          parentOfferId: parentOfferId ?? null,
          roundNumber,
          expiresAt: new Date(Date.now() + DEFAULT_OFFER_EXPIRY_HOURS * 3600 * 1000),
        },
      });
      // Sentinel message — pane detects and renders <OfferCard offerId={...} />
      const sentinel = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          senderRole: role,
          body: `__OFFER__:${offer.id}`,
          readByBuyer: role === MessageRole.BUYER,
          readBySeller: role === MessageRole.SELLER,
        },
        select: {
          id: true, senderRole: true, senderId: true, body: true,
          isFiltered: true, createdAt: true,
          sender: { select: { id: true, displayName: true } },
        },
      });
      return { offer, sentinel };
    });

    // Broadcast sentinel via WebSocket so the proposer (+ counterparty)
    // see the OfferCard immediately, without manual refresh.
    await this.gateway.broadcastToConversation(conversationId, result.sentinel);

    return result.offer;
  }

  // ─── Respond ────────────────────────────────────────────────────────────

  async acceptOffer(userId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { conversation: true, listing: true },
    });
    if (!offer) throw new NotFoundException('議價唔存在');
    this.assertCanRespond(offer, userId);

    // Lazy expiry check
    if (offer.expiresAt.getTime() < Date.now()) {
      await this.prisma.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.EXPIRED },
      });
      throw new BadRequestException('議價已過期');
    }
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('議價唔係 PENDING 狀態');
    }

    // Atomic listing reservation — race-safe
    const result = await this.prisma.$transaction(async (tx) => {
      // Atomically reserve listing only if still ACTIVE
      const reserved = await tx.listing.updateMany({
        where: { id: offer.listingId, status: ListingStatus.ACTIVE },
        data: { status: ListingStatus.RESERVED },
      });
      if (reserved.count === 0) {
        throw new ConflictException('商品已被其他買家預留，呢次議價自動取消');
      }
      const paymentDeadlineAt = new Date(Date.now() + PAYMENT_DEADLINE_HOURS * 3600 * 1000);
      const updated = await tx.offer.update({
        where: { id: offerId },
        data: {
          status: OfferStatus.ACCEPTED,
          respondedAt: new Date(),
          acceptedByUserId: userId,
          paymentDeadlineAt,
        },
      });
      // Withdraw all other PENDING offers on this listing
      await tx.offer.updateMany({
        where: {
          listingId: offer.listingId,
          status: OfferStatus.PENDING,
          id: { not: offerId },
        },
        data: { status: OfferStatus.WITHDRAWN, respondedAt: new Date() },
      });
      return updated;
    });

    // SYSTEM message — outside transaction since it's idempotent and not critical
    await this.systemMessage(
      offer.conversationId,
      `議價成功！協議價 HK$${offer.priceHKD}。買家請喺 ${PAYMENT_DEADLINE_HOURS} 小時內完成落單，否則預留會自動取消。`,
    );

    return result;
  }

  async rejectOffer(userId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { conversation: true },
    });
    if (!offer) throw new NotFoundException('議價唔存在');
    this.assertCanRespond(offer, userId);
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('議價唔係 PENDING 狀態');
    }
    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.REJECTED, respondedAt: new Date() },
    });
    await this.systemMessage(
      offer.conversationId,
      `對方拒絕咗 HK$${offer.priceHKD} 嘅出價。可以再傾或者另出價。`,
    );
    return updated;
  }

  async counterOffer(userId: string, parentOfferId: string, priceHKD: number) {
    const parent = await this.prisma.offer.findUnique({ where: { id: parentOfferId } });
    if (!parent) throw new NotFoundException('議價唔存在');
    return this.createOffer(userId, parent.conversationId, priceHKD, parentOfferId);
  }

  /** Proposer can withdraw their own PENDING offer */
  async withdrawOffer(userId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('議價唔存在');
    if (offer.proposedByUserId !== userId) {
      throw new ForbiddenException('只可以撤回自己嘅出價');
    }
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('議價唔係 PENDING 狀態');
    }
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.WITHDRAWN, respondedAt: new Date() },
    });
  }

  // ─── Reads ──────────────────────────────────────────────────────────────

  async getOffer(userId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        listing: { select: { id: true, title: true, priceHKD: true, sellerId: true } },
        proposedBy: { select: { id: true, displayName: true } },
        conversation: { select: { buyerId: true, sellerId: true } },
      },
    });
    if (!offer) throw new NotFoundException('議價唔存在');
    // Authorisation — must be party to the conversation
    const conv = offer.conversation;
    if (conv.buyerId !== userId && conv.sellerId !== userId) {
      throw new ForbiddenException('唔係呢個議價嘅參與方');
    }
    // Lazy expiry — return latest status
    if (offer.status === OfferStatus.PENDING && offer.expiresAt.getTime() < Date.now()) {
      const expired = await this.prisma.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.EXPIRED },
      });
      return { ...offer, ...expired };
    }
    return offer;
  }

  async listForConversation(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true, sellerId: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.buyerId !== userId && conv.sellerId !== userId) {
      throw new ForbiddenException('唔係呢個對話嘅參與方');
    }
    return this.prisma.offer.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        proposedBy: { select: { id: true, displayName: true } },
      },
    });
  }

  // ─── Cron sweeps ────────────────────────────────────────────────────────

  /** Mark offers past expiresAt as EXPIRED + emit SYSTEM messages. */
  async sweepExpiredOffers() {
    const expired = await this.prisma.offer.findMany({
      where: { status: OfferStatus.PENDING, expiresAt: { lt: new Date() } },
      select: { id: true, conversationId: true, priceHKD: true },
    });
    if (expired.length === 0) return { swept: 0 };
    await this.prisma.offer.updateMany({
      where: { id: { in: expired.map((o) => o.id) } },
      data: { status: OfferStatus.EXPIRED },
    });
    for (const o of expired) {
      await this.systemMessage(
        o.conversationId,
        `HK$${o.priceHKD} 議價已過期。`,
      );
    }
    return { swept: expired.length };
  }

  /** Accepted offers whose paymentDeadlineAt passed without an Order being created
   *  → revert listing to ACTIVE + offer to WITHDRAWN + system msg. */
  async sweepPaymentDeadlines() {
    const stale = await this.prisma.offer.findMany({
      where: {
        status: OfferStatus.ACCEPTED,
        paymentDeadlineAt: { lt: new Date() },
      },
      include: {
        listing: { select: { id: true, status: true } },
      },
    });
    let swept = 0;
    for (const offer of stale) {
      // Only revert if listing is still RESERVED (Order may have been placed)
      const orderExists = await this.prisma.order.findFirst({
        where: { listingId: offer.listingId, salePriceHKD: offer.priceHKD },
      });
      if (orderExists) {
        // Order placed; nothing to do — but mark offer somehow (still ACCEPTED is fine,
        // semantically it played out correctly)
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.listing.updateMany({
          where: { id: offer.listingId, status: ListingStatus.RESERVED },
          data: { status: ListingStatus.ACTIVE },
        });
        await tx.offer.update({
          where: { id: offer.id },
          data: { status: OfferStatus.WITHDRAWN },
        });
      });
      await this.systemMessage(
        offer.conversationId,
        '付款期限已過，預留已取消，商品已重新上架。',
      );
      swept++;
    }
    return { swept };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private assertCanRespond(
    offer: { proposedByUserId: string; conversation: { buyerId: string | null; sellerId: string | null } | null },
    userId: string,
  ) {
    const { buyerId, sellerId } = offer.conversation ?? {};
    if (buyerId !== userId && sellerId !== userId) {
      throw new ForbiddenException('唔係呢個議價嘅參與方');
    }
    if (offer.proposedByUserId === userId) {
      throw new BadRequestException('唔可以回應自己嘅出價');
    }
  }
}

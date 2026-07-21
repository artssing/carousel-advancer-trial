import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  DeliveryMethod,
  ListingStatus,
  OrderStatus,
  PaymentMethod,
} from '@prisma/client';
import { calculateOrderFees, tierForPrice, needsMyAction, normalizeHKPhone } from '@authentik/utils';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { PaymentsService } from '../payments/payments.service';
import { stripeAdapter } from '../payments/stripe-adapter';
import type { AddEvidenceDto, CreateOrderDto, ReviewDto, VerdictDto } from './dto';

// 面交類交收（鑑定師面交 / 三方 / 買賣雙方）。SHIP 唔屬於呢類。
const MEETUP_METHODS: DeliveryMethod[] = [
  DeliveryMethod.MEETUP_AUTH,
  DeliveryMethod.MEETUP_3WAY,
  DeliveryMethod.MEETUP_DIRECT,
];

/** MEETUP_AUTH Phase A handover photo round (audit trail) */
export type HandoverRound = {
  round: number;
  photos: string[];
  uploadedAt: string;       // ISO
  ackedAt?: string;          // seller confirmed this round
  rejectedAt?: string;       // seller requested re-photo
  rejectionPresets?: string[];
  rejectionComment?: string;
};

/** Max re-photo requests per order. After this seller can only confirm or cancel. */
export const MAX_REPHOTO = 2;

/** Ack v2 (founder 2026-07-10): SHIPPED_TO_BUYER auto-completes T+N days after
 *  ship-out — buyer never acks, only disputes within the window. Merged clock:
 *  auto-complete = 即時 cashout eligible（取代舊 72hr cashoutEligibleAt 疊加）。 */
export const AUTO_COMPLETE_DAYS = 3;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly gateway: MessagesGateway,
    // forwardRef avoids circular OrdersModule ↔ PaymentsModule dep.
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
  ) {}

  /** Capture an authorized hold if any. Best-effort — never blocks the
   *  state-machine transition, just logs failure for admin to retry. */
  private async tryCapturePayment(orderId: string, trigger: string) {
    try {
      const r = await this.payments.captureForOrder(orderId);
      if (r?.captured) {
        await this.systemMessage(orderId, `💳 鑑定／交收完成，平台已正式扣款。(trigger: ${trigger})`);
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(`[capture] order=${orderId} trigger=${trigger} failed:`, e?.message);
    }
  }

  /** Push a SYSTEM message to the order's conversation + broadcast to live clients.
   *  Silent no-op if conversation doesn't exist (e.g. pre-conversation orders).
   *  Per CLAUDE.md lesson #12, server-side writes MUST also broadcast. */
  private async systemMessage(orderId: string, body: string) {
    // SYSTEM messages always go in the THREE_WAY transparent thread —
    // never pair channels (private). Composite key now needed because
    // multiple Conversation rows can exist per order.
    const conv = await this.prisma.conversation.findUnique({
      where: { orderId_kind: { orderId, kind: 'THREE_WAY' } },
      select: { id: true },
    });
    if (!conv) return;
    const msg = await this.messages.insertSystemMessage(conv.id, body);
    if (msg) await this.gateway.broadcastToConversation(conv.id, msg);
  }

  async createFromListing(buyerId: string, dto: CreateOrderDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Seller cannot buy own listing');
    }

    // ── Negotiation path ─────────────────────────────────────────────────
    // If buyer is checking out from an ACCEPTED Offer, validate + use offer price.
    // Listing will be RESERVED at acceptance time, so don't reject on listing.status.
    let acceptedOffer: { id: string; priceHKD: number; paymentDeadlineAt: Date | null } | null = null;
    if (dto.offerId) {
      const offer = await this.prisma.offer.findUnique({
        where: { id: dto.offerId },
        include: { conversation: { select: { buyerId: true } } },
      });
      if (!offer) throw new NotFoundException('議價唔存在');
      if (offer.listingId !== dto.listingId) {
        throw new BadRequestException('議價同 listing 唔吻合');
      }
      if (offer.conversation.buyerId !== buyerId) {
        throw new ForbiddenException('只可以用自己嘅議價落單');
      }
      if (offer.status !== 'ACCEPTED') {
        throw new BadRequestException('議價未被接受，唔可以落單');
      }
      if (offer.paymentDeadlineAt && offer.paymentDeadlineAt.getTime() < Date.now()) {
        throw new BadRequestException('議價付款期限已過，預留已失效');
      }
      acceptedOffer = { id: offer.id, priceHKD: offer.priceHKD, paymentDeadlineAt: offer.paymentDeadlineAt };
    } else if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException(`Listing is ${listing.status}, cannot be purchased`);
    }

    // Effective sale price — offer overrides listing.priceHKD if present
    const salePriceHKD = acceptedOffer?.priceHKD ?? listing.priceHKD;

    // 交收方式必須喺賣家接受嘅清單內
    if (!listing.allowedDeliveryMethods.includes(dto.deliveryMethod)) {
      throw new BadRequestException(
        `Seller does not accept delivery method ${dto.deliveryMethod}`,
      );
    }

    const isMeetup = MEETUP_METHODS.includes(dto.deliveryMethod);
    const isDirectMeetup = dto.deliveryMethod === DeliveryMethod.MEETUP_DIRECT;

    // MEETUP_DIRECT = 買賣雙方面交、無鑑定，所以唔可以同時揀鑑定師
    if (isDirectMeetup && dto.authenticatorId) {
      throw new BadRequestException(
        'MEETUP_DIRECT is a no-authentication method; do not select an authenticator',
      );
    }

    // CRITICAL: tier must derive from effective sale price, not listing's original price.
    // A HK$15,000 (Tier 3) listing negotiated down to HK$8,000 becomes Tier 2 (optional auth).
    const tier = tierForPrice(salePriceHKD);
    if (tier === 3) {
      // Tier 3 強制鑑定
      if (!dto.authenticatorId) {
        throw new BadRequestException('Tier 3 listings require an authenticator selection');
      }
      if (isDirectMeetup) {
        throw new BadRequestException(
          'Tier 3 listings require authentication; MEETUP_DIRECT is not allowed',
        );
      }
    }

    // ── Payment-method × delivery-method × authenticator matrix ─────────
    //
    // Founder ruling 2026-06-11:
    //   SHIP **without** authenticator → 平台不可 hold 錢（escrow 唔可選），
    //   因為冇第三方協助處理糾紛，買賣自行解決。買家可以揀「賣家直收」
    //   （OFFLINE_CASH，平台不會託管款項；包括 FPS / 銀行轉帳 / 現金）。
    //   SHIP **with** authenticator → escrow 仲准（鑑定師充當第三方仲裁）。
    //   MEETUP_* → 現有 logic 不變（OFFLINE_CASH 准、ONLINE_ESCROW 准）。
    const isShipNoAuth =
      dto.deliveryMethod === DeliveryMethod.SHIP && !dto.authenticatorId;
    if (isShipNoAuth && dto.paymentMethod === PaymentMethod.ONLINE_ESCROW) {
      throw new BadRequestException(
        '物流寄送（無鑑定師）唔可以揀線上託管 — 平台冇方法協助處理糾紛，請揀「賣家直收」。',
      );
    }
    // Ack v2 (E, founder 2026-07-10): MEETUP_DIRECT 零佣金零 ack — 平台唔 hold
    // 錢（冇人會 ack 放款），強制 OFFLINE_CASH。
    if (dto.deliveryMethod === DeliveryMethod.MEETUP_DIRECT && dto.paymentMethod === PaymentMethod.ONLINE_ESCROW) {
      throw new BadRequestException(
        '買賣雙方面交唔支援線上託管 — 平台唔收佣金亦唔託管款項，請用面交現金/FPS。',
      );
    }
    // 線下現金：允許 meetup OR SHIP-no-auth；其餘禁
    if (dto.paymentMethod === PaymentMethod.OFFLINE_CASH && !isMeetup && !isShipNoAuth) {
      throw new BadRequestException(
        'OFFLINE_CASH payment requires in-person meetup OR ship-without-authenticator',
      );
    }

    // 面交地點 — MEETUP_AUTH / MEETUP_3WAY 要 branch；MEETUP_DIRECT 要 free-text
    const isAuthMeetup =
      dto.deliveryMethod === DeliveryMethod.MEETUP_AUTH
      || dto.deliveryMethod === DeliveryMethod.MEETUP_3WAY;
    if (isAuthMeetup && !dto.meetupBranchId) {
      throw new BadRequestException('鑑定師面交 / 三方面交 必須揀分店');
    }
    if (dto.deliveryMethod === DeliveryMethod.MEETUP_DIRECT && !dto.meetupFreeText?.trim()) {
      throw new BadRequestException('雙方面交必須填寫地點');
    }

    let authQuote: { feeRatePct: number; feeMinHKD: number } | null = null;
    let branchSnapshot: {
      name: string; fullAddress: string; districtKey: string;
      businessHours: string | null; notes: string | null;
      contactPhone: string | null; contactWhatsapp: string | null;
    } | null = null;
    if (dto.authenticatorId) {
      const auth = await this.prisma.authenticator.findUnique({
        where: { id: dto.authenticatorId },
      });
      if (!auth) throw new NotFoundException('Authenticator not found');
      if (auth.status !== 'ACTIVE') {
        throw new BadRequestException('Authenticator is not active');
      }
      authQuote = { feeRatePct: auth.feeRatePct, feeMinHKD: auth.feeMinHKD };

      // For MEETUP_AUTH/3WAY: validate branch belongs to this auth + is active,
      // then snapshot it so post-order branch edits don't mutate completed orders.
      if (isAuthMeetup && dto.meetupBranchId) {
        const branch = await this.prisma.branch.findUnique({ where: { id: dto.meetupBranchId } });
        if (!branch || branch.authenticatorId !== auth.id || !branch.isActive) {
          throw new BadRequestException('揀嘅分店唔屬於呢位鑑定師或已停用');
        }
        branchSnapshot = {
          name: branch.name,
          fullAddress: branch.fullAddress,
          districtKey: branch.districtKey,
          businessHours: branch.businessHours,
          notes: branch.notes,
          contactPhone: branch.contactPhone,
          contactWhatsapp: branch.contactWhatsapp,
        };
      }
    } else if (isAuthMeetup) {
      throw new BadRequestException('鑑定師面交 / 三方面交 必須揀鑑定師');
    }

    // 鑑定費用用所揀鑑定師嘅自訂 rate；無鑑定師則 authFee = 0
    const fees = calculateOrderFees(salePriceHKD, authQuote);

    // Draft order（founder 2026-07-20 ruling）：落單一刻 **唔 lock 件貨** —
    // listing 保持 ACTIVE，買家可以隨時上返一頁 edit / 放棄。RESERVED 只喺
    // confirmReview（double confirm）一刻先搶，30 分鐘倒數同時開始。
    // Offer path 例外：accept offer 嗰刻已 RESERVED（議價預留係刻意設計）。
    return this.prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          listingId: listing.id,
          buyerId,
          sellerId: listing.sellerId,
          authenticatorId: dto.authenticatorId ?? null,
          salePriceHKD,
          authFeeHKD: fees.authFee,
          platformFeeHKD: fees.platformFee,
          sellerNetHKD: fees.sellerNet,
          deliveryMethod: dto.deliveryMethod,
          paymentMethod: dto.paymentMethod,
          meetupLocation: dto.meetupLocation ?? null,  // legacy field, kept for now
          meetupBranchId: branchSnapshot ? dto.meetupBranchId : null,
          meetupBranchSnapshot: branchSnapshot as any,
          meetupFreeText: dto.deliveryMethod === DeliveryMethod.MEETUP_DIRECT ? (dto.meetupFreeText?.trim() ?? dto.meetupLocation ?? null) : null,
          escrowHeld: dto.paymentMethod === PaymentMethod.ONLINE_ESCROW,
          status: OrderStatus.AWAITING_PAYMENT,
        },
      });
    });
  }

  // NOTE: buyer/seller only — authenticators must use listForAuthenticator().
  // Do NOT call this for auth-role users; WHERE clause intentionally excludes authenticatorId (Lesson #6).
  async listForUser(userId: string) {
    const orders = await this.prisma.order.findMany({
      // 賣家唔見 draft（買家未 double-confirm 嘅 AWAITING_PAYMENT，貨未 lock）—
      // 嗰啲只係人哋個購物車，唔係真單（founder 2026-07-20）。買家自己就見到。
      where: {
        OR: [
          { buyerId: userId },
          {
            sellerId: userId,
            NOT: { status: OrderStatus.AWAITING_PAYMENT, paymentDeadlineAt: null },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        // list card 只需 cover 一張 —— 用 coverUrl，唔好 select images[]（全部相）
        listing: { select: { id: true, title: true, category: true, coverUrl: true } },
        authenticator: { select: { id: true, displayName: true, starRating: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
    });
    // Attach review existence for each order (for UI: show "reviewed" vs "review" button)
    const orderIds = orders.map((o) => o.id);
    const reviews = await this.prisma.authenticatorReview.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, rating: true, comment: true },
    });
    const reviewMap = new Map(reviews.map((r) => [r.orderId, r]));
    // ⚠️ Strip base64 相陣列（founder 2026-07-20 perf #5）：呢啲欄位 list card
    // 唔 render，但 base64 落 JSON 令 payload 由 ~55KB 谷到 ~1MB（32 單實測
    // handoverPhotos 一個就 969KB）。相只喺訂單詳情 `get()` 先返。
    return orders.map(
      ({ handoverPhotos, authReceiptPhotos, deliveryReceiptPhotos, returnPhotos, ...o }) => ({
        ...o,
        review: reviewMap.get(o.id) ?? null,
      }),
    );
  }

  /**
   * Count of orders awaiting user action (drives /orders badge in TopNav).
   *
   * Buyer side: AWAITING_PAYMENT (pay) / DELIVERED (confirm receipt)
   * Seller side: PAID (ship out) / AUTH_PASSED with SHIP path (ship to buyer)
   *
   * Keeps WHERE clause covering both roles per past regression #6.
   */
  /**
   * SSOT: re-use `needsMyAction` from @authentik/utils so the top-nav badge
   * counts EXACTLY what the per-tab badges count. Previously this used a
   * hand-rolled list of statuses that drifted from the SSOT (lesson #8).
   */
  async actionRequiredCount(userId: string): Promise<{ count: number }> {
    const auth = await this.prisma.authenticator.findUnique({ where: { userId } });
    const authId = auth?.id;

    // Fetch all non-terminal orders where the user plays any role.
    const orders = await this.prisma.order.findMany({
      where: {
        AND: [
          { status: { notIn: [OrderStatus.COMPLETED, OrderStatus.AUTH_FAILED] } },
          {
            OR: [
              { buyerId: userId },
              { sellerId: userId },
              ...(authId ? [{ authenticatorId: authId }] : []),
            ],
          },
        ],
      },
      select: {
        id: true, status: true,
        buyerId: true, sellerId: true, authenticatorId: true,
        deliveryMethod: true,
        returnPhotosUploadedAt: true, returnSellerAckAt: true,
      },
    });

    let count = 0;
    for (const o of orders) {
      if (o.buyerId === userId && needsMyAction(o, userId, 'buyer')) count++;
      else if (o.sellerId === userId && needsMyAction(o, userId, 'seller')) count++;
      else if (authId && o.authenticatorId === authId && needsMyAction(o, userId, 'auth')) count++;
    }
    return { count };
  }

  async listForAuthenticator(userId: string) {
    const auth = await this.prisma.authenticator.findUnique({ where: { userId } });
    if (!auth) throw new ForbiddenException('No authenticator profile for this user');
    return this.prisma.order.findMany({
      where: { authenticatorId: auth.id },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true, category: true, images: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
    });
  }

  /** Authenticator-scoped fast search across their orders.
   *  Match (any field, case-insensitive):
   *    - listing.title substring
   *    - order.id prefix (so copying 「a1b2c3d4」 from email works)
   *    - listing.brand substring (enum key OR free text)
   *    - buyer.displayName / seller.displayName substring
   *  Lesson #6: authenticatorId scope is mandatory — never cross-auth leak. */
  async searchForAuthenticator(userId: string, query: string) {
    const auth = await this.prisma.authenticator.findUnique({ where: { userId } });
    if (!auth) throw new ForbiddenException('No authenticator profile for this user');
    const q = query.trim();
    if (!q) return [];
    return this.prisma.order.findMany({
      where: {
        authenticatorId: auth.id,
        OR: [
          { id: { startsWith: q } },
          { listing: { title: { contains: q, mode: 'insensitive' } } },
          { listing: { brand: { contains: q, mode: 'insensitive' } } },
          { buyer: { displayName: { contains: q, mode: 'insensitive' } } },
          { seller: { displayName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,        // cap — UI shows results inline, no pagination needed
      include: {
        listing: { select: { id: true, title: true, category: true, images: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
    });
  }

  async get(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: true,
        authenticator: { select: { id: true, displayName: true, starRating: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    // Allow access to buyer, seller, or assigned authenticator's user
    const auth = order.authenticatorId
      ? await this.prisma.authenticator.findUnique({ where: { id: order.authenticatorId } })
      : null;
    const isParty =
      order.buyerId === userId ||
      order.sellerId === userId ||
      auth?.userId === userId;
    if (!isParty) throw new ForbiddenException('Not your order');

    // Attach review if exists
    const review = await this.prisma.authenticatorReview.findUnique({
      where: { orderId },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });

    return { ...order, review: review ?? null };
  }

  async markPaid(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Only buyer can pay');
    if (order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(`Order is ${order.status}, cannot accept payment`);
    }
    // Draft 未 double-confirm 唔准過 PAID（listing 未 lock — founder 2026-07-20）
    if (order.paymentMethod === PaymentMethod.ONLINE_ESCROW && !order.paymentDeadlineAt) {
      throw new BadRequestException('請先確認訂單（review）先可以付款');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID, paidAt: new Date() },
    });
  }

  // ── SHIP flow transitions ─────────────────────────────────────────────────

  // Seller confirms they shipped to authenticator.
  // Ack v2 (A2): this is PROGRESS not an acknowledgement — SF tracking number
  // is mandatory so the shipment is traceable, not a bare button click.
  async shipToAuthenticator(orderId: string, sellerId: string, trackingNo?: string) {
    const tracking = (trackingNo ?? '').trim();
    if (!tracking) throw new BadRequestException('請提供 SF 運單編號');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Only seller can do this');
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(`Expected PAID, got ${order.status}`);
    }
    if (!order.authenticatorId) {
      throw new BadRequestException('This order has no authenticator — use ship-to-buyer');
    }
    if (MEETUP_METHODS.includes(order.deliveryMethod)) {
      throw new BadRequestException('Meetup orders do not ship — use start-meetup-auth');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SHIPPED_TO_AUTHENTICATOR,
        shippedToAuthAt: new Date(),
        sellerShipTrackingNo: tracking,
      },
    });
  }

  // Seller ships directly to buyer (no authenticator path, SHIP only).
  // Ack v2 (B): tracking mandatory; T+3 auto-complete clock starts here —
  // buyer never acks, only disputes within the window.
  async shipToBuyerDirect(orderId: string, sellerId: string, trackingNo?: string) {
    const tracking = (trackingNo ?? '').trim();
    if (!tracking) throw new BadRequestException('請提供 SF 運單編號');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Only seller can do this');
    if (order.authenticatorId) {
      throw new BadRequestException('This order requires authentication first');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(`Expected PAID, got ${order.status}`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SHIPPED_TO_BUYER,
        shippedToBuyerAt: new Date(),
        sellerShipTrackingNo: tracking,
        autoCompleteAt: new Date(Date.now() + AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Authenticator marks item received (SHIP flow).
  // Ack v2 (A3, founder 2026-07-10): SINGLE ack — straight to AUTHENTICATING.
  // Seller ack removed: SF tracking + authenticator's ≥3 photos are the
  // evidence trail. Legacy AUTH_RECEIVED_PENDING_SELLER_ACK retained for
  // in-flight orders only.
  async markAuthenticatorReceived(orderId: string, userId: string, photos: string[]) {
    if (!Array.isArray(photos) || photos.length < 3) {
      throw new BadRequestException('請至少上載 3 張收件 unboxing 相片');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.SHIPPED_TO_AUTHENTICATOR) {
      throw new BadRequestException(`Expected SHIPPED_TO_AUTHENTICATOR, got ${order.status}`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.AUTHENTICATING,
        authReceiptPhotos: photos,
        authReceiveAckAt: new Date(),
        receivedByAuthAt: new Date(),
      },
    });
  }

  // ── MEETUP flow transitions ──────────────────────────────────────────────

  // Authenticator starts meetup authentication (PAID → AUTHENTICATING, skip shipping)
  async startMeetupAuth(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) {
      throw new ForbiddenException('Only the assigned authenticator can start meetup auth');
    }
    if (!MEETUP_METHODS.includes(order.deliveryMethod)) {
      throw new BadRequestException('This is not a meetup order — use mark-received for SHIP');
    }
    // Custody gate（founder 2026-07-14 拍板）：MEETUP_AUTH 有 custody transfer，
    // 必須經 QR drop-off scan（或電話號碼 fallback）留低證據鏈 — 鑑定師唔可以
    // 自己一鍵 override 直入鑑定（E&O / 爭議仲裁靠 custody 紀錄企得穩）。
    // 呢個 endpoint 而家只服務 MEETUP_3WAY（三方同場，冇 custody transfer）。
    if (order.deliveryMethod === DeliveryMethod.MEETUP_AUTH) {
      throw new BadRequestException(
        'MEETUP_AUTH 必須經 QR 交收（或賣家電話號碼核實）先可以開始鑑定，唔可以直接開始',
      );
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(`Expected PAID, got ${order.status}`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.AUTHENTICATING, receivedByAuthAt: new Date() },
    });
  }

  /**
   * Custody fallback（founder 2026-07-14）：賣家部電冇電/用唔到 QR 時，
   * 以「賣家登記電話號碼」核實身分代替 QR scan。要求同 QR 路一樣嚴：
   *  • 鑑定師輸入賣家口頭提供嘅電話 → 必須 exact match 登記 + 已驗證嘅號碼
   *  • ≥3 張接收相
   *  • custodyVia="PHONE_FALLBACK" audit（QR 路 = "QR"），爭議時查得返邊條路入 custody
   */
  async custodyPhoneFallback(orderId: string, authUserId: string, sellerPhoneInput: string, photos: string[]) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true, seller: { select: { phone: true, phoneVerified: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== authUserId) {
      throw new ForbiddenException('Only the assigned authenticator can confirm custody');
    }
    if (order.deliveryMethod !== DeliveryMethod.MEETUP_AUTH) {
      throw new BadRequestException('電話 fallback 只適用於 MEETUP_AUTH 交收');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(`Expected PAID, got ${order.status}`);
    }
    if (!Array.isArray(photos) || photos.length < 3) {
      throw new BadRequestException('請至少影 3 張接收相片先可以確認交收');
    }
    if (!order.seller.phone || !order.seller.phoneVerified) {
      throw new BadRequestException('賣家冇已驗證嘅電話號碼 — 呢張單用唔到電話 fallback，請聯絡客服');
    }
    const input = normalizeHKPhone(sellerPhoneInput);
    if (!input || input !== order.seller.phone) {
      throw new BadRequestException('電話號碼同賣家登記唔符 — 請向賣家再確認');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CUSTODY,
        custodyHeld: true,
        custodyVia: 'PHONE_FALLBACK',
        handoverPhotos: photos,
        authReceiveAckAt: new Date(),
        receivedByAuthAt: new Date(),
        sellerHandoverAckAt: new Date(),
      },
    });
  }

  // Buyer confirms meetup complete → COMPLETED (skip SHIPPED_TO_BUYER / DELIVERED)
  // Works for:
  //   - MEETUP_AUTH / MEETUP_3WAY + AUTH_PASSED → COMPLETED (鑑定通過，當場交收)
  //   - MEETUP_DIRECT + PAID → COMPLETED (無鑑定，直接面交完成)
  // If ONLINE_ESCROW: releases held funds to seller + authenticator (mock)
  async completeMeetup(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Only buyer can complete meetup');
    if (!MEETUP_METHODS.includes(order.deliveryMethod)) {
      throw new BadRequestException('This is not a meetup order');
    }

    const isDirectMeetup = order.deliveryMethod === DeliveryMethod.MEETUP_DIRECT;

    // Validate correct pre-state
    if (isDirectMeetup) {
      if (order.status !== OrderStatus.PAID) {
        throw new BadRequestException(`Expected PAID for MEETUP_DIRECT, got ${order.status}`);
      }
    } else {
      // MEETUP_AUTH / MEETUP_3WAY — must be AUTH_PASSED
      if (order.status !== OrderStatus.AUTH_PASSED) {
        throw new BadRequestException(`Expected AUTH_PASSED for meetup auth, got ${order.status}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.SOLD },
      });
      if (order.authenticatorId) {
        await tx.authenticator.update({
          where: { id: order.authenticatorId },
          data: { completedCount: { increment: 1 } },
        });
      }
      // Release escrow if applicable (mock — just flip the flag)
      const escrowRelease = order.escrowHeld ? { escrowHeld: false } : {};
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: new Date(),
          cashoutEligibleAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          deliveredAt: new Date(), // meetup = delivery + completion simultaneous
          ...escrowRelease,
        },
      });
    });
  }

  // ── MEETUP_AUTH Dual-Ack Flow ──────────────────────────────────────────
  //
  // Sequence:
  //   PAID → start-meetup-handover → HANDOVER_TO_AUTH
  //        → auth-receive-ack (with ≥3 photos) → SELLER_ACK_PENDING
  //        → seller-handover-ack (after viewing photos) → CUSTODY
  //        → submit-verdict-meetup PASSED → AWAITING_BUYER_PICKUP
  //        → buyer-receive-ack (in-person at store) → COMPLETED + escrow release
  //
  //   FAILED verdict → immediate REFUNDED + auth uploads return photos
  //                 → seller-return-ack (proof, not blocking)
  //
  //   Any party can dispute-meetup → DISPUTED (frozen, external legal resolution)
  //
  // Server-side timeout (cron): SELLER_ACK_PENDING > 7 days → AUTO_CANCELED + refund

  async startMeetupHandover(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.deliveryMethod !== DeliveryMethod.MEETUP_AUTH) {
      throw new BadRequestException('Only MEETUP_AUTH orders support this flow');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(`Expected PAID, got ${order.status}`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.HANDOVER_TO_AUTH },
    });
  }

  /** MEETUP_AUTH Phase A — auth uploads ≥3 photos + acks receipt. Awaits seller-ack. */
  async authReceiveAck(orderId: string, userId: string, photos: string[]) {
    if (!Array.isArray(photos) || photos.length < 3) {
      throw new BadRequestException('請至少上載 3 張接收商品時嘅相片');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.HANDOVER_TO_AUTH) {
      throw new BadRequestException(`Expected HANDOVER_TO_AUTH, got ${order.status}`);
    }
    // Append a new round to handoverHistory (audit trail visible to all 3 parties)
    const history = (order.handoverHistory as unknown as HandoverRound[] | null) ?? [];
    const roundNum = history.length + 1;
    const newRound: HandoverRound = {
      round: roundNum,
      photos,
      uploadedAt: new Date().toISOString(),
    };
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SELLER_ACK_PENDING,
        handoverPhotos: photos,
        authReceiveAckAt: new Date(),
        handoverHistory: [...history, newRound] as any,
      },
    });
    await this.systemMessage(
      orderId,
      roundNum === 1
        ? `📷 鑑定師已上載接收相片（${photos.length} 張），請賣家 view 後確認交付。`
        : `📷 鑑定師已重新上載第 ${roundNum} 次相片（${photos.length} 張），請賣家再次確認。`,
    );
    return updated;
  }

  /** MEETUP_AUTH Phase A — seller views photos + acks. Custody transfers to auth. */
  async sellerHandoverAck(orderId: string, sellerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Only seller can ack');
    if (order.deliveryMethod === DeliveryMethod.MEETUP_AUTH) {
      if (order.status !== OrderStatus.SELLER_ACK_PENDING) {
        throw new BadRequestException(`Expected SELLER_ACK_PENDING, got ${order.status}`);
      }
      // Mark latest round as acked in handoverHistory audit trail
      const history = (order.handoverHistory as unknown as HandoverRound[] | null) ?? [];
      const updatedHistory = history.map((r, i) =>
        i === history.length - 1 ? { ...r, ackedAt: new Date().toISOString() } : r,
      );
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CUSTODY,
          sellerHandoverAckAt: new Date(),
          custodyHeld: true,
          receivedByAuthAt: new Date(), // align with existing SHIP semantic
          handoverHistory: updatedHistory as any,
        },
      });
      await this.systemMessage(
        orderId,
        '✓ 賣家已確認交付，鑑定師正式接管商品。鑑定階段開始。',
      );
      return updated;
    }
    // SHIP path uses same endpoint for consistency
    if (order.status !== OrderStatus.AUTH_RECEIVED_PENDING_SELLER_ACK) {
      throw new BadRequestException(`Expected AUTH_RECEIVED_PENDING_SELLER_ACK, got ${order.status}`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.AUTHENTICATING,
        sellerHandoverAckAt: new Date(),
      },
    });
  }

  /** MEETUP_AUTH verdict — separate from SHIP submitVerdict because of different post-states */
  async submitVerdictMeetup(orderId: string, userId: string, dto: VerdictDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true, listing: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.deliveryMethod !== DeliveryMethod.MEETUP_AUTH) {
      throw new BadRequestException('Use /verdict for non-MEETUP_AUTH orders');
    }
    if (order.status !== OrderStatus.CUSTODY) {
      throw new BadRequestException(`Expected CUSTODY, got ${order.status}`);
    }
    await this.requireEvidence(orderId);
    if (dto.verdict === 'PASSED') {
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.AWAITING_BUYER_PICKUP,
          authVerdict: 'PASSED',
          authNotes: dto.notes ?? null,
          authCompletedAt: new Date(),
        },
      });
      // MEETUP_AUTH PASSED → capture escrow hold (buyer about to pick up at store)
      await this.tryCapturePayment(orderId, 'MEETUP_AUTH_PASSED');
      return updated;
    }
    // FAILED or INCONCLUSIVE: refund buyer immediately, custody held until seller picks up
    return this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.ACTIVE }, // return to active for re-listing? or REMOVED — let seller decide
      });
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.REFUNDED,
          authVerdict: dto.verdict,
          authNotes: dto.notes ?? null,
          authCompletedAt: new Date(),
          escrowHeld: false, // refund release
        },
      });
    });
  }

  /** MEETUP_AUTH Phase C — buyer in-person at auth store, single-ack. Triggers completion + escrow release. */
  async buyerReceiveAck(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Only buyer can ack');
    if (order.deliveryMethod !== DeliveryMethod.MEETUP_AUTH) {
      throw new BadRequestException('Use SHIP confirmDelivered for non-MEETUP_AUTH orders');
    }
    if (order.status !== OrderStatus.AWAITING_BUYER_PICKUP) {
      throw new BadRequestException(`Expected AWAITING_BUYER_PICKUP, got ${order.status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.SOLD },
      });
      if (order.authenticatorId) {
        await tx.authenticator.update({
          where: { id: order.authenticatorId },
          data: { completedCount: { increment: 1 } },
        });
      }
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          buyerReceiveAckAt: new Date(),
          deliveredAt: new Date(),
          completedAt: new Date(),
          cashoutEligibleAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          custodyHeld: false,
          escrowHeld: false, // release
        },
      });
    });
  }

  /** Seller acks they've collected the rejected item back (FAILED return). Does NOT block buyer refund. */
  async sellerReturnAck(orderId: string, sellerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Only seller can ack');
    if (order.status !== OrderStatus.REFUNDED) {
      throw new BadRequestException(`Expected REFUNDED, got ${order.status}`);
    }
    if (!order.returnPhotosUploadedAt) {
      throw new BadRequestException('鑑定師未上載退貨相，唔可以 ack');
    }
    if (order.returnSellerAckAt) {
      throw new BadRequestException('已經 ack 過');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { returnSellerAckAt: new Date(), custodyHeld: false },
    });
  }

  /** Auth uploads return photos for FAILED verdict (separate endpoint, called by auth after seeing seller). */
  async uploadReturnPhotos(orderId: string, userId: string, photos: string[]) {
    if (!Array.isArray(photos) || photos.length < 3) {
      throw new BadRequestException('請至少上載 3 張退貨相片');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.REFUNDED) {
      throw new BadRequestException(`Expected REFUNDED, got ${order.status}`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        returnPhotos: photos,
        returnPhotosUploadedAt: new Date(),
      },
    });
  }

  /** DISPUTED — frozen state, external legal resolution. Restricted to severe cases:
   *  - Custody transferred (CUSTODY onwards) — money/item already substantively in play
   *  - After buyer pickup confirmed — receipt-condition disputes
   *  - SHIP auth-received / delivered states
   *
   *  Pre-custody Phase A disagreements (HANDOVER_TO_AUTH / SELLER_ACK_PENDING) should use
   *  softer options: requestRePhoto or cancelHandover (seller-side only). */
  async disputeMeetup(orderId: string, userId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('請填寫爭議原因');
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const isParty =
      order.buyerId === userId ||
      order.sellerId === userId ||
      order.authenticator?.userId === userId;
    if (!isParty) throw new ForbiddenException('Not a party to this order');
    if (['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(order.status)) {
      throw new BadRequestException(`Cannot dispute order in ${order.status} state`);
    }
    // Seller cannot escalate Phase A states to full DISPUTED — must use soft options
    const isSeller = order.sellerId === userId;
    const phaseAStates: string[] = [OrderStatus.HANDOVER_TO_AUTH, OrderStatus.SELLER_ACK_PENDING];
    if (isSeller && phaseAStates.includes(order.status)) {
      throw new BadRequestException(
        '呢個階段請用「要求重拍相片」或「取消交易」soft options，DISPUTED 留待較嚴重爭議',
      );
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DISPUTED,
        authNotes: order.authNotes ? `${order.authNotes}\n\n[爭議] ${reason.trim()}` : `[爭議] ${reason.trim()}`,
      },
    });
  }

  /** Soft option: seller asks authenticator to re-photograph (back to HANDOVER_TO_AUTH).
   *  No DISPUTED escalation. Capped at MAX_REPHOTO; after cap seller must cancel. */
  async requestRePhoto(
    orderId: string,
    sellerId: string,
    payload: { presets?: string[]; comment?: string } = {},
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Only seller can request re-photo');
    if (order.status !== OrderStatus.SELLER_ACK_PENDING) {
      throw new BadRequestException(`Expected SELLER_ACK_PENDING, got ${order.status}`);
    }
    if (order.rePhotoCount >= MAX_REPHOTO) {
      throw new BadRequestException(
        `已達重拍上限（${MAX_REPHOTO} 次），請確認相片或取消交易`,
      );
    }
    const presets = (payload.presets ?? []).map((s) => s.trim()).filter(Boolean);
    const comment = payload.comment?.trim() || undefined;
    if (presets.length === 0 && !comment) {
      throw new BadRequestException('請至少揀一個拒絕原因或填寫註釋');
    }
    // Mark latest round rejected with structured reason
    const history = (order.handoverHistory as unknown as HandoverRound[] | null) ?? [];
    const nowIso = new Date().toISOString();
    const updatedHistory = history.map((r, i) =>
      i === history.length - 1
        ? { ...r, rejectedAt: nowIso, rejectionPresets: presets, rejectionComment: comment }
        : r,
    );
    const noteParts = [...presets];
    if (comment) noteParts.push(`「${comment}」`);
    const note = `\n\n[賣家要求重拍 #${order.rePhotoCount + 1}] ${noteParts.join(' · ')}`;
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.HANDOVER_TO_AUTH,
        handoverPhotos: [],                          // clear latest snapshot
        authReceiveAckAt: null,
        handoverHistory: updatedHistory as any,
        rePhotoCount: { increment: 1 },
        rePhotoRequestedAt: new Date(),
        authNotes: (order.authNotes ?? '') + note,
      },
    });
    const newCount = order.rePhotoCount + 1;
    const reasonSummary = noteParts.join('；');
    await this.systemMessage(
      orderId,
      `✗ 賣家要求重拍（已用 ${newCount}/${MAX_REPHOTO} 次）：${reasonSummary}`,
    );
    if (newCount >= MAX_REPHOTO) {
      await this.systemMessage(
        orderId,
        `⚠️ 賣家已用盡重拍機會。下一輪相片之後，賣家只能選擇「確認交付」或「取消交易」。`,
      );
    }
    return updated;
  }

  /** Soft option: seller cancels handover before custody starts.
   *  Pre-CUSTODY only. Buyer gets full refund. No DISPUTED escalation. */
  async cancelHandover(orderId: string, sellerId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Only seller can cancel');
    const allowedStates: string[] = [
      OrderStatus.PAID,
      OrderStatus.HANDOVER_TO_AUTH,
      OrderStatus.SELLER_ACK_PENDING,
    ];
    if (!allowedStates.includes(order.status)) {
      throw new BadRequestException(`Can only cancel before custody starts. Got ${order.status}`);
    }
    if (order.deliveryMethod !== DeliveryMethod.MEETUP_AUTH) {
      throw new BadRequestException('Cancel-handover only for MEETUP_AUTH orders');
    }
    const note = reason?.trim() ? `\n\n[賣家取消交易] ${reason.trim()}` : '\n\n[賣家取消交易]';
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.ACTIVE },
      });
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.REFUNDED,
          autoCanceledAt: new Date(),
          escrowHeld: false,
          custodyHeld: false,
          authNotes: (order.authNotes ?? '') + note,
        },
      });
    });
    await this.systemMessage(
      orderId,
      reason?.trim()
        ? `🚫 賣家取消交易：${reason.trim()}。買家獲全額退款，商品重新上架。`
        : '🚫 賣家取消交易。買家獲全額退款，商品重新上架。',
    );
    return result;
  }

  /** Cron: sweep MEETUP_AUTH orders stuck in SELLER_ACK_PENDING > 7 days → auto-cancel + refund. */
  async sweepSellerAckTimeout() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stale = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SELLER_ACK_PENDING,
        authReceiveAckAt: { lt: sevenDaysAgo },
      },
      select: { id: true, listingId: true },
    });
    if (stale.length === 0) return { swept: 0 };
    for (const o of stale) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: o.id, status: OrderStatus.SELLER_ACK_PENDING },
          data: {
            status: OrderStatus.REFUNDED,
            autoCanceledAt: new Date(),
            escrowHeld: false,
            custodyHeld: false,
          },
        });
        await tx.listing.update({
          where: { id: o.listingId },
          data: { status: ListingStatus.ACTIVE },
        });
      });
    }
    return { swept: stale.length };
  }

  /**
   * Ack v2 (A4/B, founder 2026-07-10): sweep SHIPPED_TO_BUYER orders whose
   * autoCompleteAt has elapsed → COMPLETED + escrow release + listing SOLD.
   * Merged clock: cashoutEligibleAt = now（唔再疊加 72hr）。
   * Guards:
   *  - status filter inside the per-row update tx (idempotent — a dispute
   *    filed in the same tick flips status to DISPUTED and the guarded update
   *    silently no-ops, so auto-complete can never race a fresh dispute).
   *  - no-auth orders capture at this moment (mirror confirmDelivered).
   */
  async sweepShipAutoComplete() {
    const due = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SHIPPED_TO_BUYER,
        autoCompleteAt: { not: null, lte: new Date() },
      },
      select: { id: true, listingId: true, authenticatorId: true },
      take: 100,
    });
    let swept = 0;
    for (const o of due) {
      await this.tryCapturePayment(o.id, 'AUTO_COMPLETE_T3');
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          // Guarded: only if STILL SHIPPED_TO_BUYER (dispute race protection)
          where: { id: o.id, status: OrderStatus.SHIPPED_TO_BUYER },
          data: {
            status: OrderStatus.COMPLETED,
            deliveredAt: new Date(),
            completedAt: new Date(),
            cashoutEligibleAt: new Date(),
            escrowHeld: false,
          },
        });
        if (updated.count === 0) return false;
        await tx.listing.update({
          where: { id: o.listingId },
          data: { status: ListingStatus.SOLD },
        });
        if (o.authenticatorId) {
          await tx.authenticator.update({
            where: { id: o.authenticatorId },
            data: { completedCount: { increment: 1 } },
          });
        }
        return true;
      });
      if (result) swept += 1;
    }
    return { swept };
  }

  // ═══ Checkout review + 付款時限（founder 2026-07-20）══════════════════

  /** 買家喺 review step 撳「確認訂單，前往付款」（double confirm）→
   *  呢一刻先 lock 件貨（listing ACTIVE→RESERVED，鬥快先得）+ server 設
   *  30 分鐘 paymentDeadlineAt。Review 階段（未 confirm）完全唔鎖 —
   *  買家有權上返上一頁 edit（founder 2026-07-20）。Idempotent —
   *  重複 call 唔會 reset 個鐘。 */
  async confirmReview(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(`Order status is ${order.status}, not AWAITING_PAYMENT`);
    }
    if (order.paymentDeadlineAt) {
      return { paymentDeadlineAt: order.paymentDeadlineAt }; // 已確認過 — 接續原 deadline
    }

    const deadline = new Date(Date.now() + 30 * 60 * 1000);
    return this.prisma.$transaction(async (tx) => {
      // Guarded reservation：ACTIVE→RESERVED 一擊即中先算贏
      const grabbed = await tx.listing.updateMany({
        where: { id: order.listingId, status: ListingStatus.ACTIVE },
        data: { status: ListingStatus.RESERVED },
      });
      if (grabbed.count === 0) {
        // 唔係 ACTIVE：可能係 (a) 第二個買家搶先 confirm 咗（有另一張
        // 未過期已確認/已付款 order）→ 擋；(b) offer accept 已預留俾呢個
        // 買家 → 照行。
        const conflict = await tx.order.findFirst({
          where: {
            listingId: order.listingId,
            id: { not: orderId },
            OR: [
              { status: OrderStatus.AWAITING_PAYMENT, paymentDeadlineAt: { gt: new Date() } },
              { status: { notIn: [OrderStatus.AWAITING_PAYMENT, OrderStatus.PAYMENT_EXPIRED, OrderStatus.REFUNDED] } },
            ],
          },
          select: { id: true },
        });
        if (conflict) {
          throw new BadRequestException('呢件貨啱啱俾另一位買家確認咗 — 如佢 30 分鐘內未付款會重新開放');
        }
      }
      await tx.order.update({
        where: { id: orderId },
        data: { paymentDeadlineAt: deadline },
      });
      return { paymentDeadlineAt: deadline };
    });
  }

  /** 5 分鐘 cron：確認後 30 分鐘未付款 → PAYMENT_EXPIRED + listing 釋放。
   *  Guards：
   *   - 有 AUTHORIZED/CAPTURED payment（webhook 遲到）→ 跳過，等 webhook 轉 PAID
   *   - 先 void gateway intents 再寫 DB — void 咗之後 gateway confirm 會被拒，
   *     杜絕「過期後先俾錢」race
   *   - server-side analytics event `checkout_payment_expired`（eventId 綁
   *     orderId，unique 保 idempotent） */
  async sweepPaymentExpired() {
    // 未 confirm 嘅 draft（從無 lock 過貨）24 小時後靜靜清走 —
    // 冇 analytics event（唔算「付款過期」）、冇 listing 釋放（本來就冇鎖）。
    await this.prisma.order.updateMany({
      where: {
        status: OrderStatus.AWAITING_PAYMENT,
        paymentDeadlineAt: null,
        createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) },
      },
      data: { status: OrderStatus.PAYMENT_EXPIRED },
    });

    const due = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.AWAITING_PAYMENT,
        paymentDeadlineAt: { not: null, lte: new Date() },
      },
      include: { payments: true, listing: { select: { id: true, title: true } } },
      take: 100,
    });
    let swept = 0;
    for (const o of due) {
      const settled = o.payments.some((p) => p.status === 'AUTHORIZED' || p.status === 'CAPTURED');
      if (settled) continue; // 錢已 hold/扣 — webhook 好快轉 PAID，唔好搶
      // Void every open intent at the gateway FIRST（唔准過期後先 confirm）
      for (const p of o.payments) {
        if (p.status === 'PENDING_AUTH' && p.gatewayRef) {
          try { await stripeAdapter.cancelIntent(p.gatewayRef); } catch { /* mock restart 冇 intent — 冇所謂 */ }
        }
      }
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          // Guarded：期間 webhook 轉咗 PAID 就 no-op
          where: { id: o.id, status: OrderStatus.AWAITING_PAYMENT },
          data: { status: OrderStatus.PAYMENT_EXPIRED, escrowHeld: false },
        });
        if (updated.count === 0) return false;
        await tx.listing.update({
          where: { id: o.listingId },
          data: { status: ListingStatus.ACTIVE },
        });
        await tx.payment.updateMany({
          where: { orderId: o.id, status: 'PENDING_AUTH' },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        return true;
      });
      if (!result) continue;
      swept += 1;
      // Server-side analytics（registry: checkout_payment_expired；spec 2026-07-20）
      const totalHKD = o.salePriceHKD + o.authFeeHKD + o.platformFeeHKD;
      await this.prisma.analyticsEvent
        .create({
          data: {
            eventName: 'checkout_payment_expired',
            eventId: `srv_expired_${o.id}`, // unique → 重跑唔會重複入賬
            occurredAt: new Date(),
            env: (process.env.DATABASE_URL ?? '').includes('authentik_uat') ? 'UAT' : 'PROD',
            portal: 'CONSUMER',
            anonymousId: 'server',
            userId: o.buyerId,
            role: 'BUYER',
            sessionId: 'server',
            pagePath: 'server:cron',
            device: 'SERVER',
            properties: {
              order_id: o.id,
              listing_id: o.listingId,
              tier: tierForPrice(o.salePriceHKD),
              total_hkd: totalHKD,
              buyer_user_id: o.buyerId,
            },
          },
        })
        .catch(() => {}); // eventId unique 撞 = 已記過
      await this.systemMessage(
        o.id,
        `⏰ 訂單因超過 30 分鐘未完成付款已自動取消，貨品已重新上架。如仍想購買請重新落單。`,
      );
    }
    return { swept };
  }

  // ═══ Ack v2 — QR 交收 token（founder 2026-07-10）═══════════════════════
  // Server-issued 短命 nonce：60 秒過期、一次性、綁 order+user+role。
  // 冇 fallback — 買家冇電 = 交收唔到（founder 拍板）。
  // BUYER_PICKUP:   MEETUP_AUTH AWAITING_BUYER_PICKUP，scan+confirm → COMPLETED
  // SELLER_DROPOFF: MEETUP_AUTH PAID，scan+confirm(≥3相) → CUSTODY

  /**
   * Ack v2: buyer disputes a SHIP order inside the T+3 auto-complete window.
   * SHIPPED_TO_BUYER → DISPUTED — halts the auto-complete sweep (guarded
   * update no-ops non-SHIPPED_TO_BUYER rows). Admin resolves via disputes queue.
   */
  async disputeShip(orderId: string, buyerId: string, reason: string) {
    const text = (reason ?? '').trim();
    if (!text) throw new BadRequestException('請講低爭議原因');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Only buyer can dispute');
    if (order.status !== OrderStatus.SHIPPED_TO_BUYER) {
      throw new BadRequestException(`只可以喺寄出後、自動完成前提出爭議（而家係 ${order.status}）`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DISPUTED,
        // Same storage convention as disputeMeetup — append into authNotes.
        authNotes: order.authNotes ? `${order.authNotes}\n\n[爭議] ${text}` : `[爭議] ${text}`,
      },
    });
  }

  /** Buyer/seller fetches a fresh rotating token (client polls every 60s). */
  async issueHandoverToken(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    let role: 'BUYER_PICKUP' | 'SELLER_DROPOFF';
    if (order.buyerId === userId && order.status === OrderStatus.AWAITING_BUYER_PICKUP) {
      role = 'BUYER_PICKUP';
    } else if (
      order.sellerId === userId &&
      order.deliveryMethod === DeliveryMethod.MEETUP_AUTH &&
      order.status === OrderStatus.PAID
    ) {
      role = 'SELLER_DROPOFF';
    } else {
      throw new BadRequestException('呢張訂單而家唔喺可交收狀態');
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 60 * 1000);
    await this.prisma.$transaction([
      // Rotating: invalidate previous unconsumed tokens for this order+user
      this.prisma.qrToken.updateMany({
        where: { orderId, userId, consumedAt: null },
        data: { expiresAt: new Date() },
      }),
      this.prisma.qrToken.create({
        data: { orderId, userId, role, token, expiresAt },
      }),
    ]);
    return { token, expiresAt, role };
  }

  /** Authenticator scans a QR — validates + returns the order card. Does NOT
   *  consume the token; consumption happens on confirm. */
  async scanQrToken(rawToken: string, authUserId: string) {
    const qr = await this.validateQrToken(rawToken, authUserId);
    const order = await this.prisma.order.findUnique({
      where: { id: qr.orderId },
      include: {
        listing: { select: { id: true, title: true, images: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
    });
    return {
      role: qr.role,
      order: {
        id: order!.id,
        status: order!.status,
        salePriceHKD: order!.salePriceHKD,
        listingTitle: order!.listing?.title,
        listingImage: order!.listing?.images?.[0] ?? null,
        counterpartyName: qr.role === 'BUYER_PICKUP' ? order!.buyer?.displayName : order!.seller?.displayName,
      },
    };
  }

  /** Authenticator confirms handover — consumes token + performs transition. */
  async confirmQrHandover(rawToken: string, authUserId: string, photos?: string[]) {
    const qr = await this.validateQrToken(rawToken, authUserId);
    const order = await this.prisma.order.findUnique({ where: { id: qr.orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (qr.role === 'SELLER_DROPOFF') {
      if (!Array.isArray(photos) || photos.length < 3) {
        throw new BadRequestException('請至少影 3 張接收相片先可以確認交收');
      }
      if (order.status !== OrderStatus.PAID) {
        throw new BadRequestException(`Expected PAID, got ${order.status}`);
      }
      return this.prisma.$transaction(async (tx) => {
        await tx.qrToken.update({
          where: { id: qr.id },
          data: { consumedAt: new Date(), consumedBy: authUserId },
        });
        return tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CUSTODY,
            custodyHeld: true,
            custodyVia: 'QR',
            handoverPhotos: photos,
            authReceiveAckAt: new Date(),
            receivedByAuthAt: new Date(),
            // QR scan = seller identity verified in person — records the ack
            sellerHandoverAckAt: new Date(),
          },
        });
      });
    }

    // BUYER_PICKUP → COMPLETED + escrow release（同 buyerReceiveAck 語義）
    if (order.status !== OrderStatus.AWAITING_BUYER_PICKUP) {
      throw new BadRequestException(`Expected AWAITING_BUYER_PICKUP, got ${order.status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.qrToken.update({
        where: { id: qr.id },
        data: { consumedAt: new Date(), consumedBy: authUserId },
      });
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.SOLD },
      });
      if (order.authenticatorId) {
        await tx.authenticator.update({
          where: { id: order.authenticatorId },
          data: { completedCount: { increment: 1 } },
        });
      }
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          buyerReceiveAckAt: new Date(),
          completedAt: new Date(),
          cashoutEligibleAt: new Date(),
          escrowHeld: false,
          custodyHeld: false,
        },
      });
    });
  }

  /** Shared validation: token exists, unexpired, unconsumed, scanner is the
   *  assigned authenticator of the token's order. */
  private async validateQrToken(rawToken: string, authUserId: string) {
    const token = (rawToken ?? '').trim();
    if (!token) throw new BadRequestException('請提供 QR token');
    const qr = await this.prisma.qrToken.findUnique({ where: { token } });
    if (!qr) throw new BadRequestException('QR 碼無效');
    if (qr.consumedAt) throw new BadRequestException('呢個 QR 碼已經用過');
    if (qr.expiresAt < new Date()) {
      throw new BadRequestException('此碼已過期，請對方刷新 App 再出示');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: qr.orderId },
      include: { authenticator: true },
    });
    if (!order || order.authenticator?.userId !== authUserId) {
      throw new ForbiddenException('只有此訂單嘅指定鑑定師可以 scan');
    }
    return qr;
  }

// Authenticator-uploaded verdict-time evidence (video/photo) — separate from the
  // buyer/seller handover photo columns. Stored via StorageService; this just
  // commits the metadata row once the client has already uploaded the file.
  async addEvidence(orderId: string, userId: string, dto: AddEvidenceDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    return this.prisma.orderEvidence.create({
      data: {
        orderId,
        uploaderUserId: userId,
        mediaUrl: dto.mediaUrl,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        kind: dto.kind,
      },
    });
  }

  // Visible to buyer/seller/authenticator of the order — not a public endpoint.
  async getEvidence(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const isParty =
      order.buyerId === userId || order.sellerId === userId || order.authenticator?.userId === userId;
    if (!isParty) throw new ForbiddenException('Not your order');
    return this.prisma.orderEvidence.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  }

  private async requireEvidence(orderId: string) {
    const count = await this.prisma.orderEvidence.count({ where: { orderId } });
    if (count === 0) {
      throw new BadRequestException('請至少上載一個鑑定影片 / 圖片證據先可以提交鑑定結果');
    }
  }

  // Authenticator submits verdict (PASSED / FAILED / INCONCLUSIVE)
  async submitVerdict(orderId: string, userId: string, dto: VerdictDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.AUTHENTICATING) {
      throw new BadRequestException(`Expected AUTHENTICATING, got ${order.status}`);
    }
    await this.requireEvidence(orderId);
    const newStatus =
      dto.verdict === 'PASSED' ? OrderStatus.AUTH_PASSED : OrderStatus.AUTH_FAILED;

    // Ack v2 (D, founder 2026-07-10): MEETUP_3WAY — 三方同場，verdict PASSED
    // 即當場交收，直接 COMPLETED + 放款，買家唔使再 ack（有咩當面傾）。
    // 鑑定師 UI 有「貨物已當面交予買家」checkbox（handedOver）分開記錄
    // 「真」同「交咗貨」兩件事。
    if (order.deliveryMethod === DeliveryMethod.MEETUP_3WAY && newStatus === OrderStatus.AUTH_PASSED) {
      await this.tryCapturePayment(orderId, 'MEETUP_3WAY_PASSED');
      return this.prisma.$transaction(async (tx) => {
        await tx.listing.update({
          where: { id: order.listingId },
          data: { status: ListingStatus.SOLD },
        });
        if (order.authenticatorId) {
          await tx.authenticator.update({
            where: { id: order.authenticatorId },
            data: { completedCount: { increment: 1 } },
          });
        }
        return tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.COMPLETED,
            authVerdict: dto.verdict,
            authNotes: dto.notes ?? null,
            authCompletedAt: new Date(),
            buyerReceiveAckAt: new Date(),
            completedAt: new Date(),
            cashoutEligibleAt: new Date(),
            escrowHeld: false,
          },
        });
      });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        authVerdict: dto.verdict,
        authNotes: dto.notes ?? null,
        authCompletedAt: new Date(),
      },
    });
    // ── ONLINE_ESCROW capture trigger: AUTH_PASSED on SHIP-flow Tier 2/3
    //    (or any order with an authenticator) — funds released from hold.
    if (newStatus === OrderStatus.AUTH_PASSED) {
      await this.tryCapturePayment(orderId, 'AUTH_PASSED');
    }
    return updated;
  }

  // Ship to buyer after AUTH_PASSED. Ack v2 (A4): goods are physically at the
  // authenticator, so the AUTHENTICATOR (or seller, transitional) records the
  // ship-out with a mandatory tracking number. From this moment the item is
  // considered SOLD; T+3 auto-complete clock starts — buyer never acks.
  async shipToBuyer(orderId: string, userId: string, trackingNo?: string) {
    const tracking = (trackingNo ?? '').trim();
    if (!tracking) throw new BadRequestException('請提供 SF 運單編號');
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const isSeller = order.sellerId === userId;
    const isAuth = order.authenticator?.userId === userId;
    if (!isSeller && !isAuth) throw new ForbiddenException('Only seller or assigned authenticator can do this');
    if (order.status !== OrderStatus.AUTH_PASSED) {
      throw new BadRequestException(`Expected AUTH_PASSED, got ${order.status}`);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SHIPPED_TO_BUYER,
        shippedToBuyerAt: new Date(),
        ...(isAuth ? { authShipTrackingNo: tracking } : { sellerShipTrackingNo: tracking }),
        autoCompleteAt: new Date(Date.now() + AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Buyer confirms delivery received (SHIP flow).
  // Founder ruling 2026-06-19: 買家唔需要影任何相 — 佢只係比錢個個，confirm
  // 收到就 OK。影相責任只屬鑑定家（最多賣家），唔涉及買家。
  // → buyer confirms → COMPLETED directly (escrow release + listing SOLD).
  // (Photos param accepted but ignored for backwards-compat; legacy
  // DELIVERED_PENDING_AUTH_ACK state retained for in-flight orders only.)
  async confirmDelivered(orderId: string, buyerId: string, _photos?: string[]) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Only buyer can confirm delivery');
    if (order.status !== OrderStatus.SHIPPED_TO_BUYER) {
      throw new BadRequestException(`Expected SHIPPED_TO_BUYER, got ${order.status}`);
    }
    // No-auth path didn't capture at AUTH_PASSED, so capture now on receipt.
    if (!order.authenticatorId) {
      await this.tryCapturePayment(orderId, 'DELIVERED_NO_AUTH');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.SOLD },
      });
      if (order.authenticatorId) {
        await tx.authenticator.update({
          where: { id: order.authenticatorId },
          data: { completedCount: { increment: 1 } },
        });
      }
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          buyerReceiveAckAt: new Date(),
          deliveredAt: new Date(),
          completedAt: new Date(),
          cashoutEligibleAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          escrowHeld: false,
        },
      });
    });
  }

  /** SHIP with auth: auth views buyer's unboxing photos + acks → COMPLETED + escrow release */
  async authDeliveryAck(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.authenticator?.userId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.DELIVERED_PENDING_AUTH_ACK) {
      throw new BadRequestException(`Expected DELIVERED_PENDING_AUTH_ACK, got ${order.status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.SOLD },
      });
      if (order.authenticatorId) {
        await tx.authenticator.update({
          where: { id: order.authenticatorId },
          data: { completedCount: { increment: 1 } },
        });
      }
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          authDeliveryAckAt: new Date(),
          completedAt: new Date(),
          cashoutEligibleAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          escrowHeld: false,
        },
      });
    });
  }

  // Buyer reviews the authenticator after order completed
  async submitReview(orderId: string, buyerId: string, dto: ReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Only buyer can review');
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Order must be COMPLETED to leave a review');
    }
    if (!order.authenticatorId) {
      throw new BadRequestException('This order has no authenticator to review');
    }
    // Check if already reviewed
    const existing = await this.prisma.authenticatorReview.findUnique({
      where: { orderId },
    });
    if (existing) {
      throw new BadRequestException('You have already reviewed this order');
    }
    // Get buyer name for denormalised display
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerId },
      select: { displayName: true },
    });
    return this.prisma.authenticatorReview.create({
      data: {
        authenticatorId: order.authenticatorId,
        orderId,
        buyerId,
        buyerName: buyer?.displayName ?? 'Anonymous',
        rating: dto.rating,
        comment: dto.comment ?? null,
      },
    });
  }

  // Buyer confirms transaction complete (SHIP flow: DELIVERED → COMPLETED)
  async completeOrder(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Only buyer can complete order');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(`Expected DELIVERED, got ${order.status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: order.listingId },
        data: { status: ListingStatus.SOLD },
      });
      if (order.authenticatorId) {
        await tx.authenticator.update({
          where: { id: order.authenticatorId },
          data: { completedCount: { increment: 1 } },
        });
      }
      const escrowRelease = order.escrowHeld ? { escrowHeld: false } : {};
      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.COMPLETED, completedAt: new Date(),
          cashoutEligibleAt: new Date(Date.now() + 72 * 60 * 60 * 1000), ...escrowRelease },
      });
    });
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Off-platform contact pattern filter
const OFF_PLATFORM_PATTERNS = [
  /\b\d{8}\b/,                          // HK phone (8 digits)
  /\+?852\s*\d{4}\s*\d{4}/,             // +852 phone
  /wa\.me\//i,                           // WhatsApp link
  /chat\.whatsapp\.com/i,
  /t\.me\//i,                            // Telegram link
  /(?:^|\s)@[a-z0-9_]{3,}\b/im,          // @handle (Telegram/IG) — must be at line start or after whitespace
  /\bwhatsapp\b/i,
  /\btelegram\b/i,
  /wechat|微信/i,
  /\bsignal\b/i,
  /\bpayme\b/i,
  /\bfps\b/i,
];

function containsOffPlatformContact(text: string): boolean {
  return OFF_PLATFORM_PATTERNS.some((p) => p.test(text));
}

/** Conversation participant shape returned to client (3-way pill bar UI). */
type PartyDto = {
  id: string;
  displayName: string;
  role: 'BUYER' | 'SELLER' | 'AUTHENTICATOR';
  lastSeenAt?: string | null;
};

/** Pair conversation kinds — for ConversationKind enum (string-typed because
 *  Prisma enum types are weak when stringified across module boundaries). */
export const PAIR_KINDS = ['BUYER_SELLER', 'BUYER_AUTH', 'SELLER_AUTH'] as const;
export type PairKind = typeof PAIR_KINDS[number];
export type ConvKind = 'THREE_WAY' | PairKind;

/** Which roles are valid participants for each pair-kind. */
const PAIR_PARTICIPANT_ROLES: Record<PairKind, Array<'BUYER' | 'SELLER' | 'AUTH'>> = {
  BUYER_SELLER: ['BUYER', 'SELLER'],
  BUYER_AUTH: ['BUYER', 'AUTH'],
  SELLER_AUTH: ['SELLER', 'AUTH'],
};

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Build the parties[] array for the conversation header. Fetches user displayNames
   *  via a single roundtrip. Returns empty array if no parties resolvable. */
  private async buildParties(
    conv: {
      buyerId?: string | null;
      sellerId?: string | null;
      order?: {
        buyerId?: string | null;
        sellerId?: string | null;
        authenticator?: { userId?: string | null; displayName?: string | null; user?: { id: string; displayName: string } | null } | null;
      } | null;
    },
  ): Promise<PartyDto[]> {
    const buyerId = conv.buyerId ?? conv.order?.buyerId ?? null;
    const sellerId = conv.sellerId ?? conv.order?.sellerId ?? null;
    const auth = conv.order?.authenticator ?? null;
    const authUserId = auth?.user?.id ?? auth?.userId ?? null;
    const userIds = [buyerId, sellerId, authUserId].filter((x): x is string => !!x);
    if (userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, lastSeenAt: true, createdAt: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    // Fallback: if user never recorded lastSeenAt (legacy / seed accounts),
    // use createdAt — they must have been online at least once at creation.
    const seenOf = (u?: { lastSeenAt: Date | null; createdAt: Date }) =>
      (u?.lastSeenAt ?? u?.createdAt)?.toISOString() ?? null;
    const out: PartyDto[] = [];
    if (buyerId) {
      const u = byId.get(buyerId);
      out.push({ id: buyerId, displayName: u?.displayName ?? '買家', role: 'BUYER', lastSeenAt: seenOf(u) });
    }
    if (sellerId) {
      const u = byId.get(sellerId);
      out.push({ id: sellerId, displayName: u?.displayName ?? '賣家', role: 'SELLER', lastSeenAt: seenOf(u) });
    }
    if (authUserId) {
      const u = byId.get(authUserId);
      out.push({
        id: authUserId,
        displayName: auth?.displayName ?? u?.displayName ?? '鑑定師',
        role: 'AUTHENTICATOR',
        lastSeenAt: seenOf(u),
      });
    }
    return out;
  }

  /** Build parties[] restricted to a known participant ID set (for pair channels). */
  private async buildPartiesFromIds(
    participantIds: string[],
    context: { buyerId: string | null; sellerId: string | null; authUserId: string | null; authDisplayName: string | null },
  ): Promise<PartyDto[]> {
    if (!participantIds || participantIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, displayName: true, lastSeenAt: true, createdAt: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const out: PartyDto[] = [];
    for (const uid of participantIds) {
      const u = byId.get(uid);
      const name = u?.displayName ?? '使用者';
      let role: PartyDto['role'] = 'BUYER';
      if (uid === context.sellerId) role = 'SELLER';
      else if (uid === context.authUserId) role = 'AUTHENTICATOR';
      else if (uid === context.buyerId) role = 'BUYER';
      const displayName = role === 'AUTHENTICATOR' && context.authDisplayName ? context.authDisplayName : name;
      const seen = (u?.lastSeenAt ?? u?.createdAt)?.toISOString() ?? null;
      out.push({ id: uid, displayName, role, lastSeenAt: seen });
    }
    return out;
  }

  /** Get or create a conversation for an order */
  async getOrCreateConversation(orderId: string, userId: string) {
    // Verify user is a party to this order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: { include: { user: { select: { id: true, displayName: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const authUserId = order.authenticator?.userId;
    const isParty =
      order.buyerId === userId ||
      order.sellerId === userId ||
      authUserId === userId;
    if (!isParty) throw new ForbiddenException('Not your order');

    // Get or create the THREE_WAY conversation for this order
    let conversation = await this.prisma.conversation.findUnique({
      where: { orderId_kind: { orderId, kind: 'THREE_WAY' } },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          orderId,
          kind: 'THREE_WAY',
          participantUserIds: [order.buyerId, order.sellerId, authUserId].filter((x): x is string => !!x),
          messages: {
            create: {
              senderRole: MessageRole.SYSTEM,
              body: '歡迎使用訂單對話。所有訊息均有記錄，用作爭議仲裁。請勿交換私人聯絡方式。',
              readByBuyer: true,
              readBySeller: true,
              readByAuth: true,
            },
          },
        },
      });
    }

    return { conversation, order, authUserId };
  }

  /** Lazy create or fetch a pair (private) channel for an order.
   *  Validates that the calling user is one of the two roles in the pair.
   *  Other parties never see this conversation in their inbox.
   *
   *  Why "lazy"? Avoid creating 3 empty rows per order. User pays a one-time
   *  fetch cost when they first open the pair tab. */
  async getOrCreatePairConversation(orderId: string, kind: PairKind, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { authenticator: { include: { user: { select: { id: true, displayName: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const authUserId = order.authenticator?.userId ?? null;

    // Role assertion: caller must be a participant of the requested pair
    const isBuyer = userId === order.buyerId;
    const isSeller = userId === order.sellerId;
    const isAuth = userId === authUserId;
    const required = PAIR_PARTICIPANT_ROLES[kind];
    const callerIsParty =
      (required.includes('BUYER') && isBuyer) ||
      (required.includes('SELLER') && isSeller) ||
      (required.includes('AUTH') && isAuth);
    if (!callerIsParty) throw new ForbiddenException(`Not a party in ${kind}`);

    // Some kinds need authenticator to exist on the order
    if ((kind === 'BUYER_AUTH' || kind === 'SELLER_AUTH') && !authUserId) {
      throw new BadRequestException('Order has no authenticator — pair channel unavailable');
    }

    // ⚠ Anti-collusion guard (founder ruling):
    //   The buyer-authenticator pairing is decided by the BUYER at checkout.
    //   Until that pair is *committed* (buyer paid → order PAID), the seller
    //   must NOT be able to DM the authenticator — otherwise they could
    //   conspire to fake-pass before the buyer locks in.
    //   After REFUNDED / DISPUTED, the relationship is terminated and the
    //   private channels must close (still preserved in DB for audit).
    const PAIR_BLOCKED_STATUSES = new Set([
      'AWAITING_PAYMENT',  // pair not committed yet (buyer can still cancel)
      'REFUNDED',          // pair was dissolved
      'DISPUTED',          // platform-locked
      'COMPLETED',         // archived
    ]);
    if (PAIR_BLOCKED_STATUSES.has(order.status as string)) {
      throw new BadRequestException(
        `訂單狀態 ${order.status} 不允許開啟私密對話頻道（買賣方未確認 / 已終止）`,
      );
    }

    const participantUserIds: string[] = [];
    if (required.includes('BUYER')) participantUserIds.push(order.buyerId);
    if (required.includes('SELLER')) participantUserIds.push(order.sellerId);
    if (required.includes('AUTH') && authUserId) participantUserIds.push(authUserId);

    let conv = await this.prisma.conversation.findUnique({
      where: { orderId_kind: { orderId, kind } },
    });
    if (!conv) {
      const kindLabel =
        kind === 'BUYER_SELLER' ? '買家 ↔ 賣家'
        : kind === 'BUYER_AUTH' ? '買家 ↔ 鑑定師'
        : '賣家 ↔ 鑑定師';
      conv = await this.prisma.conversation.create({
        data: {
          orderId,
          kind,
          participantUserIds,
          messages: {
            create: {
              senderRole: MessageRole.SYSTEM,
              body: `✉ ${kindLabel} 私密對話頻道開啟。內容只有呢兩方可見，平台會保留 log 供爭議仲裁。`,
              readByBuyer: true, readBySeller: true, readByAuth: true,
            },
          },
        },
      });
    }
    return { conv, order };
  }

  /** Load messages for a conversation */
  async getMessages(orderId: string, userId: string) {
    const { conversation, order, authUserId } = await this.getOrCreateConversation(orderId, userId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderRole: true,
        senderId: true,
        body: true,
        isFiltered: true,
        createdAt: true,
        sender: { select: { id: true, displayName: true } },
      },
    });

    // Mark messages as read for this user's role
    const role = this.getUserRole(userId, order, authUserId);
    await this.markRead(conversation.id, role);

    const parties = await this.buildParties({
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      order: { buyerId: order.buyerId, sellerId: order.sellerId, authenticator: order.authenticator as any },
    });
    return { conversationId: conversation.id, orderId, messages, parties };
  }

  /** Send a message */
  async sendMessage(orderId: string, userId: string, body: string) {
    if (!body?.trim()) throw new BadRequestException('Message body is required');
    if (body.length > 500) throw new BadRequestException('Message too long (max 500 chars)');

    const { conversation, order, authUserId } = await this.getOrCreateConversation(orderId, userId);

    // Check if order is in a terminal/locked state (read still allowed, only send blocked)
    const LOCKED_STATUSES = ['DISPUTED', 'REFUNDED', 'COMPLETED'];
    if (LOCKED_STATUSES.includes(order.status)) {
      const reason =
        order.status === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
        : order.status === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
        : '訂單爭議處理中，對話已鎖定，請聯絡客服。';
      throw new BadRequestException(reason);
    }

    const role = this.getUserRole(userId, order, authUserId);
    const filtered = containsOffPlatformContact(body);

    if (filtered) {
      throw new BadRequestException('訊息包含平台外聯絡資訊，無法發送。平台保障你嘅交易安全，請使用站內功能完成交易。');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        senderRole: role,
        body: body.trim(),
        // Sender has already read their own message
        readByBuyer: role === MessageRole.BUYER,
        readBySeller: role === MessageRole.SELLER,
        readByAuth: role === MessageRole.AUTHENTICATOR,
      },
      select: {
        id: true,
        senderRole: true,
        senderId: true,
        body: true,
        isFiltered: true,
        createdAt: true,
        sender: { select: { id: true, displayName: true } },
      },
    });

    return { message, conversationId: conversation.id };
  }

  // ── Listing-based conversations (pre-order inquiry) ─────────────────────

  /** Get or create a listing conversation for a buyer */
  async getOrCreateListingConversation(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, title: true, status: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId === userId) {
      throw new BadRequestException('不能同自己對話');
    }

    // Get or create
    let conversation = await this.prisma.conversation.findUnique({
      where: { listingId_buyerId: { listingId, buyerId: userId } },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          listingId,
          buyerId: userId,
          sellerId: listing.sellerId,
          messages: {
            create: {
              senderRole: MessageRole.SYSTEM,
              body: `商品查詢：${listing.title}。所有訊息均有記錄。請勿交換私人聯絡方式。`,
              readByBuyer: true,
              readBySeller: true,
              readByAuth: true,
            },
          },
        },
      });
    }

    return { conversation, listing };
  }

  /** Load messages for a listing conversation */
  async getListingMessages(listingId: string, userId: string) {
    const { conversation } = await this.getOrCreateListingConversation(listingId, userId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderRole: true,
        senderId: true,
        body: true,
        isFiltered: true,
        createdAt: true,
        sender: { select: { id: true, displayName: true } },
      },
    });

    // Mark as read
    const isBuyer = conversation.buyerId === userId;
    const readField = isBuyer ? 'readByBuyer' : 'readBySeller';
    await this.prisma.message.updateMany({
      where: { conversationId: conversation.id, [readField]: false },
      data: { [readField]: true },
    });

    const partiesArr = await this.buildParties({
      buyerId: conversation.buyerId,
      sellerId: conversation.sellerId,
      order: null,
    });
    return { conversationId: conversation.id, listingId, messages, parties: partiesArr };
  }

  /** Send a message in a listing conversation */
  async sendListingMessage(listingId: string, userId: string, body: string) {
    if (!body?.trim()) throw new BadRequestException('Message body is required');
    if (body.length > 500) throw new BadRequestException('Message too long (max 500 chars)');

    const { conversation, listing } = await this.getOrCreateListingConversation(listingId, userId);

    if (containsOffPlatformContact(body)) {
      throw new BadRequestException('訊息包含平台外聯絡資訊，無法發送。平台保障你嘅交易安全，請使用站內功能完成交易。');
    }

    const isBuyer = conversation.buyerId === userId;
    const role = isBuyer ? MessageRole.BUYER : MessageRole.SELLER;

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        senderRole: role,
        body: body.trim(),
        readByBuyer: isBuyer,
        readBySeller: !isBuyer,
        readByAuth: false,
      },
      select: {
        id: true,
        senderRole: true,
        senderId: true,
        body: true,
        isFiltered: true,
        createdAt: true,
        sender: { select: { id: true, displayName: true } },
      },
    });

    return { message, conversationId: conversation.id };
  }

  /** Load messages by conversation ID — works for both buyer and seller of a listing conv */
  async getMessagesByConversationId(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        order: {
          select: {
            buyerId: true,
            sellerId: true,
            authenticator: {
              select: {
                userId: true,
                displayName: true,
                user: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        listing: { select: { id: true, title: true, sellerId: true } },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    // Authoritative membership check — for pair channels this correctly
    // excludes the third party (e.g. BUYER_AUTH doesn't include seller).
    if (!conv.participantUserIds?.includes(userId)) {
      throw new ForbiddenException('Not a party to this conversation');
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conv.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderRole: true,
        senderId: true,
        body: true,
        isFiltered: true,
        createdAt: true,
        readByBuyer: true,
        readBySeller: true,
        readByAuth: true,
        sender: { select: { id: true, displayName: true } },
      },
    });

    // Mark as read for the right side
    const isBuyer =
      conv.buyerId === userId || conv.order?.buyerId === userId;
    const isSeller =
      conv.sellerId === userId || conv.order?.sellerId === userId;
    const isAuth = conv.order?.authenticator?.userId === userId;
    const readField = isBuyer ? 'readByBuyer' : isSeller ? 'readBySeller' : isAuth ? 'readByAuth' : null;
    if (readField) {
      await this.prisma.message.updateMany({
        where: { conversationId: conv.id, [readField]: false },
        data: { [readField]: true },
      });
    }

    // Build parties from this conversation's own participantUserIds (so pair
    // channels show only their 2 participants, not all 3 order parties)
    const partiesArr = await this.buildPartiesFromIds(conv.participantUserIds, {
      buyerId: conv.buyerId ?? conv.order?.buyerId ?? null,
      sellerId: conv.sellerId ?? conv.order?.sellerId ?? null,
      authUserId: conv.order?.authenticator?.userId ?? null,
      authDisplayName: conv.order?.authenticator?.displayName ?? null,
    });
    return {
      conversationId: conv.id,
      orderId: conv.orderId,
      listingId: conv.listingId,
      listing: conv.listing,
      messages,
      parties: partiesArr,
      kind: conv.kind,
    };
  }

  /** Send a message by conversation ID — works for both buyer and seller */
  async sendMessageByConversationId(conversationId: string, userId: string, body: string) {
    if (!body?.trim()) throw new BadRequestException('Message body is required');
    if (body.length > 500) throw new BadRequestException('Message too long (max 500 chars)');

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        order: { select: { status: true, buyerId: true, sellerId: true, authenticator: { select: { userId: true } } } },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    // Membership gate FIRST — for pair channels this blocks the third party
    // who happens to be on the order but not in this channel.
    if (!conv.participantUserIds?.includes(userId)) {
      throw new ForbiddenException('Not a party to this conversation');
    }

    if (containsOffPlatformContact(body)) {
      throw new BadRequestException('訊息包含平台外聯絡資訊，無法發送。平台保障你嘅交易安全，請使用站內功能完成交易。');
    }

    // Determine role
    let role: MessageRole;
    if (conv.order) {
      if (conv.order.buyerId === userId) role = MessageRole.BUYER;
      else if (conv.order.sellerId === userId) role = MessageRole.SELLER;
      else if (conv.order.authenticator?.userId === userId) role = MessageRole.AUTHENTICATOR;
      else throw new ForbiddenException('Not a party to this conversation');

      const LOCKED = ['DISPUTED', 'REFUNDED', 'COMPLETED'];
      if (LOCKED.includes(conv.order.status)) {
        throw new BadRequestException('此訂單已鎖定，無法發送訊息');
      }
    } else {
      // Listing conversation
      if (conv.buyerId === userId) role = MessageRole.BUYER;
      else if (conv.sellerId === userId) role = MessageRole.SELLER;
      else throw new ForbiddenException('Not a party to this conversation');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: userId,
        senderRole: role,
        body: body.trim(),
        readByBuyer: role === MessageRole.BUYER,
        readBySeller: role === MessageRole.SELLER,
        readByAuth: role === MessageRole.AUTHENTICATOR,
      },
      select: {
        id: true,
        senderRole: true,
        senderId: true,
        body: true,
        isFiltered: true,
        createdAt: true,
        readByBuyer: true,
        readBySeller: true,
        readByAuth: true,
        sender: { select: { id: true, displayName: true } },
      },
    });

    return { message, conversationId: conv.id };
  }

  /** Get user IDs of all parties to a conversation (order or listing) */
  async getConversationParties(conversationId: string): Promise<string[]> {
    // ⚠ Privacy-critical: must return ONLY this conversation's participants.
    // For pair channels (BUYER_SELLER/BUYER_AUTH/SELLER_AUTH), the third
    // order-party MUST NOT receive a broadcast — they're not in the channel.
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participantUserIds: true },
    });
    return conv?.participantUserIds ?? [];
  }

  /** Get user IDs of all parties to an order (for personal-room broadcast) */
  async getOrderParties(orderId: string): Promise<string[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, sellerId: true, authenticator: { select: { userId: true } } },
    });
    if (!order) return [];
    const ids = [order.buyerId, order.sellerId];
    if (order.authenticator?.userId) ids.push(order.authenticator.userId);
    return ids.filter(Boolean) as string[];
  }

  /** Get user IDs of buyer + seller for a listing conversation */
  async getListingConversationParties(conversationId: string): Promise<string[]> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true, sellerId: true },
    });
    if (!conv) return [];
    return [conv.buyerId, conv.sellerId].filter(Boolean) as string[];
  }

  /**
   * Insert a SYSTEM message into a conversation by conversationId.
   * Returns the created message row (or null if conversation doesn't exist).
   *
   * NOTE: callers used to pass orderId due to historical naming bug; this now
   * always takes conversationId. For order-based flows, look up
   * conversation.id from orderId first.
   */
  async insertSystemMessage(conversationId: string, body: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return null;

    return this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderRole: MessageRole.SYSTEM,
        body,
        readByBuyer: false,
        readBySeller: false,
        readByAuth: false,
      },
      select: {
        id: true, senderRole: true, senderId: true, body: true,
        isFiltered: true, createdAt: true,
        sender: { select: { id: true, displayName: true } },
      },
    });
  }

  /** List all conversations for a user with last message + unread count */
  /** Fast search across the user's conversations. Authoritative scope via
   *  `participantUserIds` (single source of truth — same as listConversations).
   *  Match (case-insensitive substring / id prefix):
   *    - listing.title
   *    - listing.brand
   *    - order.id prefix
   *    - any participant's displayName (auth user's name + counterparties) */
  async searchConversations(userId: string, q: string) {
    const query = q.trim();
    if (!query) return [];
    const lower = query.toLowerCase();

    // Pull all conversations for this user (membership-scoped) — re-uses the
    // same WHERE pattern. For 10k+ scale we'd push the filter into Postgres,
    // but the JOIN on User.displayName makes that messier; client-side filter
    // on already-fetched conv list is fast enough for the foreseeable user.
    const convs = await this.prisma.conversation.findMany({
      where: {
        participantUserIds: { has: userId },
        // Server-side fast prefilter on the easy cases (covers ~95% of typed queries)
        OR: [
          { orderId: { startsWith: query } },
          { listing: { title: { contains: query, mode: 'insensitive' } } },
          { listing: { brand: { contains: query, mode: 'insensitive' } } },
          { order: { listing: { title: { contains: query, mode: 'insensitive' } } } },
          { order: { listing: { brand: { contains: query, mode: 'insensitive' } } } },
          { buyer: { displayName: { contains: query, mode: 'insensitive' } } },
          { seller: { displayName: { contains: query, mode: 'insensitive' } } },
          { order: { buyer: { displayName: { contains: query, mode: 'insensitive' } } } },
          { order: { seller: { displayName: { contains: query, mode: 'insensitive' } } } },
          { order: { authenticator: { displayName: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        order: {
          select: {
            id: true, status: true, buyerId: true, sellerId: true,
            authenticator: { select: { id: true, userId: true, displayName: true } },
            listing: { select: { id: true, title: true, brand: true, images: true } },
            buyer: { select: { id: true, displayName: true } },
            seller: { select: { id: true, displayName: true } },
          },
        },
        listing: { select: { id: true, title: true, brand: true, images: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Hide terminated pair channels (same rule as listConversations)
    const PAIR_HIDE_STATUSES = new Set(['REFUNDED', 'DISPUTED', 'COMPLETED']);
    return convs
      .filter((conv) =>
        conv.kind === 'THREE_WAY' ||
        !conv.order?.status ||
        !PAIR_HIDE_STATUSES.has(conv.order.status as string),
      )
      .map((conv) => {
        const buyer = conv.buyer ?? conv.order?.buyer ?? null;
        const seller = conv.seller ?? conv.order?.seller ?? null;
        const auth = conv.order?.authenticator ?? null;
        const isBuyer = conv.buyerId === userId || conv.order?.buyerId === userId;
        const isAuth = auth?.userId === userId;
        const counterparty =
          isAuth
            ? { displayName: `${buyer?.displayName ?? '買家'} / ${seller?.displayName ?? '賣家'}` }
            : isBuyer
              ? (seller ?? { displayName: '賣家' })
              : (buyer ?? { displayName: '買家' });
        return {
          id: conv.id,
          orderId: conv.order?.id ?? null,
          listingId: conv.listing?.id ?? conv.order?.listing?.id ?? null,
          type: conv.orderId ? 'order' : 'listing',
          kind: conv.kind,
          orderStatus: conv.order?.status ?? null,
          counterparty,
          listing: conv.listing ?? conv.order?.listing ?? null,
          unread: 0,  // search results don't compute unread (UI shows it via listConversations cache anyway)
          createdAt: conv.createdAt,
        };
      });
  }

  async listConversations(userId: string) {
    // Membership single source of truth: Conversation.participantUserIds
    // is populated at create-time and never mutates. Avoids lesson #6
    // (multi-role WHERE drift) entirely — pair channels naturally hide
    // from non-participants because their userId isn't in the array.
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participantUserIds: { has: userId },
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            buyerId: true,
            sellerId: true,
            authenticator: {
              select: {
                id: true,
                userId: true,
                displayName: true,
                user: { select: { id: true, displayName: true } },
              },
            },
            listing: { select: { id: true, title: true, images: true } },
            buyer: { select: { id: true, displayName: true } },
            seller: { select: { id: true, displayName: true } },
          },
        },
        listing: { select: { id: true, title: true, images: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Hide pair channels (private DMs) once the order is terminated.
    // THREE_WAY stays visible because it carries SYSTEM audit messages.
    const PAIR_HIDE_STATUSES = new Set(['REFUNDED', 'DISPUTED', 'COMPLETED']);
    const result = [];
    for (const conv of conversations) {
      if (
        conv.kind !== 'THREE_WAY' &&
        conv.order?.status &&
        PAIR_HIDE_STATUSES.has(conv.order.status as string)
      ) {
        continue;
      }
      // Skip conversations that only contain the SYSTEM bootstrap message —
      // they clutter the messages list as "empty frames". User can still
      // reach them via the order/listing detail page if they want to start
      // a conversation. Surface only conversations someone has actually used.
      const hasHumanMessage = await this.prisma.message.count({
        where: {
          conversationId: conv.id,
          deletedAt: null,
          senderRole: { not: 'SYSTEM' as any },
        },
      });
      if (hasHumanMessage === 0) continue;

      // Get last message
      const lastMessage = await this.prisma.message.findFirst({
        where: { conversationId: conv.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { body: true, senderRole: true, createdAt: true },
      });

      // Determine viewer's role in this conversation
      const isBuyer =
        conv.buyerId === userId || conv.order?.buyerId === userId;
      const isSeller =
        conv.sellerId === userId || conv.order?.sellerId === userId;
      const isAuth =
        conv.order?.authenticator?.userId === userId;

      const readField = isBuyer ? 'readByBuyer' : isSeller ? 'readBySeller' : isAuth ? 'readByAuth' : 'readByBuyer';

      const unread = await this.prisma.message.count({
        where: { conversationId: conv.id, [readField]: false, deletedAt: null },
      });

      // Determine counterparty (best-effort label)
      let counterparty: { id?: string; displayName: string };
      if (isAuth) {
        // Authenticator viewing → counterparty is buyer + seller pair
        const buyerName = conv.order?.buyer?.displayName ?? '買家';
        const sellerName = conv.order?.seller?.displayName ?? '賣家';
        counterparty = { displayName: `${buyerName} / ${sellerName}` };
      } else if (isBuyer) {
        counterparty = conv.seller ?? conv.order?.seller ?? { displayName: '賣家' };
      } else {
        counterparty = conv.buyer ?? conv.order?.buyer ?? { displayName: '買家' };
      }

      // Determine listing info
      const listingInfo = conv.listing ?? conv.order?.listing ?? null;

      // Build parties from THIS conversation's own participantUserIds — for
      // pair channels we MUST exclude the third party, else owner label dedupes
      // (e.g. THREE_WAY / BUYER_SELLER / SELLER_AUTH would all label "Alice + Milan").
      const partiesArr = await this.buildPartiesFromIds(conv.participantUserIds, {
        buyerId: conv.buyerId ?? conv.order?.buyerId ?? null,
        sellerId: conv.sellerId ?? conv.order?.sellerId ?? null,
        authUserId: conv.order?.authenticator?.userId ?? null,
        authDisplayName: conv.order?.authenticator?.displayName ?? conv.order?.authenticator?.user?.displayName ?? null,
      });

      result.push({
        id: conv.id,
        orderId: conv.order?.id ?? null,
        listingId: conv.listing?.id ?? conv.order?.listing?.id ?? null,
        type: conv.orderId ? 'order' : 'listing',
        kind: conv.kind,
        orderStatus: conv.order?.status ?? null,
        counterparty,
        parties: partiesArr,
        listing: listingInfo,
        lastMessage,
        unread,
        createdAt: conv.createdAt,
      });
    }

    // WhatsApp-style: sort purely by last-message recency (desc).
    // Unread state is shown via the badge — sorting by unread-first would
    // push 5-day-old unread above current activity, which feels stale.
    result.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.createdAt;
      const bTime = b.lastMessage?.createdAt ?? b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return result;
  }

  /** Get unread count for a user across all conversations (order + listing) */
  async getUnreadCount(userId: string) {
    // Same membership-via-participantUserIds principle as listConversations
    const conversations = await this.prisma.conversation.findMany({
      where: { participantUserIds: { has: userId } },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        order: {
          select: {
            buyerId: true,
            sellerId: true,
            authenticator: { select: { userId: true } },
          },
        },
      },
    });

    let total = 0;
    for (const conv of conversations) {
      const isBuyer = conv.buyerId === userId || conv.order?.buyerId === userId;
      const isSeller = conv.sellerId === userId || conv.order?.sellerId === userId;
      const isAuth = conv.order?.authenticator?.userId === userId;
      const readField = isBuyer ? 'readByBuyer' : isSeller ? 'readBySeller' : isAuth ? 'readByAuth' : 'readByBuyer';

      const unread = await this.prisma.message.count({
        where: {
          conversationId: conv.id,
          [readField]: false,
          deletedAt: null,
        },
      });
      total += unread;
    }

    return { unread: total };
  }

  /** Mark all messages in a conversation as read for a role */
  private async markRead(conversationId: string, role: MessageRole) {
    const field =
      role === MessageRole.BUYER ? 'readByBuyer'
      : role === MessageRole.SELLER ? 'readBySeller'
      : role === MessageRole.AUTHENTICATOR ? 'readByAuth'
      : null;

    if (!field) return;

    await this.prisma.message.updateMany({
      where: { conversationId, [field]: false },
      data: { [field]: true },
    });
  }

  /** Determine user's role in an order */
  private getUserRole(userId: string, order: any, authUserId?: string | null): MessageRole {
    if (order.buyerId === userId) return MessageRole.BUYER;
    if (order.sellerId === userId) return MessageRole.SELLER;
    if (authUserId === userId) return MessageRole.AUTHENTICATOR;
    throw new ForbiddenException('Not a party to this order');
  }

  /** Mark all unread messages in a conversation as read for the given user.
   *  Determines the user's role automatically from conversation membership. */
  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        buyerId: true, sellerId: true,
        order: { select: { buyerId: true, sellerId: true, authenticator: { select: { userId: true } } } },
      },
    });
    if (!conv) return;

    const isBuyer = conv.buyerId === userId || conv.order?.buyerId === userId;
    const isSeller = conv.sellerId === userId || conv.order?.sellerId === userId;
    const isAuth = conv.order?.authenticator?.userId === userId;
    const field = isBuyer ? 'readByBuyer' : isSeller ? 'readBySeller' : isAuth ? 'readByAuth' : null;
    if (!field) return;

    await this.prisma.message.updateMany({
      where: { conversationId, [field]: false },
      data: { [field]: true },
    });
  }

  /** Update User.lastSeenAt to now (called on socket connect/disconnect). */
  async updateLastSeen(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  }

  /** Return all conv: room names for conversations this user is a participant in.
   *  Used by presence broadcast to notify all relevant parties. */
  async getUserConversationRooms(userId: string): Promise<string[]> {
    const convs = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
          { participantUserIds: { has: userId } },
        ],
      },
      select: { id: true },
      take: 200,
    });
    return convs.map((c) => `conv:${c.id}`);
  }

  /** Get all unique user IDs that share a conversation with the given user.
   *  Used by gateway to broadcast presence events to peers' user rooms. */
  async getConversationPeerIds(userId: string): Promise<string[]> {
    const convs = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
          { participantUserIds: { has: userId } },
        ],
      },
      select: { buyerId: true, sellerId: true, participantUserIds: true },
      take: 200,
    });
    const peerSet = new Set<string>();
    for (const c of convs) {
      if (c.buyerId && c.buyerId !== userId) peerSet.add(c.buyerId);
      if (c.sellerId && c.sellerId !== userId) peerSet.add(c.sellerId);
      for (const uid of c.participantUserIds) {
        if (uid !== userId) peerSet.add(uid);
      }
    }
    return Array.from(peerSet);
  }

  /** Determine a user's MessageRole in a conversation (returns null if not a party). */
  async getUserRoleInConversation(conversationId: string, userId: string): Promise<MessageRole | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        buyerId: true, sellerId: true,
        order: { select: { buyerId: true, sellerId: true, authenticator: { select: { userId: true } } } },
      },
    });
    if (!conv) return null;
    if (conv.buyerId === userId || conv.order?.buyerId === userId) return MessageRole.BUYER;
    if (conv.sellerId === userId || conv.order?.sellerId === userId) return MessageRole.SELLER;
    if (conv.order?.authenticator?.userId === userId) return MessageRole.AUTHENTICATOR;
    return null;
  }
}

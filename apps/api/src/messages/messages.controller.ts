import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { MessagesService, PAIR_KINDS, type PairKind } from './messages.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** List all conversations for the current user */
  @Get('list')
  listConversations(@CurrentUser() user: CurrentUserData) {
    return this.messages.listConversations(user.userId);
  }

  /** Get total unread count across all conversations */
  @Get('unread')
  getUnreadCount(@CurrentUser() user: CurrentUserData) {
    return this.messages.getUnreadCount(user.userId);
  }

  /** Search the user's conversations by counterparty / listing / brand / id prefix.
   *  Scoped via participantUserIds (same authority as listConversations). */
  @Get('search')
  searchConversations(
    @CurrentUser() user: CurrentUserData,
    @Query('q') q?: string,
  ) {
    return this.messages.searchConversations(user.userId, q ?? '');
  }

  /** Load conversation + messages for an order */
  @Get('order/:orderId')
  getOrderMessages(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
  ) {
    return this.messages.getMessages(orderId, user.userId);
  }

  /** Load conversation + messages for a listing inquiry */
  @Get('listing/:listingId')
  getListingMessages(
    @CurrentUser() user: CurrentUserData,
    @Param('listingId') listingId: string,
  ) {
    return this.messages.getListingMessages(listingId, user.userId);
  }

  /** Load conversation by ID — works for both buyer and seller */
  @Get('by-id/:conversationId')
  getByConversationId(
    @CurrentUser() user: CurrentUserData,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messages.getMessagesByConversationId(conversationId, user.userId);
  }

  /** Lazy-fetch (or create) a private pair channel for an order.
   *  :kind must be BUYER_SELLER | BUYER_AUTH | SELLER_AUTH.
   *  Caller must be a participant of the requested pair, else 403. */
  @Get('order/:orderId/pair/:kind')
  async getPair(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
    @Param('kind') kindRaw: string,
  ) {
    if (!PAIR_KINDS.includes(kindRaw as PairKind)) {
      throw new BadRequestException(`Invalid kind: ${kindRaw}`);
    }
    const { conv } = await this.messages.getOrCreatePairConversation(
      orderId, kindRaw as PairKind, user.userId,
    );
    // Reuse the by-id loader so client gets messages + parties + kind
    return this.messages.getMessagesByConversationId(conv.id, user.userId);
  }
}

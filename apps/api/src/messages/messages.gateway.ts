import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MessagesService } from './messages.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Map socket.id → userId for cleanup
  private socketUserMap = new Map<string, string>();

  constructor(
    private readonly messages: MessagesService,
    private readonly jwt: JwtService,
  ) {}

  /** Authenticate on connect via token query param */
  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify(token);
      const userId = payload.sub;
      (client as any).userId = userId;
      this.socketUserMap.set(client.id, userId);
      // Auto-join personal room so seller/buyer/auth can receive real-time
      // messages for any of their conversations without explicit joins.
      client.join(`user:${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.socketUserMap.delete(client.id);
  }

  /** Client joins a conversation room (order-based, listing-based, or by conversationId) */
  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId?: string; listingId?: string; conversationId?: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    try {
      if (data?.conversationId) {
        // Generic path: verify access by loading messages, then join conv room
        await this.messages.getMessagesByConversationId(data.conversationId, userId);
        client.join(`conv:${data.conversationId}`);
        client.emit('joined', { conversationId: data.conversationId });
      } else if (data?.orderId) {
        await this.messages.getMessages(data.orderId, userId);
        const room = `order:${data.orderId}`;
        client.join(room);
        client.emit('joined', { orderId: data.orderId });
      } else if (data?.listingId) {
        const { conversation } = await this.messages.getOrCreateListingConversation(data.listingId, userId);
        client.join(`conv:${conversation.id}`);
        client.emit('joined', { listingId: data.listingId, conversationId: conversation.id });
      }
    } catch (e: any) {
      client.emit('error', { message: e.message ?? 'Cannot join conversation' });
    }
  }

  /** Client leaves a conversation room */
  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId?: string; listingId?: string },
  ) {
    if (data?.orderId) client.leave(`order:${data.orderId}`);
    if (data?.listingId) {
      const userId = (client as any).userId;
      client.leave(`listing:${data.listingId}:${userId}`);
    }
  }

  /** Client sends a message */
  @SubscribeMessage('send')
  async handleSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId?: string; listingId?: string; conversationId?: string; body: string },
  ) {
    const userId = (client as any).userId;
    if (!userId || !data?.body) return;

    try {
      if (data.conversationId) {
        const { message, conversationId } = await this.messages.sendMessageByConversationId(data.conversationId, userId, data.body);
        const payload = { ...message, conversationId };
        this.server.to(`conv:${conversationId}`).emit('message', payload);
        const parties = await this.messages.getConversationParties(conversationId);
        for (const uid of parties) {
          this.server.to(`user:${uid}`).emit('message', payload);
        }
        return;
      }
      if (data.orderId) {
        const { message, conversationId } = await this.messages.sendMessage(data.orderId, userId, data.body);
        const payload = { ...message, conversationId };
        this.server.to(`order:${data.orderId}`).emit('message', payload);
        // Also broadcast to involved users' personal rooms (covers offline-room cases)
        const parties = await this.messages.getOrderParties(data.orderId);
        for (const uid of parties) {
          this.server.to(`user:${uid}`).emit('message', payload);
        }
      } else if (data.listingId) {
        const { message, conversationId } = await this.messages.sendListingMessage(data.listingId, userId, data.body);
        const payload = { ...message, conversationId };
        this.server.to(`conv:${conversationId}`).emit('message', payload);
        // Broadcast to both buyer + seller personal rooms so seller receives
        // even though they didn't explicitly join the listing room.
        const parties = await this.messages.getListingConversationParties(conversationId);
        for (const uid of parties) {
          this.server.to(`user:${uid}`).emit('message', payload);
        }
      }
    } catch (e: any) {
      client.emit('error', { message: e.message ?? 'Failed to send message' });
    }
  }

  /** Client is typing */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId?: string; listingId?: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    if (data?.orderId) {
      client.to(`order:${data.orderId}`).emit('typing', { userId });
    }
    // For listing conversations, broadcast via conv room
  }

  /** Utility: broadcast a system message to a room (called from service) */
  broadcastSystemMessage(orderId: string, message: any) {
    this.server.to(`order:${orderId}`).emit('message', message);
  }

  /**
   * Generic: broadcast any message to a conversation (covers both order-based
   * and listing-based). Emits to the conv room + each party's personal room
   * so receivers get it even if they joined via a different alias.
   *
   * Called when a server-side insert (e.g. Offer sentinel message,
   * insertSystemMessage) needs to reach connected clients without going
   * through the client `send` event.
   */
  async broadcastToConversation(conversationId: string, message: any) {
    const payload = { ...message, conversationId };
    this.server.to(`conv:${conversationId}`).emit('message', payload);
    const parties = await this.messages.getConversationParties(conversationId);
    for (const uid of parties) {
      this.server.to(`user:${uid}`).emit('message', payload);
    }
  }
}

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
      client.join(`user:${userId}`);

      // Update lastSeenAt + broadcast online presence to conv rooms + peer user rooms
      await this.messages.updateLastSeen(userId);
      const rooms = await this.messages.getUserConversationRooms(userId);
      for (const room of rooms) {
        client.to(room).emit('presence', { userId, online: true });
      }
      const peerIds = await this.messages.getConversationPeerIds(userId);
      for (const peerId of peerIds) {
        client.to(`user:${peerId}`).emit('presence', { userId, online: true });
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketUserMap.get(client.id);
    this.socketUserMap.delete(client.id);
    if (!userId) return;

    // Update lastSeenAt + broadcast offline presence to conv rooms + peer user rooms
    const lastSeenAt = new Date().toISOString();
    try {
      await this.messages.updateLastSeen(userId);
      const rooms = await this.messages.getUserConversationRooms(userId);
      for (const room of rooms) {
        this.server.to(room).emit('presence', { userId, online: false, lastSeenAt });
      }
      const peerIds = await this.messages.getConversationPeerIds(userId);
      for (const peerId of peerIds) {
        this.server.to(`user:${peerId}`).emit('presence', { userId, online: false, lastSeenAt });
      }
    } catch {
      // Swallow: user may have been deleted
    }
  }

  /** Client joins a conversation room */
  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId?: string; listingId?: string; conversationId?: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    try {
      if (data?.conversationId) {
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
    @MessageBody() data: { orderId?: string; listingId?: string; conversationId?: string },
  ) {
    if (data?.conversationId) client.leave(`conv:${data.conversationId}`);
    if (data?.orderId) client.leave(`order:${data.orderId}`);
    if (data?.listingId) {
      const userId = (client as any).userId;
      client.leave(`listing:${data.listingId}:${userId}`);
    }
  }

  /** Client sends a message. Returns ack { ok, tempId } to sender. */
  @SubscribeMessage('send')
  async handleSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      orderId?: string;
      listingId?: string;
      conversationId?: string;
      body: string;
      tempId?: string; // client-generated optimistic ID
    },
  ) {
    const userId = (client as any).userId;
    if (!userId || !data?.body) return { ok: false, error: 'Missing body' };

    try {
      if (data.conversationId) {
        const { message, conversationId } = await this.messages.sendMessageByConversationId(data.conversationId, userId, data.body);
        const payload = { ...message, conversationId, tempId: data.tempId };
        this.server.to(`conv:${conversationId}`).emit('message', payload);
        const parties = await this.messages.getConversationParties(conversationId);
        for (const uid of parties) {
          // client.to() excludes the sender's pane socket (which already got it from conv room).
          // Other sockets of the same user (e.g. /messages sidebar) still receive via user room.
          client.to(`user:${uid}`).emit('message', payload);
        }
        return { ok: true, tempId: data.tempId };
      }
      if (data.orderId) {
        const { message, conversationId } = await this.messages.sendMessage(data.orderId, userId, data.body);
        const payload = { ...message, conversationId, tempId: data.tempId };
        this.server.to(`order:${data.orderId}`).emit('message', payload);
        const parties = await this.messages.getOrderParties(data.orderId);
        for (const uid of parties) {
          client.to(`user:${uid}`).emit('message', payload);
        }
        return { ok: true, tempId: data.tempId };
      }
      if (data.listingId) {
        const { message, conversationId } = await this.messages.sendListingMessage(data.listingId, userId, data.body);
        const payload = { ...message, conversationId, tempId: data.tempId };
        this.server.to(`conv:${conversationId}`).emit('message', payload);
        const parties = await this.messages.getListingConversationParties(conversationId);
        for (const uid of parties) {
          client.to(`user:${uid}`).emit('message', payload);
        }
        return { ok: true, tempId: data.tempId };
      }
      return { ok: false, error: 'No conversation context' };
    } catch (e: any) {
      client.emit('error', { message: e.message ?? 'Failed to send message' });
      return { ok: false, error: e.message, tempId: data.tempId };
    }
  }

  /** Client is typing — now includes conversationId + role for all conv kinds */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      orderId?: string;
      listingId?: string;
      conversationId?: string;
      role?: string;
    },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;
    const payload = { userId, role: data?.role };

    if (data?.conversationId) {
      client.to(`conv:${data.conversationId}`).emit('typing', payload);
    } else if (data?.orderId) {
      client.to(`order:${data.orderId}`).emit('typing', payload);
    }
    // listingId: listing conv always uses conversationId path after join
  }

  /** Client marks a conversation as read — updates DB + broadcasts read_update */
  @SubscribeMessage('read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = (client as any).userId;
    if (!userId || !data?.conversationId) return;

    try {
      await this.messages.markConversationRead(data.conversationId, userId);
      const role = await this.messages.getUserRoleInConversation(data.conversationId, userId);
      if (!role) return;
      const payload = { conversationId: data.conversationId, role, userId };
      // Broadcast to all parties in the conv room (so they see double-tick update)
      this.server.to(`conv:${data.conversationId}`).emit('read_update', payload);
      const parties = await this.messages.getConversationParties(data.conversationId);
      for (const uid of parties) {
        this.server.to(`user:${uid}`).emit('read_update', payload);
      }
    } catch {
      // Swallow: conv may not exist
    }
  }

  /** Utility: broadcast a system message to a room (called from service) */
  broadcastSystemMessage(orderId: string, message: any) {
    this.server.to(`order:${orderId}`).emit('message', message);
  }

  /**
   * Generic: broadcast any message to a conversation.
   * Called when a server-side insert needs to reach connected clients.
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

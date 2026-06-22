'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { MessageCircle } from 'lucide-react';
import { formatChatTime } from '@authentik/utils';
import { api, hasToken, clearToken, getToken } from '@/lib/api';
import { ConversationPane } from '@/components/conversation-pane';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ConvSummary {
  id: string;
  orderId: string | null;
  listingId: string | null;
  type: 'order' | 'listing';
  orderStatus: string | null;
  counterparty: { id?: string; displayName: string };
  listing: { id: string; title: string; images: string[] } | null;
  lastMessage: { body: string; senderRole: string; createdAt: string } | null;
  unread: number;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  BUYER: '買家', SELLER: '賣家', AUTHENTICATOR: '你', SYSTEM: '系統',
};

// timeAgo deprecated — use formatChatTime SSOT from @authentik/utils (WhatsApp-style)

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  // Fast search — client-side filter on already-loaded conversations.
  // Foreseen: 10k+ messages → API /conversations/search exists as a hedge;
  // current scale (<100 convs per user) → client filter = zero-latency.
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    Promise.all([api.me(), api.conversations.list()])
      .then(([meData, convList]) => {
        setMe({ id: meData.id });
        setConversations(convList);
      })
      .catch((e: any) => {
        if (e?.status === 401) { clearToken(); router.replace('/login'); }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const activeConvIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<ConvSummary[]>([]);
  conversationsRef.current = conversations;
  activeConvIdRef.current = activeConvId;

  function refreshList() {
    api.conversations.list().then(setConversations).catch(() => {});
  }
  function openConv(id: string) {
    setActiveConvId(id);
    // Optimistic: opening a conv marks it as read locally (Approach A).
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, unread: 0 } : c));
  }
  function backToList() { setActiveConvId(null); refreshList(); }

  // ── Approach A (P0 + P1): Page-level WebSocket subscription ──────────────
  // Server broadcasts to `user:{userId}` for every conversation participant
  // (messages.gateway.ts + getConversationParties via participantUserIds SSOT —
  // Lesson #6 covered for all 3 roles including AUTHENTICATOR).
  // P1: on (re)connect → refreshList() to recover any events fired offline.
  useEffect(() => {
    if (!me?.id) return;
    const token = getToken();
    if (!token) return;

    const socket: Socket = io(`${API_URL}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      refreshList(); // P1 reconnect-recovery
    });

    socket.on('message', (msg: { conversationId: string; body: string; senderRole: string; createdAt: string; senderId?: string }) => {
      const list = conversationsRef.current;
      const idx = list.findIndex((c) => c.id === msg.conversationId);
      if (idx === -1) {
        refreshList(); // new conv just became visible
        return;
      }
      const isActive = activeConvIdRef.current === msg.conversationId;
      const isMine = msg.senderId === me.id;
      setConversations((prev) => {
        const i = prev.findIndex((c) => c.id === msg.conversationId);
        if (i === -1) return prev;
        const target = prev[i]!;
        const updated: ConvSummary = {
          ...target,
          lastMessage: { body: msg.body, senderRole: msg.senderRole, createdAt: msg.createdAt },
          unread: (isActive || isMine) ? 0 : (target.unread ?? 0) + 1,
        };
        const without = prev.filter((_, k) => k !== i);
        return [updated, ...without];
      });
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  // Filter — substring on counterparty / listing.title / brand / order id prefix
  const qLower = query.trim().toLowerCase();
  const visibleConvs = qLower
    ? conversations.filter((c) => {
        if (c.orderId && c.orderId.toLowerCase().startsWith(qLower)) return true;
        if ((c.counterparty?.displayName ?? '').toLowerCase().includes(qLower)) return true;
        if ((c.listing?.title ?? '').toLowerCase().includes(qLower)) return true;
        const brand = (c.listing as any)?.brand ?? '';
        if (brand && brand.toLowerCase().includes(qLower)) return true;
        return false;
      })
    : conversations;
  const noResults = !!qLower && visibleConvs.length === 0;

  const sidebar = (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-slate-200 bg-white md:w-72">
      <div className="border-b border-slate-100 px-4 py-3">
        <h1 className="font-display text-lg font-bold">訊息</h1>
        <p className="text-[11px] text-slate-400">
          {qLower ? `${visibleConvs.length}/${conversations.length}` : conversations.length} 個對話
          {conversations.filter((c) => c.unread > 0).length > 0 && (
            <span className="ml-1 text-red-600">
              · {conversations.filter((c) => c.unread > 0).length} 個未讀
            </span>
          )}
        </p>
        {/* Fast search — counterparty / listing / brand / order id prefix */}
        <div className="relative mt-2">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋客人、商品或訂單 ID"
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-6 pr-7 text-xs outline-none transition focus:border-brand-400 focus:bg-white"
            aria-label="搜尋對話"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute inset-y-0 right-1 my-0.5 rounded px-1.5 text-[10px] text-slate-500 hover:bg-slate-100"
              aria-label="清除搜尋"
            >✕</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="px-4 py-8 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">暫無對話</p>
            <p className="mt-1 text-xs text-slate-400">
              收到鑑定訂單時，買賣雙方對話會出現喺度。
            </p>
          </div>
        )}

        {!loading && noResults && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs font-medium text-slate-700">揾唔到符合「{query.trim()}」嘅對話</p>
            <p className="mt-1 text-[10px] text-slate-400">
              試客人名、商品名、品牌或訂單 ID 首 8 字。
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[10px] hover:bg-slate-50"
            >
              清除搜尋
            </button>
          </div>
        )}

        {!loading && visibleConvs.map((conv) => {
          const img = conv.listing?.images?.[0];
          const preview = conv.lastMessage
            ? `${ROLE_LABEL[conv.lastMessage.senderRole] ?? ''}：${conv.lastMessage.body}`
            : '新對話';
          const isActive = conv.id === activeConvId;

          return (
            <button
              key={conv.id}
              onClick={() => openConv(conv.id)}
              className={`flex w-full items-start gap-2.5 border-l-2 px-3 py-2.5 text-left transition ${
                isActive
                  ? 'border-brand-600 bg-brand-50'
                  : conv.unread > 0
                    ? 'border-transparent bg-brand-50/30 hover:bg-slate-50'
                    : 'border-transparent hover:bg-slate-50'
              }`}
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {img
                  ? <img src={img} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-base">
                      {conv.type === 'order' ? '📦' : '🛍️'}
                    </div>
                }
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {conv.counterparty.displayName}
                  </p>
                  <span className="shrink-0 text-[9px] text-slate-400">
                    {conv.lastMessage ? formatChatTime(conv.lastMessage.createdAt) : ''}
                  </span>
                </div>
                <p className="truncate text-[11px] text-slate-500">{conv.listing?.title ?? ''}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-400">{preview.slice(0, 50)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {conv.unread > 0 && !isActive && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {conv.unread}
                  </span>
                )}
                <span className={`rounded-full px-1.5 py-0 text-[8px] font-medium ${
                  conv.type === 'order' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {conv.type === 'order' ? '訂單' : '查詢'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );

  const emptyState = (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50/30 px-6 text-center">
      <MessageCircle className="h-12 w-12 text-slate-300" />
      <p className="mt-4 text-base font-medium text-slate-700">揀選一個對話</p>
      <p className="mt-1 max-w-xs text-sm text-slate-400">
        買賣雙方嘅訊息會出現喺度。
      </p>
    </div>
  );

  const rightPane = activeConv && me ? (
    <ConversationPane
      key={activeConv.id}
      chrome="pane"
      conversationId={activeConv.id}
      currentUserId={me.id}
      counterpartyName={activeConv.counterparty.displayName}
      listingTitle={activeConv.listing?.title ?? ''}
      listingLinkId={activeConv.listing?.id ?? activeConv.listingId ?? undefined}
      listingImage={activeConv.listing?.images?.[0]}
      counterpartySellerId={activeConv.counterparty.id}
      orderStatus={activeConv.orderStatus}
      conversationType={activeConv.type}
      readOnly={activeConv.type === 'order' && ['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(activeConv.orderStatus ?? '')}
      readOnlyReason={
        activeConv.orderStatus === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
        : activeConv.orderStatus === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
        : activeConv.orderStatus === 'DISPUTED' ? '訂單爭議處理中，對話已鎖定。'
        : undefined
      }
      onClose={backToList}
      showBackButton
    />
  ) : emptyState;

  return (
    // mobile bottom nav 佔 h-16 (4rem)；desktop 冇所以 md:h-screen.
    // overflow-hidden + min-h-0 chain forces inner overflow-y-auto to scroll
    // within its own pane instead of the whole page (Tailwind flex gotcha).
    // Authenticator portal main has no global footer so we keep the calc.
    <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden md:h-dvh">
      <div className={`${activeConvId ? 'hidden md:flex' : 'flex'} min-h-0 w-full md:w-72`}>{sidebar}</div>
      <div className={`${activeConvId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1`}>{rightPane}</div>
    </div>
  );
}

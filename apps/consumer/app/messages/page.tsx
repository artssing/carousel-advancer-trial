'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { Button, Pill } from '@authentik/ui';
import {
  formatChatTime, formatHKD, tierForPrice, categoryByApiEnum, conditionLabel,
  type ConditionGrade,
} from '@authentik/utils';
import { Tag } from 'lucide-react';

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '物流寄送',
  MEETUP_AUTH: '鑑定師面交',
  MEETUP_3WAY: '三方面交',
  MEETUP_DIRECT: '雙方面交',
};

/** Neutral labels — no named authenticator (buyer hasn't opted in until order). */
const DELIVERY_LABEL_NEUTRAL: Record<string, string> = {
  SHIP: '郵寄',
  MEETUP_AUTH: '鑑定師處面交',
  MEETUP_3WAY: '三方面交',
  MEETUP_DIRECT: '雙方面交',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  ONLINE_ESCROW: '線上託管',
  OFFLINE_CASH: '現金面交',
};
import { ChevronDown, ChevronRight, MessageCircle, Search, X } from 'lucide-react';
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
  BUYER: '你', SELLER: '賣家', AUTHENTICATOR: '鑑定師', SYSTEM: '系統',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: '待付款',
  PAID: '款項託管中',
  SHIPPED_TO_AUTHENTICATOR: '寄往鑑定',
  AUTH_IN_PROGRESS: '鑑定中',
  AUTH_PASSED: '鑑定通過',
  AUTH_FAILED: '鑑定不通過',
  SHIPPED_TO_BUYER: '寄往買家',
  DELIVERED: '已送達',
  COMPLETED: '已完成',
  REFUNDED: '已退款',
  DISPUTED: '爭議處理中',
};

function MessagesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [presenceMap, setPresenceMap] = useState<Record<string, { online: boolean }>>({});
  const [query, setQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const activeConvIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<ConvSummary[]>([]);
  conversationsRef.current = conversations;
  activeConvIdRef.current = activeConvId;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── URL ↔ state sync (deeplink + back/forward button) ────────────────
  // URL is the source of truth for which conv is open. This useEffect re-runs
  // on searchParams change so browser back/forward naturally restore state
  // (Coordinator ruling 2026-07-05 Q3). Also handles mount-time ?conv=<id>.
  //
  // Side-effect side note (Q5): the optimistic `unread: 0` local mark happens
  // here too so BOTH click-path (openConv) and URL-path (deeplink/back) share
  // the same "opened a conv" side-effect — avoids the split-brain risk of two
  // separate code paths having drift.
  const urlConvId = searchParams.get('conv');
  useEffect(() => {
    if (loading) return;
    if (!urlConvId) { setActiveConvId(null); return; }
    // Silent fallback if URL conv doesn't exist in the user's list — avoids
    // leaking existence via 404/403 distinction (Coordinator Q7).
    if (!conversations.some((c) => c.id === urlConvId)) return;
    setActiveConvId(urlConvId);
    // Optimistic mark-read (shared with openConv click path).
    setConversations((prev) => prev.map((c) => c.id === urlConvId ? { ...c, unread: 0 } : c));
  }, [urlConvId, loading, conversations.length]);

  function refreshList() {
    api.conversations.list().then(setConversations).catch(() => {});
  }

  useEffect(() => {
    if (!me?.id) return;
    const token = getToken();
    if (!token) return;

    const socket: Socket = io(`${API_URL.replace(/\/api\/?$/, '')}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => { refreshList(); });

    socket.on('presence', (data: { userId: string; online: boolean }) => {
      setPresenceMap((prev) => ({ ...prev, [data.userId]: { online: data.online } }));
    });

    socket.on('message', (msg: { conversationId: string; body: string; senderRole: string; createdAt: string; senderId?: string }) => {
      const list = conversationsRef.current;
      const idx = list.findIndex((c) => c.id === msg.conversationId);
      if (idx === -1) { refreshList(); return; }
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

  // ── openConv / backToList — URL is source of truth ──────────────────
  // Coordinator ruling Q4: list→conv uses push (create back-target); conv→conv
  // uses replace (don't stack history when user is browsing between convs).
  // The URL-watching useEffect above handles the actual setActiveConvId +
  // mark-read side-effects, so this handler just pushes/replaces the URL.
  function openConv(id: string) {
    const url = `/messages?conv=${id}` as const;
    if (activeConvId) {
      router.replace(url);
    } else {
      router.push(url);
    }
  }
  // Q5: use replace (not push) so leaving a conv doesn't leave an empty-state
  // history entry that the user would hit on subsequent back.
  function backToList() {
    router.replace('/messages');
    refreshList();
  }

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

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
  const unreadCount = conversations.filter((c) => c.unread > 0).length;

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; counterparty: ConvSummary['counterparty']; convs: ConvSummary[] }>();
    for (const c of visibleConvs) {
      const key = c.counterparty.id ?? `name:${c.counterparty.displayName}`;
      let g = map.get(key);
      if (!g) { g = { key, counterparty: c.counterparty, convs: [] }; map.set(key, g); }
      g.convs.push(c);
    }
    return Array.from(map.values());
  }, [visibleConvs]);

  // ── L3 Sidebar (conversation list) ─────────────────────────────────────
  const sidebar = (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-line bg-white">
      {/* Header — matches messages.html .convhead */}
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <h1 className="text-[17px] font-extrabold text-ink">訊息</h1>
        <Pill variant="tier" size="sm">
          {qLower ? `${visibleConvs.length}/${conversations.length}` : conversations.length} 個對話
        </Pill>
      </div>

      {/* Search — messages.html .convsearch */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-text-hint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋對話…"
            className="h-[38px] w-full rounded-lg border border-line-2 bg-white pl-8 pr-8 text-[13px] outline-none shadow-[inset_0_1px_2px_rgba(10,37,64,0.03)] transition focus:border-verify"
            aria-label="搜尋對話"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-text-hint hover:bg-surface-2"
              aria-label="清除搜尋"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {unreadCount > 0 && (
          <p className="mt-1.5 text-[11px] font-semibold text-danger">
            · {unreadCount} 個未讀
          </p>
        )}
      </div>

      {/* Conversation list — messages.html .convs */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="px-4 py-8 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-neutral-text-hint" />
            <p className="mt-2 text-sm font-medium text-neutral-text">暫無對話</p>
            <p className="mt-1 text-xs text-neutral-text-hint">
              去瀏覽商品，搵到心水撳「聯絡賣家」。
            </p>
            <Link href="/browse"><Button size="sm" className="mt-3">瀏覽商品</Button></Link>
          </div>
        )}

        {!loading && noResults && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs font-medium text-neutral-text">揾唔到符合「{query.trim()}」嘅對話</p>
            <p className="mt-1 text-[10px] text-neutral-text-hint">
              試對方名、商品名、品牌或訂單 ID 首 8 字。
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-2 rounded-lg border border-line-2 bg-white px-2.5 py-1 text-[11px] hover:bg-surface-2"
            >
              清除搜尋
            </button>
          </div>
        )}

        {!loading && groups.map((g) => {
          const isGrouped = g.convs.length > 1;
          const collapsed = isGrouped && collapsedGroups[g.key];
          const totalUnread = g.convs.reduce((sum, c) => sum + c.unread, 0);
          const isOnline = g.counterparty.id ? presenceMap[g.counterparty.id]?.online : false;
          const latest = g.convs[0]!;

          const renderThread = (conv: ConvSummary, indent: boolean) => {
            const preview = conv.lastMessage
              ? `${conv.lastMessage.senderRole === 'BUYER' ? '你' : ROLE_LABEL[conv.lastMessage.senderRole] ?? ''}：${conv.lastMessage.body}`
              : '新對話';
            const isActive = conv.id === activeConvId;
            const tier = (conv as any).listing?.priceHKD ? tierForPrice((conv as any).listing.priceHKD) : null;
            const initial = conv.counterparty.displayName.slice(0, 1).toUpperCase();
            return (
              <button
                key={conv.id}
                onClick={() => openConv(conv.id)}
                className={`flex w-full items-start gap-2.5 border-b border-line ${indent ? 'py-2 pl-8 pr-4' : 'px-4 py-3'} text-left transition ${
                  isActive ? 'bg-verify-soft' : 'hover:bg-surface-2'
                }`}
              >
                {/* Avatar — messages.html .conv .av */}
                {!indent && (
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee] text-sm font-bold text-ink">
                    {initial}
                    {tier && (
                      <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white bg-brand-600 px-1 py-[1px] text-[8px] font-extrabold text-white">
                        T{tier}
                      </span>
                    )}
                    {conv.counterparty.id && presenceMap[conv.counterparty.id]?.online && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="在線" />
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  {!indent && (
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[14px] font-semibold text-neutral-text">
                        {conv.counterparty.displayName}
                      </p>
                      <span className="shrink-0 text-[11px] text-neutral-text-hint">
                        {conv.lastMessage ? formatChatTime(conv.lastMessage.createdAt) : ''}
                      </span>
                    </div>
                  )}
                  {indent && conv.listing?.title && (
                    <p className="truncate text-[12px] font-medium text-neutral-text">{conv.listing.title}</p>
                  )}
                  <p className="mt-0.5 truncate text-[12px] text-neutral-text-hint">{preview}</p>
                </div>

                {conv.unread > 0 && !isActive && (
                  <span className="mt-1 flex h-[18px] min-w-[18px] items-center justify-center self-center rounded-full bg-brand-600 px-1.5 text-[11px] font-extrabold text-white">
                    {conv.unread}
                  </span>
                )}
              </button>
            );
          };

          if (!isGrouped) return renderThread(latest, false);

          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => setCollapsedGroups((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left hover:bg-surface-2"
                aria-expanded={!collapsed}
                aria-label={`${g.counterparty.displayName} · ${g.convs.length} 個對話`}
              >
                {collapsed
                  ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-text-hint" />
                  : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-text-hint" />}
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee] text-[12px] font-bold text-ink">
                  {g.counterparty.displayName.slice(0, 1).toUpperCase()}
                  {isOnline && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="在線" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-neutral-text">
                    {g.counterparty.displayName}
                    <span className="ml-1 text-[10px] font-medium text-neutral-text-hint">· {g.convs.length}</span>
                  </p>
                  <p className="truncate text-[11px] text-neutral-text-hint">
                    {latest.lastMessage ? formatChatTime(latest.lastMessage.createdAt) : ''}
                  </p>
                </div>
                {totalUnread > 0 && (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-extrabold text-white">
                    {totalUnread}
                  </span>
                )}
              </button>
              {!collapsed && <div>{g.convs.map((c) => renderThread(c, true))}</div>}
            </div>
          );
        })}
      </div>
    </aside>
  );

  // ── Empty state for centre pane (desktop only) ─────────────────────────
  const emptyState = (
    <div className="flex h-full w-full flex-col items-center justify-center bg-surface-2 px-6 text-center">
      <MessageCircle className="h-12 w-12 text-neutral-text-hint" />
      <p className="mt-4 text-base font-semibold text-neutral-text">揀選一個對話</p>
      <p className="mt-1 max-w-xs text-sm text-neutral-text-hint">
        或者去瀏覽商品，搵到心水就聯絡賣家。
      </p>
      <Link href="/browse"><Button size="sm" className="mt-5">瀏覽商品</Button></Link>
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

  // ── 3-pane layout: sidebar (310px) | chat (1fr) | context (292px) ──────
  return (
    <div className="grid h-[calc(100dvh-var(--chrome-h))] w-full overflow-hidden lg:grid-cols-[310px_1fr_292px] md:grid-cols-[310px_1fr] grid-cols-1">
      {/* Sidebar */}
      <div className={`${activeConvId ? 'hidden md:flex' : 'flex'} min-h-0`}>
        {sidebar}
      </div>

      {/* Chat pane */}
      <div className={`${activeConvId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0`}>
        {rightPane}
      </div>

      {/* Context pane (lg+ only, when conversation active) */}
      {activeConv && (
        <div className="hidden min-h-0 lg:block">
          <ContextPane conv={activeConv} />
        </div>
      )}
    </div>
  );
}

// ── ContextPane — right-side product/order context card ──────────────────
// Coordinator ruling 2026-07-05: Listing convo (未落單) must show asking price,
// Tier, category, condition, seller delivery preferences + activeOffer comparison.
// Order convo (落單) additionally shows named authenticator + payment method.
// Both lazy-fetched — listConversations kept lean.
//
// Platform-neutrality: Listing convo shows delivery methods but NEVER names a
// specific authenticator (buyer hasn't opted in until order). Only Order convo
// names 鑑定師 (opt-in happened via 落單).
function ContextPane({ conv }: { conv: ConvSummary }) {
  const [order, setOrder] = useState<any>(null);
  const [listingFull, setListingFull] = useState<any>(null);
  const [activeOffer, setActiveOffer] = useState<any>(null);

  // Lazy-fetch order (落單) OR listing details (未落單) depending on convo type.
  useEffect(() => {
    setOrder(null); setListingFull(null); setActiveOffer(null);
    let cancelled = false;
    if (conv.orderId) {
      api.orders.get(conv.orderId)
        .then((o) => { if (!cancelled) setOrder(o); })
        .catch(() => {});
    } else if (conv.type === 'listing' && conv.listing?.id) {
      api.listings.get(conv.listing.id)
        .then((l) => { if (!cancelled) setListingFull(l); })
        .catch(() => {});
      // Fetch offers to compute activeOffer (PROPOSED / most recent).
      api.offers.listForConversation(conv.id)
        .then((offers: any[]) => {
          if (cancelled) return;
          const proposed = offers?.find((o) => o.status === 'PROPOSED') ?? null;
          setActiveOffer(proposed);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [conv.orderId, conv.listing?.id, conv.type, conv.id]);

  const listing = conv.listing;
  const isOrder = !!conv.orderId;

  // ── Derived data (order path) ──
  const orderPrice = order?.salePriceHKD;
  const orderAuthFee = order?.authFeeHKD;
  const orderDelivery = order?.deliveryMethod as string | undefined;
  const orderPayment = order?.paymentMethod as string | undefined;
  const orderStatusLabel = order?.status ? STATUS_LABEL[order.status] ?? order.status : null;
  const orderTier = orderPrice ? tierForPrice(orderPrice) : null;
  const isEscrowActive = order && !['COMPLETED', 'REFUNDED'].includes(order.status);
  const orderAuthenticator = order?.authenticator;

  // ── Derived data (listing path) ──
  const askingPrice = listingFull?.priceHKD;
  const listingTier = askingPrice ? tierForPrice(askingPrice) : null;
  const listingCategory = listingFull?.category ? categoryByApiEnum(listingFull.category) : null;
  const listingBrand = listingFull?.brand as string | null;
  const listingCondition = listingFull?.condition as ConditionGrade | null;
  const listingDeliveries = (listingFull?.allowedDeliveryMethods ?? []) as string[];
  const offerPrice = activeOffer?.priceHKD;
  const showOfferComparison = offerPrice && askingPrice && offerPrice < askingPrice;

  return (
    <div className="h-full overflow-y-auto border-l border-line bg-white px-5 py-5">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
        此對話商品
      </p>

      {/* Mini-card — Lesson #1: never dead-end */}
      {listing ? (
        <Link
          href={`/listing/${listing.id}` as any}
          className="block overflow-hidden rounded-xl border border-line shadow-sh1 transition hover:-translate-y-0.5 hover:shadow-sh3"
        >
          <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee]">
            {listing.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.images[0]} alt={listing.title} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[12px] font-bold tracking-[0.12em] text-neutral-text-hint">
                {(listingBrand ?? listingFull?.brand ?? 'CERTIFINE').toUpperCase()}
              </span>
            )}
            {/* Only Order-convo w/ confirmed authenticator gets the 已鑑定 pill —
                Listing-convo never claims "已鑑定" (platform-neutrality). */}
            {isOrder && orderAuthenticator && (
              <span className="absolute left-2.5 top-2.5">
                <Pill variant="verify" size="sm">◆ 已指派鑑定師</Pill>
              </span>
            )}
          </div>
          <div className="px-3.5 py-3">
            <p className="truncate text-[13px] font-semibold text-neutral-text">{listing.title}</p>
            {(conv.orderId || orderTier || listingTier) && (
              <p className="mt-1 font-mono text-[11px] text-neutral-text-hint">
                {conv.orderId && `#${conv.orderId.slice(0, 8).toUpperCase()}`}
                {(orderTier ?? listingTier) && conv.orderId && ' · '}
                {(orderTier ?? listingTier) && `Tier ${orderTier ?? listingTier}`}
              </p>
            )}
          </div>
        </Link>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 p-4 text-center text-[12px] text-neutral-text-hint">
          此對話未關聯商品
        </div>
      )}

      {/* ═══ Listing convo KVs (未落單) ═══ */}
      {!isOrder && listingFull && (
        <div className="mt-4 space-y-0">
          {askingPrice && (
            <KV
              label={showOfferComparison ? '叫價' : '報價'}
              value={
                showOfferComparison ? (
                  <b className="text-neutral-text-hint line-through">{formatHKD(askingPrice)}</b>
                ) : (
                  <b className="text-neutral-text">{formatHKD(askingPrice)}</b>
                )
              }
            />
          )}
          {showOfferComparison && (
            <KV
              label="議價中"
              value={
                <span className="flex items-baseline gap-1.5">
                  <b className="text-brand-600">{formatHKD(offerPrice)}</b>
                  <span className="text-[10px] font-semibold text-brand-600">
                    ↓ HK${(askingPrice - offerPrice).toLocaleString('en-HK')}
                  </span>
                </span>
              }
            />
          )}
          {listingCategory && (
            <KV
              label="品類"
              value={
                <b className="text-neutral-text">
                  {listingCategory.emoji} {listingCategory.shortLabel}
                  {listingBrand && <span className="text-neutral-text-muted"> · {listingBrand}</span>}
                </b>
              }
            />
          )}
          {listingCondition && (
            <KV label="狀況" value={<b className="text-neutral-text">{conditionLabel(listingCondition)}</b>} />
          )}
          {listingDeliveries.length > 0 && (
            <KV
              label="賣家接受"
              value={
                <b className="text-right text-neutral-text">
                  {listingDeliveries.map((m) => DELIVERY_LABEL_NEUTRAL[m] ?? m).join(' / ')}
                </b>
              }
            />
          )}
        </div>
      )}

      {/* ═══ Order convo KVs (已落單) ═══ */}
      {isOrder && order && (
        <div className="mt-4 space-y-0">
          {orderPrice && (
            <KV label="成交價" value={<b className="text-neutral-text">{formatHKD(orderPrice)}</b>} />
          )}
          {orderAuthFee > 0 && (
            <KV label="鑑定費" value={<b className="text-neutral-text">{formatHKD(orderAuthFee)}</b>} />
          )}
          {orderStatusLabel && (
            <KV
              label="狀態"
              value={
                <b className={isEscrowActive ? 'text-verify' : 'text-neutral-text-muted'}>
                  {orderStatusLabel}
                </b>
              }
            />
          )}
          {orderDelivery && (
            <KV label="交收" value={<b className="text-neutral-text">{DELIVERY_LABEL[orderDelivery] ?? orderDelivery}</b>} />
          )}
          {orderPayment && (
            <KV
              label="付款"
              value={
                <b className={orderPayment === 'OFFLINE_CASH' ? 'text-verdict-incon' : 'text-neutral-text'}>
                  {PAYMENT_METHOD_LABEL[orderPayment] ?? orderPayment}
                </b>
              }
            />
          )}
          {orderAuthenticator && (
            <KV
              label="鑑定師"
              value={
                <b className="text-verify">
                  {orderAuthenticator.displayName}
                  {orderAuthenticator.starRating && (
                    <span className="ml-1 text-[10px] font-normal text-neutral-text-hint">
                      ★{orderAuthenticator.starRating.toFixed(1)}
                    </span>
                  )}
                </b>
              }
            />
          )}
        </div>
      )}

      {/* OFFLINE_CASH warning — no escrow protection */}
      {isOrder && orderPayment === 'OFFLINE_CASH' && (
        <p className="mt-2 rounded-lg bg-verdict-incon-soft px-3 py-2 text-[11px] leading-relaxed text-verdict-incon">
          ⚠ 現金面交唔受平台託管保障，請確認商品交收後再交錢。
        </p>
      )}

      {/* CTAs */}
      <div className="mt-4 space-y-2">
        {/* Order convo: 查看訂單 primary */}
        {isOrder && conv.orderId && (
          <Link
            href={`/orders?highlight=${conv.orderId}` as any}
            className="block w-full rounded-lg bg-brand-600 px-4 py-2.5 text-center text-[13px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(0,135,102,0.5)] transition hover:bg-brand-700"
          >
            查看訂單
          </Link>
        )}
        {/* Listing convo: 提出議價 primary — 若有 activeOffer 改文案「查看議價中」 */}
        {!isOrder && listing && (
          <Link
            href={`/listing/${listing.id}` as any}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-center text-[13px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(0,135,102,0.5)] transition hover:bg-brand-700"
          >
            <Tag className="h-3.5 w-3.5" />
            {showOfferComparison ? `查看議價中 ${formatHKD(offerPrice)}` : '提出議價'}
          </Link>
        )}
        {/* Fallback: 查看商品 (tertiary) — 永遠顯示，never-dead-end lesson #1 */}
        {listing && (
          <Link
            href={`/listing/${listing.id}` as any}
            className="block w-full rounded-lg border border-line-2 bg-white px-4 py-2.5 text-center text-[13px] font-semibold text-neutral-text shadow-sh1 transition hover:border-brand-600 hover:text-brand-600"
          >
            查看商品
          </Link>
        )}
      </div>

      {/* L3 neutral disclaimer — L'Oréal v eBay */}
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-text-hint">
        款項受平台託管，鑑定通過並完成交收後方放款；平台為資訊中介，不擔保真偽。
      </p>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5 text-[12px] text-neutral-text-muted last:border-b-0">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesPageInner />
    </Suspense>
  );
}

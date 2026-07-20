'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { ChevronDown, ChevronRight, MessageCircle, Search, X } from 'lucide-react';
import { Pill } from '@authentik/ui';
import { formatChatTime, formatHKD, tierForPrice } from '@authentik/utils';
import { api, hasToken, clearToken, getToken } from '@/lib/api';
import { ConversationPane } from '@/components/conversation-pane';
import { XLink } from '@/components/x-link';

// Strip trailing /api so socket.io connects to namespace root.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');

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

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '物流寄送',
  MEETUP_AUTH: '鑑定師面交',
  MEETUP_3WAY: '三方面交',
  MEETUP_DIRECT: '雙方面交',
};

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [presenceMap, setPresenceMap] = useState<Record<string, { online: boolean }>>({});
  const [query, setQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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

  // ── URL ↔ state sync (deeplink + back/forward button) ────────────────
  // Ported 2026-07-05 from consumer /messages — was missing here entirely.
  // See consumer page.tsx for full doc of Coordinator ruling.
  const urlConvId = searchParams.get('conv');
  useEffect(() => {
    if (loading) return;
    if (!urlConvId) { setActiveConvId(null); return; }
    if (!conversations.some((c) => c.id === urlConvId)) return;
    setActiveConvId(urlConvId);
    setConversations((prev) => prev.map((c) => c.id === urlConvId ? { ...c, unread: 0 } : c));
  }, [urlConvId, loading, conversations.length]);

  const activeConvIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<ConvSummary[]>([]);
  conversationsRef.current = conversations;
  activeConvIdRef.current = activeConvId;

  function refreshList() {
    api.conversations.list().then(setConversations).catch(() => {});
  }
  // Coordinator Q4: push for list→conv, replace for conv→conv, so back-history
  // doesn't accumulate one entry per conv the user browsed through.
  function openConv(id: string) {
    const url = `/messages?conv=${id}` as const;
    if (activeConvId) router.replace(url);
    else router.push(url);
  }
  // Q5: replace so leaving a conv doesn't add an empty-list history entry.
  function backToList() { router.replace('/messages'); refreshList(); }

  useEffect(() => {
    if (!me?.id) return;
    const token = getToken();
    if (!token) return;

    const socket: Socket = io(`${API_URL}/chat`, {
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

  // ── L3 Sidebar ────────────────────────────────────────────────────────
  const sidebar = (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-line bg-white">
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <h1 className="text-[17px] font-extrabold text-ink">訊息</h1>
        <Pill variant="tier" size="sm">
          {qLower ? `${visibleConvs.length}/${conversations.length}` : conversations.length} 個對話
        </Pill>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-text-hint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋客人、商品或訂單 ID"
            className="h-[38px] w-full rounded-lg border border-line-2 bg-white pl-8 pr-8 text-[13px] outline-none shadow-[inset_0_1px_2px_rgba(10,37,64,0.03)] transition focus:border-authBrand-500"
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
              收到鑑定訂單時，買賣雙方對話會出現喺度。
            </p>
          </div>
        )}

        {!loading && noResults && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs font-medium text-neutral-text">揾唔到符合「{query.trim()}」嘅對話</p>
            <p className="mt-1 text-[10px] text-neutral-text-hint">
              試客人名、商品名、品牌或訂單 ID 首 8 字。
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
              ? `${ROLE_LABEL[conv.lastMessage.senderRole] ?? ''}：${conv.lastMessage.body}`
              : '新對話';
            const isActive = conv.id === activeConvId;
            const tier = (conv as any).listing?.priceHKD ? tierForPrice((conv as any).listing.priceHKD) : null;
            const initial = conv.counterparty.displayName.slice(0, 1).toUpperCase();
            return (
              <button
                key={conv.id}
                onClick={() => openConv(conv.id)}
                className={`flex w-full items-start gap-2.5 border-b border-line ${indent ? 'py-2 pl-8 pr-4' : 'px-4 py-3'} text-left transition ${
                  isActive ? 'bg-authBrand-soft' : 'hover:bg-surface-2'
                }`}
              >
                {!indent && (
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee] text-sm font-bold text-ink">
                    {initial}
                    {tier && (
                      <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white bg-authBrand-500 px-1 py-[1px] text-[8px] font-extrabold text-white">
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
                  <span className="mt-1 flex h-[18px] min-w-[18px] items-center justify-center self-center rounded-full bg-authBrand-500 px-1.5 text-[11px] font-extrabold text-white">
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
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-authBrand-500 px-1.5 text-[11px] font-extrabold text-white">
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

  const emptyState = (
    <div className="flex h-full w-full flex-col items-center justify-center bg-surface-2 px-6 text-center">
      <MessageCircle className="h-12 w-12 text-neutral-text-hint" />
      <p className="mt-4 text-base font-semibold text-neutral-text">揀選一個對話</p>
      <p className="mt-1 max-w-xs text-sm text-neutral-text-hint">
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

  // ── 3-pane grid on lg+, 2-pane on md, single-toggle on mobile ─────────
  // Height budget: 100dvh minus the mobile bottom nav (h-16 = 4rem) on mobile.
  // Desktop has no bottom nav so just dvh.
  return (
    <div className="grid h-[calc(100dvh-4rem)] w-full overflow-hidden lg:grid-cols-[310px_1fr_292px] md:grid-cols-[310px_1fr] md:h-dvh grid-cols-1">
      <div className={`${activeConvId ? 'hidden md:flex' : 'flex'} min-h-0`}>{sidebar}</div>
      <div className={`${activeConvId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0`}>{rightPane}</div>
      {activeConv && (
        <div className="hidden min-h-0 lg:block">
          <ContextPane conv={activeConv} />
        </div>
      )}
    </div>
  );
}

// ── ContextPane — mirrors consumer w/ authenticator-specific CTAs ────────
// Uses XLink to open consumer /listing/* in a new tab (Lesson #4), and
// links "查看訂單" to authenticator's own /inbox (its order queue).
function ContextPane({ conv }: { conv: ConvSummary }) {
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    setOrder(null);
    if (!conv.orderId) return;
    let cancelled = false;
    api.orders.get(conv.orderId)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conv.orderId]);

  const listing = conv.listing;
  const price = order?.salePriceHKD;
  const tier = price ? tierForPrice(price) : null;
  const authFee = order?.authFeeHKD;
  const delivery = order?.deliveryMethod as string | undefined;
  const deliveryLabel = delivery ? DELIVERY_LABEL[delivery] ?? delivery : null;
  const statusLabel = order?.status ? STATUS_LABEL[order.status] ?? order.status : null;
  const isEscrowActive = order && !['COMPLETED', 'REFUNDED'].includes(order.status);

  return (
    <div className="h-full overflow-y-auto border-l border-line bg-white px-5 py-5">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
        此對話商品
      </p>

      {listing ? (
        <XLink
          href={`/listing/${listing.id}`}
          className="block overflow-hidden rounded-xl border border-line shadow-sh1 transition hover:-translate-y-0.5 hover:shadow-sh3"
        >
          <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee]">
            {listing.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.images[0]} alt={listing.title} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[12px] font-bold tracking-[0.12em] text-neutral-text-hint">
                {(listing as any).brand?.toUpperCase() ?? 'CERTIFINE'}
              </span>
            )}
            {order?.authenticatorId && (
              <span className="absolute left-2.5 top-2.5">
                <span className="rounded-full border border-authBrand-border bg-authBrand-soft px-2.5 py-0.5 text-[11px] font-semibold text-authBrand-600">◆ 已鑑定</span>
              </span>
            )}
          </div>
          <div className="px-3.5 py-3">
            <p className="truncate text-[13px] font-semibold text-neutral-text">{listing.title}</p>
            {(conv.orderId || tier) && (
              <p className="mt-1 font-mono text-[11px] text-neutral-text-hint">
                {conv.orderId && `#${conv.orderId.slice(0, 8).toUpperCase()}`}
                {tier && conv.orderId && ' · '}
                {tier && `Tier ${tier}`}
              </p>
            )}
          </div>
        </XLink>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 p-4 text-center text-[12px] text-neutral-text-hint">
          此對話未關聯商品
        </div>
      )}

      {order && (
        <div className="mt-4 space-y-0">
          {price && <KV label="成交價" value={<b className="text-neutral-text">{formatHKD(price)}</b>} />}
          {authFee > 0 && <KV label="鑑定費" value={<b className="text-neutral-text">{formatHKD(authFee)}</b>} />}
          {statusLabel && (
            <KV
              label="狀態"
              value={
                <b className={isEscrowActive ? 'text-authBrand-500' : 'text-neutral-text-muted'}>{statusLabel}</b>
              }
            />
          )}
          {deliveryLabel && <KV label="交收" value={<b className="text-neutral-text">{deliveryLabel}</b>} />}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {conv.orderId && (
          <Link
            href="/inbox"
            className="block w-full rounded-lg bg-authBrand-500 px-4 py-2.5 text-center text-[13px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600"
          >
            前往鑑定收件匣
          </Link>
        )}
        {listing && (
          <XLink
            href={`/listing/${listing.id}`}
            className="block w-full rounded-lg border border-line-2 bg-white px-4 py-2.5 text-center text-[13px] font-semibold text-neutral-text shadow-sh1 transition hover:border-brand-400 hover:text-authBrand-500"
          >
            查看商品
          </XLink>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-text-hint">
        平台為資訊中介，鑑定判斷歸屬鑑定師。所有結果應如實填報並附證據。
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

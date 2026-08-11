'use client';

/**
 * ConversationPane — the actual IM UI body, shared by both portals.
 *
 * Two contexts:
 * - `chrome="drawer"`: rendered inside ConversationDrawer's fixed/overlay shell.
 *   Shows X close button. Clicking nav links calls onClose (dismiss drawer).
 * - `chrome="pane"`: rendered as a first-class region (e.g. /messages right column).
 *   No X button. Optional back button (mobile). Links do NOT call onClose.
 *
 * This used to be two files — apps/consumer and apps/authenticator each kept a
 * copy, 588 lines apart, and the authenticator's had fallen behind (no loading
 * shimmer, no 3-party roles). They differed in exactly three ways, all of which
 * are props here:
 *
 *   theme          brand-* (consumer) vs authBrand-* (authenticator). Full class
 *                  strings in a lookup, never `bg-${theme}-600` — Tailwind scans
 *                  source text and would purge an interpolated class.
 *   linkComponent  next/link in consumer; a cross-app <a> in the authenticator.
 *   deps           each app's own api client and token getter.
 *
 * Everything else was the same code twice.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { X, Send, MessageCircle, ExternalLink, Store, ShieldCheck, ChevronLeft, Tag } from 'lucide-react';
import { createT, getClientLocale, type TLocale } from '@authentik/utils';

/**
 * Every string in this file lives in `locales/ssot.json` under `ui.conversation.*`.
 * Module-level helpers take `_t` as an argument — they render user-visible copy
 * but sit outside the component, where no hook-derived translator is in scope.
 */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Intl locale tag for date/time formatting — not the same thing as our TLocale. */
function intlTag(locale: TLocale): string {
  return locale === 'en' ? 'en-HK' : 'zh-HK';
}

/** Per-portal colour tokens. Literal class strings so Tailwind can see them. */
const THEME_TOKENS = {
  consumer: {
    icon: 'text-brand-600',
    linkHover: 'hover:text-brand-700',
    cardHover: 'hover:border-brand-300 hover:bg-surface-2',
    avatar: 'bg-brand-100 text-brand-700',
    chipActive: 'bg-brand-600 text-white shadow-sm',
    bubbleMe: 'bg-brand-600 text-white',
    bubbleMeMeta: 'text-brand-200',
    quickHover: 'hover:border-brand-300 hover:bg-brand-50',
    sendButton: 'bg-brand-600',
  },
  authenticator: {
    icon: 'text-authBrand-500',
    linkHover: 'hover:text-authBrand-500',
    cardHover: 'hover:border-authBrand-500 hover:bg-surface-2',
    avatar: 'bg-authBrand-soft text-authBrand-500',
    chipActive: 'bg-authBrand-500 text-white shadow-sm',
    bubbleMe: 'bg-authBrand-500 text-white',
    bubbleMeMeta: 'text-authBrand-200',
    quickHover: 'hover:border-authBrand-500 hover:bg-authBrand-soft',
    sendButton: 'bg-authBrand-500',
  },
} as const;

export type ConversationTheme = keyof typeof THEME_TOKENS;

/** The app-specific bits the pane cannot own: its API client and its links. */
export interface ConversationDeps {
  /** API origin WITHOUT the /api path — the socket connects to `${apiBaseUrl}/chat`. */
  apiBaseUrl: string;
  getToken: () => string | null;
  api: {
    offers: {
      create: (conversationId: string, priceHKD: number) => Promise<unknown>;
      listForConversation: (conversationId: string) => Promise<any>;
      withdraw: (offerId: string) => Promise<unknown>;
    };
    users: {
      sellerProfile: (userId: string) => Promise<any>;
      sellerListings?: (userId: string, limit: number, offset: number) => Promise<any>;
    };
  };
}

export interface ConversationLinkProps {
  href: string;
  onClick?: () => void;
  className?: string;
  title?: string;
  children: ReactNode;
}

type SendStatus = 'sending' | 'sent' | 'failed';

interface Message {
  id: string;
  senderRole: 'BUYER' | 'SELLER' | 'AUTHENTICATOR' | 'SYSTEM';
  senderId: string | null;
  body: string;
  createdAt: string;
  sender?: { id: string; displayName: string } | null;
  readByBuyer?: boolean;
  readBySeller?: boolean;
  readByAuth?: boolean;
  // Optimistic-only fields (never on server messages)
  tempId?: string;
  sendStatus?: SendStatus;
}

interface PresenceInfo { online: boolean; lastSeenAt?: string | null; }

function formatLastSeen(info: PresenceInfo | undefined, _t: Translate, locale: TLocale): string | null {
  if (!info) return null;
  if (info.online) return _t('ui.conversation.presence.online');
  if (!info.lastSeenAt) return null;
  const d = new Date(info.lastSeenAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString(intlTag(locale), { hour: '2-digit', minute: '2-digit', hour12: false });
  if (msgDay.getTime() >= today.getTime()) return _t('ui.conversation.time.todayAt', { time });
  if (msgDay.getTime() >= yesterday.getTime()) return _t('ui.conversation.time.yesterdayAt', { time });
  // Intl gives "2026年8月10日" / "10 August 2026" — the year-month-day pattern
  // is not something we can interpolate from a single translated template.
  const date = d.toLocaleDateString(intlTag(locale), { year: 'numeric', month: 'long', day: 'numeric' });
  return _t('ui.conversation.time.dateAt', { date, time });
}

/** Determine tick status for a message the current user sent */
function getTickStatus(
  msg: Message,
  parties: Array<{ id: string; role: string }>,
  currentUserId: string,
): 'sending' | 'sent' | 'read' | 'failed' {
  if (msg.sendStatus === 'sending') return 'sending';
  if (msg.sendStatus === 'failed') return 'failed';
  const otherRoles = parties.filter((p) => p.id !== currentUserId).map((p) => p.role);
  if (otherRoles.length === 0) return 'sent';
  const allRead = otherRoles.every((role) => {
    if (role === 'BUYER') return msg.readByBuyer;
    if (role === 'SELLER') return msg.readBySeller;
    if (role === 'AUTHENTICATOR') return msg.readByAuth;
    return false;
  });
  return allRead ? 'read' : 'sent';
}

/** Tick icon shown in own message bubbles */
function MessageTick({ status, tooltip, _t }: { status: 'sending' | 'sent' | 'read' | 'failed'; tooltip?: string; _t: Translate }) {
  if (status === 'sending') {
    return (
      <span
        title={_t('ui.conversation.tick.sending')}
        style={{
          display: 'inline-block',
          fontSize: '9px',
          fontWeight: 'bold',
          backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.75) 50%, rgba(255,255,255,0.2) 100%)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          animation: 'msgTickSweep 1.4s linear infinite',
        }}
      >✓</span>
    );
  }
  if (status === 'failed') return <span className="text-[9px] text-red-300" title={_t('ui.conversation.tick.failed')}>!</span>;
  if (status === 'read') return <span className="text-[9px] font-bold text-white" title={tooltip ?? _t('ui.conversation.tick.read')} style={{ letterSpacing: '-0.35em' }}>✓✓</span>;
  return <span className="text-[9px] font-bold text-white" title={_t('ui.conversation.tick.delivered')}>✓</span>;
}

/**
 * Role name. Written out rather than looked up in a map so every key is a
 * literal that `scripts/i18n-check-keys.ts` can actually verify.
 */
function roleLabel(role: string | undefined, _t: Translate): string {
  if (role === 'BUYER') return _t('ui.conversation.role.BUYER');
  if (role === 'SELLER') return _t('ui.conversation.role.SELLER');
  if (role === 'AUTHENTICATOR') return _t('ui.conversation.role.AUTHENTICATOR');
  if (role === 'SYSTEM') return _t('ui.conversation.role.SYSTEM');
  return _t('ui.conversation.role.unknown');
}

function formatDateDivider(d: Date, _t: Translate, locale: TLocale): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysDiff = Math.round((startOfToday - dDay) / 86400000);
  if (daysDiff === 0) return _t('ui.conversation.divider.today');
  if (daysDiff === 1) return _t('ui.conversation.divider.yesterday');
  if (daysDiff > 1 && daysDiff < 7) return _t(`ui.conversation.divider.weekday.${d.getDay()}`);
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(intlTag(locale), { month: 'long', day: 'numeric' });
  }
  return d.toLocaleDateString(intlTag(locale), { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(d: Date, locale: TLocale): string {
  return d.toLocaleTimeString(intlTag(locale), { hour: '2-digit', minute: '2-digit', hour12: false });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function DateDivider({ date, _t, locale }: { date: Date; _t: Translate; locale: TLocale }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-surface-2/80 px-2.5 py-0.5 text-[10px] font-medium text-neutral-text-muted">
        {formatDateDivider(date, _t, locale)}
      </span>
    </div>
  );
}

/**
 * Order statuses this pane shows as a chip. Short forms — `utils.orderStatus`
 * carries the long sentence versions used on the orders pages, which do not
 * fit here. Values are ssot keys, resolved through `_t` at render time.
 *
 * Every caller passes `Order.status` straight from the API, so the incoming
 * value is always an `OrderStatus` enum member. **All 18 must be listed**: an
 * unlisted status falls through and prints the raw enum name to the user.
 * Until 2026-08-10 four entries here named statuses that had been renamed out
 * of the schema (`PENDING_PAYMENT`, `RECEIVED_BY_AUTHENTICATOR`,
 * `AWAITING_MEETUP`, `MEETUP_AUTHENTICATING`) while eight real ones were
 * missing. Keep this in step with `enum OrderStatus` in schema.prisma.
 */
const STATUS_KEY: Record<string, string> = {
  AWAITING_PAYMENT: 'ui.conversation.status.AWAITING_PAYMENT',
  PAID: 'ui.conversation.status.PAID',
  // MEETUP_AUTH dual-ack flow
  HANDOVER_TO_AUTH: 'ui.conversation.status.HANDOVER_TO_AUTH',
  SELLER_ACK_PENDING: 'ui.conversation.status.SELLER_ACK_PENDING',
  CUSTODY: 'ui.conversation.status.CUSTODY',
  // SHIP photo-evidence flow
  SHIPPED_TO_AUTHENTICATOR: 'ui.conversation.status.SHIPPED_TO_AUTHENTICATOR',
  AUTH_RECEIVED_PENDING_SELLER_ACK: 'ui.conversation.status.AUTH_RECEIVED_PENDING_SELLER_ACK',
  // Common
  AUTHENTICATING: 'ui.conversation.status.AUTHENTICATING',
  AUTH_PASSED: 'ui.conversation.status.AUTH_PASSED',
  AUTH_FAILED: 'ui.conversation.status.AUTH_FAILED',
  AWAITING_BUYER_PICKUP: 'ui.conversation.status.AWAITING_BUYER_PICKUP',
  SHIPPED_TO_BUYER: 'ui.conversation.status.SHIPPED_TO_BUYER',
  DELIVERED_PENDING_AUTH_ACK: 'ui.conversation.status.DELIVERED_PENDING_AUTH_ACK',
  DELIVERED: 'ui.conversation.status.DELIVERED',
  COMPLETED: 'ui.conversation.status.COMPLETED',
  DISPUTED: 'ui.conversation.status.DISPUTED',
  REFUNDED: 'ui.conversation.status.REFUNDED',
  PAYMENT_EXPIRED: 'ui.conversation.status.PAYMENT_EXPIRED',
};

const OFFER_STATUS_KEY: Record<string, string> = {
  PENDING: 'ui.conversation.offer.status.PENDING',
  ACCEPTED: 'ui.conversation.offer.status.ACCEPTED',
  REJECTED: 'ui.conversation.offer.status.REJECTED',
  COUNTERED: 'ui.conversation.offer.status.COUNTERED',
  EXPIRED: 'ui.conversation.offer.status.EXPIRED',
  WITHDRAWN: 'ui.conversation.offer.status.WITHDRAWN',
};

/** Same 18 keys as STATUS_KEY. Amber = waiting on a person, blue = in transit
 *  or in custody, emerald = passed, red = failed, grey = terminal. */
const STATUS_COLOR: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-amber-100 text-amber-700', PAID: 'bg-blue-100 text-blue-700',
  HANDOVER_TO_AUTH: 'bg-amber-100 text-amber-700', SELLER_ACK_PENDING: 'bg-amber-100 text-amber-700',
  CUSTODY: 'bg-blue-100 text-blue-700',
  SHIPPED_TO_AUTHENTICATOR: 'bg-blue-100 text-blue-700',
  AUTH_RECEIVED_PENDING_SELLER_ACK: 'bg-amber-100 text-amber-700',
  AUTHENTICATING: 'bg-amber-100 text-amber-700', AUTH_PASSED: 'bg-emerald-100 text-emerald-700',
  AUTH_FAILED: 'bg-red-100 text-red-700',
  AWAITING_BUYER_PICKUP: 'bg-amber-100 text-amber-700', SHIPPED_TO_BUYER: 'bg-blue-100 text-blue-700',
  DELIVERED_PENDING_AUTH_ACK: 'bg-amber-100 text-amber-700',
  DELIVERED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-surface-2 text-neutral-text-muted',
  DISPUTED: 'bg-red-100 text-red-700', REFUNDED: 'bg-surface-2 text-neutral-text-muted',
  PAYMENT_EXPIRED: 'bg-surface-2 text-neutral-text-muted',
};

export interface ConversationPaneProps {
  orderId?: string;
  listingId?: string;
  conversationId?: string;
  currentUserId: string;
  counterpartyName: string;
  listingTitle: string;
  readOnly?: boolean;
  readOnlyReason?: string;
  orderStatus?: string | null;
  conversationType?: 'order' | 'listing';
  listingLinkId?: string;
  listingImage?: string;
  counterpartySellerId?: string;
  counterpartyBuyerId?: string;
  counterpartyAuthenticatorId?: string;
  /** All parties in this conversation (incl. viewer). When provided, renders a
   *  3-role pill bar so every participant (esp. authenticator) is visible.
   *  Without this, the header falls back to the single counterpartyName label. */
  parties?: Array<{ id: string; displayName: string; role: 'BUYER' | 'SELLER' | 'AUTHENTICATOR'; lastSeenAt?: string | null }>;
  /** Render context — controls header buttons + link click behavior */
  chrome: 'drawer' | 'pane';
  /** Drawer close (X), or mobile pane back. Required for drawer; optional for pane */
  onClose?: () => void;
  /** Pane chrome on mobile may show a back button; pass true to render it */
  showBackButton?: boolean;

  // ── injected by the host app ───────────────────────────────────────────────
  /** Which portal's colours to use. */
  theme: ConversationTheme;
  /** next/link in consumer; a cross-app <a> in the authenticator. */
  linkComponent: ComponentType<ConversationLinkProps>;
  /** The host app's api client + token getter + socket origin. */
  deps: ConversationDeps;
  /** Renders the inline offer card for an `__OFFER__:<id>` message. */
  renderOffer: (offerId: string) => ReactNode;
}

export function ConversationPane({
  orderId,
  listingId,
  conversationId: convIdProp,
  currentUserId,
  counterpartyName,
  listingTitle,
  readOnly = false,
  readOnlyReason,
  orderStatus,
  conversationType,
  listingLinkId,
  listingImage,
  counterpartySellerId,
  counterpartyBuyerId,
  counterpartyAuthenticatorId,
  parties,
  chrome,
  onClose,
  showBackButton = false,
  theme,
  linkComponent: Link,
  deps,
  renderOffer,
}: ConversationPaneProps) {
  // Aliased so the body below reads exactly as it did when this file lived
  // inside each app — `api.offers.create(...)`, `<Link href=…>`, `getToken()`.
  const { api, getToken, apiBaseUrl: API_URL } = deps;
  const tk = THEME_TOKENS[theme];

  // Locale is read after mount (cookie), so the server renders zh and English
  // arrives on hydrate — the same idiom as top-nav/footer. See
  // docs/backlog/i18n-backlog.md §3.6 for the SSR fix that would replace it.
  const [locale, setLocaleState] = useState<TLocale>('zh');
  useEffect(() => { setLocaleState(getClientLocale()); }, []);
  const _t = createT(locale);

  const contextId = convIdProp ?? orderId ?? listingId ?? '';
  const [activeConvId, setActiveConvId] = useState<string | null>(convIdProp ?? null);
  const activeConvIdRef = useRef<string | null>(convIdProp ?? null);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(true);   // 初次載入訊息 shimmer
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  // Store the role, not the rendered sentence: the label has to re-translate
  // when the locale arrives on hydrate, and state set inside a socket handler
  // would otherwise freeze whatever language was current at that moment.
  const [typingRole, setTypingRole] = useState<string | undefined>(undefined);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  // Ref-based dedup: prevent any residual duplicate broadcasts
  const seenMessageIds = useRef(new Set<string>());
  // Track when each optimistic was created so we can enforce a min animation display time
  const optimisticSentAt = useRef(new Map<string, number>());
  // Parties loaded from API on socket join — fallback for callers that
  // don't pass `parties` prop (e.g. order detail / authenticator workbench).
  const [liveParties, setLiveParties] = useState<NonNullable<ConversationPaneProps['parties']>>([]);
  // Direct messaging — current channel kind + lazy-loaded pair channel IDs.
  // Starts as THREE_WAY (or whatever server tells us). User can tab-switch
  // to a private pair channel which auto-lazily-creates server-side.
  type ConvKind = 'THREE_WAY' | 'BUYER_SELLER' | 'BUYER_AUTH' | 'SELLER_AUTH';
  const [currentKind, setCurrentKind] = useState<ConvKind>('THREE_WAY');
  const [pairConvIds, setPairConvIds] = useState<Partial<Record<ConvKind, string>>>({});
  const [tabSwitching, setTabSwitching] = useState(false);
  // Phase 2 cross-sell: lazy picker of seller's own active listings
  const [crossSellOpen, setCrossSellOpen] = useState(false);
  const [myListings, setMyListings] = useState<Array<{ id: string; title: string; priceHKD: number; images: string[] }> | null>(null);
  const [myListingsLoading, setMyListingsLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In drawer chrome, links should close the drawer on navigate.
  // In pane chrome, links just navigate (no overlay to dismiss).
  const linkOnClick = chrome === 'drawer' ? onClose : undefined;

  // Seller mini-card lazy fetch
  const [sellerInfo, setSellerInfo] = useState<{
    soldAsSellerCount: number; activeListingsCount: number; kycVerified: boolean;
  } | null>(null);
  useEffect(() => {
    if (!counterpartySellerId) { setSellerInfo(null); return; }
    let active = true;
    api.users.sellerProfile(counterpartySellerId)
      .then((p) => {
        if (active) setSellerInfo({
          soldAsSellerCount: p.soldAsSellerCount,
          activeListingsCount: p.activeListingsCount,
          kycVerified: p.kycVerified,
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [counterpartySellerId]);

  // ── Active offer state (for pinned strip + 提出議價 enablement) ─────────
  const [activeOffer, setActiveOffer] = useState<{
    id: string; status: string; priceHKD: number; expiresAt: string; paymentDeadlineAt: string | null;
  } | null>(null);
  const [offerHistory, setOfferHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [offerPrice, setOfferPrice] = useState<string>('');
  const [offerSubmitBusy, setOfferSubmitBusy] = useState(false);
  // Confirm-replace dialog when there's already an active offer
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  // Refresh active offer state — call after any offer action / new message
  const refreshActiveOffer = useCallback(() => {
    if (!activeConvId) return;
    api.offers.listForConversation(activeConvId)
      .then((list) => {
        setOfferHistory(list);
        // Active = latest PENDING or ACCEPTED (with valid paymentDeadline)
        const active = list
          .filter((o: any) => o.status === 'PENDING' || (o.status === 'ACCEPTED'
            && o.paymentDeadlineAt
            && new Date(o.paymentDeadlineAt).getTime() > Date.now()))
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        setActiveOffer(active ?? null);
      })
      .catch(() => {});
  }, [activeConvId]);

  useEffect(() => { refreshActiveOffer(); }, [refreshActiveOffer, messages.length]);

  // Switch conversation tab — lazy-fetches pair channel if not yet loaded.
  // Re-joins socket room so live messages route to the active tab.
  async function switchTab(targetKind: ConvKind) {
    if (targetKind === currentKind || tabSwitching) return;
    if (!orderId && targetKind !== 'THREE_WAY') return;  // pair channels require order context
    setTabSwitching(true);
    try {
      const token = getToken();
      let url: string;
      if (targetKind === 'THREE_WAY') {
        url = orderId
          ? `${API_URL}/api/conversations/order/${orderId}`
          : `${API_URL}/api/conversations/listing/${listingId}`;
      } else {
        url = `${API_URL}/api/conversations/order/${orderId}/pair/${targetKind}`;
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json())?.message ?? 'Failed to load tab');
      const d = await res.json();
      if (!d.conversationId) throw new Error('No conversation returned');
      // Re-join socket on new conversation room
      const sock = socketRef.current;
      if (sock) sock.emit('join', { conversationId: d.conversationId });
      setActiveConvId(d.conversationId);
      setCurrentKind(targetKind);
      setPairConvIds((m) => ({ ...m, [targetKind]: d.conversationId }));
      setMessages(d.messages ?? []);
      if (Array.isArray(d.parties)) setLiveParties(d.parties);
    } catch (e: any) {
      setError(e?.message ?? _t('ui.conversation.error.switchTab'));
    } finally {
      setTabSwitching(false);
    }
  }

  async function submitNewOffer() {
    if (!activeConvId || !offerPrice || Number(offerPrice) <= 0) return;
    // If there's an active PENDING/ACCEPTED offer, prompt for replace confirmation
    if (activeOffer && activeOffer.status === 'PENDING' && !replaceConfirmOpen) {
      setReplaceConfirmOpen(true);
      return;
    }
    setOfferSubmitBusy(true);
    setError(null);
    try {
      // If there's a PENDING offer, withdraw it first (server enforces "1 pending at a time")
      if (activeOffer && activeOffer.status === 'PENDING') {
        try { await api.offers.withdraw(activeOffer.id); } catch {}
      }
      await api.offers.create(activeConvId, Number(offerPrice));
      setOfferPrice('');
      setOfferFormOpen(false);
      setReplaceConfirmOpen(false);
      refreshActiveOffer();
    } catch (e: any) {
      setError(e?.message ?? _t('ui.conversation.error.offerFailed'));
    } finally {
      setOfferSubmitBusy(false);
    }
  }

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Reset state when switching conversations (pane mode)
  useEffect(() => {
    setMessages([]);
    setActiveConvId(convIdProp ?? null);
    setInput('');
    setError(null);
    seenMessageIds.current.clear();
    optimisticSentAt.current.clear();
  }, [contextId, convIdProp]);

  useEffect(() => {
    const token = getToken();
    if (!token || !contextId) return;

    const socket = io(`${API_URL}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      if (convIdProp) socket.emit('join', { conversationId: convIdProp });
      else if (orderId) socket.emit('join', { orderId });
      else if (listingId) socket.emit('join', { listingId });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('joined', (data: { conversationId?: string; orderId?: string; listingId?: string }) => {
      if (data?.conversationId) {
        setActiveConvId(data.conversationId);
        // Mark this conversation as read on join
        socket.emit('read', { conversationId: data.conversationId });
      }
      const url = convIdProp
        ? `${API_URL}/api/conversations/by-id/${convIdProp}`
        : orderId
          ? `${API_URL}/api/conversations/order/${orderId}`
          : `${API_URL}/api/conversations/listing/${listingId}`;
      setMsgLoading(true);
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.conversationId) setActiveConvId(d.conversationId);
          if (d.messages) setMessages(d.messages);
          if (Array.isArray(d.parties) && d.parties.length > 0) {
            setLiveParties(d.parties);
            // Seed presence map from DB lastSeenAt so header shows "最後上線" immediately
            // without waiting for a WebSocket presence event (which only fires on connect/disconnect)
            setPresenceMap((prev) => {
              const next = { ...prev };
              for (const p of d.parties) {
                if (p.id !== currentUserId && p.lastSeenAt && !next[p.id]) {
                  next[p.id] = { online: false, lastSeenAt: p.lastSeenAt };
                }
              }
              return next;
            });
          }
          if (d.kind) {
            setCurrentKind(d.kind);
            if (d.conversationId) setPairConvIds((m) => ({ ...m, [d.kind]: d.conversationId }));
          }
        })
        .catch(() => {})
        .finally(() => setMsgLoading(false));
    });

    socket.on('message', (msg: Message & { conversationId?: string; tempId?: string }) => {
      // Safety-net dedup (gateway already uses client.to() to prevent most duplicates)
      if (msg.id && seenMessageIds.current.has(msg.id)) return;
      if (msg.id) seenMessageIds.current.add(msg.id);

      const applyMessage = () => {
        setMessages((prev) => {
          const myConv = activeConvIdRef.current;
          if (msg.conversationId && myConv && msg.conversationId !== myConv) return prev;
          // Replace matching optimistic message
          if (msg.tempId) {
            const hasOptimistic = prev.some((m) => m.tempId === msg.tempId);
            if (hasOptimistic) {
              optimisticSentAt.current.delete(msg.tempId);
              return prev.map((m) =>
                m.tempId === msg.tempId ? { ...msg, sendStatus: 'sent' as const } : m,
              );
            }
          }
          if (prev.some((m) => m.id === msg.id)) return prev;
          const isOwn = msg.senderId === currentUserId;
          return [...prev, { ...msg, sendStatus: isOwn ? 'sent' as const : undefined }];
        });
      };

      // For own optimistic messages: enforce a 400ms minimum 'sending' animation display.
      // In local dev the round-trip is <20ms — without this floor the shimmer is invisible.
      const isOwnOptimistic = msg.senderId === currentUserId && !!msg.tempId;
      if (isOwnOptimistic) {
        const sentAt = optimisticSentAt.current.get(msg.tempId!) ?? Date.now();
        const elapsed = Date.now() - sentAt;
        const MIN_ANIM_MS = 400;
        if (elapsed < MIN_ANIM_MS) {
          setTimeout(applyMessage, MIN_ANIM_MS - elapsed);
        } else {
          applyMessage();
        }
      } else {
        applyMessage();
      }

      setTyping(false);
      // Emit read for messages from others in active conv
      if (msg.conversationId === activeConvIdRef.current && msg.senderId !== currentUserId) {
        socket.emit('read', { conversationId: msg.conversationId });
      }
    });

    socket.on('typing', (data: { userId?: string; role?: string } | undefined) => {
      if (data?.userId === currentUserId) return; // own typing, ignore
      setTypingRole(data?.role);
      setTyping(true);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTyping(false), 3000);
    });

    socket.on('presence', (data: { userId: string; online: boolean; lastSeenAt?: string }) => {
      setPresenceMap((prev) => ({ ...prev, [data.userId]: { online: data.online, lastSeenAt: data.lastSeenAt } }));
    });

    socket.on('read_update', (data: { conversationId: string; role: string }) => {
      const myConv = activeConvIdRef.current;
      if (data.conversationId !== myConv) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.senderRole === 'SYSTEM') return m;
          return {
            ...m,
            readByBuyer: data.role === 'BUYER' ? true : m.readByBuyer,
            readBySeller: data.role === 'SELLER' ? true : m.readBySeller,
            readByAuth: data.role === 'AUTHENTICATOR' ? true : m.readByAuth,
          };
        }),
      );
    });

    socket.on('error', (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(null), 4000);
    });

    return () => {
      if (convIdProp) socket.emit('leave', { conversationId: convIdProp });
      else if (orderId) socket.emit('leave', { orderId });
      else if (listingId) socket.emit('leave', { listingId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [contextId, orderId, listingId, convIdProp]);

  function handleSend() {
    const body = input.trim();
    if (!body || !socketRef.current || sending) return;
    setSending(true);
    setError(null);
    setInput('');

    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      tempId,
      senderId: currentUserId,
      senderRole: 'BUYER', // will be replaced by server message
      body,
      createdAt: new Date().toISOString(),
      sendStatus: 'sending',
    };
    optimisticSentAt.current.set(tempId, Date.now());
    setMessages((prev) => [...prev, optimistic]);

    const ctx = activeConvId
      ? { conversationId: activeConvId }
      : convIdProp
        ? { conversationId: convIdProp }
        : orderId
          ? { orderId }
          : { listingId };

    // Ack timeout: if no ack in 8s, mark failed
    const failTimer = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => m.tempId === tempId && m.sendStatus === 'sending' ? { ...m, sendStatus: 'failed' } : m),
      );
      setSending(false);
    }, 8000);

    socketRef.current.emit('send', { ...ctx, body, tempId }, (ack: { ok: boolean; error?: string }) => {
      clearTimeout(failTimer);
      setSending(false);
      if (!ack?.ok) {
        setMessages((prev) =>
          prev.map((m) => m.tempId === tempId ? { ...m, sendStatus: 'failed' } : m),
        );
        setError(ack?.error ?? _t('ui.conversation.error.sendFailed'));
      }
      // On success: server will broadcast 'message' event which replaces the optimistic entry
    });
  }

  function retryMessage(msg: Message) {
    // Remove failed optimistic message and resend
    setMessages((prev) => prev.filter((m) => m.tempId !== msg.tempId));
    setInput(msg.body);
  }

  function handleTyping() {
    if (socketRef.current) {
      const effectiveParties = (parties && parties.length > 0) ? parties : liveParties;
      const myRole = effectiveParties.find((p) => p.id === currentUserId)?.role;
      const convId = activeConvId ?? convIdProp;
      const ctx = convId
        ? { conversationId: convId }
        : orderId
          ? { orderId }
          : { listingId };
      socketRef.current.emit('typing', { ...ctx, role: myRole });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // Derive counterparty presence from presenceMap
  const effectivePartiesForPresence = (parties && parties.length > 0) ? parties : liveParties;
  const counterpartyIds = effectivePartiesForPresence.filter((p) => p.id !== currentUserId).map((p) => p.id);
  // Online if any counterparty is online; last seen from first offline counterparty
  const anyOnline = counterpartyIds.some((uid) => presenceMap[uid]?.online);
  const firstLastSeen = counterpartyIds.map((uid) => presenceMap[uid]).find((p) => p && !p.online)?.lastSeenAt;
  const presenceLabel = anyOnline
    ? _t('ui.conversation.presence.online')
    : firstLastSeen
      ? _t('ui.conversation.presence.lastSeen', {
          time: formatLastSeen({ online: false, lastSeenAt: firstLastSeen }, _t, locale) ?? '',
        })
      : null;

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {/* Mobile back button (pane chrome only) */}
            {chrome === 'pane' && showBackButton && onClose && (
              <button
                onClick={onClose}
                className="-ml-1 mt-0.5 rounded-lg p-1 hover:bg-surface-2"
                aria-label={_t('ui.conversation.header.back')}
              >
                <ChevronLeft className="h-5 w-5 text-neutral-text-muted" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <MessageCircle className={`h-4 w-4 ${tk.icon}`} />
                {counterpartyAuthenticatorId ? (
                  <Link href={`/authenticator/${counterpartyAuthenticatorId}`} onClick={linkOnClick}
                    className={`truncate font-semibold text-ink ${tk.linkHover} hover:underline`}>
                    {counterpartyName}
                  </Link>
                ) : counterpartySellerId ? (
                  <Link href={`/seller/${counterpartySellerId}`} onClick={linkOnClick}
                    className={`truncate font-semibold text-ink ${tk.linkHover} hover:underline`}>
                    {counterpartyName}
                  </Link>
                ) : counterpartyBuyerId ? (
                  <Link href={`/buyer/${counterpartyBuyerId}` as any} onClick={linkOnClick}
                    className={`truncate font-semibold text-ink ${tk.linkHover} hover:underline`}>
                    {counterpartyName}
                  </Link>
                ) : (
                  <h3 className="truncate font-semibold text-ink">{counterpartyName}</h3>
                )}
                {presenceLabel && (
                  <span className={`text-[10px] font-medium ${anyOnline ? 'text-emerald-600' : 'text-neutral-text-hint'}`}>
                    {presenceLabel}
                  </span>
                )}
              </div>
              {/* Party-pill bar — show all 3 roles when available (3-way transparency).
                  Current viewer gets a subtle "(你)" tag so they know they're in the list.
                  Source: caller prop preferred; otherwise from API socket-join payload. */}
              {(() => {
                const effectiveParties = (parties && parties.length > 0) ? parties : liveParties;
                if (!effectiveParties || effectiveParties.length === 0) return null;
                return (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {effectiveParties.map((p) => {
                    const isMe = p.id === currentUserId;
                    const label = roleLabel(p.role, _t);
                    const cls =
                      p.role === 'AUTHENTICATOR' ? 'bg-emerald-100 text-emerald-800'
                      : p.role === 'SELLER' ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800';
                    const href =
                      p.role === 'AUTHENTICATOR' ? `/authenticator/${p.id}`
                      : p.role === 'SELLER' ? `/seller/${p.id}`
                      : `/buyer/${p.id}`;
                    const baseClass = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls} ${isMe ? 'ring-1 ring-line-2' : ''}`;
                    const content = (
                      <>
                        <span className="opacity-70">{label}</span>
                        <span data-user-content>{p.displayName}</span>
                        {isMe && <span className="text-[9px] opacity-60">{_t('ui.conversation.header.meTag')}</span>}
                      </>
                    );
                    if (isMe) {
                      return (
                        <span key={p.id} className={baseClass} title={_t('ui.conversation.header.meTitle')}>
                          {content}
                        </span>
                      );
                    }
                    return (
                      <Link
                        key={p.id}
                        href={href as any}
                        onClick={linkOnClick}
                        className={`${baseClass} hover:opacity-80`}
                        title={_t('ui.conversation.header.viewParty', { role: label, name: p.displayName })}
                      >
                        {content}
                      </Link>
                    );
                  })}
                </div>
                );
              })()}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {orderStatus ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[orderStatus] ?? 'bg-surface-2 text-neutral-text-muted'}`}>
                    {STATUS_KEY[orderStatus] ? _t(STATUS_KEY[orderStatus]!) : orderStatus}
                  </span>
                ) : conversationType === 'listing' ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {_t('ui.conversation.status.listingInquiry')}
                  </span>
                ) : null}
              </div>
              {/* Direct-message tab strip — show pair channels in addition to 3-way thread.
                  Only when we have an order context AND the order is in a *committed*
                  state (PAID onward, not REFUNDED/DISPUTED/COMPLETED). This enforces
                  the anti-collusion rule: seller cannot DM auth until buyer has
                  committed the pair by paying.  */}
              {orderId && (() => {
                const PAIR_BLOCKED = new Set(['AWAITING_PAYMENT', 'REFUNDED', 'DISPUTED', 'COMPLETED']);
                const pairChannelsAvailable = !!orderStatus && !PAIR_BLOCKED.has(orderStatus);
                if (!pairChannelsAvailable) return null;
                const effectiveParties = (parties && parties.length > 0) ? parties : liveParties;
                if (!effectiveParties || effectiveParties.length < 2) return null;
                const myRole = effectiveParties.find((p) => p.id === currentUserId)?.role;
                if (!myRole) return null;
                const hasAuth = effectiveParties.some((p) => p.role === 'AUTHENTICATOR');
                const nameOf = (role: 'BUYER' | 'SELLER' | 'AUTHENTICATOR') =>
                  effectiveParties.find((p) => p.role === role)?.displayName ?? role;
                type TabDef = { kind: ConvKind; label: string };
                const withLabel = (role: 'BUYER' | 'SELLER' | 'AUTHENTICATOR') =>
                  _t('ui.conversation.tabs.with', { role: roleLabel(role, _t), name: nameOf(role) });
                const tabs: TabDef[] = [{ kind: 'THREE_WAY', label: _t('ui.conversation.tabs.threeWay') }];
                if (myRole === 'BUYER' || myRole === 'SELLER') {
                  const other = myRole === 'BUYER' ? 'SELLER' : 'BUYER';
                  tabs.push({ kind: 'BUYER_SELLER', label: withLabel(other) });
                }
                if (hasAuth && (myRole === 'BUYER' || myRole === 'AUTHENTICATOR')) {
                  tabs.push({ kind: 'BUYER_AUTH', label: withLabel(myRole === 'BUYER' ? 'AUTHENTICATOR' : 'BUYER') });
                }
                if (hasAuth && (myRole === 'SELLER' || myRole === 'AUTHENTICATOR')) {
                  tabs.push({ kind: 'SELLER_AUTH', label: withLabel(myRole === 'SELLER' ? 'AUTHENTICATOR' : 'SELLER') });
                }
                if (tabs.length <= 1) return null;
                return (
                  <div className="mt-2 -mb-0.5 flex flex-wrap gap-1 overflow-x-auto">
                    {tabs.map((t) => {
                      const active = t.kind === currentKind;
                      return (
                        <button
                          key={t.kind}
                          type="button"
                          disabled={tabSwitching}
                          onClick={() => switchTab(t.kind)}
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                            active
                              ? tk.chipActive
                              : 'bg-surface-2 text-neutral-text hover:bg-surface-2'
                          } ${tabSwitching ? 'opacity-60' : ''}`}
                          title={
                            t.kind === 'THREE_WAY'
                              ? _t('ui.conversation.tabs.threeWayTitle')
                              : _t('ui.conversation.tabs.pairTitle')
                          }
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          {/* Drawer X close */}
          {chrome === 'drawer' && onClose && (
            <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 hover:bg-surface-2">
              <X className="h-5 w-5 text-neutral-text-hint" />
            </button>
          )}
        </div>

        {/* Listing mini-card */}
        {listingLinkId && listingTitle && (
          <Link href={`/listing/${listingLinkId}`} onClick={linkOnClick}
            className={`mt-3 flex items-center gap-2.5 rounded-xl border border-line p-2 transition ${tk.cardHover}`}>
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
              {listingImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listingImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base">📦</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-neutral-text">{listingTitle}</p>
              <p className="text-[10px] text-neutral-text-hint">{_t('ui.conversation.listingCard.view')}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-text-hint" />
          </Link>
        )}

        {/* Seller mini-card */}
        {counterpartySellerId && sellerInfo && (
          <Link href={`/seller/${counterpartySellerId}`} onClick={linkOnClick}
            className={`mt-2 flex items-center gap-2.5 rounded-xl border border-line p-2 transition ${tk.cardHover}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tk.avatar}`}>
              {counterpartyName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-medium text-neutral-text">{counterpartyName}</p>
                {sellerInfo.kycVerified && <ShieldCheck className="h-3 w-3 text-blue-500" />}
              </div>
              <p className="text-[10px] text-neutral-text-hint">
                {_t('ui.conversation.sellerCard.stats', {
                  sold: sellerInfo.soldAsSellerCount,
                  active: sellerInfo.activeListingsCount,
                })}
              </p>
            </div>
            <Store className="h-3.5 w-3.5 shrink-0 text-neutral-text-hint" />
          </Link>
        )}

        {/* ── Active offer pinned strip ─────────────────────────────── */}
        {activeOffer && (
          (() => {
            const isAccepted = activeOffer.status === 'ACCEPTED';
            const deadline = isAccepted ? activeOffer.paymentDeadlineAt : activeOffer.expiresAt;
            const msLeft = deadline ? new Date(deadline).getTime() - Date.now() : 0;
            const hLeft = Math.max(0, Math.floor(msLeft / 3600_000));
            const mLeft = Math.max(0, Math.floor((msLeft % 3600_000) / 60_000));
            const tone = msLeft <= 0
              ? 'border-line-2 bg-surface-2 text-neutral-text-muted'
              : isAccepted
                ? (hLeft < 3 ? 'border-red-300 bg-red-50 text-red-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800')
                : (hLeft < 6 ? 'border-red-300 bg-red-50 text-red-800'
                  : hLeft < 12 ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-amber-200 bg-amber-50 text-amber-800');
            // Was `議價進行中 · 第 ${''}` — an empty interpolation left over from a
            // round-number that never got wired, so it rendered a dangling "· 第 ".
            const label = isAccepted
              ? _t('ui.conversation.offer.accepted')
              : _t('ui.conversation.offer.inProgress');
            return (
              <div className={`mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${tone}`}>
                <div className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5" />
                  <span className="font-medium">{label} · HK${activeOffer.priceHKD.toLocaleString('en-HK')}</span>
                  {msLeft > 0 && (
                    <span className="opacity-75">
                      · {_t('ui.conversation.offer.timeLeft', { hours: hLeft, minutes: mLeft })}
                    </span>
                  )}
                </div>
                {isAccepted && (
                  <Link
                    href={`/listing/${listingId ?? activeOffer.id}?offerId=${activeOffer.id}`}
                    onClick={linkOnClick}
                    className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700"
                  >
                    {_t('ui.conversation.offer.orderNow')}
                  </Link>
                )}
              </div>
            );
          })()
        )}

        {/* ── 議價歷史 collapsible ────────────────────────────────────── */}
        {offerHistory.length > 1 && (
          <div className="mt-2 rounded-lg border border-line bg-white">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-neutral-text-muted hover:bg-surface-2"
            >
              <span>{_t('ui.conversation.offer.historyToggle', { rounds: offerHistory.length })}</span>
              <span className="text-neutral-text-hint">{historyOpen ? '▲' : '▼'}</span>
            </button>
            {historyOpen && (
              <ul className="border-t border-line divide-y divide-line text-[11px]">
                {offerHistory.map((o) => {
                  const statusLabel = OFFER_STATUS_KEY[o.status]
                    ? _t(OFFER_STATUS_KEY[o.status]!)
                    : o.status;
                  const statusColor =
                    o.status === 'ACCEPTED' ? 'text-emerald-700'
                    : o.status === 'PENDING' ? 'text-amber-700'
                    : 'text-neutral-text-hint';
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                      <span className="text-neutral-text-muted">{_t('ui.conversation.offer.round', { n: o.roundNumber })}</span>
                      <span className="text-neutral-text">HK${o.priceHKD.toLocaleString('en-HK')}</span>
                      <span className="text-neutral-text-hint">
                        {_t('ui.conversation.offer.byRole', { role: roleLabel(o.proposedByRole, _t) })}
                      </span>
                      <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                      <span className="text-neutral-text-hint">
                        {new Date(o.createdAt).toLocaleString(intlTag(locale), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Messages ──────────────────────────────────────────────────── */}
      {/* bg 由 surface-2（灰底，同 L3 白底風格唔 align）改 surface-1（近白） */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white px-4 py-3">
        {msgLoading && messages.length === 0 && (
          <div className="flex flex-col gap-3">
            {([[false,'w-40'],[true,'w-28'],[false,'w-52'],[true,'w-36'],[false,'w-32'],[true,'w-24']] as Array<[boolean,string]>).map(([mine, w], i) => (
              <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`skeleton h-9 ${w} max-w-[75%] !rounded-2xl`} />
              </div>
            ))}
          </div>
        )}
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === currentUserId;
          const isSystem = msg.senderRole === 'SYSTEM';
          const msgDate = new Date(msg.createdAt);
          const prev = idx > 0 ? messages[idx - 1] : null;
          const prevDate = prev ? new Date(prev.createdAt) : null;
          const showDateDivider = !prevDate || !sameDay(prevDate, msgDate);
          const groupedWithPrev =
            prev && prev.senderRole !== 'SYSTEM' && prev.senderId === msg.senderId
            && prev.senderRole === msg.senderRole && prevDate && sameDay(prevDate, msgDate)
            && (msgDate.getTime() - prevDate.getTime()) < 2 * 60 * 1000;
          const spacingClass = idx === 0 ? '' : (groupedWithPrev ? 'mt-0.5' : 'mt-3');

          // Sentinel: __OFFER__:<offerId> → render OfferCard inline
          const offerMatch = msg.body.match(/^__OFFER__:([\w-]+)$/);
          if (offerMatch) {
            const offerId = offerMatch[1] ?? '';
            return (
              <div key={msg.id}>
                {showDateDivider && <DateDivider date={msgDate} _t={_t} locale={locale} />}
                <div className={`${spacingClass}`}>
                  {renderOffer(offerId)}
                </div>
              </div>
            );
          }

          if (isSystem) {
            return (
              <div key={msg.id}>
                {showDateDivider && <DateDivider date={msgDate} _t={_t} locale={locale} />}
                <div className={`flex justify-center ${spacingClass}`}>
                  {/* messages.html .sys — white pill w/ line border */}
                  <p className="rounded-full border border-line bg-white px-3.5 py-1 text-[12px] text-neutral-text-hint">{msg.body}</p>
                </div>
              </div>
            );
          }

          const tickStatus = isMe
            ? getTickStatus(msg, effectivePartiesForPresence, currentUserId)
            : null;

          return (
            <div key={msg.tempId ?? msg.id}>
              {showDateDivider && <DateDivider date={msgDate} _t={_t} locale={locale} />}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${spacingClass}`}>
                {/* messages.html .bubble — asymmetric top corner per side */}
                <div className={`max-w-[80%] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                  isMe
                    ? msg.sendStatus === 'failed'
                      ? 'rounded-2xl rounded-tr-[4px] bg-red-500 text-white'
                      : `rounded-2xl rounded-tr-[4px] ${tk.bubbleMe}`
                    : 'rounded-2xl rounded-tl-[4px] border border-line bg-white text-neutral-text'
                }`}>
                  {!isMe && !groupedWithPrev && (
                    <p data-user-content className="mb-0.5 text-[10px] font-medium text-neutral-text-hint">
                      {msg.sender?.displayName ?? roleLabel(msg.senderRole, _t)}
                    </p>
                  )}
                  <p data-user-content className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <div className={`mt-0.5 flex items-center justify-end gap-1 text-[9px] ${isMe ? tk.bubbleMeMeta : 'text-neutral-text-hint'}`}>
                    <span>{formatTime(msgDate, locale)}</span>
                    {tickStatus && <MessageTick status={tickStatus} _t={_t} />}
                    {tickStatus === 'failed' && (
                      <button
                        type="button"
                        onClick={() => retryMessage(msg)}
                        className="ml-0.5 rounded px-1 text-[9px] font-medium text-red-200 underline hover:text-white"
                      >
                        {_t('ui.conversation.composer.retry')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {typing && (
          <div className="mt-3 flex justify-start">
            <div className="rounded-2xl bg-surface-2 px-3.5 py-2">
              <p className="text-xs text-neutral-text-hint animate-pulse">
                {_t('ui.conversation.typing.label', { role: roleLabel(typingRole, _t) })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* ── Input or read-only banner ─────────────────────────────────── */}
      {readOnly ? (
        <div className="border-t border-line bg-surface-2 px-4 py-3 text-center">
          <p className="text-xs text-neutral-text-muted">
            {readOnlyReason ?? _t('ui.conversation.readOnly.default')}
          </p>
        </div>
      ) : (
        <div className="border-t border-line px-4 py-3">
          {/* ── Replace-active-offer confirmation dialog ─────────────── */}
          {replaceConfirmOpen && activeOffer && conversationType === 'listing' && (
            <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <Tag className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-900">{_t('ui.conversation.offer.replace.title')}</p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    {_t('ui.conversation.offer.replace.current')}
                    <strong>HK${activeOffer.priceHKD.toLocaleString('en-HK')}</strong>
                    {_t('ui.conversation.offer.replace.proposedBy', {
                      role: roleLabel(offerHistory.find((o) => o.id === activeOffer.id)?.proposedByRole ?? 'SELLER', _t),
                    })}
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    {_t('ui.conversation.offer.replace.newPrice')}
                    <strong>HK${offerPrice ? Number(offerPrice).toLocaleString('en-HK') : '—'}</strong>
                  </p>
                  <p className="mt-1 text-[10px] text-amber-600">
                    {_t('ui.conversation.offer.replace.note')}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplaceConfirmOpen(false)}
                  disabled={offerSubmitBusy}
                  className="rounded-md border border-line-2 bg-white px-3 py-1 text-xs font-medium text-neutral-text hover:bg-surface-2"
                >
                  {_t('ui.conversation.offer.replace.cancel')}
                </button>
                <button
                  type="button"
                  onClick={submitNewOffer}
                  disabled={offerSubmitBusy}
                  className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {_t('ui.conversation.offer.replace.confirm')}
                </button>
              </div>
            </div>
          )}

          {/* ── Offer form (collapsible, listing-conversation only) ─── */}
          {offerFormOpen && conversationType === 'listing' && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2">
              <Tag className="h-3.5 w-3.5 shrink-0 text-amber-700" />
              <span className="text-xs text-amber-900">{_t('ui.conversation.offer.form.label')}</span>
              <input
                type="number"
                value={offerPrice}
                onChange={(e) => setOfferPrice(e.target.value)}
                placeholder={activeOffer
                  ? _t('ui.conversation.offer.form.currentPlaceholder', { price: activeOffer.priceHKD })
                  : _t('ui.conversation.offer.form.amountPlaceholder')}
                min={1}
                className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-sm outline-none focus:border-amber-400"
              />
              <button
                type="button"
                disabled={offerSubmitBusy || !offerPrice || Number(offerPrice) <= 0}
                onClick={submitNewOffer}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {activeOffer ? _t('ui.conversation.offer.form.update') : _t('ui.conversation.offer.form.submit')}
              </button>
              <button
                type="button"
                onClick={() => { setOfferFormOpen(false); setOfferPrice(''); }}
                className="rounded p-1 text-amber-700 hover:bg-amber-100"
                aria-label={_t('ui.conversation.offer.form.close')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {offerFormOpen && conversationType === 'listing' && (
            <p className="mb-1 text-[10px] text-amber-700">
              {_t('ui.conversation.offer.form.note')}
            </p>
          )}

          {/* Phase 2 cross-sell picker (only seller, only when open) */}
          {(() => {
            const ep = (parties && parties.length > 0) ? parties : liveParties;
            const isSeller = ep.find((p) => p.id === currentUserId)?.role === 'SELLER';
            if (!isSeller || !crossSellOpen) return null;
            // Exclude the listing currently being discussed
            const currentLid = listingLinkId ?? listingId;
            const items = (myListings ?? []).filter((l) => l.id !== currentLid).slice(0, 6);
            return (
              <div className="mb-2 rounded-xl border border-line bg-white p-2 shadow-sm">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-medium text-neutral-text">{_t('ui.conversation.crossSell.title')}</p>
                  <button
                    type="button"
                    onClick={() => setCrossSellOpen(false)}
                    className="rounded p-1 text-neutral-text-hint hover:bg-surface-2"
                    aria-label={_t('ui.conversation.crossSell.close')}
                  ><X className="h-3 w-3" /></button>
                </div>
                {myListingsLoading && (
                  <p className="px-1 py-2 text-[10px] text-neutral-text-hint">{_t('ui.conversation.crossSell.loading')}</p>
                )}
                {!myListingsLoading && items.length === 0 && (
                  <p className="px-1 py-2 text-[10px] text-neutral-text-hint">{_t('ui.conversation.crossSell.empty')}</p>
                )}
                {!myListingsLoading && items.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          const origin = typeof window !== 'undefined' ? window.location.origin : '';
                          const line = _t('ui.conversation.crossSell.shareText', {
                            title: l.title,
                            price: l.priceHKD.toLocaleString(),
                          });
                          const text = `${line}\n${origin}/listing/${l.id}`;
                          setInput((prev) => prev ? `${prev}\n${text}` : text);
                          setCrossSellOpen(false);
                        }}
                        className={`flex items-start gap-1.5 rounded-lg border border-line p-1.5 text-left ${tk.quickHover}`}
                      >
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-surface-2">
                          {l.images?.[0]
                            ? <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center text-sm">🛍️</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p data-user-content className="truncate text-[10px] font-medium text-neutral-text">{l.title}</p>
                          <p className="text-[10px] text-neutral-text-muted">HK${l.priceHKD.toLocaleString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 px-1 text-[9px] text-neutral-text-hint">
                  {_t('ui.conversation.crossSell.note')}
                </p>
              </div>
            );
          })()}

          <div className="flex items-end gap-2">
            {/* Phase 2: Seller's cross-sell trigger — share my other listings */}
            {(() => {
              const ep = (parties && parties.length > 0) ? parties : liveParties;
              const isSeller = ep.find((p) => p.id === currentUserId)?.role === 'SELLER';
              if (!isSeller) return null;
              // Cross-sell needs the seller-listings endpoint. The authenticator
              // portal's api client has no such call, so the trigger is absent
              // there — same as before this component was shared.
              const listSellerListings = api.users.sellerListings;
              if (!listSellerListings) return null;
              return (
                <button
                  type="button"
                  onClick={() => {
                    setCrossSellOpen((v) => !v);
                    if (!myListings && !myListingsLoading) {
                      setMyListingsLoading(true);
                      listSellerListings(currentUserId, 12, 0)
                        .then((r) => setMyListings(r.items))
                        .catch(() => setMyListings([]))
                        .finally(() => setMyListingsLoading(false));
                    }
                  }}
                  title={_t('ui.conversation.crossSell.title')}
                  className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border bg-white transition ${
                    crossSellOpen
                      ? 'border-verify-border bg-verify-soft text-verify'
                      : 'border-line-2 text-neutral-text-muted hover:border-verify hover:text-verify'
                  }`}
                >
                  <Store className="h-4 w-4" />
                </button>
              );
            })()}
            {/* 提出議價 trigger — listing convs always show; if active offer exists,
                click → form pre-fills + on submit triggers replace-confirm dialog */}
            {conversationType === 'listing' && (
              <button
                type="button"
                onClick={() => setOfferFormOpen((v) => !v)}
                title={activeOffer
                  ? _t('ui.conversation.offer.triggerActive', { price: activeOffer.priceHKD })
                  : _t('ui.conversation.offer.trigger')}
                className={`relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border bg-white transition ${
                  activeOffer
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-line-2 text-neutral-text-muted hover:border-amber-300 hover:text-amber-700'
                }`}
              >
                <Tag className="h-4 w-4" />
                {activeOffer && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
                )}
              </button>
            )}
            {/* messages.html .composer input — rounded-full + line-2 border */}
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); handleTyping(); }}
              onKeyDown={handleKeyDown}
              placeholder={_t('ui.conversation.composer.placeholder')}
              rows={1}
              maxLength={500}
              className="flex-1 resize-none rounded-full border border-line-2 bg-white px-4 py-2.5 text-[14px] outline-none transition focus:border-verify"
            />
            {/* messages.html .composer .send — larger circular */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white shadow-[0_4px_12px_-4px_rgba(0,135,102,0.5)] transition disabled:opacity-40 ${tk.sendButton}`}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-right text-[9px] text-neutral-text-hint">{input.length}/500</p>
        </div>
      )}
    </div>
  );
}

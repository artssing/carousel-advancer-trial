'use client';

/**
 * ConversationPane — the actual IM UI body.
 *
 * Two contexts:
 * - `chrome="drawer"`: rendered inside ConversationDrawer's fixed/overlay shell.
 *   Shows X close button. Clicking nav links calls onClose (dismiss drawer).
 * - `chrome="pane"`: rendered as a first-class region (e.g. /messages right column).
 *   No X button. Optional back button (mobile). Links do NOT call onClose.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { X, Send, MessageCircle, ExternalLink, Store, ShieldCheck, ChevronLeft, Tag } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { OfferCard } from './offer-card';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const CONSUMER_URL = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';

function Link({ href, onClick, className, children, title }: {
  href: string; onClick?: () => void; className?: string; children: React.ReactNode; title?: string;
}) {
  return (
    <a href={`${CONSUMER_URL}${href}`} onClick={onClick} target="_blank" rel="noopener noreferrer" className={className} title={title}>
      {children}
    </a>
  );
}

interface Message {
  id: string;
  senderRole: 'BUYER' | 'SELLER' | 'AUTHENTICATOR' | 'SYSTEM';
  senderId: string | null;
  body: string;
  createdAt: string;
  sender?: { id: string; displayName: string } | null;
}

const ROLE_LABEL: Record<string, string> = {
  BUYER: '買家', SELLER: '賣家', AUTHENTICATOR: '鑑定師', SYSTEM: '系統',
};

const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function formatDateDivider(d: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysDiff = Math.round((startOfToday - dDay) / 86400000);
  if (daysDiff === 0) return '今日';
  if (daysDiff === 1) return '昨日';
  if (daysDiff > 1 && daysDiff < 7) return WEEKDAY_ZH[d.getDay()] ?? '';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function DateDivider({ date }: { date: Date }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-600">
        {formatDateDivider(date)}
      </span>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: '待付款', PAID: '已付款',
  SHIPPED_TO_AUTHENTICATOR: '已寄鑑定師', RECEIVED_BY_AUTHENTICATOR: '鑑定師簽收',
  AUTHENTICATING: '鑑定中', AUTH_PASSED: '鑑定通過', AUTH_FAILED: '鑑定不通過',
  SHIPPED_TO_BUYER: '已寄買家', DELIVERED: '已送達', COMPLETED: '已完成',
  DISPUTED: '爭議處理中', REFUNDED: '已退款',
  AWAITING_MEETUP: '等待面交', MEETUP_AUTHENTICATING: '面交鑑定中',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-700', PAID: 'bg-blue-100 text-blue-700',
  SHIPPED_TO_AUTHENTICATOR: 'bg-blue-100 text-blue-700', RECEIVED_BY_AUTHENTICATOR: 'bg-blue-100 text-blue-700',
  AUTHENTICATING: 'bg-amber-100 text-amber-700', AUTH_PASSED: 'bg-emerald-100 text-emerald-700',
  AUTH_FAILED: 'bg-red-100 text-red-700', SHIPPED_TO_BUYER: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-slate-100 text-slate-600',
  DISPUTED: 'bg-red-100 text-red-700', REFUNDED: 'bg-slate-100 text-slate-500',
  AWAITING_MEETUP: 'bg-amber-100 text-amber-700', MEETUP_AUTHENTICATING: 'bg-amber-100 text-amber-700',
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
  /** Render context — controls header buttons + link click behavior */
  chrome: 'drawer' | 'pane';
  /** Drawer close (X), or mobile pane back. Required for drawer; optional for pane */
  onClose?: () => void;
  /** Pane chrome on mobile may show a back button; pass true to render it */
  showBackButton?: boolean;
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
  chrome,
  onClose,
  showBackButton = false,
}: ConversationPaneProps) {
  const contextId = convIdProp ?? orderId ?? listingId ?? '';
  const [activeConvId, setActiveConvId] = useState<string | null>(convIdProp ?? null);
  const activeConvIdRef = useRef<string | null>(convIdProp ?? null);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
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
      setError(e?.message ?? '提出議價失敗');
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
      if (data?.conversationId) setActiveConvId(data.conversationId);
      const url = convIdProp
        ? `${API_URL}/api/conversations/by-id/${convIdProp}`
        : orderId
          ? `${API_URL}/api/conversations/order/${orderId}`
          : `${API_URL}/api/conversations/listing/${listingId}`;
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.conversationId) setActiveConvId(d.conversationId);
          if (d.messages) setMessages(d.messages);
        })
        .catch(() => {});
    });

    socket.on('message', (msg: Message & { conversationId?: string }) => {
      setMessages((prev) => {
        const myConv = activeConvIdRef.current;
        if (msg.conversationId && myConv && msg.conversationId !== myConv) return prev;
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTyping(false);
    });

    socket.on('typing', () => {
      setTyping(true);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTyping(false), 3000);
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
    if (!input.trim() || !socketRef.current || sending) return;
    setSending(true);
    setError(null);
    const ctx = convIdProp ? { conversationId: convIdProp } : orderId ? { orderId } : { listingId };
    socketRef.current.emit('send', { ...ctx, body: input.trim() });
    setInput('');
    setSending(false);
  }

  function handleTyping() {
    if (socketRef.current) {
      const ctx = convIdProp ? { conversationId: convIdProp } : orderId ? { orderId } : { listingId };
      socketRef.current.emit('typing', ctx);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {/* Mobile back button (pane chrome only) */}
            {chrome === 'pane' && showBackButton && onClose && (
              <button
                onClick={onClose}
                className="-ml-1 mt-0.5 rounded-lg p-1 hover:bg-slate-100"
                aria-label="返回對話列表"
              >
                <ChevronLeft className="h-5 w-5 text-slate-500" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-brand-600" />
                {counterpartyAuthenticatorId ? (
                  <Link href={`/authenticator/${counterpartyAuthenticatorId}`} onClick={linkOnClick}
                    className="truncate font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                    {counterpartyName}
                  </Link>
                ) : counterpartySellerId ? (
                  <Link href={`/seller/${counterpartySellerId}`} onClick={linkOnClick}
                    className="truncate font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                    {counterpartyName}
                  </Link>
                ) : counterpartyBuyerId ? (
                  <Link href={`/seller/${counterpartyBuyerId}`} onClick={linkOnClick}
                    className="truncate font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                    {counterpartyName}
                  </Link>
                ) : (
                  <h3 className="truncate font-semibold text-slate-900">{counterpartyName}</h3>
                )}
                {connected && <span className="h-2 w-2 rounded-full bg-emerald-500" title="已連線" />}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {orderStatus ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[orderStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[orderStatus] ?? orderStatus}
                  </span>
                ) : conversationType === 'listing' ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    商品查詢（未落單）
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {/* Drawer X close */}
          {chrome === 'drawer' && onClose && (
            <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 hover:bg-slate-100">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          )}
        </div>

        {/* Listing mini-card */}
        {listingLinkId && listingTitle && (
          <Link href={`/listing/${listingLinkId}`} onClick={linkOnClick}
            className="mt-3 flex items-center gap-2.5 rounded-xl border border-slate-200 p-2 transition hover:border-brand-300 hover:bg-slate-50">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              {listingImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listingImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base">📦</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800">{listingTitle}</p>
              <p className="text-[10px] text-slate-400">睇商品詳情 →</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </Link>
        )}

        {/* Seller mini-card */}
        {counterpartySellerId && sellerInfo && (
          <Link href={`/seller/${counterpartySellerId}`} onClick={linkOnClick}
            className="mt-2 flex items-center gap-2.5 rounded-xl border border-slate-200 p-2 transition hover:border-brand-300 hover:bg-slate-50">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {counterpartyName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-medium text-slate-700">{counterpartyName}</p>
                {sellerInfo.kycVerified && <ShieldCheck className="h-3 w-3 text-blue-500" />}
              </div>
              <p className="text-[10px] text-slate-400">
                已售 {sellerInfo.soldAsSellerCount} 件 · 上架中 {sellerInfo.activeListingsCount} 件
              </p>
            </div>
            <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
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
              ? 'border-slate-300 bg-slate-50 text-slate-500'
              : isAccepted
                ? (hLeft < 3 ? 'border-red-300 bg-red-50 text-red-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800')
                : (hLeft < 6 ? 'border-red-300 bg-red-50 text-red-800'
                  : hLeft < 12 ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-amber-200 bg-amber-50 text-amber-800');
            const label = isAccepted ? '✓ 議價成功' : `議價進行中 · 第 ${''}`;
            return (
              <div className={`mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${tone}`}>
                <div className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5" />
                  <span className="font-medium">{label} · HK${activeOffer.priceHKD.toLocaleString('en-HK')}</span>
                  {msLeft > 0 && (
                    <span className="opacity-75">
                      · 剩 {hLeft}h {mLeft}m
                    </span>
                  )}
                </div>
                {isAccepted && (
                  <Link
                    href={`/listing/${listingId ?? activeOffer.id}?offerId=${activeOffer.id}`}
                    onClick={linkOnClick}
                    className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700"
                  >
                    立即落單 →
                  </Link>
                )}
              </div>
            );
          })()
        )}

        {/* ── 議價歷史 collapsible ────────────────────────────────────── */}
        {offerHistory.length > 1 && (
          <div className="mt-2 rounded-lg border border-slate-100 bg-white">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
            >
              <span>議價過往（{offerHistory.length} 輪）</span>
              <span className="text-slate-400">{historyOpen ? '▲' : '▼'}</span>
            </button>
            {historyOpen && (
              <ul className="border-t border-slate-100 divide-y divide-slate-50 text-[11px]">
                {offerHistory.map((o) => {
                  const statusLabel =
                    o.status === 'PENDING' ? '待回覆'
                    : o.status === 'ACCEPTED' ? '✓ 已接受'
                    : o.status === 'REJECTED' ? '✗ 已拒絕'
                    : o.status === 'COUNTERED' ? '已還價'
                    : o.status === 'EXPIRED' ? '已過期'
                    : o.status === 'WITHDRAWN' ? '已撤回' : o.status;
                  const statusColor =
                    o.status === 'ACCEPTED' ? 'text-emerald-700'
                    : o.status === 'PENDING' ? 'text-amber-700'
                    : 'text-slate-400';
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                      <span className="text-slate-500">第 {o.roundNumber} 輪</span>
                      <span className="text-slate-700">HK${o.priceHKD.toLocaleString('en-HK')}</span>
                      <span className="text-slate-400">
                        由 {o.proposedByRole === 'BUYER' ? '買家' : '賣家'}
                      </span>
                      <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                      <span className="text-slate-400">
                        {new Date(o.createdAt).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-slate-50/30 px-4 py-3">
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
                {showDateDivider && <DateDivider date={msgDate} />}
                <div className={`${spacingClass}`}>
                  <OfferCard offerId={offerId} currentUserId={currentUserId} />
                </div>
              </div>
            );
          }

          if (isSystem) {
            return (
              <div key={msg.id}>
                {showDateDivider && <DateDivider date={msgDate} />}
                <div className={`flex justify-center ${spacingClass}`}>
                  <p className="rounded-full bg-slate-100 px-3 py-1 text-[10px] text-slate-500">{msg.body}</p>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id}>
              {showDateDivider && <DateDivider date={msgDate} />}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${spacingClass}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm ${
                  isMe ? 'bg-brand-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-100'
                }`}>
                  {!isMe && !groupedWithPrev && (
                    <p className="mb-0.5 text-[10px] font-medium text-slate-400">
                      {msg.sender?.displayName ?? ROLE_LABEL[msg.senderRole]}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <p className={`mt-0.5 text-right text-[9px] ${isMe ? 'text-brand-200' : 'text-slate-400'}`}>
                    {formatTime(msgDate)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {typing && (
          <div className="mt-3 flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-3.5 py-2">
              <p className="text-xs text-slate-400 animate-pulse">對方正在輸入…</p>
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
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center">
          <p className="text-xs text-slate-500">
            {readOnlyReason ?? '此對話已存檔，僅供查閱，無法發送新訊息。'}
          </p>
        </div>
      ) : (
        <div className="border-t border-slate-200 px-4 py-3">
          {/* ── Replace-active-offer confirmation dialog ─────────────── */}
          {replaceConfirmOpen && activeOffer && conversationType === 'listing' && (
            <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <Tag className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-900">取代而家嘅議價？</p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    當前議價：<strong>HK${activeOffer.priceHKD.toLocaleString('en-HK')}</strong>
                    （由 {activeOffer && offerHistory.find((o) => o.id === activeOffer.id)?.proposedByRole === 'BUYER' ? '買家' : '賣家'} 提出）
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    新出價：<strong>HK${offerPrice ? Number(offerPrice).toLocaleString('en-HK') : '—'}</strong>
                  </p>
                  <p className="mt-1 text-[10px] text-amber-600">
                    確認後，舊嘅議價會被撤回，新出價會通知對方。
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplaceConfirmOpen(false)}
                  disabled={offerSubmitBusy}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitNewOffer}
                  disabled={offerSubmitBusy}
                  className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  確認取代
                </button>
              </div>
            </div>
          )}

          {/* ── Offer form (collapsible, listing-conversation only) ─── */}
          {offerFormOpen && conversationType === 'listing' && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2">
              <Tag className="h-3.5 w-3.5 shrink-0 text-amber-700" />
              <span className="text-xs text-amber-900">議價 HK$</span>
              <input
                type="number"
                value={offerPrice}
                onChange={(e) => setOfferPrice(e.target.value)}
                placeholder={activeOffer ? `當前 HK$${activeOffer.priceHKD}` : '輸入金額'}
                min={1}
                className="flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-sm outline-none focus:border-amber-400"
              />
              <button
                type="button"
                disabled={offerSubmitBusy || !offerPrice || Number(offerPrice) <= 0}
                onClick={submitNewOffer}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {activeOffer ? '更新出價' : '提出'}
              </button>
              <button
                type="button"
                onClick={() => { setOfferFormOpen(false); setOfferPrice(''); }}
                className="rounded p-1 text-amber-700 hover:bg-amber-100"
                aria-label="取消"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {offerFormOpen && conversationType === 'listing' && (
            <p className="mb-1 text-[10px] text-amber-700">
              出價有效期 24 小時。對方接受後商品會預留，買家須喺 12 小時內完成落單。
            </p>
          )}

          <div className="flex items-end gap-2">
            {/* 提出議價 trigger — listing convs always show; if active offer exists,
                click → form pre-fills + on submit triggers replace-confirm dialog */}
            {conversationType === 'listing' && (
              <button
                type="button"
                onClick={() => setOfferFormOpen((v) => !v)}
                title={activeOffer ? `而家議價 HK$${activeOffer.priceHKD}（撳開更新）` : '提出議價'}
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                  activeOffer
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-slate-200 text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700'
                }`}
              >
                <Tag className="h-4 w-4" />
                {activeOffer && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
                )}
              </button>
            )}
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); handleTyping(); }}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息…"
              rows={1}
              maxLength={500}
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-right text-[9px] text-slate-400">{input.length}/500</p>
        </div>
      )}
    </div>
  );
}

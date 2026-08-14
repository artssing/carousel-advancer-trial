'use client';

// useSearchParams needs dynamic rendering — production build fix.
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, TierPill, Button, ListingThumb, ConfirmDialog } from '@authentik/ui';
import {
  formatHKD, tierForPrice, categoryByApiEnum,
  STATUS_LABEL_BASE, getStatusLabel, needsMyAction, isMeetupOrder, TERMINAL_STATUSES,
  sfTrackingUrl, orderGroup,
  type TabRole, type OrderGroup,
  getClientLocale, createT,
} from '@authentik/utils';
import { api, hasToken, clearToken, ApiError, getToken } from '@/lib/api';
import { ConversationDrawer } from '@/components/conversation-drawer';
import { MessageCircle } from 'lucide-react';
import { QrHandoverCard } from '@/components/qr-handover-card';

// ─── Types ───────────────────────────────────────────────────────────────────

// TabRole imported from @authentik/utils SSOT

// ─── Status helpers (SSOT — imported from @authentik/utils) ──────────────────
// STATUS_LABEL_BASE, getStatusLabel, needsMyAction, isMeetupOrder, TERMINAL_STATUSES
// all live in packages/utils/src/order-status.ts. Listing page reuses the same.

/** One page of orders. Most accounts never need a second one. */
const ORDERS_PAGE_SIZE = 20;

// Values are t() keys — these maps live outside the component, where _t does
// not exist, so the lookup happens at the use site.
const DELIVERY_LABEL_KEY: Record<string, string> = {
  SHIP: 'orders.deliveryLabel.ship',
  MEETUP_AUTH: 'orders.deliveryLabel.meetupAuth',
  MEETUP_3WAY: 'orders.deliveryLabel.meetup3way',
  MEETUP_DIRECT: 'orders.deliveryLabel.meetupDirect',
};

const PAYMENT_LABEL_KEY: Record<string, string> = {
  ONLINE_ESCROW: 'orders.paymentLabel.escrow',
  OFFLINE_CASH: 'orders.paymentLabel.cash',
};

const STATUS_VARIANT = (s: string): 'success' | 'warning' | 'brand' | 'danger' | 'default' => {
  if (s === 'COMPLETED' || s === 'AUTH_PASSED') return 'success';
  if (['AWAITING_PAYMENT', 'AUTHENTICATING', 'PAID'].includes(s)) return 'warning';
  if (['SHIPPED_TO_BUYER', 'SHIPPED_TO_AUTHENTICATOR'].includes(s)) return 'brand';
  if (['AUTH_FAILED', 'REFUNDED', 'DISPUTED'].includes(s)) return 'danger';
  return 'default';
};

const STATUS_STRIPE = (s: string) => {
  if (s === 'COMPLETED') return 'bg-emerald-500';
  if (s === 'AUTH_PASSED') return 'bg-emerald-400';
  if (['AWAITING_PAYMENT', 'PAID', 'AUTHENTICATING'].includes(s)) return 'bg-amber-400';
  if (['SHIPPED_TO_AUTHENTICATOR', 'SHIPPED_TO_BUYER', 'DELIVERED'].includes(s)) return 'bg-brand-500';
  if (['AUTH_FAILED', 'REFUNDED', 'DISPUTED'].includes(s)) return 'bg-red-500';
  return 'bg-slate-300';
};

// TERMINAL_STATUSES imported from @authentik/utils SSOT

// ─── Progress step bar (情境化：按交收/付款方式顯示唔同步驟) ─────────────────

type FlowType = 'ship_auth' | 'ship_noauth' | 'meetup_auth' | 'meetup_direct';

function getFlowType(delivery: string | null, hasAuth: boolean): FlowType {
  const isMeetup = ['MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT'].includes(delivery ?? '');
  if (isMeetup && !hasAuth) return 'meetup_direct';
  if (isMeetup && hasAuth) return 'meetup_auth';
  if (hasAuth) return 'ship_auth';
  return 'ship_noauth';
}

const FLOW_STEPS: Record<FlowType, string[]> = {
  ship_auth:     ['orders.timeline.pay', 'orderDetail.timeline.shippedToAuth', 'orders.timeline.authenticating', 'orderDetail.timeline.shippedToBuyer', 'orders.timeline.done'],
  ship_noauth:   ['orders.timeline.pay', 'orders.timeline.sellerShipped', 'orders.timeline.confirmReceipt', 'orders.timeline.done'],
  meetup_auth:   ['orderDetail.timeline.created', 'orders.timeline.meetupAuth', 'orders.timeline.done'],
  meetup_direct: ['orderDetail.timeline.created', 'orders.timeline.meetup', 'orders.timeline.done'],
};

function getCompletedStep(status: string, flow: FlowType): number {
  // ship_auth: 付款(0) → 寄至鑑定師(1) → 鑑定中(2) → 寄至買家(3) → 完成(4)
  if (flow === 'ship_auth') {
    if (status === 'AWAITING_PAYMENT') return -1;
    if (status === 'PAID') return 0;
    if (status === 'SHIPPED_TO_AUTHENTICATOR') return 1;
    if (status === 'AUTHENTICATING') return 1;
    if (status === 'AUTH_PASSED') return 2;
    if (status === 'AUTH_FAILED') return 2;
    if (status === 'SHIPPED_TO_BUYER') return 3;
    if (status === 'DELIVERED') return 3;
    if (status === 'COMPLETED') return 4;
    return 0;
  }
  // ship_noauth: 付款(0) → 賣家寄出(1) → 確認收貨(2) → 完成(3)
  if (flow === 'ship_noauth') {
    if (status === 'AWAITING_PAYMENT') return -1;
    if (status === 'PAID') return 0;
    if (status === 'SHIPPED_TO_BUYER') return 1;
    if (status === 'DELIVERED') return 2;
    if (status === 'COMPLETED') return 3;
    return 0;
  }
  // meetup_auth: 落單(0) → 面交鑑定(1) → 完成(2)
  if (flow === 'meetup_auth') {
    if (status === 'AWAITING_PAYMENT') return -1;
    if (status === 'PAID') return 0;
    if (['AUTHENTICATING', 'SHIPPED_TO_AUTHENTICATOR'].includes(status)) return 0;
    if (['AUTH_PASSED', 'AUTH_FAILED'].includes(status)) return 1;
    if (status === 'DELIVERED') return 1;
    if (status === 'COMPLETED') return 2;
    return 0;
  }
  // meetup_direct: 落單(0) → 面交(1) → 完成(2)
  if (status === 'AWAITING_PAYMENT') return -1;
  if (status === 'PAID') return 0;
  if (status === 'DELIVERED') return 1;
  if (status === 'COMPLETED') return 2;
  return 0;
}

/** Terminal-fail 狀態用紅色橫額取代步驟條 */
const TERMINAL_BANNER: Record<string, { icon: string; labelKey: string; descKey: string }> = {
  AUTH_FAILED: { icon: '✗', labelKey: 'orders.constant.terminalAuthFailed', descKey: 'orders.constant.terminalAuthFailedDesc' },
  REFUNDED:    { icon: '↩', labelKey: 'orders.constant.terminalRefunded',    descKey: 'orders.constant.terminalRefundedDesc' },
  DISPUTED:    { icon: '⚠', labelKey: 'orders.constant.terminalDisputed',    descKey: 'orders.constant.terminalDisputedDesc' },
};

function ProgressBar({ status, deliveryMethod, hasAuth }: {
  status: string;
  deliveryMethod: string | null;
  hasAuth: boolean;
}) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  // Terminal-fail 狀態：顯示橫額而非步驟條
  const banner = TERMINAL_BANNER[status];
  if (banner) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {banner.icon}
        </span>
        <div>
          <span className="font-semibold text-red-700">{_t(banner.labelKey)}</span>
          <span className="ml-1 text-red-600">{_t(banner.descKey)}</span>
        </div>
      </div>
    );
  }

  const flow = getFlowType(deliveryMethod, hasAuth);
  const steps = FLOW_STEPS[flow];
  const completedThrough = getCompletedStep(status, flow);

  return (
    <div className="flex items-start gap-0">
      {steps.map((stepKey, i) => {
        const done    = i <= completedThrough;
        const current = i === completedThrough + 1;
        return (
          <div key={stepKey} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : done ? 'bg-verify' : 'bg-line'}`} />
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-all
                ${done    ? 'bg-verify text-white' : ''}
                ${current ? 'bg-verify-soft text-verify ring-2 ring-verify' : ''}
                ${!done && !current ? 'bg-line text-neutral-text-hint' : ''}`}
              >
                {done ? '✓' : i + 1}
              </div>
              <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'invisible' : done ? 'bg-verify' : 'bg-line'}`} />
            </div>
            <span className={`mt-1 text-[9px] font-medium ${done ? 'text-verify' : current ? 'text-brand-600' : 'text-neutral-text-hint'}`}>
              {_t(stepKey)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonOrder() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="skeleton h-1 w-full !rounded-none" />
      <div className="flex gap-4 p-4">
        <div className="skeleton h-20 w-20 shrink-0 !rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-5 w-28 !rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ─── Action helpers (SSOT imports above) ───────────────────────────────────

/** Sort: action-needed first, within each group descending by time.
 *  `roleOf` reads the viewer's role off each row — the list is no longer split
 *  by role, so one fixed role for the whole list would be wrong. */
function sortOrders(orders: any[], userId: string, roleOf: (o: any) => TabRole): any[] {
  return [...orders].sort((a, b) => {
    const aNeeds = needsMyAction(a, userId, roleOf(a)) ? 1 : 0;
    const bNeeds = needsMyAction(b, userId, roleOf(b)) ? 1 : 0;
    if (aNeeds !== bNeeds) return bNeeds - aNeeds; // action-needed first
    // within group: non-terminal before terminal, then by time desc
    const aTerminal = TERMINAL_STATUSES.includes(a.status) ? 1 : 0;
    const bTerminal = TERMINAL_STATUSES.includes(b.status) ? 1 : 0;
    if (aTerminal !== bTerminal) return aTerminal - bTerminal;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get('role') as TabRole) ?? 'buyer';

  const [orders, setOrders]               = useState<any[]>([]);
  const [ordersTotal, setOrdersTotal]     = useState(0);
  /** Per-role "needs my action" totals, from the server — see below. */
  const [actionCounts, setActionCounts]   = useState({
    buyer: 0, seller: 0, auth: 0, disputed: 0, active: 0, done: 0,
  });
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [authOrders, setAuthOrders]       = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAuthenticator, setIsAuthenticator] = useState(false);
  const [loading, setLoading]             = useState(true);
  const [authed, setAuthed]               = useState(false);
  const [actionBusy, setActionBusy]       = useState<string | null>(null);
  // Ack v2: SF 單號 inline prompt（寄出唔再係齋 button）
  const [trackingPrompt, setTrackingPrompt] = useState<{ orderId: string; kind: 'toAuth' | 'toBuyerDirect' | 'toBuyer' } | null>(null);
  const [trackingNo, setTrackingNo] = useState('');
  // Ack v2: T+3 窗口內買家爭議 inline prompt
  const [disputePrompt, setDisputePrompt] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  // ConfirmDialog v2（founder 2026-07-12）：放款類 action 一律 modal
  const [moneyConfirm, setMoneyConfirm] = useState<{
    orderId: string; title: string; consequence: string; label: string; run: () => Promise<any>;
  } | null>(null);
  const [chatOrderId, setChatOrderId]     = useState<string | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [reviewRating, setReviewRating]   = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy]       = useState(false);
  /**
   * The page is organised by WHAT NEEDS DOING, not by which side of the trade
   * the user is on (founder 2026-08-14). Role is a secondary filter — an
   * account that both buys and sells had to check two tabs just to find out
   * whether anything was waiting on it.
   */
  const [activeGroup, setActiveGroup]     = useState<OrderGroup>(() => {
    const g = searchParams.get('group');
    return (['action', 'disputed', 'active', 'done'] as const).includes(g as OrderGroup)
      ? (g as OrderGroup)
      : 'action';
  });
  // `?role=` only pre-filters when it is actually in the URL — `initialRole`
  // falls back to 'buyer', which would silently hide every sale on first load.
  const [roleFilter, setRoleFilter]       = useState<TabRole | 'all'>(
    searchParams.get('role') && ['buyer', 'seller', 'auth'].includes(initialRole)
      ? initialRole
      : 'all',
  );

  /** 載入更多 — appends the next page; totals come from the server so the tab
   *  labels stay right even before everything is loaded. */
  const loadMoreOrders = useCallback(async () => {
    setLoadingMoreOrders(true);
    try {
      const page = await api.orders.list(ORDERS_PAGE_SIZE, orders.length);
      setOrders((prev) => [...prev, ...page.items]);
      setOrdersTotal(page.total);
    } catch { /* keep what is already on screen */ }
    setLoadingMoreOrders(false);
  }, [orders.length]);

  const fetchData = useCallback(async () => {
    if (!hasToken()) { setAuthed(false); setLoading(false); return; }
    setAuthed(true);
    try {
      // Paged (founder 2026-08-02). PAGE_SIZE covers the overwhelming majority
      // of accounts in one shot; 載入更多 handles the rest instead of shipping
      // every order a user has ever had on first paint.
      // The action counts come from the server, NOT from `orderPage.items`:
      // that is one page of 20, so deriving the tab badges from it would make
      // them disagree with the top-nav badge (which counts every order) the
      // moment an account has more than a page of history. Same query, same
      // `needsMyAction`, every surface.
      const [me, orderPage, counts] = await Promise.all([
        api.me(), api.orders.list(ORDERS_PAGE_SIZE), api.orders.badgeCount(),
      ]);
      setCurrentUserId(me.id);
      setOrders(orderPage.items);
      setOrdersTotal(orderPage.total);
      setActionCounts({
        buyer: counts.buyer, seller: counts.seller, auth: counts.auth,
        disputed: counts.disputed, active: counts.active, done: counts.done,
      });

      // 如果用戶有鑑定師身份，同時拉鑑定 inbox
      if (me.authenticator) {
        setIsAuthenticator(true);
        try {
          const inbox = await api.orders.authenticatorInbox();
          setAuthOrders(inbox);
        } catch {
          setAuthOrders([]);
        }
      }
    } catch (e: any) {
      if (e?.status === 401) { clearToken(); setAuthed(false); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function doAction(orderId: string, action: () => Promise<any>) {
    setActionBusy(orderId);
    setActionError(null);
    try { await action(); await fetchData(); }
    catch (e: any) { setActionError(e instanceof ApiError ? e.message : _t('orders.error.generic')); }
    finally { setActionBusy(null); }
  }

  // ── Which side of the trade is the viewer on, for THIS order ─────────────
  // Replaces the old `activeTab` role: with one merged list, role has to be
  // read off each row rather than off the tab the user happens to be on.
  /**
   * Which tab you are on lives in the URL.
   *
   * Founder 2026-08-14: opening an order from 已完成 and pressing back landed
   * on 待處理, because the tab was component state and the browser restored a
   * URL that never knew about it. `replace` rather than `push` — clicking
   * through four tabs should not cost four presses of the back button.
   */
  const selectView = useCallback((group: OrderGroup, role: TabRole | 'all') => {
    setActiveGroup(group);
    setRoleFilter(role);
    const qs = new URLSearchParams();
    if (group !== 'action') qs.set('group', group);
    if (role !== 'all') qs.set('role', role);
    const q = qs.toString();
    router.replace((q ? `/orders?${q}` : '/orders') as any, { scroll: false });
  }, [router]);

  const viewRole = useCallback((o: any): TabRole => (
    o.buyerId === currentUserId ? 'buyer'
    : o.sellerId === currentUserId ? 'seller'
    : 'auth'
  ), [currentUserId]);

  // Auth inbox rows are fetched separately; merge so one list covers every hat
  // the user wears. Dedupe in case an authenticator is also a party.
  const allOrders = (() => {
    const seen = new Set(orders.map((o) => o.id));
    return [...orders, ...authOrders.filter((o) => !seen.has(o.id))];
  })();

  const buyerOrders  = allOrders.filter((o) => o.buyerId === currentUserId);
  const sellerOrders = allOrders.filter((o) => o.sellerId === currentUserId);

  const inGroup = allOrders.filter(
    (o) => orderGroup(o, currentUserId ?? '', viewRole(o)) === activeGroup,
  );
  const visibleOrders = sortOrders(
    roleFilter === 'all' ? inGroup : inGroup.filter((o) => viewRole(o) === roleFilter),
    currentUserId ?? '',
    viewRole,
  );

  const { buyer: buyerActionCount, seller: sellerActionCount, auth: authActionCount } = actionCounts;
  const totalActionCount = buyerActionCount + sellerActionCount + authActionCount;

  /**
   * 待處理 and 爭議 must never hide behind pagination.
   *
   * The list comes back newest-first, so an order you have to act on can sit
   * on page 2 while the tab confidently says 「待處理 1」 over an empty screen —
   * exactly the mismatch this whole change is meant to remove. Both groups are
   * small by nature (they are the exception, not the archive), so it is cheaper
   * to finish loading them than to explain the gap.
   *
   * Compared against `inGroup`, not `visibleOrders`: the role chips are a view
   * filter, and a filtered-out row is loaded, not missing.
   */
  const expectedInGroup = activeGroup === 'action' ? totalActionCount
    : activeGroup === 'disputed' ? actionCounts.disputed
    : 0;
  useEffect(() => {
    if (activeGroup !== 'action' && activeGroup !== 'disputed') return;
    if (loading || loadingMoreOrders) return;
    if (orders.length >= ordersTotal) return;
    if (inGroup.length >= expectedInGroup) return;
    loadMoreOrders();
  }, [activeGroup, loading, loadingMoreOrders, orders.length, ordersTotal,
      inGroup.length, expectedInGroup, loadMoreOrders]);

  // ── Render actions (role read off the row, not off the tab) ───────────────
  function renderActions(o: any) {
    const role     = viewRole(o);
    const isBuyer  = o.buyerId  === currentUserId;
    const isSeller = o.sellerId === currentUserId;
    const meetup   = isMeetupOrder(o);
    const busy = actionBusy === o.id;
    const btns: { label: string; action: () => Promise<any>; primary?: boolean; desc?: string }[] = [];

    // ── Buyer actions ──────────────────────────────────────────────────────
    if (role === 'buyer') {
      // Pay (both SHIP and meetup ONLINE_ESCROW)
      if (o.status === 'AWAITING_PAYMENT') {
        const label = o.paymentMethod === 'OFFLINE_CASH'
          ? _t('orders.action.confirmMeetup')
          : _t('orders.action.pay');
        btns.push({ label, action: () => api.orders.pay(o.id), primary: true });
      }
      // Ack v2 (A4/B, founder 2026-07-10): SHIPPED_TO_BUYER 唔使買家 confirm —
      // T+3 自動完成。買家喺窗口內只有「提出爭議」（下面 renderShipWindow 處理）。
      if (!meetup && o.status === 'DELIVERED')
        btns.push({ label: _t('orders.action.complete'), action: async () => setMoneyConfirm({
          orderId: o.id, title: _t('orders.confirmDialog.completeTitle'), label: _t('orders.confirmDialog.completeLabel'),
          consequence: _t('orders.confirmDialog.completeConsequence'),
          run: () => api.orders.complete(o.id),
        }), primary: true });
      // MEETUP_AUTH dual-ack: buyer pickup → detail page (single ack at store)
      // No inline button — directed via detail page
      // MEETUP_3WAY: confirm meetup complete after auth passed
      if (o.deliveryMethod === 'MEETUP_3WAY' && o.status === 'AUTH_PASSED') {
        const label = o.escrowHeld
          ? _t('orders.action.completeMeetupRelease')
          : _t('orders.action.completeMeetup');
        btns.push({ label, action: async () => setMoneyConfirm({
          orderId: o.id, title: _t('orders.confirmDialog.meetupTitle'), label: _t('orders.confirmDialog.meetupLabel'),
          consequence: o.escrowHeld
            ? _t('orders.confirmDialog.meetupConsequenceRelease')
            : _t('orders.confirmDialog.meetupConsequence'),
          run: () => api.orders.completeMeetup(o.id),
        }), primary: true });
      }
      // Ack v2 (E): MEETUP_DIRECT 零 ack — 平台唔 hold 錢唔收佣。
      // 只有 legacy escrow 單先需要買家放款 click。
      if (o.deliveryMethod === 'MEETUP_DIRECT' && o.status === 'PAID' && o.escrowHeld) {
        btns.push({ label: _t('orders.action.completeMeetupDirect'), action: async () => setMoneyConfirm({
          orderId: o.id, title: _t('orders.confirmDialog.meetupTitle'), label: _t('orders.confirmDialog.completeLabel'),
          consequence: '此操作將即時向賣家放款，訂單隨即轉為已完成，且無法撤回。',
          run: () => api.orders.completeMeetup(o.id),
        }), primary: true });
      }
    }

    // ── Authenticator actions ─────────────────────────────────────────────
    if (role === 'auth') {
      // Meetup: start authentication directly from PAID
      if (meetup && o.status === 'PAID')
        btns.push({ label: _t('orders.action.startMeetupAuth'), action: () => api.orders.startMeetupAuth(o.id), primary: true });
    }

    // ── Seller actions (SHIP only — meetup 唔需要 seller ship) ─────────────
    if (role === 'seller') {
      // Ack v2 (A2): 寄出必須提供 SF 單號 — 開 inline prompt，唔係齋 click
      if (!meetup && o.status === 'PAID' && o.authenticatorId)
        btns.push({ label: _t('orders.action.shipToAuth'), action: async () => { setTrackingPrompt({ orderId: o.id, kind: 'toAuth' }); setTrackingNo(''); }, primary: true });
      if (!meetup && o.status === 'PAID' && !o.authenticatorId)
        btns.push({ label: '確認寄出至買家（填寫順豐單號）', action: async () => { setTrackingPrompt({ orderId: o.id, kind: 'toBuyerDirect' }); setTrackingNo(''); }, primary: true });
      if (!meetup && o.status === 'AUTH_PASSED')
        btns.push({ label: '確認寄出至買家（填寫順豐單號）', action: async () => { setTrackingPrompt({ orderId: o.id, kind: 'toBuyer' }); setTrackingNo(''); }, primary: true });
    }

    // Ack v2 extra panels（唔係 btns 一部分）
    const extras: React.ReactNode[] = [];

    // SF 單號 inline prompt
    if (trackingPrompt && trackingPrompt.orderId === o.id) {
      const kind = trackingPrompt.kind;
      extras.push(
        <div key="tracking" className="rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-semibold text-brand-800">{_t('orders.tracking.title')}</p>
          <input
            value={trackingNo}
            onChange={(e) => setTrackingNo(e.target.value)}
            placeholder={_t('orders.tracking.placeholder')}
            className="mt-2 w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || !trackingNo.trim()}
              onClick={() => doAction(o.id, async () => {
                const t = trackingNo.trim();
                if (kind === 'toAuth') await api.orders.shipToAuthenticator(o.id, t);
                else if (kind === 'toBuyerDirect') await api.orders.shipToBuyerDirect(o.id, t);
                else await api.orders.shipToBuyer(o.id, t);
                setTrackingPrompt(null);
              })}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {_t('orders.action.shipConfirm')}
            </button>
            <button type="button" onClick={() => setTrackingPrompt(null)} className="rounded-lg border border-brand-200 px-4 text-sm text-brand-700 hover:bg-brand-100">
              取消
            </button>
          </div>
        </div>,
      );
    }

    // Ack v2 (A4/B): 買家 SHIPPED_TO_BUYER — T+3 倒數 + 爭議
    if (isBuyer && !meetup && o.status === 'SHIPPED_TO_BUYER') {
      const eta = o.autoCompleteAt ? new Date(o.autoCompleteAt) : null;
      const daysLeft = eta ? Math.max(0, Math.ceil((eta.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;
      extras.push(
        <div key="shipwindow" className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900">
            {_t('orders.shipWindow.title')}
            {(o.authShipTrackingNo || o.sellerShipTrackingNo) && (
              <>
                （SF{' '}
                <a
                  href={sfTrackingUrl(o.authShipTrackingNo ?? o.sellerShipTrackingNo)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-amber-700"
                >
                  {o.authShipTrackingNo ?? o.sellerShipTrackingNo}
                </a>
                {' '}↗）
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
            {eta
              ? `如無異議，訂單將於 ${eta.toLocaleDateString('zh-HK')}（約 ${daysLeft} 日後）自動完成並放款。收到貨有問題請即提出爭議。`
              : _t('orders.shipWindow.autoCompleteDefault')}
          </p>
          {disputePrompt === o.id ? (
            <div className="mt-2">
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={2}
                placeholder={_t('orders.dispute.placeholder')}
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs outline-none focus:border-amber-500"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !disputeReason.trim()}
                  onClick={() => doAction(o.id, async () => {
                    await api.orders.disputeShip(o.id, disputeReason.trim());
                    setDisputePrompt(null);
                    setDisputeReason('');
                  })}
                  className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {_t('orders.dispute.confirm')}
                </button>
                <button type="button" onClick={() => setDisputePrompt(null)} className="rounded-lg border border-amber-300 px-3 text-xs text-amber-800 hover:bg-amber-100">
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setDisputePrompt(o.id); setDisputeReason(''); }}
              className="mt-2 w-full rounded-lg border border-amber-400 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              {_t('orders.shipWindow.disputeButton')}
            </button>
          )}
        </div>,
      );
    }

    // SF tracking P0: 任何一方喺已寄出狀態都可以 click 單號直去 SF 查件
    // （買家 SHIPPED_TO_BUYER 已喺上面 amber banner 有 link，唔重複）
    if (!(isBuyer && o.status === 'SHIPPED_TO_BUYER')
        && ['SHIPPED_TO_AUTHENTICATOR', 'SHIPPED_TO_BUYER'].includes(o.status)
        && (o.sellerShipTrackingNo || o.authShipTrackingNo)) {
      const no = o.status === 'SHIPPED_TO_AUTHENTICATOR'
        ? o.sellerShipTrackingNo
        : (o.authShipTrackingNo ?? o.sellerShipTrackingNo);
      if (no) {
        extras.push(
          <a
            key="sf-track"
            href={sfTrackingUrl(no)}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-line bg-surface-1 px-3 py-2 text-center text-xs font-medium text-neutral-text hover:border-brand-600 hover:text-brand-700"
          >
            📦 SF 追蹤：{no} ↗
          </a>,
        );
      }
    }

    // Ack v2 QR 交收卡
    if (isBuyer && o.status === 'AWAITING_BUYER_PICKUP') {
      extras.push(<QrHandoverCard key="qr-pickup" orderId={o.id} role="pickup" />);
    }
    if (isSeller && o.deliveryMethod === 'MEETUP_AUTH' && o.status === 'PAID') {
      extras.push(<QrHandoverCard key="qr-dropoff" orderId={o.id} role="dropoff" />);
    }
    // Three-way meetup has no drop-off QR — everyone is in the room at once —
    // so the appointment itself is the only instruction to give. Without this
    // the order sits in 待處理 with nothing on the card telling you why.
    if (o.deliveryMethod === 'MEETUP_3WAY' && o.status === 'PAID' && (isBuyer || isSeller)) {
      extras.push(
        <div key="meetup3way" className="rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-semibold text-brand-800">請與對方及鑑定師約定面交時間</p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-700">
            三方面交需買賣雙方同時到場，由鑑定師當場鑑定。請透過訂單訊息協定時間及地點。
          </p>
        </div>,
      );
    }

    if (btns.length === 0 && extras.length === 0) return null;
    return (
      <div className="mt-3 flex flex-col gap-2">
        {btns.map((b) => (
          <button
            key={b.label}
            disabled={busy}
            onClick={() => doAction(o.id, b.action)}
            className={`w-full rounded-xl py-2.5 text-sm font-medium transition disabled:opacity-50
              ${b.primary
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'border border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'}`}
          >
            {busy ? '處理中…' : b.label}
          </button>
        ))}
        {extras}
      </div>
    );
  }

  // Render Link-style nav button for dual-ack states (require photo viewing/upload in detail page)
  function renderDualAckNav(o: any) {
    const isBuyer  = o.buyerId  === currentUserId;
    const isSeller = o.sellerId === currentUserId;
    let label: string | null = null;
    if (isSeller && o.status === 'AUTH_RECEIVED_PENDING_SELLER_ACK') {
      label = _t('orders.dualAck.sellerAck');
    } else if (isSeller && o.status === 'SELLER_ACK_PENDING') {
      label = _t('orders.dualAck.sellerAckPending');
    } else if (isSeller && o.status === 'REFUNDED' && o.returnPhotosUploadedAt && !o.returnSellerAckAt) {
      label = _t('orders.dualAck.returnAck');
    }
    if (!label) return null;
    return (
      <Link href={`/orders/${o.id}` as any} className="block">
        <button
          type="button"
          className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700"
        >
          {label}
        </button>
      </Link>
    );
  }

  // ── Review helpers ─────────────────────────────────────────────────────────
  function openReview(orderId: string) {
    setReviewingOrderId(orderId);
    setReviewRating(5);
    setReviewComment('');
  }

  async function submitReview(orderId: string) {
    setReviewBusy(true);
    setActionError(null);
    try {
      await api.orders.review(orderId, {
        rating: reviewRating,
        ...(reviewComment.trim() ? { comment: reviewComment.trim() } : {}),
      });
      setReviewingOrderId(null);
      await fetchData();
    } catch (e: any) {
      setActionError(e instanceof ApiError ? e.message : _t('orders.error.review'));
    } finally {
      setReviewBusy(false);
    }
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!authed && !loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-slate-600">{_t('orders.empty.notLoggedIn')}</p>
        <Link href="/login">
          <Button className="mt-4">{_t('orders.empty.goToLogin')}</Button>
        </Link>
      </div>
    );
  }

  // ── Tab definition ─────────────────────────────────────────────────────────
  // 爭議中 appears ONLY when the account actually has a dispute (founder
  // 2026-08-14). A permanent 「爭議」 tab reads as a warning to every ordinary
  // customer that something can go wrong; it should show up when it applies to
  // them, and be unmissable when it does.
  const tabs: { id: OrderGroup; label: string; count: number; tone?: 'danger' }[] = [
    { id: 'action',   label: '待處理', count: totalActionCount },
    ...(actionCounts.disputed > 0
      ? [{ id: 'disputed' as OrderGroup, label: '爭議處理中', count: actionCounts.disputed, tone: 'danger' as const }]
      : []),
    { id: 'active',   label: '進行中', count: actionCounts.active },
    // 已完成 carries no number: it only ever grows, and a number that always
    // goes up is not information (founder 2026-08-14).
    { id: 'done',     label: '已完成', count: 0 },
  ];

  const roleChips: { id: TabRole | 'all'; label: string }[] = [
    { id: 'all',    label: '全部' },
    { id: 'buyer',  label: '我的購買' },
    { id: 'seller', label: '我的銷售' },
    ...(isAuthenticator ? [{ id: 'auth' as TabRole, label: '鑑定委託' }] : []),
  ];

  // ── Counterparty nodes (clickable) based on tab ───────────────────────────
  function counterpartyNodes(o: any): React.ReactNode {
    const linkCls = 'font-medium text-slate-700 hover:text-brand-700 hover:underline';
    const sellerLink = (id: string, name: string) => (
      <Link key={`s-${id}`} href={`/seller/${id}`} className={linkCls}>{name}</Link>
    );
    const buyerLink = (id: string, name: string) => (
      <Link key={`b-${id}`} href={`/buyer/${id}` as any} className={linkCls}>{name}</Link>
    );
    const role = viewRole(o);
    if (role === 'buyer') {
      if (!o.seller?.displayName || !o.seller?.id) return null;
      return <>賣家：{sellerLink(o.seller.id, o.seller.displayName)}</>;
    }
    if (role === 'seller') {
      if (!o.buyer?.displayName || !o.buyer?.id) return null;
      return <>買家：{buyerLink(o.buyer.id, o.buyer.displayName)}</>;
    }
    if (role === 'auth') {
      const nodes: React.ReactNode[] = [];
      if (o.buyer?.displayName && o.buyer?.id) {
        nodes.push(<span key="b">買家：{buyerLink(o.buyer.id, o.buyer.displayName)}</span>);
      }
      if (o.seller?.displayName && o.seller?.id) {
        nodes.push(<span key="s">賣家：{sellerLink(o.seller.id, o.seller.displayName)}</span>);
      }
      if (nodes.length === 0) return null;
      return (
        <>
          {nodes.map((n, i) => (
            <span key={i}>{i > 0 && <span className="mx-1.5 text-slate-300">·</span>}{n}</span>
          ))}
        </>
      );
    }
    return null;
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 pb-16 pt-8 sm:px-6">

      {/* ═══ L3 Header — serif big title + tagline ═══ */}
      <div className="mb-5">
        <h1 className="font-display-serif text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
          {_t('orders.pageTitle')}
        </h1>
        <p className="mt-1.5 text-[13px] text-neutral-text-hint">{_t('orders.pageSubtitle')}</p>
      </div>

      {/* ═══ L3 Tabs — bottom-border underline ═══ */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => {
          const isActive = activeGroup === t.id;
          const danger = t.tone === 'danger';
          return (
            <button
              key={t.id}
              onClick={() => selectView(t.id, roleFilter)}
              className={`relative -mb-px shrink-0 border-b-2 px-4 py-3 text-[14px] font-semibold transition ${
                isActive
                  ? danger ? 'border-danger text-danger' : 'border-brand-600 text-ink'
                  : danger
                    ? 'border-transparent text-danger/70 hover:text-danger'
                    : 'border-transparent text-neutral-text-hint hover:text-neutral-text-muted'
              }`}
            >
              {t.label}
              {!loading && t.count > 0 && (
                <span
                  className={`ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    // Red is reserved for the two groups that mean "this is on
                    // you": something to do, or money frozen in a dispute.
                    t.id === 'action' || danger
                      ? 'bg-danger text-white'
                      : 'bg-neutral-100 text-neutral-text-muted'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Role is a filter, not a destination — see the tab comment above. */}
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {roleChips.map((c) => (
          <button
            key={c.id}
            onClick={() => selectView(activeGroup, c.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
              roleFilter === c.id
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-line text-neutral-text-muted hover:border-line-2 hover:text-neutral-text'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {activeGroup === 'disputed' && (
        <div className="mb-5 rounded-xl border border-danger/30 bg-red-50 px-4 py-3">
          <p className="text-[13px] font-semibold text-danger">款項已凍結，待平台客服處理</p>
          <p className="mt-1 text-[12px] leading-relaxed text-red-800">
            爭議期間款項不會放予任何一方。客服將透過訂單訊息與買家、賣家及鑑定師聯絡，
            請留意訊息通知並提供所需資料。
          </p>
        </div>
      )}

      {actionError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => <SkeletonOrder key={i} />)}
        </div>
      )}

      {/* Nothing on screen for this group, but there ARE more pages to fetch —
          the tab count comes from the server and covers every order, so saying
          「沒有訂單」 here would be a lie the load-more button contradicts. */}
      {!loading && visibleOrders.length === 0 && orders.length < ordersTotal && (
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-500">此分類的訂單尚未載入。</p>
          <Button className="mt-4" onClick={loadMoreOrders} disabled={loadingMoreOrders}>
            {loadingMoreOrders ? '載入中…' : `載入更多（尚有 ${ordersTotal - orders.length} 張）`}
          </Button>
        </div>
      )}

      {/* Empty states per group. An empty 「待處理」 is the GOOD outcome, so it
          reads as reassurance rather than as an absence to be corrected. */}
      {!loading && visibleOrders.length === 0 && orders.length >= ordersTotal && (
        <div className="mt-12 text-center">
          {activeGroup === 'action' && (
            <>
              <p className="text-3xl">✅</p>
              <p className="mt-3 font-medium text-slate-700">目前沒有需要你處理的訂單</p>
              <p className="mt-1 text-sm text-slate-400">
                有訂單需要你付款、寄出或確認時，將於此顯示。
              </p>
              {allOrders.length === 0 && (
                <Link href="/browse"><Button className="mt-4">{_t('orders.empty.browse')}</Button></Link>
              )}
            </>
          )}
          {activeGroup === 'disputed' && (
            <>
              <p className="text-3xl">🛡️</p>
              <p className="mt-3 font-medium text-slate-700">沒有爭議中的訂單</p>
            </>
          )}
          {activeGroup === 'active' && (
            <>
              <p className="text-3xl">📦</p>
              <p className="mt-3 font-medium text-slate-700">沒有進行中的訂單</p>
              <p className="mt-1 text-sm text-slate-400">
                已付款、鑑定中或運送中的訂單，將於此顯示。
              </p>
            </>
          )}
          {activeGroup === 'done' && (
            <>
              <p className="text-3xl">🗂️</p>
              <p className="mt-3 font-medium text-slate-700">尚未有已完成的訂單</p>
              <p className="mt-1 text-sm text-slate-400">
                想查看你上架的商品，請前往
                <Link href="/my-listings" className="text-brand-600 hover:underline">「我的商品」</Link>。
              </p>
            </>
          )}
          {roleFilter !== 'all' && allOrders.length > 0 && (
            <button
              onClick={() => selectView(activeGroup, 'all')}
              className="mt-4 text-sm text-brand-600 hover:underline"
            >
              顯示全部角色的訂單
            </button>
          )}
        </div>
      )}

      {/* Order cards */}
      {!loading && visibleOrders.length > 0 && (
        <div className="space-y-4">
          {visibleOrders.map((o) => {
            const hasAuth = !!o.authenticatorId;
            const img     = o.listing?.coverUrl ?? o.listing?.images?.[0];
            const isAction = needsMyAction(o, currentUserId ?? '', viewRole(o));
            const cp = counterpartyNodes(o);

            // Lesson #20：卡內有多個獨立 interactive 元素（star rating / 評價
            // textarea / authenticator link / action buttons），唔可以 stretched-link
            // — 刪 outer hover，hover 只留返真正 clickable 嘅 inner Link。
            return (
              <div
                key={o.id}
                className={`overflow-hidden rounded-xl border bg-white shadow-sh1 ${
                  isAction ? 'border-verify' : 'border-line'
                }`}
              >
                <div className="p-5">
                  {/* Action needed banner */}
                  {isAction && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-verify-soft px-3 py-1.5 text-xs font-medium text-verify">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-verify" />
                      {_t('orders.actionNeeded')}
                    </div>
                  )}

                  {/* Top row: image + main info */}
                  <Link
                    href={`/listing/${o.listingId ?? o.listing?.id}`}
                    className="group flex gap-4 rounded-xl transition hover:bg-slate-50"
                  >
                    <ListingThumb
                      src={img}
                      alt={o.listing?.title}
                      emoji={categoryByApiEnum(o.listing?.category)?.emoji}
                      className="h-20 w-20 shrink-0 rounded-xl"
                      imgClassName="transition group-hover:scale-105"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-snug text-slate-900 line-clamp-2 group-hover:text-brand-700">
                          {o.listing?.title}
                        </p>
                        <span className="shrink-0 font-mono text-[10px] text-slate-300">
                          #{o.id.slice(0, 8)}
                        </span>
                      </div>

                      {/* Price + tier */}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-brand-600">
                          {formatHKD(o.salePriceHKD)}
                        </span>
                        <TierPill tier={tierForPrice(o.salePriceHKD) as 1 | 2 | 3} />
                      </div>

                      {/* Status badge */}
                      <div className="mt-2">
                        <Badge variant={STATUS_VARIANT(o.status)}>
                          {getStatusLabel(o.status, o.deliveryMethod)}
                        </Badge>
                      </div>
                    </div>
                  </Link>

                  {/* Counterparty (outside outer listing Link so role names can be clickable) */}
                  {cp && (
                    <p className="mt-2 text-xs text-slate-500">{cp}</p>
                  )}

                  {/* Delivery + payment badges */}
                  {(o.deliveryMethod || o.paymentMethod) && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                      {o.deliveryMethod && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          🚚 {_t(DELIVERY_LABEL_KEY[o.deliveryMethod] ?? o.deliveryMethod)}
                        </span>
                      )}
                      {o.paymentMethod && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          💳 {_t(PAYMENT_LABEL_KEY[o.paymentMethod] ?? o.paymentMethod)}
                        </span>
                      )}
                      {o.meetupLocation && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          📍 {o.meetupLocation}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Authenticator info */}
                  {o.authenticator && (
                    <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      <span>🔍</span>
                      <span>鑑定師：
                        {o.authenticator.id ? (
                          <Link href={`/authenticator/${o.authenticator.id}`} className="font-medium text-slate-700 hover:text-brand-700 hover:underline">
                            {o.authenticator.displayName}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-700">{o.authenticator.displayName}</span>
                        )}
                      </span>
                      <span className="ml-auto text-amber-500">{'★'.repeat(Math.min(o.authenticator.starRating, 5))}</span>
                    </div>
                  )}

                  {/* Auth verdict */}
                  {o.authVerdict && (
                    <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium
                      ${o.authVerdict === 'PASSED' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {o.authVerdict === 'PASSED' ? _t('orders.verdictPassed') : _t('orders.verdictFailed')}
                      {o.authNotes && <span className="ml-1 font-normal">· {o.authNotes}</span>}
                    </div>
                  )}

                  {/* Review section (buyer tab, COMPLETED orders with authenticator) */}
                  {viewRole(o) === 'buyer' && o.status === 'COMPLETED' && hasAuth && (
                    <div className="mt-3">
                      {o.review ? (
                        /* Already reviewed — show it */
                        <div className="rounded-lg bg-amber-50 px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-slate-600">{_t('orders.review.title')}</span>
                            <span className="text-amber-500">
                              {'★'.repeat(o.review.rating)}{'☆'.repeat(5 - o.review.rating)}
                            </span>
                          </div>
                          {o.review.comment && (
                            <p className="mt-1 text-xs text-slate-600">「{o.review.comment}」</p>
                          )}
                        </div>
                      ) : reviewingOrderId === o.id ? (
                        /* Review form */
                        <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
                          <p className="text-xs font-medium text-slate-700">{_t('orders.review.rateAuth')}</p>
                          {/* Star picker */}
                          <div className="mt-2 flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className={`text-xl transition-transform hover:scale-110 ${
                                  star <= reviewRating ? 'text-amber-400' : 'text-slate-300'
                                }`}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                          {/* Comment */}
                          <textarea
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder={_t('orders.review.placeholder')}
                            rows={2}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => submitReview(o.id)}
                              disabled={reviewBusy}
                              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                            >
                              {reviewBusy ? _t('orders.review.submitting') : _t('orders.review.submit')}
                            </button>
                            <button
                              onClick={() => setReviewingOrderId(null)}
                              disabled={reviewBusy}
                              className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Show review button */
                        <button
                          onClick={() => openReview(o.id)}
                          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                        >
                          {_t('orders.review.rateButton')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Progress bar */}
                  <div className="mt-4 px-1">
                    <ProgressBar status={o.status} deliveryMethod={o.deliveryMethod} hasAuth={hasAuth} />
                  </div>

                  {/* Actions */}
                  {renderActions(o)}

                  {/* Dual-ack nav button (requires photo viewing/upload — goes to detail page) */}
                  <div className="mt-2">
                    {renderDualAckNav(o)}
                  </div>

                  {/* Message button (read-only for terminal orders) */}
                  <div className="mt-2 flex gap-2">
                    <Link href={`/orders/${o.id}`} className="flex-1">
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                      >
                        {_t('orders.detailLink')}
                      </button>
                    </Link>
                    <button
                      onClick={() => setChatOrderId(o.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(o.status) ? _t('orders.messageArchived') : _t('orders.messageButton')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chat drawer */}
      {chatOrderId && currentUserId && (() => {
        const o = [...orders, ...authOrders].find((x) => x.id === chatOrderId);
        if (!o) return null;
        const chatRole = viewRole(o);
        const cpName =
          chatRole === 'buyer'  ? (o.seller?.displayName ?? '賣家') :
          chatRole === 'seller' ? (o.buyer?.displayName ?? _t('orderDetail.label.buyer')) :
          `${o.buyer?.displayName ?? '買家'} / ${o.seller?.displayName ?? '賣家'}`;
        return (
          <ConversationDrawer
            orderId={chatOrderId}
            currentUserId={currentUserId}
            counterpartyName={cpName}
            listingTitle={o.listing?.title ?? ''}
            listingLinkId={o.listing?.id}
            listingImage={o.listing?.coverUrl ?? o.listing?.images?.[0]}
            counterpartySellerId={chatRole === 'buyer' ? o.seller?.id : undefined}
            counterpartyBuyerId={chatRole === 'seller' ? o.buyer?.id : undefined}
            orderStatus={o.status}
            conversationType="order"
            onClose={() => setChatOrderId(null)}
            readOnly={['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(o.status)}
            readOnlyReason={
              o.status === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
              : o.status === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
              : '訂單爭議處理中，對話已鎖定，請聯絡客服。'
            }
          />
        );
      })()}

      {/* ConfirmDialog v2 — T1 放款類（唔准背景 dismiss） */}
      {moneyConfirm && (
        <ConfirmDialog
          open
          onCancel={() => setMoneyConfirm(null)}
          onConfirm={() => {
            const { orderId, run } = moneyConfirm;
            setMoneyConfirm(null);
            doAction(orderId, run);
          }}
          title={moneyConfirm.title}
          consequence={moneyConfirm.consequence}
          confirmLabel={moneyConfirm.label}
          severity="danger"
          busy={actionBusy === moneyConfirm.orderId}
          dismissOnBackdrop={false}
        />
      )}
      {!loading && visibleOrders.length > 0 && orders.length < ordersTotal && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={loadMoreOrders}
            disabled={loadingMoreOrders}
            className="rounded-lg border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-sh1 transition hover:bg-surface-2 disabled:opacity-50"
          >
            {loadingMoreOrders ? '載入中…' : `載入更多（尚有 ${ordersTotal - orders.length} 張）`}
          </button>
        </div>
      )}
    </div>
  );
}

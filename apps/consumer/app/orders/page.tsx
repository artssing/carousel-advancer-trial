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
  sfTrackingUrl,
  type TabRole,
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

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '物流寄送',
  MEETUP_AUTH: '鑑定師面交',
  MEETUP_3WAY: '三方面交',
  MEETUP_DIRECT: '雙方面交',
};

const PAYMENT_LABEL: Record<string, string> = {
  ONLINE_ESCROW: '線上託管',
  OFFLINE_CASH: '線下現金',
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
  ship_auth:     ['付款', '寄至鑑定師', '鑑定中', '寄至買家', '完成'],
  ship_noauth:   ['付款', '賣家寄出', '確認收貨', '完成'],
  meetup_auth:   ['落單', '面交鑑定', '完成'],
  meetup_direct: ['落單', '面交', '完成'],
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
const TERMINAL_BANNER: Record<string, { icon: string; label: string; desc: string }> = {
  AUTH_FAILED: { icon: '✗', label: '鑑定不通過', desc: '商品將退回賣家，買家獲全額退款。' },
  REFUNDED:    { icon: '↩', label: '已退款',     desc: '款項已退回買家帳戶。' },
  DISPUTED:    { icon: '⚠', label: '爭議處理中', desc: '平台正在跟進，請留意通知。' },
};

function ProgressBar({ status, deliveryMethod, hasAuth }: {
  status: string;
  deliveryMethod: string | null;
  hasAuth: boolean;
}) {
  // Terminal-fail 狀態：顯示橫額而非步驟條
  const banner = TERMINAL_BANNER[status];
  if (banner) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {banner.icon}
        </span>
        <div>
          <span className="font-semibold text-red-700">{banner.label}</span>
          <span className="ml-1 text-red-600">{banner.desc}</span>
        </div>
      </div>
    );
  }

  const flow = getFlowType(deliveryMethod, hasAuth);
  const steps = FLOW_STEPS[flow];
  const completedThrough = getCompletedStep(status, flow);

  return (
    <div className="flex items-start gap-0">
      {steps.map((label, i) => {
        const done    = i <= completedThrough;
        const current = i === completedThrough + 1;
        return (
          <div key={label} className="flex flex-1 flex-col items-center">
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
              {label}
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

/** Sort: action-needed first, within each group descending by time */
function sortOrders(orders: any[], userId: string, tab: TabRole): any[] {
  return [...orders].sort((a, b) => {
    const aNeeds = needsMyAction(a, userId, tab) ? 1 : 0;
    const bNeeds = needsMyAction(b, userId, tab) ? 1 : 0;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get('role') as TabRole) ?? 'buyer';

  const [orders, setOrders]               = useState<any[]>([]);
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
  const [activeTab, setActiveTab]         = useState<TabRole>(
    ['buyer', 'seller', 'auth'].includes(initialRole) ? initialRole : 'buyer',
  );

  const fetchData = useCallback(async () => {
    if (!hasToken()) { setAuthed(false); setLoading(false); return; }
    setAuthed(true);
    try {
      const [me, orderList] = await Promise.all([api.me(), api.orders.list()]);
      setCurrentUserId(me.id);
      setOrders(orderList);

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
    catch (e: any) { setActionError(e instanceof ApiError ? e.message : '操作失敗，請重試'); }
    finally { setActionBusy(null); }
  }

  // ── Filter by tab ────────────────────────────────────────────────────────
  const buyerOrders  = orders.filter((o) => o.buyerId === currentUserId);
  const sellerOrders = orders.filter((o) => o.sellerId === currentUserId);

  const visibleOrders = (() => {
    if (activeTab === 'buyer')  return sortOrders(buyerOrders, currentUserId ?? '', 'buyer');
    if (activeTab === 'seller') return sortOrders(sellerOrders, currentUserId ?? '', 'seller');
    if (activeTab === 'auth')   return sortOrders(authOrders, currentUserId ?? '', 'auth');
    return [];
  })();

  // Count orders needing action
  const buyerActionCount  = buyerOrders.filter((o) => needsMyAction(o, currentUserId ?? '', 'buyer')).length;
  const sellerActionCount = sellerOrders.filter((o) => needsMyAction(o, currentUserId ?? '', 'seller')).length;
  const authActionCount   = authOrders.filter((o) => needsMyAction(o, currentUserId ?? '', 'auth')).length;

  // ── Render actions (per tab role) ──────────────────────────────────────────
  function renderActions(o: any) {
    const isBuyer  = o.buyerId  === currentUserId;
    const isSeller = o.sellerId === currentUserId;
    const meetup   = isMeetupOrder(o);
    const busy = actionBusy === o.id;
    const btns: { label: string; action: () => Promise<any>; primary?: boolean; desc?: string }[] = [];

    // ── Buyer actions ──────────────────────────────────────────────────────
    if (activeTab === 'buyer' || (activeTab !== 'auth' && isBuyer)) {
      // Pay (both SHIP and meetup ONLINE_ESCROW)
      if (o.status === 'AWAITING_PAYMENT') {
        const label = o.paymentMethod === 'OFFLINE_CASH'
          ? '確認準備面交'
          : '確認付款（模擬）';
        btns.push({ label, action: () => api.orders.pay(o.id), primary: true });
      }
      // Ack v2 (A4/B, founder 2026-07-10): SHIPPED_TO_BUYER 唔使買家 confirm —
      // T+3 自動完成。買家喺窗口內只有「提出爭議」（下面 renderShipWindow 處理）。
      if (!meetup && o.status === 'DELIVERED')
        btns.push({ label: '確認完成交易', action: async () => setMoneyConfirm({
          orderId: o.id, title: '確認完成交易？', label: '確認完成 + 放款',
          consequence: '呢個動作會即時釋放款項畀賣家，訂單轉為完成，不可撤回。',
          run: () => api.orders.complete(o.id),
        }), primary: true });
      // MEETUP_AUTH dual-ack: buyer pickup → detail page (single ack at store)
      // No inline button — directed via detail page
      // MEETUP_3WAY: confirm meetup complete after auth passed
      if (o.deliveryMethod === 'MEETUP_3WAY' && o.status === 'AUTH_PASSED') {
        const label = o.escrowHeld
          ? '確認面交完成（放款畀賣家+鑑定師）'
          : '確認面交完成';
        btns.push({ label, action: async () => setMoneyConfirm({
          orderId: o.id, title: '確認面交完成？', label: '確認完成',
          consequence: o.escrowHeld
            ? '呢個動作會即時放款畀賣家同鑑定師，訂單轉為完成，不可撤回。'
            : '訂單會轉為完成，不可撤回。',
          run: () => api.orders.completeMeetup(o.id),
        }), primary: true });
      }
      // Ack v2 (E): MEETUP_DIRECT 零 ack — 平台唔 hold 錢唔收佣。
      // 只有 legacy escrow 單先需要買家放款 click。
      if (o.deliveryMethod === 'MEETUP_DIRECT' && o.status === 'PAID' && o.escrowHeld) {
        btns.push({ label: '確認面交完成（放款畀賣家）', action: async () => setMoneyConfirm({
          orderId: o.id, title: '確認面交完成？', label: '確認完成 + 放款',
          consequence: '呢個動作會即時放款畀賣家，訂單轉為完成，不可撤回。',
          run: () => api.orders.completeMeetup(o.id),
        }), primary: true });
      }
    }

    // ── Authenticator actions (鑑定 tab) ──────────────────────────────────
    if (activeTab === 'auth') {
      // Meetup: start authentication directly from PAID
      if (meetup && o.status === 'PAID')
        btns.push({ label: '開始面交鑑定', action: () => api.orders.startMeetupAuth(o.id), primary: true });
    }

    // ── Seller actions (SHIP only — meetup 唔需要 seller ship) ─────────────
    if (activeTab === 'seller' || (activeTab !== 'auth' && isSeller)) {
      // Ack v2 (A2): 寄出必須提供 SF 單號 — 開 inline prompt，唔係齋 click
      if (!meetup && o.status === 'PAID' && o.authenticatorId)
        btns.push({ label: '已寄出至鑑定師（入 SF 單號）', action: async () => { setTrackingPrompt({ orderId: o.id, kind: 'toAuth' }); setTrackingNo(''); }, primary: true });
      if (!meetup && o.status === 'PAID' && !o.authenticatorId)
        btns.push({ label: '已寄出至買家（入 SF 單號）', action: async () => { setTrackingPrompt({ orderId: o.id, kind: 'toBuyerDirect' }); setTrackingNo(''); }, primary: true });
      if (!meetup && o.status === 'AUTH_PASSED')
        btns.push({ label: '已寄出至買家（入 SF 單號）', action: async () => { setTrackingPrompt({ orderId: o.id, kind: 'toBuyer' }); setTrackingNo(''); }, primary: true });
    }

    // Ack v2 extra panels（唔係 btns 一部分）
    const extras: React.ReactNode[] = [];

    // SF 單號 inline prompt
    if (trackingPrompt && trackingPrompt.orderId === o.id) {
      const kind = trackingPrompt.kind;
      extras.push(
        <div key="tracking" className="rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-semibold text-brand-800">輸入 SF Express 運單編號（必填）</p>
          <input
            value={trackingNo}
            onChange={(e) => setTrackingNo(e.target.value)}
            placeholder="例：SF1234567890123"
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
              確認寄出
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
            📦 貨物已寄出
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
              : '如無異議，訂單將於寄出後 3 日自動完成並放款。'}
          </p>
          {disputePrompt === o.id ? (
            <div className="mt-2">
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={2}
                placeholder="講低問題（必填）— 例：收到嘅唔係訂單商品 / 有損壞"
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
                  確認提出爭議
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
              收到貨有問題 — 提出爭議
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
      label = '睇鑑定師收件相 + 確認 →';
    } else if (isSeller && o.status === 'SELLER_ACK_PENDING') {
      label = '睇鑑定師接收相 + 確認交付 →';
    } else if (isSeller && o.status === 'REFUNDED' && o.returnPhotosUploadedAt && !o.returnSellerAckAt) {
      label = '睇退貨相 + 確認取回 →';
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
      setActionError(e instanceof ApiError ? e.message : '提交評價失敗，請重試');
    } finally {
      setReviewBusy(false);
    }
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!authed && !loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-slate-600">請先登入查看訂單。</p>
        <Link href="/login">
          <Button className="mt-4">前往登入</Button>
        </Link>
      </div>
    );
  }

  // ── Tab definition ─────────────────────────────────────────────────────────
  const tabs: { id: TabRole; label: string; count: number; actionCount: number }[] = [
    { id: 'buyer',  label: '我買入', count: buyerOrders.length,  actionCount: buyerActionCount },
    { id: 'seller', label: '我賣出', count: sellerOrders.length, actionCount: sellerActionCount },
    ...(isAuthenticator
      ? [{ id: 'auth' as TabRole, label: '我鑑定', count: authOrders.length, actionCount: authActionCount }]
      : []),
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
    if (activeTab === 'buyer') {
      if (!o.seller?.displayName || !o.seller?.id) return null;
      return <>賣家：{sellerLink(o.seller.id, o.seller.displayName)}</>;
    }
    if (activeTab === 'seller') {
      if (!o.buyer?.displayName || !o.buyer?.id) return null;
      return <>買家：{buyerLink(o.buyer.id, o.buyer.displayName)}</>;
    }
    if (activeTab === 'auth') {
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
          我的訂單
        </h1>
        <p className="mt-1.5 text-[13px] text-neutral-text-hint">追蹤買入、賣出及鑑定進度</p>
      </div>

      {/* ═══ L3 Tabs — bottom-border underline ═══ */}
      <div className="mb-6 flex gap-1 border-b border-line">
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative -mb-px border-b-2 px-4 py-3 text-[14px] font-semibold transition ${
                isActive
                  ? 'border-brand-600 text-ink'
                  : 'border-transparent text-neutral-text-hint hover:text-neutral-text-muted'
              }`}
            >
              {t.label}{!loading && ` (${t.count})`}
              {t.actionCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {t.actionCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {actionError && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => <SkeletonOrder key={i} />)}
        </div>
      )}

      {/* Empty states per tab */}
      {!loading && visibleOrders.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-3xl">{activeTab === 'seller' ? '🏪' : activeTab === 'auth' ? '🔍' : '📦'}</p>
          {activeTab === 'buyer' && (
            <>
              <p className="mt-3 font-medium text-slate-700">未有買入訂單</p>
              <p className="mt-1 text-sm text-slate-400">去瀏覽商品，找到心水就落單吧！</p>
              <Link href="/browse"><Button className="mt-4">瀏覽商品</Button></Link>
            </>
          )}
          {activeTab === 'seller' && (
            <>
              <p className="mt-3 font-medium text-slate-700">未有賣出訂單</p>
              <p className="mt-1 text-sm text-slate-400">
                當買家購買你上架嘅商品後，訂單會出現喺呢度。
              </p>
              <p className="mt-1 text-sm text-slate-400">
                想睇你上架嘅商品？去
                <Link href="/my-listings" className="text-brand-600 hover:underline">「我的商品」</Link>。
              </p>
              <Link href="/sell"><Button className="mt-4">上架商品</Button></Link>
            </>
          )}
          {activeTab === 'auth' && (
            <>
              <p className="mt-3 font-medium text-slate-700">暫無鑑定訂單</p>
              <p className="mt-1 text-sm text-slate-400">
                當買家揀你做鑑定師後，訂單會出現喺呢度。
              </p>
            </>
          )}
        </div>
      )}

      {/* Order cards */}
      {!loading && visibleOrders.length > 0 && (
        <div className="space-y-4">
          {visibleOrders.map((o) => {
            const hasAuth = !!o.authenticatorId;
            const img     = o.listing?.coverUrl ?? o.listing?.images?.[0];
            const isAction = needsMyAction(o, currentUserId ?? '', activeTab);
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
                      需要你處理
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
                          🚚 {DELIVERY_LABEL[o.deliveryMethod] ?? o.deliveryMethod}
                        </span>
                      )}
                      {o.paymentMethod && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          💳 {PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}
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
                      {o.authVerdict === 'PASSED' ? '✓ 鑑定結果：真品' : '✗ 鑑定結果：假貨'}
                      {o.authNotes && <span className="ml-1 font-normal">· {o.authNotes}</span>}
                    </div>
                  )}

                  {/* Review section (buyer tab, COMPLETED orders with authenticator) */}
                  {activeTab === 'buyer' && o.status === 'COMPLETED' && hasAuth && (
                    <div className="mt-3">
                      {o.review ? (
                        /* Already reviewed — show it */
                        <div className="rounded-lg bg-amber-50 px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-slate-600">你的評價</span>
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
                          <p className="text-xs font-medium text-slate-700">評價鑑定師</p>
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
                            placeholder="分享你對鑑定服務嘅體驗（可選）"
                            rows={2}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => submitReview(o.id)}
                              disabled={reviewBusy}
                              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                            >
                              {reviewBusy ? '提交中…' : '提交評價'}
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
                          ⭐ 評價鑑定師
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
                        訂單詳情 →
                      </button>
                    </Link>
                    <button
                      onClick={() => setChatOrderId(o.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(o.status) ? '查閱訊息存檔' : '訊息'}
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
        const cpName =
          activeTab === 'buyer'  ? (o.seller?.displayName ?? '賣家') :
          activeTab === 'seller' ? (o.buyer?.displayName ?? '買家') :
          `${o.buyer?.displayName ?? '買家'} / ${o.seller?.displayName ?? '賣家'}`;
        return (
          <ConversationDrawer
            orderId={chatOrderId}
            currentUserId={currentUserId}
            counterpartyName={cpName}
            listingTitle={o.listing?.title ?? ''}
            listingLinkId={o.listing?.id}
            listingImage={o.listing?.coverUrl ?? o.listing?.images?.[0]}
            counterpartySellerId={activeTab === 'buyer' ? o.seller?.id : undefined}
            counterpartyBuyerId={activeTab === 'seller' ? o.buyer?.id : undefined}
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
    </div>
  );
}

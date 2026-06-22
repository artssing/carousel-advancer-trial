'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge, Button } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';
import { Package, Handshake, MapPin, MessageCircle } from 'lucide-react';
import { api, type InboxOrder } from '@/lib/api';
import { ConversationDrawer } from '@/components/conversation-drawer';
import { XLink } from '@/components/x-link';

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: '等買家付款',
  PAID: '等待收件',
  SHIPPED_TO_AUTHENTICATOR: '待簽收',
  AUTH_RECEIVED_PENDING_SELLER_ACK: '等賣家 ack 收件',
  HANDOVER_TO_AUTH: '面交待影相',
  SELLER_ACK_PENDING: '等賣家 ack 交付',
  CUSTODY: '保管中（待鑑定）',
  AUTHENTICATING: '鑑定中',
  AUTH_PASSED: '通過',
  AUTH_FAILED: '不通過',
  AWAITING_BUYER_PICKUP: '等買家取貨',
  SHIPPED_TO_BUYER: '已寄買家',
  DELIVERED: '已送達',
  DELIVERED_PENDING_AUTH_ACK: '等我 ack 買家收件',
  COMPLETED: '已完成',
  REFUNDED: '已退款',
  DISPUTED: '爭議中',
};

// Statuses where authenticator has an actionable next step
const AUTH_ACTION_STATUSES = new Set([
  'SHIPPED_TO_AUTHENTICATOR',         // mark received
  'AUTHENTICATING',                    // verdict (SHIP / 3WAY)
  'HANDOVER_TO_AUTH',                  // upload photos (MEETUP_AUTH)
  'CUSTODY',                           // verdict (MEETUP_AUTH)
  'DELIVERED_PENDING_AUTH_ACK',        // ack buyer unboxing
]);
const TERMINAL_STATUSES = new Set([
  'AUTH_PASSED', 'AUTH_FAILED', 'COMPLETED', 'REFUNDED', 'DISPUTED',
]);

const CATEGORY_LABEL: Record<string, string> = {
  HANDBAG: '手袋', IPHONE: 'iPhone', POKEMON_CARD: '寶可夢卡',
  WATCH: '手錶', SNEAKER: '波鞋', DESIGNER_TOY: '潮玩', OTHER: '其他',
};

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '寄送', MEETUP_AUTH: '鑑定師面交', MEETUP_3WAY: '三方面交', MEETUP_DIRECT: '雙方面交',
};

const MEETUP_METHODS = ['MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT'];
function isMeetup(o: InboxOrder) { return MEETUP_METHODS.includes(o.deliveryMethod ?? ''); }

/** Search match: substring on title / brand / party names, prefix on id.
 *  Empty query passes through everything. Case-insensitive. */
function matchesQuery(o: InboxOrder, qLower: string): boolean {
  if (!qLower) return true;
  if (o.id.toLowerCase().startsWith(qLower)) return true;
  const title = (o.listing?.title ?? '').toLowerCase();
  if (title.includes(qLower)) return true;
  const brand = ((o.listing as any)?.brand ?? '').toLowerCase();
  if (brand && brand.includes(qLower)) return true;
  const buyer = (o.buyer?.displayName ?? '').toLowerCase();
  if (buyer.includes(qLower)) return true;
  const seller = (o.seller?.displayName ?? '').toLowerCase();
  if (seller.includes(qLower)) return true;
  return false;
}

function slaLabel(order: InboxOrder): { text: string; color: 'green' | 'amber' | 'red' | 'slate' } | null {
  if (order.status === 'AUTHENTICATING' && order.receivedByAuthAt) {
    const received = new Date(order.receivedByAuthAt).getTime();
    const deadline = received + 48 * 60 * 60 * 1000;
    const msLeft = deadline - Date.now();
    if (msLeft <= 0) return { text: '⚠ 已逾期', color: 'red' };
    const h = Math.floor(msLeft / 3_600_000);
    const m = Math.floor((msLeft % 3_600_000) / 60_000);
    const text = `⏱ 剩 ${h}小時 ${m}分`;
    if (h >= 24) return { text, color: 'green' };
    if (h >= 12) return { text, color: 'amber' };
    return { text, color: 'red' };
  }
  if (order.status === 'SHIPPED_TO_AUTHENTICATOR') {
    return { text: '⏱ 收件後計時 48h', color: 'slate' };
  }
  if (order.status === 'PAID') {
    return { text: '⏱ 寄到 / 面交後計時', color: 'slate' };
  }
  return null;
}

function DeliveryIcon({ method }: { method: string | null }) {
  if (MEETUP_METHODS.includes(method ?? '')) {
    return <Handshake className="h-3.5 w-3.5 text-amber-600" />;
  }
  return <Package className="h-3.5 w-3.5 text-blue-600" />;
}

export default function InboxPage() {
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  // Fast search — client-side filter on already-loaded orders.
  // (API endpoint /orders/authenticator-search exists for future when order
  // count outgrows inbox payload; not used here while we have <100 orders.)
  const [query, setQuery] = useState('');
  // Click-to-copy short ID feedback per-order
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((m) => setMe({ id: m.id })).catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    api.orders.inbox()
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function doAction(orderId: string, action: () => Promise<any>) {
    setActionBusy(orderId);
    try { await action(); fetchData(); }
    catch (e: any) { setError(e.message ?? '操作失敗'); }
    finally { setActionBusy(null); }
  }

  // ── 3-tier split (lesson #6: cover ALL statuses to avoid silent gaps) ────
  // Apply search filter first; tier split downstream so empty tiers can hide.
  const qLower = query.trim().toLowerCase();
  const visibleOrders = qLower ? orders.filter((o) => matchesQuery(o, qLower)) : orders;

  // Tier 1: Action Required — authenticator has next move
  const actionRequired = visibleOrders.filter((o) =>
    AUTH_ACTION_STATUSES.has(o.status) ||
    (o.status === 'PAID' && isMeetup(o)) // PAID meetup: auth needs to start handover
  );
  // Tier 3: Terminal — completed / refunded / disputed / verdict-given
  const done = visibleOrders.filter((o) => TERMINAL_STATUSES.has(o.status));
  // Tier 2: Waiting — everything else (waiting on other parties; read-only for auth)
  const actionIds = new Set(actionRequired.map((o) => o.id));
  const doneIds = new Set(done.map((o) => o.id));
  const waiting = visibleOrders.filter((o) => !actionIds.has(o.id) && !doneIds.has(o.id));
  const noResults = !!qLower && visibleOrders.length === 0;

  if (loading) {
    return <div className="mx-auto max-w-5xl px-6 py-8"><p className="text-sm text-slate-500">載入中…</p></div>;
  }
  if (error) {
    return <div className="mx-auto max-w-5xl px-6 py-8"><p className="text-sm text-red-600">{error}</p></div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">待鑑定 Inbox</h1>
        <p className="text-xs text-slate-400">共 {orders.length} 張訂單 · SLA 48h</p>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {actionRequired.length} 件需要處理 · {waiting.length} 件等待中 · {done.length} 件已完成
        {qLower && <span className="ml-2 text-brand-600">（已過濾）</span>}
      </p>

      {/* ── Fast search bar ────────────────────────────────────────────── */}
      <div className="relative mt-4">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋商品名稱、買賣家、品牌或訂單 ID（首 8 字）"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          aria-label="搜尋訂單"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-2 my-1 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100"
            aria-label="清除搜尋"
          >
            清除 ✕
          </button>
        )}
      </div>

      {/* ── No-match empty state ───────────────────────────────────────── */}
      {noResults && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm">
          <p className="font-medium text-slate-700">揾唔到符合「{query.trim()}」嘅訂單</p>
          <p className="mt-1 text-xs text-slate-500">
            試試輸入訂單 ID 首 8 個字、買賣家名稱、商品品牌或商品標題關鍵字。
          </p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-100"
          >
            清除搜尋 → 睇晒所有訂單
          </button>
        </div>
      )}

      {/* ── Tier 1: Action Required ──────────────────────────────────────── */}
      {actionRequired.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            需要你處理（{actionRequired.length}）
          </h2>
          <div className="space-y-3">
            {actionRequired.map((o) => {
              const sla = slaLabel(o);
              const meetup = isMeetup(o);
              const busy = actionBusy === o.id;
              return (
                <Card key={o.id} className="border-amber-200 transition hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Listing image */}
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {o.listing.images?.[0]
                          ? <img src={o.listing.images[0]} alt="" className="h-full w-full object-cover" />
                          : <div className="flex h-full w-full items-center justify-center text-lg">📦</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/authenticate/${o.id}`} className="font-medium leading-snug hover:text-brand-700 line-clamp-1">
                            {o.listing.title}
                          </Link>
                          <Badge variant={o.status === 'AUTHENTICATING' ? 'warning' : o.status === 'SHIPPED_TO_AUTHENTICATOR' ? 'brand' : 'default'}>
                            {meetup && o.status === 'PAID' ? '等待面交' : STATUS_LABEL[o.status] ?? o.status}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {formatHKD(o.salePriceHKD)} · {CATEGORY_LABEL[o.listing.category] ?? o.listing.category}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <DeliveryIcon method={o.deliveryMethod} />
                            {DELIVERY_LABEL[o.deliveryMethod ?? ''] ?? o.deliveryMethod}
                          </span>
                          {o.meetupLocation && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {o.meetupLocation}
                            </span>
                          )}
                          <span>鑑定費：<span className="font-medium text-emerald-600">{formatHKD(o.authFeeHKD)}</span></span>
                          {sla && (
                            <Badge variant={
                              sla.color === 'red' ? 'danger'
                              : sla.color === 'amber' ? 'warning'
                              : sla.color === 'green' ? 'success'
                              : 'default'
                            }>
                              {sla.text}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          賣家：
                          <XLink
                            href={`/seller/${o.seller.id}`}
                            className="text-slate-200 hover:text-brand-300 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {o.seller.displayName}
                          </XLink>
                          {' · '}買家：
                          <XLink
                            href={`/buyer/${o.buyer.id}`}
                            className="text-slate-200 hover:text-brand-300 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {o.buyer.displayName}
                          </XLink>
                          {' · '}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigator.clipboard?.writeText(o.id).then(() => {
                                setCopiedId(o.id);
                                setTimeout(() => setCopiedId((c) => (c === o.id ? null : c)), 1500);
                              }).catch(() => {});
                            }}
                            className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] hover:bg-slate-200"
                            title="點擊複製訂單 ID"
                          >
                            {copiedId === o.id ? '✓ 已複製' : `#${o.id.slice(0, 8)} ⎘`}
                          </button>
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 flex gap-2">
                      {/* MEETUP + PAID → start meetup auth */}
                      {meetup && o.status === 'PAID' && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => doAction(o.id, () => api.orders.startMeetupAuth(o.id))}
                        >
                          {busy ? '處理中…' : '開始面交鑑定'}
                        </Button>
                      )}
                      {/* SHIPPED_TO_AUTHENTICATOR → mark received */}
                      {o.status === 'SHIPPED_TO_AUTHENTICATOR' && (
                        <Link href={`/authenticate/${o.id}`}>
                          <Button size="sm">
                            確認收件 + 影相 →
                          </Button>
                        </Link>
                      )}
                      {/* AUTHENTICATING → go to authenticate page */}
                      {o.status === 'AUTHENTICATING' && (
                        <Link href={`/authenticate/${o.id}`}>
                          <Button size="sm">進入鑑定工作台</Button>
                        </Link>
                      )}
                      {/* Always-available: message buyer/seller */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setChatOrderId(o.id)}
                      >
                        <MessageCircle className="mr-1 h-3.5 w-3.5" />
                        訊息
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {actionRequired.length === 0 && !noResults && !qLower && (
        <div className="mt-8 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">
          目前無需要你立即處理嘅訂單。
        </div>
      )}

      {/* ── Tier 2: Waiting / In-progress (read-only) ─────────────────────── */}
      {waiting.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            等待中 / 進行中（{waiting.length}）— 點擊查閱詳情
          </h2>
          <div className="space-y-2">
            {waiting.map((o) => (
              <Link key={o.id} href={`/authenticate/${o.id}`}>
                <Card className="cursor-pointer transition hover:shadow-md hover:opacity-100 opacity-80">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-100">
                        {o.listing.images?.[0]
                          ? <img src={o.listing.images[0]} alt="" className="h-full w-full object-cover" />
                          : <div className="flex h-full w-full items-center justify-center text-sm">📦</div>}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.listing.title}</p>
                        <p className="truncate text-xs text-slate-500">
                          {formatHKD(o.salePriceHKD)} · {CATEGORY_LABEL[o.listing.category] ?? o.listing.category} ·
                          {' '}<DeliveryIcon method={o.deliveryMethod} />
                          {' '}{DELIVERY_LABEL[o.deliveryMethod ?? ''] ?? o.deliveryMethod} ·
                          {' '}賣家 {o.seller.displayName}
                        </p>
                      </div>
                    </div>
                    <Badge variant="default" className="shrink-0">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Tier 3: Terminal (verdict given / completed / refunded / disputed) ─ */}
      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            已完成 / 終結（{done.length}）— 點擊查閱
          </h2>
          <div className="space-y-2">
            {done.map((o) => {
              const variant: 'success' | 'danger' | 'default' =
                o.status === 'COMPLETED' || o.authVerdict === 'PASSED' ? 'success'
                : o.status === 'DISPUTED' || o.authVerdict === 'FAILED' ? 'danger'
                : 'default';
              const label =
                o.status === 'COMPLETED' ? '已完成'
                : o.status === 'REFUNDED' ? '已退款'
                : o.status === 'DISPUTED' ? '爭議中'
                : o.authVerdict === 'PASSED' ? '真品'
                : o.authVerdict === 'FAILED' ? '假貨'
                : o.authVerdict === 'INCONCLUSIVE' ? '無法判定'
                : STATUS_LABEL[o.status] ?? o.status;
              return (
                <Link key={o.id} href={`/authenticate/${o.id}`}>
                  <Card className="opacity-80 transition hover:opacity-100 hover:shadow-md">
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-100">
                          {o.listing.images?.[0]
                            ? <img src={o.listing.images[0]} alt="" className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center text-sm">📦</div>}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{o.listing.title}</p>
                          <p className="truncate text-xs text-slate-500">
                            {formatHKD(o.salePriceHKD)} · 鑑定費 <span className="font-medium text-emerald-600">{formatHKD(o.authFeeHKD)}</span>
                          </p>
                        </div>
                      </div>
                      <Badge variant={variant} className="shrink-0">{label}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Chat drawer */}
      {chatOrderId && me && (() => {
        const o = orders.find((x) => x.id === chatOrderId);
        if (!o) return null;
        return (
          <ConversationDrawer
            orderId={chatOrderId}
            currentUserId={me.id}
            counterpartyName={`${o.buyer.displayName} / ${o.seller.displayName}`}
            listingTitle={o.listing.title}
            listingLinkId={o.listing.id}
            listingImage={o.listing.images?.[0]}
            counterpartySellerId={o.seller.id}
            counterpartyBuyerId={o.buyer.id}
            orderStatus={o.status}
            conversationType="order"
            onClose={() => setChatOrderId(null)}
            readOnly={['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(o.status)}
            readOnlyReason={
              o.status === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
              : o.status === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
              : o.status === 'DISPUTED' ? '訂單爭議處理中，對話已鎖定。'
              : undefined
            }
          />
        );
      })()}
    </div>
  );
}

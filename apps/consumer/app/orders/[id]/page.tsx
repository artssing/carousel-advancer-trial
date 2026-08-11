'use client';

/**
 * Single-order detail page — deep-linkable view of one order.
 *
 * Shows: listing card · status timeline · parties · delivery/payment ·
 *        fee breakdown · IM entry · review entry.
 *
 * Authorisation: API already enforces buyer/seller/auth via order.get.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, ListingThumb,
  HandoverHistoryTimeline, RE_PHOTO_PRESETS, type HandoverRound, ConfirmDialog,
} from '@authentik/ui';
import { formatHKD, getStatusLabel, districtLabel, categoryByApiEnum,
  getClientLocale, createT,
} from '@authentik/utils';

const MAX_REPHOTO = 2;
const MEETUP_AUTH_PHASE_A: string[] = ['PAID', 'HANDOVER_TO_AUTH', 'SELLER_ACK_PENDING'];
import {
  ArrowLeft, MessageCircle, Package, Handshake, Wallet, Lock, MapPin, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { api, hasToken, clearToken } from '@/lib/api';
import { ConversationDrawer } from '@/components/conversation-drawer';

// STATUS_LABEL is now SSOT — use getStatusLabel(status, deliveryMethod) from @authentik/utils.
// (Lesson #8: catalog dict was previously duplicated here AND in orders/page.tsx; both removed.)

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'brand'> = {
  AWAITING_PAYMENT: 'warning', PAID: 'brand',
  SHIPPED_TO_AUTHENTICATOR: 'brand', RECEIVED_BY_AUTHENTICATOR: 'brand',
  AUTHENTICATING: 'warning', AUTH_PASSED: 'success', AUTH_FAILED: 'danger',
  SHIPPED_TO_BUYER: 'brand', DELIVERED: 'brand', COMPLETED: 'success',
  DISPUTED: 'danger', REFUNDED: 'default',
};

// Values are t() keys — these live outside the component, so _t is not in scope.
const DELIVERY_LABEL_KEY: Record<string, string> = {
  SHIP: 'orderDetail.delivery.ship', MEETUP_AUTH: 'orderDetail.delivery.meetupAuth',
  MEETUP_3WAY: 'orderDetail.delivery.meetup3way', MEETUP_DIRECT: 'orderDetail.delivery.meetupDirect',
};
const PAYMENT_LABEL_KEY: Record<string, string> = {
  ONLINE_ESCROW: 'orderDetail.payment.escrow', OFFLINE_CASH: 'orderDetail.payment.cash',
};

const MEETUP_METHODS = ['MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT'];

export default function OrderDetailPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const params = useParams() as { id: string };
  const router = useRouter();
  const id = params.id;
  const [order, setOrder] = useState<any | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [sellerReviewRating, setSellerReviewRating] = useState(0);
  const [sellerReviewComment, setSellerReviewComment] = useState('');
  // Default 匿名 (founder ruling 2026-06-11)
  const [sellerReviewAnonymous, setSellerReviewAnonymous] = useState(true);
  // Re-photo modal (seller rejecting handover photos with structured reason)
  const [rePhotoOpen, setRePhotoOpen] = useState(false);
  const [rePhotoPresets, setRePhotoPresets] = useState<string[]>([]);
  const [rePhotoComment, setRePhotoComment] = useState('');
  // Cancel confirm (inline 2-step, lesson #16)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  // ConfirmDialog v2（founder 2026-07-12）：放款/取消全部行 modal
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  /** Dispute confirm dialog — retires window.prompt for styled UI + clear
   *  warning that escalation cannot be silently undone. Reason captured by
   *  the dialog's built-in textarea (requireReason). */
  const [disputeConfirmOpen, setDisputeConfirmOpen] = useState(false);

  function onDispute() {
    setDisputeConfirmOpen(true);
  }
  async function doDispute(reason?: string) {
    setDisputeConfirmOpen(false);
    const r = (reason ?? '').trim();
    if (!r) return; // dialog already gates this, belt-and-braces
    await doAction('orderDetail.action.dispute', () => api.orders.dispute(order.id, r));
  }

  function toggleRePhotoPreset(p: string) {
    setRePhotoPresets((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function submitRePhoto() {
    if (rePhotoPresets.length === 0 && !rePhotoComment.trim()) {
      alert(_t('orderDetail.rePhoto.needReason'));
      return;
    }
    await doAction('orderDetail.action.rePhoto', () =>
      api.orders.requestRePhoto(order.id, {
        presets: rePhotoPresets,
        comment: rePhotoComment.trim() || undefined,
      }),
    );
    setRePhotoOpen(false);
    setRePhotoPresets([]);
    setRePhotoComment('');
  }

  async function submitCancelWithReason(reason: string) {
    await doAction('orderDetail.action.cancelOrder', () =>
      api.orders.cancelHandover(order.id, reason.trim() || undefined),
    );
    setCancelReason('');
  }

  function refresh() {
    return api.orders.get(id).then(setOrder);
  }

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    Promise.all([api.me().then((m) => setMe({ id: m.id })), refresh()])
      .catch((e: any) => {
        if (e?.status === 401) { clearToken(); router.replace('/login'); return; }
        setError(e?.message ?? _t('orderDetail.error.load'));
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  // P1 (founder-approved): 30s polling scoped to MEETUP_AUTH Phase A only.
  // Lets seller see milan's re-photo without manual F5, without hammering server.
  useEffect(() => {
    if (!order) return;
    if (order.deliveryMethod !== 'MEETUP_AUTH') return;
    if (!MEETUP_AUTH_PHASE_A.includes(order.status)) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh().catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [order?.id, order?.status, order?.deliveryMethod]);

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-slate-500">{_t('orderDetail.loading')}</div>;
  if (error) return <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-red-600">{error}</div>;
  if (!order) return null;

  const isBuyer = me?.id === order.buyerId;
  const isSeller = me?.id === order.sellerId;
  const isMeetup = MEETUP_METHODS.includes(order.deliveryMethod ?? '');
  const isCompleted = order.status === 'COMPLETED';

  /** `nameKey` is a t() key, not text — it only surfaces inside the error line. */
  async function doAction(nameKey: string, fn: () => Promise<any>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(_t('orderDetail.action.failed', { name: _t(nameKey), reason: e?.message ?? _t('orderDetail.action.unknownError') }));
      setTimeout(() => setError(null), 4000);
    } finally { setBusy(false); }
  }

  // ── Timeline events (with timestamps if present) ─────────────────────
  const timeline = [
    { key: 'createdAt',       label: _t('orderDetail.timeline.created') },
    { key: 'paidAt',          label: _t('orderDetail.timeline.paid') },
    { key: 'shippedToAuthAt', label: _t('orderDetail.timeline.shippedToAuth') },
    { key: 'receivedByAuthAt',label: _t('orderDetail.timeline.receivedByAuth') },
    { key: 'authCompletedAt', label: _t('orderDetail.timeline.authCompleted') },
    { key: 'shippedToBuyerAt',label: _t('orderDetail.timeline.shippedToBuyer') },
    { key: 'deliveredAt',     label: _t('orderDetail.timeline.delivered') },
    { key: 'completedAt',     label: _t('orderDetail.timeline.completed') },
  ].filter((e) => order[e.key]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        onClick={() => router.push('/orders')}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> {_t('orderDetail.backToOrders')}
      </button>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
          {getStatusLabel(order.status, order.deliveryMethod)}
        </Badge>
        <span className="text-xs text-slate-400">#{order.id.slice(0, 8)}</span>
        <span className="text-xs text-slate-400">·</span>
        <span className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleString('zh-HK', { hour12: false })}</span>
        {order.listing?.id && (
          <Link
            href={`/listing/${order.listing.id}`}
            className="ml-auto text-xs text-brand-600 hover:underline"
          >
            {_t('orderDetail.backToListing')}
          </Link>
        )}
      </div>

      {/* Listing card */}
      <Card className="mb-4">
        <CardContent className="flex items-start gap-4 p-4">
          <Link href={`/listing/${order.listing?.id}`} className="block">
            <ListingThumb
              src={order.listing?.images?.[0]}
              alt={order.listing?.title ?? ''}
              emoji={categoryByApiEnum(order.listing?.category)?.emoji}
              className="h-20 w-20 shrink-0 rounded-lg"
            />
          </Link>
          <div className="flex-1 min-w-0">
            <Link data-user-content href={`/listing/${order.listing?.id}`} className="block font-medium text-slate-900 hover:text-brand-700">
              {order.listing?.title}
            </Link>
            <p className="mt-1 font-display text-xl font-bold text-brand-700">{formatHKD(order.salePriceHKD)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{_t('orderDetail.listing.categoryLabel')} {order.listing?.category}</p>
          </div>
        </CardContent>
      </Card>

      {/* Parties */}
      <Card className="mb-4">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-sm">{_t('orderDetail.card.parties')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label={_t('orderDetail.label.buyer')} link={isBuyer ? null : (order.buyer?.id ? `/buyer/${order.buyer.id}` : null)}>
            <span data-user-content>{order.buyer?.displayName}</span> {isBuyer && <span className="text-[10px] text-brand-600">{_t('orderDetail.you.self')}</span>}
          </Row>
          <Row label={_t('orderDetail.label.seller')} link={isSeller ? null : (order.seller?.id ? `/seller/${order.seller.id}` : null)}>
            <span data-user-content>{order.seller?.displayName}</span> {isSeller && <span className="text-[10px] text-brand-600">{_t('orderDetail.you.self')}</span>}
          </Row>
          {order.authenticator && (
            <Row label={_t('orderDetail.label.authenticator')} link={`/authenticator/${order.authenticator.id}`}>
              <span data-user-content>{order.authenticator.displayName}</span>
            </Row>
          )}
        </CardContent>
      </Card>

      {/* Delivery + Payment */}
      <Card className="mb-4">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-sm">{_t('orderDetail.card.deliveryPayment')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label={_t('orderDetail.delivery.label')}>
            <span className="inline-flex items-center gap-1.5">
              {isMeetup ? <Handshake className="h-3.5 w-3.5 text-amber-600" /> : <Package className="h-3.5 w-3.5 text-blue-600" />}
              {_t(DELIVERY_LABEL_KEY[order.deliveryMethod] ?? order.deliveryMethod)}
            </span>
          </Row>
          {/* Branch snapshot (MEETUP_AUTH / MEETUP_3WAY) — read from frozen
              Order.meetupBranchSnapshot so authenticator branch edits later
              never mutate this order. */}
          {order.meetupBranchSnapshot && (() => {
            const snap = order.meetupBranchSnapshot as {
              name: string; fullAddress: string; districtKey: string;
              businessHours?: string | null; notes?: string | null;
              contactPhone?: string | null; contactWhatsapp?: string | null;
            };
            const district = districtLabel(snap.districtKey);
            const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(snap.fullAddress + ' ' + (district ?? ''))}`;
            return (
              <Row label={_t('orderDetail.branch.label')}>
                <span className="flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <MapPin className="h-3.5 w-3.5 text-brand-600" />
                    {snap.name}
                    {district && (
                      <span className="rounded bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600">
                        {district}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-600">{snap.fullAddress}</span>
                  {snap.businessHours && (
                    <span className="text-[11px] text-slate-500">{_t('orderDetail.meetupLocation.businessHours', { hours: snap.businessHours })}</span>
                  )}
                  {snap.notes && (
                    <span className="text-[11px] text-amber-700">⚠ {snap.notes}</span>
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      📍 Google Maps
                    </a>
                    {snap.contactPhone && (
                      <a
                        href={`tel:${snap.contactPhone.replace(/\s+/g, '')}`}
                        className="text-brand-600 hover:underline"
                      >
                        📞 {snap.contactPhone}
                      </a>
                    )}
                    {snap.contactWhatsapp && (
                      <a
                        href={`https://wa.me/${snap.contactWhatsapp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:underline"
                      >
                        💬 WhatsApp
                      </a>
                    )}
                  </span>
                </span>
              </Row>
            );
          })()}

          {/* MEETUP_DIRECT free-text fallback */}
          {!order.meetupBranchSnapshot && (order.meetupFreeText || order.meetupLocation) && (
            <Row label={_t('orderDetail.meetupLocation.label')}>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {order.meetupFreeText ?? order.meetupLocation}
              </span>
            </Row>
          )}
          <Row label={_t('orderDetail.payment.label')}>
            <span className="inline-flex items-center gap-1.5">
              {order.paymentMethod === 'ONLINE_ESCROW' ? <Lock className="h-3.5 w-3.5 text-emerald-600" /> : <Wallet className="h-3.5 w-3.5 text-amber-600" />}
              {_t(PAYMENT_LABEL_KEY[order.paymentMethod] ?? order.paymentMethod)}
              {order.escrowHeld && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0 text-[9px] font-medium text-emerald-700">{_t('orderDetail.payment.held')}</span>}
            </span>
          </Row>
        </CardContent>
      </Card>

      {/* Fee breakdown */}
      <Card className="mb-4">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-sm">{_t('orderDetail.card.fees')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label={_t('orderDetail.fee.salePrice')}>{formatHKD(order.salePriceHKD)}</Row>
          {order.authFeeHKD > 0 && <Row label={_t('orderDetail.fee.authSeller')}>- {formatHKD(order.authFeeHKD)}</Row>}
          <Row label={_t('orderDetail.fee.platformSeller')}>- {formatHKD(order.platformFeeHKD)}</Row>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <Row label={_t('orderDetail.fee.sellerNet')}><span className="font-bold text-emerald-700">{formatHKD(order.sellerNetHKD)}</span></Row>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-sm">{_t('orderDetail.card.timeline')}</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ol className="space-y-2.5">
              {timeline.map((ev, i) => (
                <li key={ev.key} className="flex items-start gap-2.5">
                  <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${i === timeline.length - 1 ? 'text-brand-600' : 'text-emerald-500'}`} />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{ev.label}</p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(order[ev.key]).toLocaleString('zh-HK', { hour12: false })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Quick actions — IM entry */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <MessageCircle className="h-4 w-4" />
          {_t('orderDetail.messageButton')}
        </button>
      </div>

      {/* Buyer-side: pay / confirm-delivered */}
      {isBuyer && order.status === 'AWAITING_PAYMENT' && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="p-4">
            <p className="font-medium text-amber-900">{_t('orderDetail.awaitingPayment.title')}</p>
            <p className="mt-0.5 text-xs text-amber-800">
              {order.paymentMethod === 'ONLINE_ESCROW'
                ? _t('orderDetail.awaitingPayment.escrowDesc')
                : _t('orderDetail.awaitingPayment.cashDesc')}
            </p>
            {order.paymentMethod === 'ONLINE_ESCROW' ? (
              <a href={`/checkout/${order.id}`} className="mt-2 inline-block">
                <Button>{_t('orderDetail.payNow')}</Button>
              </a>
            ) : (
              <Button className="mt-2" disabled={busy} onClick={() => doAction('orderDetail.action.confirmPay', () => api.orders.pay(order.id))}>
                {_t('orderDetail.confirmCash')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {/* SHIP: buyer confirm delivered.
          Founder ruling 2026-06-19: 買家唔需要影任何相 — confirm 收到就完成
          交易。影相責任屬鑑定家（最多賣家）。 */}
      {isBuyer && order.status === 'SHIPPED_TO_BUYER' && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <CardContent className="space-y-3 p-4">
            <p className="font-medium text-emerald-900">{_t('orderDetail.delivered.title')}</p>
            <p className="text-xs text-emerald-800">{_t('orderDetail.delivered.desc')}</p>
            <Button
              disabled={busy}
              onClick={() => setReleaseConfirmOpen(true)}
            >
              {_t('orderDetail.confirmReceived')}
            </Button>
          </CardContent>
        </Card>
      )}
      {isBuyer && order.status === 'DELIVERED' && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <CardContent className="p-4">
            <p className="font-medium text-emerald-900">{_t('orderDetail.deliveredFinal.title')}</p>
            <Button className="mt-2" disabled={busy} onClick={() => doAction(_t('orders.timeline.done'), () => api.orders.complete(order.id))}>
              {_t('orderDetail.completeTransaction')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SHIP dual-ack: seller views auth's receipt photos + acks */}
      {isSeller && order.status === 'AUTH_RECEIVED_PENDING_SELLER_ACK' && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="space-y-2 p-4">
            <p className="font-medium text-amber-900">{_t('orderDetail.sellerAck.title')}</p>
            {order.authReceiptPhotos?.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {order.authReceiptPhotos.map((src: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${i + 1}`} className="aspect-square w-full rounded object-cover" />
                ))}
              </div>
            )}
            <p className="text-[11px] text-amber-700">{_t('orderDetail.sellerAck.hint')}</p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => doAction('orderDetail.action.confirmHandover', () => api.orders.sellerHandoverAck(order.id))}>
                {_t('orderDetail.confirmCondition')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={onDispute}>
                {_t('orderDetail.action.dispute')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MEETUP_AUTH dual-ack: seller views auth's handover photos + soft options.
          Shows full handoverHistory for transparency; nudge buttons cap at MAX_REPHOTO. */}
      {isSeller && order.status === 'SELLER_ACK_PENDING' && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="font-medium text-amber-900">{_t('orderDetail.meetupAuth.title')}</p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                {_t('orderDetail.meetupAuth.rePhotoUsed', { used: order.rePhotoCount ?? 0, max: MAX_REPHOTO })}
              </p>
            </div>

            <HandoverHistoryTimeline
              history={(order.handoverHistory ?? []) as HandoverRound[]}
              maxRePhoto={MAX_REPHOTO}
              collapseSingleRound={false}
            />

            {/* Action buttons — nudge towards confirm; cancel always last */}
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => doAction('orderDetail.action.confirmHandover', () => api.orders.sellerHandoverAck(order.id))}
              >
                {_t('orderDetail.meetupAuth.confirm')}
              </Button>

              {(order.rePhotoCount ?? 0) < MAX_REPHOTO ? (
                <Button
                  variant="outline"
                  className="w-full border-amber-400 text-amber-900"
                  disabled={busy}
                  onClick={() => setRePhotoOpen(true)}
                >
                  {_t('orderDetail.rePhoto.buttonWithCount', { left: MAX_REPHOTO - (order.rePhotoCount ?? 0) })}
                </Button>
              ) : (
                <p className="rounded bg-rose-50 px-2 py-1.5 text-center text-[11px] text-rose-700">
                  {_t('orderDetail.meetupAuth.exhausted')}
                </p>
              )}

              <button
                type="button"
                className="w-full py-1.5 text-center text-xs text-rose-600 hover:underline"
                disabled={busy}
                onClick={() => setCancelConfirmOpen(true)}
              >
                {_t('orderDetail.meetupAuth.cancel')}
              </button>
            </div>

            {/* Re-photo request modal: preset checkboxes + comment */}
            {rePhotoOpen && (
              <div className="rounded border border-amber-400 bg-white p-3">
                <p className="text-sm font-medium text-amber-900">{_t('orderDetail.rePhoto.title')}</p>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {RE_PHOTO_PRESETS.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs hover:bg-amber-50"
                    >
                      <input
                        type="checkbox"
                        checked={rePhotoPresets.includes(p)}
                        onChange={() => toggleRePhotoPreset(p)}
                        className="h-3.5 w-3.5"
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={rePhotoComment}
                  onChange={(e) => setRePhotoComment(e.target.value)}
                  placeholder={_t('orderDetail.rePhoto.commentPlaceholder')}
                  rows={2}
                  className="mt-2 w-full rounded border border-slate-300 p-2 text-xs"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || (rePhotoPresets.length === 0 && !rePhotoComment.trim())}
                    onClick={submitRePhoto}
                  >
                    {_t('orderDetail.rePhoto.submit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => { setRePhotoOpen(false); setRePhotoPresets([]); setRePhotoComment(''); }}
                  >
                    {_t('orderDetail.cancelLabel')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Read-only handoverHistory for non-actionable parties + later phases (transparency) */}
      {order.deliveryMethod === 'MEETUP_AUTH' &&
        ((order.handoverHistory?.length ?? 0) > 0) &&
        !(isSeller && order.status === 'SELLER_ACK_PENDING') &&
        ['HANDOVER_TO_AUTH', 'SELLER_ACK_PENDING', 'CUSTODY', 'AUTH_PASSED', 'AWAITING_BUYER_PICKUP'].includes(order.status) && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm">{_t('orderDetail.card.handoverHistory')}</CardTitle>
            </CardHeader>
            <CardContent>
              <HandoverHistoryTimeline
                history={(order.handoverHistory ?? []) as HandoverRound[]}
                maxRePhoto={MAX_REPHOTO}
                collapseSingleRound
              />
            </CardContent>
          </Card>
        )}

      {/* MEETUP_AUTH: buyer pickup at auth store */}
      {isBuyer && order.status === 'AWAITING_BUYER_PICKUP' && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <CardContent className="space-y-2 p-4">
            <p className="font-medium text-emerald-900">
              {_t('orderDetail.pickup.passed')}{order.authenticator?.displayName && _t('orderDetail.pickup.passedNamed', { name: order.authenticator.displayName })}
            </p>
            <p className="text-[11px] text-emerald-700">
              {_t('orderDetail.pickup.inspectNotice')}
            </p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => doAction(_t('orders.timeline.confirmReceipt'), () => api.orders.buyerReceiveAck(order.id))}>
                {_t('orderDetail.pickup.confirm')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={onDispute}>
                {_t('orderDetail.action.dispute')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FAILED return: seller picks up rejected item */}
      {isSeller && order.status === 'REFUNDED' && order.returnPhotosUploadedAt && !order.returnSellerAckAt && (
        <Card className="mb-4 border-red-300 bg-red-50">
          <CardContent className="space-y-2 p-4">
            <p className="font-medium text-red-900">{_t('orderDetail.return.title')}</p>
            {order.returnPhotos?.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {order.returnPhotos.map((src: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${i + 1}`} className="aspect-square w-full rounded object-cover" />
                ))}
              </div>
            )}
            <p className="text-[11px] text-red-700">
              {_t('orderDetail.return.warning')}
            </p>
            <Button disabled={busy} onClick={() => doAction('orderDetail.action.confirmReturn', () => api.orders.sellerReturnAck(order.id))}>
              {_t('orderDetail.return.confirm')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* DISPUTED — frozen state notice */}
      {order.status === 'DISPUTED' && (
        <Card className="mb-4 border-red-300 bg-red-50">
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-red-900">{_t('orderDetail.disputed.title')}</p>
            <p className="mt-1 text-red-700">
              {_t('orderDetail.disputed.desc')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Buyer-side: review (after COMPLETED) */}
      {isBuyer && isCompleted && (
        <>
          {order.authenticator && !order.review && (
            <Card className="mb-4">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-sm">{_t('orderDetail.review.rateAuth')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4">
                <StarRating value={reviewRating} onChange={setReviewRating} />
                <textarea
                  value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={_t('orderDetail.review.commentAuth')} rows={2}
                  className="w-full rounded border border-slate-200 p-2 text-sm outline-none focus:border-brand-400"
                />
                <Button
                  disabled={busy || reviewRating === 0}
                  onClick={() => doAction('orderDetail.action.reviewAuthenticator', () => api.orders.review(order.id, { rating: reviewRating, comment: reviewComment || undefined }))}
                >
                  {_t('orderDetail.review.submitButton')}
                </Button>
              </CardContent>
            </Card>
          )}
          <Card className="mb-4">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-sm">{_t('orderDetail.review.rateSeller')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              <StarRating value={sellerReviewRating} onChange={setSellerReviewRating} />
              <textarea
                value={sellerReviewComment} onChange={(e) => setSellerReviewComment(e.target.value)}
                placeholder={_t('orderDetail.review.commentSeller')} rows={2}
                className="w-full rounded border border-slate-200 p-2 text-sm outline-none focus:border-brand-400"
              />
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={sellerReviewAnonymous}
                  onChange={(e) => setSellerReviewAnonymous(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  {_t('orderDetail.review.anonymous')}
                  <span className="block text-slate-400">
                    {_t('orderDetail.review.anonymousHint')}
                  </span>
                </span>
              </label>
              <Button
                disabled={busy || sellerReviewRating === 0}
                onClick={() => doAction('orderDetail.action.reviewSeller', () => api.users.createSellerReview(order.id, sellerReviewRating, sellerReviewComment || undefined, sellerReviewAnonymous))}
              >
                {_t('orderDetail.review.submitButton')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Drawer */}
      {chatOpen && me && (
        <ConversationDrawer
          orderId={order.id}
          currentUserId={me.id}
          counterpartyName={
            isBuyer ? (order.seller?.displayName ?? _t('orderDetail.label.seller'))
            : isSeller ? (order.buyer?.displayName ?? _t('orderDetail.label.buyer'))
            : `${order.buyer?.displayName ?? _t('orderDetail.label.buyerFallback')} / ${order.seller?.displayName ?? _t('orderDetail.label.sellerFallback')}`
          }
          listingTitle={order.listing?.title ?? ''}
          listingLinkId={order.listing?.id}
          listingImage={order.listing?.images?.[0]}
          counterpartySellerId={isBuyer ? order.seller?.id : undefined}
          counterpartyBuyerId={isSeller ? order.buyer?.id : undefined}
          orderStatus={order.status}
          conversationType="order"
          onClose={() => setChatOpen(false)}
          readOnly={['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(order.status)}
          readOnlyReason={
            order.status === 'COMPLETED' ? _t('orderDetail.chat.readOnly.completed')
            : order.status === 'REFUNDED' ? _t('orderDetail.chat.readOnly.refunded')
            : order.status === 'DISPUTED' ? _t('orderDetail.chat.readOnly.disputed')
            : undefined
          }
        />
      )}

      {/* Dispute confirm — escalates a PAID order into the dispute pipeline.
          requireReason forces the buyer/seller to state the issue before
          submit. Replaces the old window.prompt() flow. */}
      {/* T1 放款 — 買家確認收貨即釋放 escrow 畀賣家（唔准背景 dismiss） */}
      <ConfirmDialog
        open={releaseConfirmOpen}
        onCancel={() => setReleaseConfirmOpen(false)}
        onConfirm={() => {
          setReleaseConfirmOpen(false);
          doAction('orderDetail.action.confirmReceived', () => api.orders.confirmDelivered(order.id, []));
        }}
        title={_t('orderDetail.confirmDialog.receivedTitle')}
        description={<p>{order.listing?.title}</p>}
        consequence={_t('orderDetail.confirmDialog.receivedConsequence')}
        confirmLabel={_t('orderDetail.confirmDialog.receivedLabel')}
        severity="danger"
        busy={busy}
        dismissOnBackdrop={false}
      />

      {/* T2 取消交易 — 全額退款買家 + 商品重新上架 */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        onCancel={() => { setCancelConfirmOpen(false); setCancelReason(''); }}
        onConfirm={(reason) => {
          setCancelReason(reason ?? '');
          setCancelConfirmOpen(false);
          submitCancelWithReason(reason ?? '');
        }}
        title={_t('orderDetail.confirmDialog.cancelTitle')}
        consequence={_t('orderDetail.confirmDialog.cancelConsequence')}
        confirmLabel={_t('orderDetail.confirmDialog.cancelLabel')}
        cancelLabel={_t('orderDetail.confirmDialog.cancelCancelLabel')}
        severity="danger"
        busy={busy}
        requireReason
        reasonLabel={_t('orderDetail.confirmDialog.reasonLabel')}
        reasonPlaceholder={_t('orderDetail.confirmDialog.reasonPlaceholder')}
      />

      <ConfirmDialog
        open={disputeConfirmOpen}
        onCancel={() => setDisputeConfirmOpen(false)}
        onConfirm={(reason) => doDispute(reason)}
        title={_t('orderDetail.confirmDialog.disputeTitle')}
        description={
          <p>
            {_t('orderDetail.confirmDialog.disputeDesc')}
          </p>
        }
        confirmLabel={_t('orderDetail.confirmDialog.disputeLabel')}
        cancelLabel={_t('orderDetail.cancelLabel')}
        severity="warning"
        busy={busy}
        requireReason
        reasonLabel={_t('orderDetail.confirmDialog.disputeReasonLabel')}
        reasonPlaceholder={_t('orderDetail.confirmDialog.disputeReasonPlaceholder')}
      />
    </div>
  );
}

function Row({ label, link, children }: { label: string; link?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-800">
        {link ? <Link href={link as any} className="hover:text-brand-700 hover:underline">{children}</Link> : children}
      </span>
    </div>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="text-2xl leading-none transition hover:scale-110"
          aria-label={_t('orderDetail.review.starAria', { n })}
        >
          <span className={n <= value ? 'text-amber-400' : 'text-slate-300'}>★</span>
        </button>
      ))}
      {value > 0 && <span className="ml-2 self-center text-xs text-slate-500">{value}/5</span>}
    </div>
  );
}

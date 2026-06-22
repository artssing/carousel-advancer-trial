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
  HandoverHistoryTimeline, RE_PHOTO_PRESETS, type HandoverRound,
} from '@authentik/ui';
import { formatHKD, getStatusLabel, districtLabel, categoryByApiEnum } from '@authentik/utils';

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

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '物流寄送', MEETUP_AUTH: '鑑定師面交', MEETUP_3WAY: '三方面交', MEETUP_DIRECT: '雙方面交',
};
const PAYMENT_LABEL: Record<string, string> = {
  ONLINE_ESCROW: '線上託管 (Escrow)', OFFLINE_CASH: '線下現金',
};

const MEETUP_METHODS = ['MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT'];

export default function OrderDetailPage() {
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
  const [cancelReason, setCancelReason] = useState('');

  async function onDispute() {
    const reason = window.prompt('請輸入爭議原因（簡述）：');
    if (!reason?.trim()) return;
    await doAction('提出爭議', () => api.orders.dispute(order.id, reason.trim()));
  }

  function toggleRePhotoPreset(p: string) {
    setRePhotoPresets((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function submitRePhoto() {
    if (rePhotoPresets.length === 0 && !rePhotoComment.trim()) {
      alert('請至少揀一個原因或填寫註釋');
      return;
    }
    await doAction('要求重拍', () =>
      api.orders.requestRePhoto(order.id, {
        presets: rePhotoPresets,
        comment: rePhotoComment.trim() || undefined,
      }),
    );
    setRePhotoOpen(false);
    setRePhotoPresets([]);
    setRePhotoComment('');
  }

  async function submitCancel() {
    await doAction('取消交易', () =>
      api.orders.cancelHandover(order.id, cancelReason.trim() || undefined),
    );
    setCancelConfirmOpen(false);
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
        setError(e?.message ?? '無法載入訂單');
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

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-slate-500">載入中…</div>;
  if (error) return <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-red-600">{error}</div>;
  if (!order) return null;

  const isBuyer = me?.id === order.buyerId;
  const isSeller = me?.id === order.sellerId;
  const isMeetup = MEETUP_METHODS.includes(order.deliveryMethod ?? '');
  const isCompleted = order.status === 'COMPLETED';

  async function doAction(name: string, fn: () => Promise<any>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(`${name} 失敗：${e?.message ?? '未知錯誤'}`);
      setTimeout(() => setError(null), 4000);
    } finally { setBusy(false); }
  }

  // ── Timeline events (with timestamps if present) ─────────────────────
  const timeline = [
    { key: 'createdAt',       label: '落單' },
    { key: 'paidAt',          label: '已付款' },
    { key: 'shippedToAuthAt', label: '寄至鑑定師' },
    { key: 'receivedByAuthAt',label: '鑑定師簽收' },
    { key: 'authCompletedAt', label: '鑑定完成' },
    { key: 'shippedToBuyerAt',label: '寄至買家' },
    { key: 'deliveredAt',     label: '買家確認收到' },
    { key: 'completedAt',     label: '交易完成' },
  ].filter((e) => order[e.key]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        onClick={() => router.push('/orders')}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> 返回我的訂單
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
            ← 返回商品頁
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
            <Link href={`/listing/${order.listing?.id}`} className="block font-medium text-slate-900 hover:text-brand-700">
              {order.listing?.title}
            </Link>
            <p className="mt-1 font-display text-xl font-bold text-brand-700">{formatHKD(order.salePriceHKD)}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">商品分類 {order.listing?.category}</p>
          </div>
        </CardContent>
      </Card>

      {/* Parties */}
      <Card className="mb-4">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-sm">交易參與方</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label="買家" link={isBuyer ? null : (order.buyer?.id ? `/buyer/${order.buyer.id}` : null)}>
            {order.buyer?.displayName} {isBuyer && <span className="text-[10px] text-brand-600">(你)</span>}
          </Row>
          <Row label="賣家" link={isSeller ? null : (order.seller?.id ? `/seller/${order.seller.id}` : null)}>
            {order.seller?.displayName} {isSeller && <span className="text-[10px] text-brand-600">(你)</span>}
          </Row>
          {order.authenticator && (
            <Row label="鑑定師" link={`/authenticator/${order.authenticator.id}`}>
              {order.authenticator.displayName}
            </Row>
          )}
        </CardContent>
      </Card>

      {/* Delivery + Payment */}
      <Card className="mb-4">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-sm">交收 + 付款</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label="交收方式">
            <span className="inline-flex items-center gap-1.5">
              {isMeetup ? <Handshake className="h-3.5 w-3.5 text-amber-600" /> : <Package className="h-3.5 w-3.5 text-blue-600" />}
              {DELIVERY_LABEL[order.deliveryMethod] ?? order.deliveryMethod}
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
              <Row label="交收分店">
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
                    <span className="text-[11px] text-slate-500">營業：{snap.businessHours}</span>
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
            <Row label="面交地點">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {order.meetupFreeText ?? order.meetupLocation}
              </span>
            </Row>
          )}
          <Row label="付款方式">
            <span className="inline-flex items-center gap-1.5">
              {order.paymentMethod === 'ONLINE_ESCROW' ? <Lock className="h-3.5 w-3.5 text-emerald-600" /> : <Wallet className="h-3.5 w-3.5 text-amber-600" />}
              {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
              {order.escrowHeld && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0 text-[9px] font-medium text-emerald-700">已 hold</span>}
            </span>
          </Row>
        </CardContent>
      </Card>

      {/* Fee breakdown */}
      <Card className="mb-4">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-sm">費用明細</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label="成交價">{formatHKD(order.salePriceHKD)}</Row>
          {order.authFeeHKD > 0 && <Row label="鑑定費（賣家付）">- {formatHKD(order.authFeeHKD)}</Row>}
          <Row label="平台費 1.5%（賣家付）">- {formatHKD(order.platformFeeHKD)}</Row>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <Row label="賣家實收"><span className="font-bold text-emerald-700">{formatHKD(order.sellerNetHKD)}</span></Row>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-sm">進度</CardTitle>
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
          訊息
        </button>
      </div>

      {/* Buyer-side: pay / confirm-delivered */}
      {isBuyer && order.status === 'AWAITING_PAYMENT' && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="p-4">
            <p className="font-medium text-amber-900">等待付款</p>
            <p className="mt-0.5 text-xs text-amber-800">
              {order.paymentMethod === 'ONLINE_ESCROW'
                ? '線上託管：信用卡 hold（鑑定通過先正式扣款）。'
                : '線下現金：面交時付款，平台不代收。'}
            </p>
            {order.paymentMethod === 'ONLINE_ESCROW' ? (
              <a href={`/checkout/${order.id}`} className="mt-2 inline-block">
                <Button>立即付款 →</Button>
              </a>
            ) : (
              <Button className="mt-2" disabled={busy} onClick={() => doAction('確認交易', () => api.orders.pay(order.id))}>
                確認交易（面交現金）
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
            <p className="font-medium text-emerald-900">商品已送達？</p>
            <p className="text-xs text-emerald-800">確認收到貨後，款項即時釋放畀賣家，交易完成。如貨品有問題，請即撳「提出爭議」。</p>
            <Button
              disabled={busy}
              onClick={() => doAction('確認收到', () => api.orders.confirmDelivered(order.id, []))}
            >
              確認已收到商品
            </Button>
          </CardContent>
        </Card>
      )}
      {isBuyer && order.status === 'DELIVERED' && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <CardContent className="p-4">
            <p className="font-medium text-emerald-900">商品已送達 — 完成交易</p>
            <Button className="mt-2" disabled={busy} onClick={() => doAction('完成', () => api.orders.complete(order.id))}>
              確認完成交易
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SHIP dual-ack: seller views auth's receipt photos + acks */}
      {isSeller && order.status === 'AUTH_RECEIVED_PENDING_SELLER_ACK' && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="space-y-2 p-4">
            <p className="font-medium text-amber-900">鑑定師已收件並影 unboxing 相。請 view 後確認 condition match。</p>
            {order.authReceiptPhotos?.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {order.authReceiptPhotos.map((src: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${i + 1}`} className="aspect-square w-full rounded object-cover" />
                ))}
              </div>
            )}
            <p className="text-[11px] text-amber-700">確認後鑑定進入下一階段。如有問題請即撳「提出爭議」。</p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => doAction('確認交付', () => api.orders.sellerHandoverAck(order.id))}>
                確認 condition 正確
              </Button>
              <Button variant="outline" disabled={busy} onClick={onDispute}>
                提出爭議
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
              <p className="font-medium text-amber-900">鑑定師已上載商品狀況相片，請查閱後決定下一步。</p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                已用重拍機會：<span className="font-semibold">{order.rePhotoCount ?? 0}</span> / {MAX_REPHOTO}。
                確認後鑑定師正式接管商品（E&O 保險）。逾 7 日唔 ack 訂單會自動取消、買家獲全額退款。
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
                onClick={() => doAction('確認交付', () => api.orders.sellerHandoverAck(order.id))}
              >
                ✓ 確認相片正確 · 完成交付
              </Button>

              {(order.rePhotoCount ?? 0) < MAX_REPHOTO ? (
                <Button
                  variant="outline"
                  className="w-full border-amber-400 text-amber-900"
                  disabled={busy}
                  onClick={() => setRePhotoOpen(true)}
                >
                  要求重拍相片（剩 {MAX_REPHOTO - (order.rePhotoCount ?? 0)} 次）
                </Button>
              ) : (
                <p className="rounded bg-rose-50 px-2 py-1.5 text-center text-[11px] text-rose-700">
                  ⚠️ 已用盡重拍機會，請選擇確認交付或取消交易。
                </p>
              )}

              {!cancelConfirmOpen ? (
                <button
                  type="button"
                  className="w-full py-1.5 text-center text-xs text-rose-600 hover:underline"
                  disabled={busy}
                  onClick={() => setCancelConfirmOpen(true)}
                >
                  取消交易（不可撤回）
                </button>
              ) : (
                <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm">
                  <p className="font-medium text-rose-900">確認取消交易？</p>
                  <p className="mt-1 text-[11px] text-rose-700">
                    買家會即時獲全額退款，商品重新上架。鑑定師已影相 record 會保留作 audit。此操作不可撤回。
                  </p>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="（可選）取消原因"
                    rows={2}
                    className="mt-2 w-full rounded border border-rose-300 bg-white p-2 text-xs"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={submitCancel}
                    >
                      確認取消
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => { setCancelConfirmOpen(false); setCancelReason(''); }}
                    >
                      返回
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Re-photo request modal: preset checkboxes + comment */}
            {rePhotoOpen && (
              <div className="rounded border border-amber-400 bg-white p-3">
                <p className="text-sm font-medium text-amber-900">要求鑑定師重拍 — 請揀原因（可多選）</p>
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
                  placeholder="（可選）補充細節，例如「請對住底部刮痕影 close-up」"
                  rows={2}
                  className="mt-2 w-full rounded border border-slate-300 p-2 text-xs"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || (rePhotoPresets.length === 0 && !rePhotoComment.trim())}
                    onClick={submitRePhoto}
                  >
                    提交重拍要求
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => { setRePhotoOpen(false); setRePhotoPresets([]); setRePhotoComment(''); }}
                  >
                    取消
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
              <CardTitle className="text-sm">鑑定師接收記錄</CardTitle>
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
              ✓ 鑑定通過。請前往鑑定師店面取貨{order.authenticator?.displayName && `（${order.authenticator.displayName}）`}。
            </p>
            <p className="text-[11px] text-emerald-700">
              現場驗貨。確認後代表你親手收到並認可貨品狀況，款項即時釋放畀賣家，不可撤回。
              如貨品有問題，請唔好確認，撳「提出爭議」。
            </p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => doAction('確認收貨', () => api.orders.buyerReceiveAck(order.id))}>
                我已在店 · 確認收到
              </Button>
              <Button variant="outline" disabled={busy} onClick={onDispute}>
                提出爭議
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FAILED return: seller picks up rejected item */}
      {isSeller && order.status === 'REFUNDED' && order.returnPhotosUploadedAt && !order.returnSellerAckAt && (
        <Card className="mb-4 border-red-300 bg-red-50">
          <CardContent className="space-y-2 p-4">
            <p className="font-medium text-red-900">鑑定不通過。買家已退款。請前往鑑定師店面取回商品，並 view 退貨相確認 condition。</p>
            {order.returnPhotos?.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {order.returnPhotos.map((src: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`${i + 1}`} className="aspect-square w-full rounded object-cover" />
                ))}
              </div>
            )}
            <p className="text-[11px] text-red-700">
              ⚠ 如逾期未取，鑑定師可能會收取寄存費（屬於你同鑑定師之間嘅安排，唔屬於 Authentik HK 平台責任）。
            </p>
            <Button disabled={busy} onClick={() => doAction('確認取回', () => api.orders.sellerReturnAck(order.id))}>
              已取回商品
            </Button>
          </CardContent>
        </Card>
      )}

      {/* DISPUTED — frozen state notice */}
      {order.status === 'DISPUTED' && (
        <Card className="mb-4 border-red-300 bg-red-50">
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-red-900">⚠ 交易已凍結（DISPUTED）</p>
            <p className="mt-1 text-red-700">
              Authentik HK 為資訊中介，唔裁決爭議。請拎相片 + 對話作為證據自行解決（包括法律途徑）。
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
                <CardTitle className="text-sm">評價鑑定師</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4">
                <StarRating value={reviewRating} onChange={setReviewRating} />
                <textarea
                  value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="講下鑑定師服務（選填）" rows={2}
                  className="w-full rounded border border-slate-200 p-2 text-sm outline-none focus:border-brand-400"
                />
                <Button
                  disabled={busy || reviewRating === 0}
                  onClick={() => doAction('評鑑定師', () => api.orders.review(order.id, { rating: reviewRating, comment: reviewComment || undefined }))}
                >
                  提交評價
                </Button>
              </CardContent>
            </Card>
          )}
          <Card className="mb-4">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-sm">評價賣家</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              <StarRating value={sellerReviewRating} onChange={setSellerReviewRating} />
              <textarea
                value={sellerReviewComment} onChange={(e) => setSellerReviewComment(e.target.value)}
                placeholder="貨品同描述相符？溝通如何？（選填）" rows={2}
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
                  匿名留評（預設）：其他訪客只見「認證買家」。
                  <span className="block text-slate-400">
                    賣家、鑑定師同平台 admin 仍會見到你嘅名以便處理交易爭議。
                  </span>
                </span>
              </label>
              <Button
                disabled={busy || sellerReviewRating === 0}
                onClick={() => doAction('評賣家', () => api.users.createSellerReview(order.id, sellerReviewRating, sellerReviewComment || undefined, sellerReviewAnonymous))}
              >
                提交評價
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
            isBuyer ? (order.seller?.displayName ?? '賣家')
            : isSeller ? (order.buyer?.displayName ?? '買家')
            : `${order.buyer?.displayName ?? '買家'} / ${order.seller?.displayName ?? '賣家'}`
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
            order.status === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
            : order.status === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
            : order.status === 'DISPUTED' ? '訂單爭議處理中，對話已鎖定。'
            : undefined
          }
        />
      )}
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
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="text-2xl leading-none transition hover:scale-110"
          aria-label={`${n} 星`}
        >
          <span className={n <= value ? 'text-amber-400' : 'text-slate-300'}>★</span>
        </button>
      ))}
      {value > 0 && <span className="ml-2 self-center text-xs text-slate-500">{value}/5</span>}
    </div>
  );
}

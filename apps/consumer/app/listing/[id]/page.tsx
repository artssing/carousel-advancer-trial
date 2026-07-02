'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardContent, TierPill, StarRating, Badge } from '@authentik/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatHKD, tierForPrice, calculateOrderFees, quoteAuthFee, formatSavings,
  categoryByApiEnum, brandLabel, brandFieldLabel,
  needsMyAction, sellerActionCta, getStatusLabel,
  districtLabel, conditionLabel,
} from '@authentik/utils';
import { ShieldCheck, MapPin, Truck, Users, UserCheck, Wallet, Lock, AlertTriangle } from 'lucide-react';
import { api, hasToken, ApiError } from '@/lib/api';
import { ConversationDrawer } from '@/components/conversation-drawer';
import { MessageCircle } from 'lucide-react';

type DeliveryMethod = 'SHIP' | 'MEETUP_AUTH' | 'MEETUP_3WAY' | 'MEETUP_DIRECT';
type PaymentMethod = 'ONLINE_ESCROW' | 'OFFLINE_CASH';

const DELIVERY_META: Record<
  DeliveryMethod,
  { label: string; desc: string; icon: typeof Truck; meetup: boolean; needsAuth: boolean }
> = {
  SHIP: { label: '物流寄送', desc: '有鑑定：賣家寄→鑑定師→你；無鑑定：賣家直寄你', icon: Truck, meetup: false, needsAuth: false },
  MEETUP_AUTH: { label: '鑑定師面交', desc: '你去鑑定師地點，當場鑑定 + 交收', icon: UserCheck, meetup: true, needsAuth: true },
  MEETUP_3WAY: { label: '三方面交', desc: '你、賣家、鑑定師同場，當場鑑定 + 交收', icon: Users, meetup: true, needsAuth: true },
  MEETUP_DIRECT: { label: '買賣雙方面交', desc: '純撮合、無鑑定，你同賣家直接見面', icon: Users, meetup: true, needsAuth: false },
};

const PAYMENT_META: Record<PaymentMethod, { label: string; desc: string; icon: typeof Wallet }> = {
  ONLINE_ESCROW: { label: '線上託管', desc: '平台代收款項，交易完成後派款畀賣家 + 鑑定師', icon: Lock },
  OFFLINE_CASH: { label: '賣家直收', desc: '買家自行付款畀賣家 (FPS / 銀行轉帳 / 現金)，平台不託管', icon: Wallet },
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '上架中',
  RESERVED: '已預留',
  SOLD: '已售出',
  REMOVED: '已下架',
};

export default function ListingPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  // Reactive URL param — `?offerId=<id>` activates locked-price checkout
  // CRITICAL: must use useSearchParams() hook (known bug #9: useState(()=>URL) not reactive)
  const searchParams = useSearchParams();
  const offerIdParam = searchParams?.get('offerId') ?? null;

  const [listing, setListing] = useState<any | null>(null);
  const [authenticators, setAuthenticators] = useState<any[]>([]);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [selectedAuth, setSelectedAuth] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [meetupLocation, setMeetupLocation] = useState('');  // MEETUP_DIRECT — 'OTHER' 或賣家地點
  const [meetupCustomLocation, setMeetupCustomLocation] = useState(''); // 「其他」自填
  // MEETUP_AUTH / MEETUP_3WAY: branch picker driven by selectedAuth
  const [branches, setBranches] = useState<Array<{
    id: string; name: string; fullAddress: string; districtKey: string;
    businessHours: string | null; notes: string | null; isPrimary: boolean;
    contactPhone: string | null; contactWhatsapp: string | null;
  }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  // Active order on this listing — drives Seller Action Card (owner view) and
  // Buyer track-order strip (buyer view). Single fetch covers both roles.
  const [activeOrder, setActiveOrder] = useState<any | null>(null);

  // Owner-only: list of conversations on this listing (buyer/auth counterparties)
  const [ownerConvs, setOwnerConvs] = useState<Array<{
    id: string;
    orderId: string | null;
    orderStatus: string | null;
    kind?: 'THREE_WAY' | 'BUYER_SELLER' | 'BUYER_AUTH' | 'SELLER_AUTH';
    counterparty: { id?: string; displayName: string };
    parties?: Array<{ id: string; displayName: string; role: 'BUYER' | 'SELLER' | 'AUTHENTICATOR' }>;
    lastMessage?: { body: string; senderRole: string; createdAt: string } | null;
    unread: number;
  }>>([]);
  const [activeConv, setActiveConv] = useState<{
    convId: string;
    orderId: string | null;
    counterpartyName: string;
    counterpartyId: string | undefined;
    parties?: Array<{ id: string; displayName: string; role: 'BUYER' | 'SELLER' | 'AUTHENTICATOR' }>;
    orderStatus: string | null;
  } | null>(null);

  // Locked-price negotiation state
  const [lockedOffer, setLockedOffer] = useState<{
    id: string;
    priceHKD: number;
    paymentDeadlineAt: string | null;
    status: string;
  } | null>(null);

  // Recommendations — same-category listings only. Seller's other listings
  // available via /seller/[id] page, no need to duplicate here.
  const [relatedListings, setRelatedListings] = useState<any[]>([]);

  useEffect(() => {
    api.listings
      .get(id)
      .then((l) => {
        setListing(l);
        if (l) {
          if (l.category) {
            api.listings.list(l.category, 8, 0, undefined, { excludeId: l.id })
              .then(({ items }) => setRelatedListings(items))
              .catch(() => {});
          }
          return api.authenticators.list(l.category).then(setAuthenticators);
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);

  // Fetch the accepted Offer when ?offerId= is present
  useEffect(() => {
    if (!offerIdParam) { setLockedOffer(null); return; }
    api.offers.get(offerIdParam)
      .then((o) => setLockedOffer({
        id: o.id,
        priceHKD: o.priceHKD,
        paymentDeadlineAt: o.paymentDeadlineAt,
        status: o.status,
      }))
      .catch(() => setLockedOffer(null));
  }, [offerIdParam]);

  // 取得登入用戶（用嚟判斷係咪賣家自己睇緊自己嘅商品）
  useEffect(() => {
    if (!hasToken()) {
      setMe(null);
      return;
    }
    api
      .me()
      .then((u) => setMe({ id: u.id }))
      .catch(() => setMe(null));
  }, []);

  // Find this user's active (non-terminal) order on this listing — drives
  // the Seller Action Card and Buyer track-order strip below.
  useEffect(() => {
    if (!me || !listing) { setActiveOrder(null); return; }
    const iAmSeller = me.id === listing.seller?.id;
    if (!iAmSeller && me.id) {
      // also valid for buyer — same fetch works for both
    }
    api.orders.list()
      .then((orders: any[]) => {
        const match = orders.find((o) =>
          o.listingId === listing.id &&
          o.status !== 'COMPLETED' &&
          (o.status !== 'REFUNDED' || (o.returnPhotosUploadedAt && !o.returnSellerAckAt)) &&
          (o.sellerId === me.id || o.buyerId === me.id),
        );
        setActiveOrder(match ?? null);
      })
      .catch(() => setActiveOrder(null));
  }, [me?.id, listing?.id, listing?.seller?.id]);

  // SEO — inject <meta name="robots" content="noindex,nofollow"> for SOLD / REMOVED
  // listings so Google de-indexes pages that can't be purchased.
  // RESERVED stays indexable per founder ruling 2026-06-11 (still publicly searchable).
  useEffect(() => {
    if (!listing) return;
    const META_ID = 'authentik-robots-noindex';
    const existing = document.getElementById(META_ID);
    const needsNoindex = listing.status === 'SOLD' || listing.status === 'REMOVED';
    if (needsNoindex) {
      if (!existing) {
        const m = document.createElement('meta');
        m.id = META_ID;
        m.setAttribute('name', 'robots');
        m.setAttribute('content', 'noindex, nofollow');
        document.head.appendChild(m);
      }
    } else if (existing) {
      existing.remove();
    }
    return () => {
      const m = document.getElementById(META_ID);
      if (m) m.remove();
    };
  }, [listing?.status]);

  // Owner: load conversations on this listing so seller can message buyer/auth at any status
  useEffect(() => {
    if (!me || !listing) return;
    if (me.id !== listing.seller?.id) return;
    api.conversations.list()
      .then((convs: any[]) => {
        const onThis = convs
          .filter((c) => c.listingId === listing.id || c.listing?.id === listing.id)
          .map((c) => ({
            id: c.id,
            orderId: c.orderId,
            orderStatus: c.orderStatus,
            kind: c.kind,
            counterparty: c.counterparty,
            parties: c.parties,
            lastMessage: c.lastMessage,
            unread: c.unread ?? 0,
          }));
        setOwnerConvs(onThis);
      })
      .catch(() => setOwnerConvs([]));
  }, [me?.id, listing?.id, listing?.seller?.id]);

  // 賣家接受嘅交收方式（後備 SHIP）
  const allowedMethods: DeliveryMethod[] =
    listing?.allowedDeliveryMethods?.length ? listing.allowedDeliveryMethods : ['SHIP'];

  const isOwner = !!me && !!listing && me.id === listing.seller?.id;
  const listingTier = listing ? tierForPrice(listing.priceHKD) : 1;

  const selectedAuthObj = authenticators.find((a) => a.id === selectedAuth) ?? null;
  const deliveryMeta = deliveryMethod ? DELIVERY_META[deliveryMethod] : null;
  const isMeetup = !!deliveryMeta?.meetup;

  // 鑑定師步驟邏輯（交收方式驅動）：
  //  • MEETUP_AUTH / MEETUP_3WAY → 一定要鑑定，無「唔使鑑定」選項
  //  • SHIP + Tier 3 → 強制鑑定
  //  • SHIP + Tier 2 → 可選鑑定（有「唔使鑑定」選項）
  //  • MEETUP_DIRECT / SHIP+Tier1 → 完全唔需要鑑定步驟
  const authRequired = !!deliveryMeta?.needsAuth || (deliveryMethod === 'SHIP' && listingTier === 3);
  const authOptional = deliveryMethod === 'SHIP' && listingTier === 2;
  const showAuthStep = !!deliveryMethod && (authRequired || authOptional);

  // 交收方式唔需要鑑定時，清走已揀嘅鑑定師
  useEffect(() => {
    if (!showAuthStep && selectedAuth) setSelectedAuth(null);
  }, [showAuthStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // 交收方式 / 鑑定師選擇改變時清走唔再適用嘅 paymentMethod
  // Founder ruling 2026-06-11: SHIP 無鑑定師 → 唔可以揀 ONLINE_ESCROW
  useEffect(() => {
    const isShipNoAuth = deliveryMethod === 'SHIP' && !selectedAuth;
    if (paymentMethod === 'OFFLINE_CASH' && !isMeetup && !isShipNoAuth) {
      setPaymentMethod(null);
    }
    if (paymentMethod === 'ONLINE_ESCROW' && isShipNoAuth) {
      setPaymentMethod(null);
    }
  }, [deliveryMethod, selectedAuth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch chosen auth's branches whenever selection changes (MEETUP_AUTH / 3WAY)
  useEffect(() => {
    const needsBranch = deliveryMethod === 'MEETUP_AUTH' || deliveryMethod === 'MEETUP_3WAY';
    if (!needsBranch || !selectedAuth) {
      setBranches([]);
      setSelectedBranchId(null);
      return;
    }
    let active = true;
    api.authenticators.branches(selectedAuth)
      .then((bs) => {
        if (!active) return;
        setBranches(bs);
        // Auto-pick primary or first when single / sensible default
        const primary = bs.find((b) => b.isPrimary) ?? bs[0];
        setSelectedBranchId(primary?.id ?? null);
      })
      .catch(() => { if (active) { setBranches([]); setSelectedBranchId(null); } });
    return () => { active = false; };
  }, [selectedAuth, deliveryMethod]);

  async function onBuy() {
    setError(null);
    if (!hasToken()) {
      router.push('/login');
      return;
    }
    if (!listing) return;
    if (!deliveryMethod) {
      setError('請揀一種交收方式');
      return;
    }
    if (authRequired && !selectedAuth) {
      setError('此交收方式需要鑑定，請先揀一位鑑定師');
      return;
    }
    if (!paymentMethod) {
      setError('請揀一種付款方式');
      return;
    }
    const needsBranch = deliveryMethod === 'MEETUP_AUTH' || deliveryMethod === 'MEETUP_3WAY';
    if (needsBranch && !selectedBranchId) {
      setError('請揀鑑定師嘅交收分店');
      return;
    }
    if (deliveryMethod === 'MEETUP_DIRECT' && !meetupLocation) {
      setError('請揀選面交地點');
      return;
    }
    if (deliveryMethod === 'MEETUP_DIRECT' && meetupLocation === 'OTHER' && !meetupCustomLocation.trim()) {
      setError('請填寫你建議嘅面交地點');
      return;
    }
    const resolvedMeetupText = deliveryMethod === 'MEETUP_DIRECT'
      ? (meetupLocation === 'OTHER' ? meetupCustomLocation.trim() : meetupLocation)
      : undefined;
    setBusy(true);
    try {
      const order = await api.orders.create({
        listingId: listing.id,
        authenticatorId: selectedAuth ?? undefined,
        deliveryMethod,
        paymentMethod,
        offerId: lockedOffer?.id,
        meetupBranchId: needsBranch ? selectedBranchId ?? undefined : undefined,
        meetupFreeText: resolvedMeetupText,
      });
      // ONLINE_ESCROW: redirect buyer to /checkout to do real payment auth.
      // OFFLINE_CASH: order stays AWAITING_PAYMENT until parties meet face-to-face.
      if (paymentMethod === 'ONLINE_ESCROW') {
        router.push(`/checkout/${order.id}` as any);
      } else {
        router.push('/orders');
        router.refresh();
      }
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Failed to create order');
    } finally {
      setBusy(false);
    }
  }

  if (error && !listing) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-red-600">{error}</div>;
  }
  if (!listing) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-slate-500">載入中…</div>;
  }

  // Effective price = locked offer (if buyer is checking out from accepted negotiation) or listing's original
  const effectivePrice = lockedOffer && lockedOffer.status === 'ACCEPTED'
    ? lockedOffer.priceHKD
    : listing.priceHKD;
  const tier = tierForPrice(effectivePrice);
  const authQuote = selectedAuthObj
    ? { feeRatePct: selectedAuthObj.feeRatePct, feeMinHKD: selectedAuthObj.feeMinHKD }
    : null;
  const fees = calculateOrderFees(effectivePrice, authQuote);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Media gallery — interleaved images + optional video.
            Founder OQ-1=B: videoIsCover → video renders FIRST (slide 0). */}
        {(() => {
          const imgs: string[] = listing.images ?? [];
          const slides: Array<{ kind: 'image' | 'video'; src: string; poster?: string }> =
            listing.videoUrl
              ? listing.videoIsCover
                ? [{ kind: 'video', src: listing.videoUrl, poster: listing.videoPosterUrl }, ...imgs.map((s) => ({ kind: 'image' as const, src: s }))]
                : [...imgs.map((s) => ({ kind: 'image' as const, src: s })), { kind: 'video', src: listing.videoUrl, poster: listing.videoPosterUrl }]
              : imgs.map((s) => ({ kind: 'image' as const, src: s }));
          const active = slides[activeImg] ?? slides[0];
          return (
            <div>
              <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                {active ? (
                  active.kind === 'video' ? (
                    <video
                      key={active.src}
                      src={active.src}
                      poster={active.poster}
                      controls
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={active.src} alt={listing.title} className="h-full w-full object-cover" />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400 text-sm">暫無圖片</div>
                )}
                {slides.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImg((i) => (i - 1 + slides.length) % slides.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white hover:bg-black/60"
                    ><ChevronLeft className="h-5 w-5" /></button>
                    <button
                      onClick={() => setActiveImg((i) => (i + 1) % slides.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white hover:bg-black/60"
                    ><ChevronRight className="h-5 w-5" /></button>
                  </>
                )}
              </div>
              {slides.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {slides.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${activeImg === i ? 'border-brand-500' : 'border-transparent'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.kind === 'video' ? (s.poster ?? '') : s.src} alt="" className="h-full w-full object-cover" />
                      {s.kind === 'video' && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-base text-white">▶</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        <div>
          <Badge variant="brand">Listing #{listing.id.slice(0, 6)}</Badge>

          {/* ── Prominent state banner — placed BEFORE title so users
                immediately know the listing's status at a glance ─────── */}
          {isOwner && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs">
              <UserCheck className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="font-medium text-brand-800">這是你上架嘅商品</span>
              <span className="text-brand-600">·</span>
              <span className="text-brand-700">狀態：{STATUS_LABEL[listing.status] ?? listing.status}</span>
            </div>
          )}
          {!isOwner && listing.status === 'RESERVED' && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">此商品交易進行中</p>
                <p className="mt-0.5 text-amber-800">已有買家落單，暫時唔可以購買。</p>
              </div>
            </div>
          )}
          {!isOwner && listing.status === 'SOLD' && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div>
                <p className="font-medium text-slate-800">此商品已售出</p>
                <p className="mt-0.5 text-slate-600">
                  交易已完成，呢件商品唔可以再買入。可以睇下面類似商品 ↓
                </p>
              </div>
            </div>
          )}

          <h1 className="mt-3 font-display text-2xl font-bold">{listing.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TierPill tier={tier} showDescription />
            {listing.brand && (() => {
              const cat = categoryByApiEnum(listing.category);
              const label = cat ? brandLabel(cat.id as any, listing.brand) : listing.brand;
              const fieldName = cat ? brandFieldLabel(cat.id as any) : '品牌';
              return label ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                  title={fieldName}
                >
                  <span className="font-medium">{label}</span>
                </span>
              ) : null;
            })()}
            {listing.condition && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200"
                title="成色由賣家自行申報，Authentik 不驗證"
              >
                <span className="text-emerald-500">●</span>
                <span className="font-medium">賣方申報：{conditionLabel(listing.condition)}</span>
              </span>
            )}
          </div>
          {listing.condition && (
            <p className="mt-1 text-[10px] text-slate-400">
              成色由賣家自行申報，Authentik 不驗證。Tier 2/3 商品如選擇鑑定，成色以鑑定師為準。
            </p>
          )}

          {/* Price — show negotiated price if locked */}
          {lockedOffer && lockedOffer.status === 'ACCEPTED' ? (
            <div className="mt-4">
              <p className="text-3xl font-semibold text-brand-700">{formatHKD(lockedOffer.priceHKD)}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                <span className="line-through">原價 {formatHKD(listing.priceHKD)}</span>
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                  ✓ 議價成交價
                </span>
              </p>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">議價已確認，請完成落單</p>
                <p className="mt-0.5 text-amber-800">
                  {lockedOffer.paymentDeadlineAt
                    ? `付款期限：${new Date(lockedOffer.paymentDeadlineAt).toLocaleString('zh-HK', { hour12: false })}`
                    : '請盡快完成落單，否則預留會自動取消。'}
                </p>
                {effectivePrice < listing.priceHKD && tier !== tierForPrice(listing.priceHKD) && (
                  <p className="mt-1 text-amber-800">
                    ⓘ 協議價格屬 {tier === 1 ? 'Tier 1（純撮合）' : tier === 2 ? 'Tier 2（鑑定可選）' : 'Tier 3（強制鑑定）'}，與原 listing tier 不同。
                  </p>
                )}
              </div>
            </div>
          ) : listing.status === 'SOLD' && listing.actualSalePriceHKD != null ? (
            // Founder ruling 2026-06-11: 成交價可以公開
            // 2026-06-19 Q6=A: SOLD with original-price anchor — show full
            // strikethrough so buyers see the deal context.
            <div className="mt-4">
              <p className="text-3xl font-semibold text-slate-700">{formatHKD(listing.actualSalePriceHKD)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                成交價
                {listing.originalPriceHKD && listing.originalPriceHKD > listing.actualSalePriceHKD && (
                  <span className="ml-2 line-through text-slate-400">原價 {formatHKD(listing.originalPriceHKD)}</span>
                )}
                {!listing.originalPriceHKD && listing.actualSalePriceHKD !== listing.priceHKD && (
                  <span className="ml-2 line-through text-slate-400">原價 {formatHKD(listing.priceHKD)}</span>
                )}
              </p>
            </div>
          ) : (() => {
            // 2026-06-19 Q1=A: strikethrough when originalPriceHKD is set
            // (= listing has gone through at least one applied price drop).
            const savings = formatSavings(listing.originalPriceHKD, listing.priceHKD);
            return savings ? (
              <div className="mt-4">
                <p className="text-3xl font-semibold text-rose-600">{formatHKD(listing.priceHKD)}</p>
                <p className="mt-1 text-sm">
                  <span className="text-slate-400 line-through">原價 {formatHKD(listing.originalPriceHKD)}</span>
                  <span className="ml-2 inline-flex items-center rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                    {savings.display} · {savings.savedDisplay}
                  </span>
                </p>
              </div>
            ) : (
              <p className="mt-4 text-3xl font-semibold">{formatHKD(listing.priceHKD)}</p>
            );
          })()}

          <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{listing.description}</p>

          {/* 上架時間 — 分鐘/小時/日 granularity */}
          {listing.createdAt && (
            <p className="mt-2 text-[11px] text-slate-400">
              上架：{(() => {
                const diff = Date.now() - new Date(listing.createdAt).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 1) return '剛剛';
                if (mins < 60) return `${mins} 分鐘前`;
                const hours = Math.floor(mins / 60);
                if (hours < 24) return `${hours} 小時前`;
                const days = Math.floor(hours / 24);
                if (days < 30) return `${days} 日前`;
                const months = Math.floor(days / 30);
                if (months < 12) return `${months} 個月前`;
                return new Date(listing.createdAt).toLocaleDateString('zh-HK');
              })()}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {/* Seller chip — looks like a clickable pill, matches drawer mini-card pattern */}
            {listing.seller?.id ? (
              <Link
                href={`/seller/${listing.seller.id}`}
                className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-xs transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                  {(listing.seller.displayName ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium text-slate-700 group-hover:text-brand-700">
                  {listing.seller.displayName}
                </span>
                <span className="text-[10px] text-slate-400 group-hover:text-brand-600">
                  睇賣家檔案 →
                </span>
              </Link>
            ) : (
              <span className="text-xs text-slate-500">賣家：{listing.seller?.displayName}</span>
            )}
            {me && !isOwner && (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {listing.status === 'SOLD'
                  ? '問賣家有冇同類貨或補貨計劃'
                  : listing.status === 'RESERVED'
                    ? '問賣家有冇同類貨'
                    : '聯絡賣家'}
              </button>
            )}
          </div>

          {isOwner ? (
            /* ── 賣家自己視角：管理資訊 + 同買家/鑑定家對話入口 ── */
            <div className="mt-6 space-y-4">
              {/* ── Seller Action Card — direct CTA when an order on this
                  listing needs jenny's attention. Source of CTA copy: SSOT
                  sellerActionCta() in @authentik/utils. */}
              {activeOrder && me && needsMyAction(activeOrder, me.id, 'seller') && (() => {
                const cta = sellerActionCta(activeOrder);
                if (!cta) return null;
                const buyerName = activeOrder.buyer?.displayName ?? '買家';
                const deliveryLabel = DELIVERY_META[activeOrder.deliveryMethod as DeliveryMethod]?.label ?? activeOrder.deliveryMethod;
                return (
                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      ⚠ 需要你處理
                    </p>
                    <p className="mt-1 text-base font-semibold text-amber-900">{cta.heading}</p>
                    <p className="mt-1 text-[11px] text-amber-800/80">
                      訂單 <span className="font-mono">#{activeOrder.id.slice(0, 8)}</span>
                      {' · '}
                      {buyerName} 買入
                      {' · '}
                      {deliveryLabel}
                    </p>
                    <a
                      href={`/orders/${activeOrder.id}`}
                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700"
                    >
                      {cta.buttonLabel}
                    </a>
                  </div>
                );
              })()}

              {/* Order summary strip — when there's an active order but seller
                  doesn't need to act yet (CUSTODY / AUTHENTICATING / etc.).
                  Surfaces status so seller knows what's happening + deep link
                  to full order detail. (Urgent state → Seller Action Card above.) */}
              {activeOrder && me && !needsMyAction(activeOrder, me.id, 'seller') && (
                <a
                  href={`/orders/${activeOrder.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:bg-slate-100"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800">訂單進行中</span>
                    <span className="ml-1.5 text-[11px] text-slate-600">
                      · {getStatusLabel(activeOrder.status, activeOrder.deliveryMethod)}
                    </span>
                    <span className="ml-1.5 text-[10px] text-slate-400">
                      #{activeOrder.id.slice(0, 8)} · {activeOrder.buyer?.displayName ?? '買家'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-600">查看訂單 →</span>
                </a>
              )}

              {/* Owner conversations — let seller message any buyer/auth tied to this listing,
                  at any order status (lesson #1: never dead-end without navigation) */}
              {ownerConvs.length > 0 && (
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
                  <h4 className="mb-2 font-semibold text-brand-900">
                    對話（{ownerConvs.length}）
                  </h4>
                  <div className="space-y-1.5">
                    {ownerConvs.map((c) => {
                      // Label = other participants (excludes viewer). Pair channels
                      // naturally have just one other; 3-way has two.
                      const others = (c.parties ?? []).filter((p) => p.id !== me?.id);
                      const peopleLabel = others.length
                        ? others
                            .map((p) =>
                              p.role === 'AUTHENTICATOR' ? `鑑定師 ${p.displayName}` : p.displayName,
                            )
                            .join(' + ')
                        : c.counterparty?.displayName ?? '對方';
                      // Kind badge distinguishes channels with overlapping people
                      const kindBadge =
                        c.kind === 'THREE_WAY' ? { text: '三方', cls: 'bg-slate-200 text-slate-700' }
                        : c.kind === 'BUYER_SELLER' ? { text: '私', cls: 'bg-amber-200 text-amber-800' }
                        : c.kind === 'BUYER_AUTH' ? { text: '私', cls: 'bg-amber-200 text-amber-800' }
                        : c.kind === 'SELLER_AUTH' ? { text: '私', cls: 'bg-amber-200 text-amber-800' }
                        : null;
                      const previewBody =
                        c.lastMessage?.body
                          ? (c.lastMessage.body.length > 40
                              ? c.lastMessage.body.slice(0, 40) + '…'
                              : c.lastMessage.body)
                          : null;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveConv({
                            convId: c.id,
                            orderId: c.orderId,
                            counterpartyName: peopleLabel,
                            counterpartyId: c.counterparty?.id,
                            parties: c.parties,
                            orderStatus: c.orderStatus,
                          })}
                          className="flex w-full items-start justify-between gap-2 rounded border border-brand-200 bg-white px-3 py-2 text-left text-xs transition hover:bg-brand-100"
                        >
                          <span className="flex flex-col gap-1 min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                              {kindBadge && (
                                <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${kindBadge.cls}`}>
                                  {kindBadge.text}
                                </span>
                              )}
                              <span className="truncate font-medium">{peopleLabel}</span>
                            </span>
                            {previewBody && (
                              <span className="truncate pl-5 text-[10px] text-slate-500">
                                {c.lastMessage?.senderRole === 'SYSTEM' && '🔔 '}
                                {previewBody}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {c.orderStatus && (
                              <Badge variant="default">{c.orderStatus}</Badge>
                            )}
                            {c.unread > 0 && (
                              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {c.unread}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-brand-700/80">
                    任何狀態都可以同對方傾偈；對話完成 / 退款 / 爭議後變 read-only 存檔。
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <h4 className="mb-2 font-semibold">你接受嘅交收方式</h4>
                <div className="flex flex-wrap gap-2">
                  {allowedMethods.map((m) => (
                    <Badge key={m} variant="default">
                      {DELIVERY_META[m].label}
                    </Badge>
                  ))}
                  {listing.sellerDistrict && (
                    <Badge variant="default">
                      <MapPin className="mr-0.5 inline h-3 w-3" />
                      {listing.sellerDistrict}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  買家會喺呢度見到揀鑑定師、交收同付款嘅選項。你唔可以購買自己嘅商品。
                </p>
              </div>

              {/* Primary action: edit (only while ACTIVE) */}
              {listing.status === 'ACTIVE' && (
                <Link href={`/sell?edit=${listing.id}`} className="block">
                  <Button className="w-full">編輯商品</Button>
                </Link>
              )}

              <div className="flex gap-2">
                <Link href="/my-listings" className="flex-1">
                  <Button variant="outline" className="w-full">
                    我的商品
                  </Button>
                </Link>
                <Link href="/orders?role=seller" className="flex-1">
                  <Button variant="outline" className="w-full">
                    我賣出嘅訂單
                  </Button>
                </Link>
              </div>
            </div>
          ) : listing.status !== 'ACTIVE' ? (
            /* ── 非賣家 + 商品已唔可以買 — top banner 已 surface 狀態 ── */
            <div className="mt-6 space-y-3">
              {/* Buyer track-order strip — direct link if logged-in user is the
                  buyer on the active order (lesson #1: avoid plain-text dead-end) */}
              {activeOrder && me && activeOrder.buyerId === me.id && (
                <a
                  href={`/orders/${activeOrder.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm transition hover:bg-brand-100"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-brand-900">你係這個訂單嘅買家</span>
                    <span className="ml-1.5 text-[11px] text-brand-700">
                      · {getStatusLabel(activeOrder.status, activeOrder.deliveryMethod)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-brand-700">追蹤進度 →</span>
                </a>
              )}
              <p className="text-xs text-slate-500">
                {activeOrder && me && activeOrder.buyerId === me.id
                  ? '如果交易最終取消或退款，商品會重新上架。'
                  : <>如果你已經係呢張訂單嘅買家，可以喺「我的訂單」追蹤進度。
                      {listing.status === 'RESERVED' && ' 如果交易最終取消或退款，商品會重新上架。'}</>}
              </p>
            </div>
          ) : (
            <>
              {tier === 3 && (
                <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4" /> Tier 3 強制鑑定
                  </p>
                  <p className="mt-1 text-emerald-800">
                    此商品價格 ≥ HKD 10,000，必須揀一位平台註冊鑑定師驗證後才會放款。
                  </p>
                </div>
              )}

              {/* 步驟 1：揀交收方式 */}
              <section className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">1</span>
                  交收方式
                </h3>
                <div className="space-y-2">
                  {allowedMethods.map((m) => {
                    const meta = DELIVERY_META[m];
                    // Tier 3 強制鑑定 → 唔可以揀無鑑定嘅 MEETUP_DIRECT
                    const hardHidden = tier === 3 && m === 'MEETUP_DIRECT';
                    if (hardHidden) return null;
                    // 此品類無註冊鑑定師 → disable 需要鑑定師嘅 method
                    const noAuthAvailable = authenticators.length === 0;
                    const disabledNoAuth = noAuthAvailable && meta.needsAuth;
                    const Icon = meta.icon;
                    return (
                      <Card
                        key={m}
                        onClick={() => { if (!disabledNoAuth) setDeliveryMethod(m); }}
                        aria-disabled={disabledNoAuth}
                        className={`transition ${
                          disabledNoAuth
                            ? 'cursor-not-allowed opacity-50'
                            : `cursor-pointer ${deliveryMethod === m ? 'border-brand-500 ring-2 ring-brand-200' : ''}`
                        }`}
                      >
                        <CardContent className="flex items-start gap-3 p-3 text-sm">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          <div>
                            <p className="font-medium">{meta.label}</p>
                            <p className="text-xs text-slate-500">{meta.desc}</p>
                            {meta.needsAuth && (
                              <p className="mt-0.5 text-xs font-medium text-brand-600">
                                需要鑑定師{disabledNoAuth ? '（此品類暫無註冊鑑定師，不可選）' : ''}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {authenticators.length === 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      ⚠️ 此品類暫時冇平台註冊鑑定師。需要鑑定師嘅交收方式暫時不可選。
                    </p>
                  )}
                </div>
              </section>

              {/* 步驟 2：揀鑑定師（由交收方式決定是否出現）*/}
              {showAuthStep && (
                <section className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">
                    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">2</span>
                    {authRequired ? '揀鑑定師（必選 1）' : '揀鑑定師（可選）'}
                  </h3>
                  <div className="space-y-2">
                    {authenticators.length === 0 && (
                      <p className="text-xs text-slate-500">此品類暫無註冊鑑定師。</p>
                    )}
                    {authOptional && (
                      <Card
                        onClick={() => setSelectedAuth(null)}
                        className={`cursor-pointer transition ${selectedAuth === null ? 'border-brand-500 ring-2 ring-brand-200' : ''}`}
                      >
                        <CardContent className="p-3 text-sm">
                          <p className="font-medium">唔使鑑定</p>
                          <p className="text-xs text-slate-500">自行承擔風險、無鑑定費</p>
                        </CardContent>
                      </Card>
                    )}
                    {authenticators.map((a) => {
                      const fee = quoteAuthFee(effectivePrice, {
                        feeRatePct: a.feeRatePct,
                        feeMinHKD: a.feeMinHKD,
                      });
                      return (
                        <Card
                          key={a.id}
                          onClick={() => setSelectedAuth(a.id)}
                          className={`cursor-pointer transition ${selectedAuth === a.id ? 'border-brand-500 ring-2 ring-brand-200' : ''}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{a.displayName}</p>
                                {a.storeName && (
                                  <p className="truncate text-xs text-slate-500">{a.storeName}</p>
                                )}
                              </div>
                              <StarRating value={a.starRating} size="sm" />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                              <Badge variant="default">已鑑定 {a.completedCount} 件</Badge>
                              {a.district && (
                                <Badge variant="default">
                                  <MapPin className="mr-0.5 inline h-3 w-3" />
                                  {a.district}
                                </Badge>
                              )}
                              {a.acceptsMeetup && <Badge variant="default">接受面交</Badge>}
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-sm font-semibold text-brand-700">
                                鑑定費 {formatHKD(fee)}
                                <span className="ml-1 text-xs font-normal text-slate-400">
                                  （{Math.round(a.feeRatePct * 1000) / 10}%，最低 {formatHKD(a.feeMinHKD)}）
                                </span>
                              </span>
                              <Link
                                href={`/authenticator/${a.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-brand-600 hover:underline"
                              >
                                睇檔案 →
                              </Link>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 面交地點 — MEETUP_AUTH/3WAY 由鑑定師提供分店，MEETUP_DIRECT 買家自填 */}
              {(deliveryMethod === 'MEETUP_AUTH' || deliveryMethod === 'MEETUP_3WAY') && (
                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    交收分店（由鑑定師提供）
                  </label>
                  {!selectedAuth ? (
                    <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      請先揀鑑定師，先會顯示佢嘅分店列表。
                    </p>
                  ) : branches.length === 0 ? (
                    <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      呢位鑑定師暫時冇可用分店，請揀其他鑑定師或交收方式。
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {branches.map((b) => {
                        const active = selectedBranchId === b.id;
                        const district = districtLabel(b.districtKey);
                        const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(b.fullAddress + ' ' + (district ?? ''))}`;
                        return (
                          <label
                            key={b.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                              active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="branch"
                              checked={active}
                              onChange={() => setSelectedBranchId(b.id)}
                              className="mt-0.5 h-4 w-4 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="flex items-center gap-1.5 font-medium text-slate-900">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                                {b.name}
                                {b.isPrimary && (
                                  <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                                    主要
                                  </span>
                                )}
                                {district && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                    {district}
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-700">{b.fullAddress}</p>
                              {b.businessHours && (
                                <p className="mt-0.5 text-[11px] text-slate-500">營業時間：{b.businessHours}</p>
                              )}
                              {b.notes && (
                                <p className="mt-0.5 text-[11px] text-amber-700">⚠ {b.notes}</p>
                              )}
                              {/* Public contact links — real handlers (lesson #11) */}
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-brand-600 hover:underline"
                                >
                                  📍 Google Maps
                                </a>
                                {b.contactPhone && (
                                  <a
                                    href={`tel:${b.contactPhone.replace(/\s+/g, '')}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-brand-600 hover:underline"
                                  >
                                    📞 {b.contactPhone}
                                  </a>
                                )}
                                {b.contactWhatsapp && (
                                  <a
                                    href={`https://wa.me/${b.contactWhatsapp}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-emerald-600 hover:underline"
                                  >
                                    💬 WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                      <p className="text-[10px] text-slate-400">
                        交收地點由鑑定師提供，平台中立 — 請依時到場。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* MEETUP_DIRECT — 買家揀賣家建議地點，或填「其他」 */}
              {deliveryMethod === 'MEETUP_DIRECT' && (
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-medium text-slate-600">面交地點</label>
                  <div className="space-y-2">
                    {(listing.sellerMeetupLocations ?? []).map((loc: string, i: number) => (
                      <label key={i} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-brand-400 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                        <input
                          type="radio"
                          name="meetupLocation"
                          value={loc}
                          checked={meetupLocation === loc}
                          onChange={() => { setMeetupLocation(loc); setMeetupCustomLocation(''); }}
                          className="h-4 w-4 accent-brand-600"
                        />
                        {loc}
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-brand-400 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input
                        type="radio"
                        name="meetupLocation"
                        value="OTHER"
                        checked={meetupLocation === 'OTHER'}
                        onChange={() => setMeetupLocation('OTHER')}
                        className="h-4 w-4 accent-brand-600"
                      />
                      其他地點
                    </label>
                  </div>
                  {meetupLocation === 'OTHER' && (
                    <input
                      value={meetupCustomLocation}
                      onChange={(e) => setMeetupCustomLocation(e.target.value)}
                      placeholder="請填寫你建議嘅面交地點"
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-200"
                      autoFocus
                    />
                  )}
                  <p className="mt-1 text-[10px] text-slate-400">
                    賣家建議地點供參考，如需更改可揀「其他」並填寫。
                  </p>
                </div>
              )}

              {/* 步驟 3：揀付款方式 */}
              <section className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {showAuthStep ? 3 : 2}
                  </span>
                  付款方式
                </h3>
                {/* Payment-method × delivery × auth matrix:
                    - SHIP + no-auth → 只准 OFFLINE_CASH (founder ruling 2026-06-11)
                    - Meetup → 兩個都准
                    - SHIP + auth → 只准 ONLINE_ESCROW (現有 logic) */}
                {(() => {
                  const isShipNoAuth = deliveryMethod === 'SHIP' && !selectedAuth;
                  return (
                    <>
                      <div className="space-y-2">
                        {(['ONLINE_ESCROW', 'OFFLINE_CASH'] as PaymentMethod[]).map((p) => {
                          if (p === 'OFFLINE_CASH' && !isMeetup && !isShipNoAuth) return null;
                          if (p === 'ONLINE_ESCROW' && isShipNoAuth) return null;
                          const meta = PAYMENT_META[p];
                          const Icon = meta.icon;
                          return (
                            <Card
                              key={p}
                              onClick={() => setPaymentMethod(p)}
                              className={`cursor-pointer transition ${paymentMethod === p ? 'border-brand-500 ring-2 ring-brand-200' : ''}`}
                            >
                              <CardContent className="flex items-start gap-3 p-3 text-sm">
                                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                                <div>
                                  <p className="font-medium">{meta.label}</p>
                                  <p className="text-xs text-slate-500">{meta.desc}</p>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                      {isShipNoAuth && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <strong>物流寄送（無鑑定師）：</strong>
                            平台唔會託管款項，買賣雙方需要自行協議付款方式 (FPS / 銀行轉帳 / 現金)。
                            如出現爭議，平台冇方法協助處理，請自行解決。
                          </span>
                        </p>
                      )}
                      {paymentMethod === 'OFFLINE_CASH' && !isShipNoAuth && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          線下現金交收平台不會託管款項，未能提供款項保障，請自行注意交收安全。
                        </p>
                      )}
                    </>
                  );
                })()}
              </section>

              {/* 費用明細 */}
              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <h4 className="mb-2 font-semibold">費用明細</h4>
                <div className="space-y-1 text-slate-700">
                  <p className="flex justify-between">
                    <span>商品價</span>
                    <span>{formatHKD(fees.total)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>鑑定費（賣家付{selectedAuthObj ? `，${selectedAuthObj.displayName}` : ''}）</span>
                    <span className="text-slate-500">-{formatHKD(fees.authFee)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>平台撮合費 1.5%（賣家付）</span>
                    <span className="text-slate-500">-{formatHKD(fees.platformFee)}</span>
                  </p>
                </div>
              </div>

              {error && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}

              <Button size="lg" className="mt-6 w-full" onClick={onBuy} disabled={busy}>
                {busy
                  ? '處理中…'
                  : paymentMethod === 'OFFLINE_CASH'
                    ? '確認落單（面交付款）'
                    : '付款並啟動交易'}
              </Button>

              {!me && (
                <p className="mt-2 text-center text-xs text-slate-400">
                  未登入？<Link href="/login" className="text-brand-600 hover:underline">先登入</Link>
                </p>
              )}

            </>
          )}
        </div>
      </div>

      {/* ── Recommendations — same-category listings, 8 items ── */}
      {relatedListings.length > 0 && (
        <div className="mt-10 border-t border-slate-100 pt-8">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">同類商品</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {relatedListings.map((other) => (
              <Link key={other.id} href={`/listing/${other.id}`} className="flex">
                <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-100 bg-white transition hover:shadow-md">
                  <div className="aspect-square shrink-0 bg-slate-100">
                    {other.images?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={other.images[0]} alt={other.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-2">
                    <p className="line-clamp-2 min-h-[2.25rem] text-xs leading-snug">{other.title}</p>
                    <p className="mt-auto pt-1 text-sm font-semibold">{formatHKD(other.priceHKD)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Chat drawer for listing inquiry (non-owner contacting seller) */}
      {chatOpen && me && listing && (
        <ConversationDrawer
          listingId={listing.id}
          currentUserId={me.id}
          counterpartyName={listing.seller?.displayName ?? '賣家'}
          listingTitle={listing.title}
          listingLinkId={listing.id}
          listingImage={listing.images?.[0]}
          counterpartySellerId={listing.seller?.id}
          conversationType="listing"
          onClose={() => setChatOpen(false)}
        />
      )}

      {/* Owner-initiated chat with a specific buyer/auth (per-conversation).
          Counterparty is the BUYER (or auth) — do NOT pass counterpartySellerId
          since that would link to the seller's OWN profile (lesson #1 dead-end). */}
      {activeConv && me && listing && (
        <ConversationDrawer
          orderId={activeConv.orderId ?? undefined}
          listingId={activeConv.orderId ? undefined : listing.id}
          conversationId={activeConv.orderId ? undefined : activeConv.convId}
          currentUserId={me.id}
          counterpartyName={activeConv.counterpartyName}
          listingTitle={listing.title}
          listingLinkId={listing.id}
          listingImage={listing.images?.[0]}
          counterpartyBuyerId={activeConv.counterpartyId}
          parties={activeConv.parties}
          orderStatus={activeConv.orderStatus ?? undefined}
          conversationType={activeConv.orderId ? 'order' : 'listing'}
          onClose={() => setActiveConv(null)}
          readOnly={['COMPLETED', 'REFUNDED', 'DISPUTED'].includes(activeConv.orderStatus ?? '')}
          readOnlyReason={
            activeConv.orderStatus === 'COMPLETED' ? '訂單已完成，對話存檔僅供查閱。'
            : activeConv.orderStatus === 'REFUNDED' ? '訂單已退款，對話存檔僅供查閱。'
            : activeConv.orderStatus === 'DISPUTED' ? '訂單爭議處理中，對話已鎖定。'
            : undefined
          }
        />
      )}
    </div>
  );
}

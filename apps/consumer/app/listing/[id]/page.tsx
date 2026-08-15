'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardContent, TierPill, StarRating, Badge, Pill } from '@certifine/ui';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { tierForPrice, calculateOrderFees, quoteAuthFee, categoryByApiEnum, needsMyAction } from '@certifine/domain';
import { formatHKD, formatSavings, brandLabel, brandFieldLabel, sellerActionCta, getStatusLabel, districtLabel, conditionLabel, categoryLabel, categoryShortLabel, stationDisplayLabel, getClientLocale, createT } from '@certifine/web-kit';
import { ShieldCheck, MapPin, Truck, Users, UserCheck, Wallet, Lock, AlertTriangle } from 'lucide-react';
import { api, hasToken, ApiError } from '@/lib/api';
import { track, flushAnalytics } from '@/lib/analytics';
import { ConversationDrawer } from '@/components/conversation-drawer';
import { MessageCircle, Share2 } from 'lucide-react';
import { ShareIgModal } from '@/components/share-ig-modal';

type DeliveryMethod = 'SHIP' | 'MEETUP_AUTH' | 'MEETUP_3WAY' | 'MEETUP_DIRECT';
type PaymentMethod = 'ONLINE_ESCROW' | 'OFFLINE_CASH';

const DELIVERY_META: Record<
  DeliveryMethod,
  { labelKey: string; descKey: string; icon: typeof Truck; meetup: boolean; needsAuth: boolean }
> = {
  SHIP: { labelKey: 'listing.delivery.ship', descKey: 'listing.delivery.shipDesc', icon: Truck, meetup: false, needsAuth: false },
  MEETUP_AUTH: { labelKey: 'listing.delivery.meetupAuth', descKey: 'listing.delivery.meetupAuthDesc', icon: UserCheck, meetup: true, needsAuth: true },
  MEETUP_3WAY: { labelKey: 'listing.delivery.meetup3way', descKey: 'listing.delivery.meetup3wayDesc', icon: Users, meetup: true, needsAuth: true },
  MEETUP_DIRECT: { labelKey: 'listing.delivery.meetupDirect', descKey: 'listing.delivery.meetupDirectDesc', icon: Users, meetup: true, needsAuth: false },
};

const PAYMENT_META: Record<PaymentMethod, { labelKey: string; descKey: string; icon: typeof Wallet }> = {
  ONLINE_ESCROW: { labelKey: 'listing.payment.escrow', descKey: 'listing.payment.escrowDesc', icon: Lock },
  OFFLINE_CASH: { labelKey: 'listing.payment.cashDirect', descKey: 'listing.payment.cashDirectDesc', icon: Wallet },
};

// Values are t() keys, not text — this map lives outside the component.
const STATUS_LABEL_KEY: Record<string, string> = {
  DRAFT: 'listing.status.draft',
  ACTIVE: 'listing.status.active',
  RESERVED: 'listing.status.reserved',
  SOLD: 'listing.status.sold',
  REMOVED: 'listing.status.removed',
};

type GallerySlide = { kind: 'image' | 'video'; src: string; poster?: string };

/** 全屏放大睇相（eBay 式，founder 2026-07-21）：
 *  - click 圖放大：desktop 滑鼠移動跟 cursor magnify（2.5x）；mobile tap 放大
 *  - swipe / 箭咀 / Esc / ← → 揭相；X / 撳背景關
 *  - video slide 照播（唔 zoom）
 *  - portal 去 body，唔受 listing 頁任何 overflow/transform 影響 */
function ImageLightbox({
  slides, index, setIndex, onClose,
}: {
  slides: GallerySlide[];
  index: number;
  setIndex: (fn: (i: number) => number) => void;
  onClose: () => void;
}) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const touchX = useRef<number | null>(null);
  const s = slides[index];

  useEffect(() => {
    setZoom(false); // 揭去另一張時取消放大
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + slides.length) % slides.length);
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % slides.length);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';   // lock 背景 scroll
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [slides.length, onClose, setIndex]);

  if (typeof document === 'undefined' || !s) return null;

  function panFrom(clientX: number, clientY: number, el: HTMLImageElement) {
    const r = el.getBoundingClientRect();
    setOrigin(`${((clientX - r.left) / r.width) * 100}% ${((clientY - r.top) / r.height) * 100}%`);
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-modal="true">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm text-white/70">{index + 1} / {slides.length}</span>
        <button type="button" onClick={onClose} aria-label={_t('listing.lightbox.close')} className="rounded-full p-2 transition hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
      </div>
      {/* stage — 撳背景關 */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          if (zoom || touchX.current === null || slides.length < 2) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
          if (Math.abs(dx) > 40) setIndex((i) => dx < 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length);
          touchX.current = null;
        }}
      >
        {s.kind === 'video' ? (
          <video src={s.src} poster={s.poster} controls playsInline autoPlay className="max-h-full max-w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.src}
            alt=""
            onClick={() => setZoom((z) => !z)}
            onMouseMove={(e) => { if (zoom) panFrom(e.clientX, e.clientY, e.currentTarget); }}
            onTouchMove={(e) => { const t = e.touches[0]; if (zoom && t) panFrom(t.clientX, t.clientY, e.currentTarget); }}
            style={{ transformOrigin: origin, transform: zoom ? 'scale(2.5)' : 'scale(1)' }}
            className={`max-h-full max-w-full object-contain transition-transform duration-150 ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
          />
        )}
        {slides.length > 1 && !zoom && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
              className="absolute left-4 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25 md:block"
            ><ChevronLeft className="h-6 w-6" /></button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % slides.length)}
              className="absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25 md:block"
            ><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
      </div>
      {/* thumbnails */}
      {slides.length > 1 && (
        <div className="scrollbar-hide flex justify-start gap-2 overflow-x-auto p-3 md:justify-center">
          {slides.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(() => i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded border-2 transition ${i === index ? 'border-white' : 'border-white/25'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.kind === 'video' ? (t.poster ?? '') : t.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Layout-matched skeleton（founder 2026-07-20 mobile #3）：撳入商品即刻見到
 *  大圖 + 標題 + 價錢 + CTA 嘅骨架（唔再係一句「載入中…」），減少「壞咗」感 +
 *  避免內容到位時 layout jump。用共用 `.skeleton` shimmer class。 */
function ListingDetailSkeleton() {
  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-2 sm:px-6">
      <div className="skeleton my-5 h-3 w-48" />
      <div className="grid items-start gap-11 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="skeleton aspect-square w-full !rounded-[14px]" />
          <div className="mt-3 flex gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[72px] w-[72px] shrink-0 !rounded-[10px]" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="skeleton h-6 w-28 !rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-6 w-full" />
            <div className="skeleton h-6 w-2/3" />
          </div>
          <div className="skeleton h-10 w-40" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14 w-full !rounded-xl" />
            ))}
          </div>
          <div className="skeleton h-12 w-full !rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function ListingPage({ params }: { params: { id: string } }) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

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
  const touchStartX = useRef<number | null>(null);   // mobile swipe gallery (#4)
  const touchMoved = useRef(false);                   // 分辨 swipe vs tap（tap 先開 lightbox）
  const [lightboxOpen, setLightboxOpen] = useState(false);  // 放大睇相（eBay 式）
  const [chatOpen, setChatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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
          // Analytics（spec §2.2）：listing_viewed，source 由上一頁寫低嘅
          // sessionStorage flag derive（search/browse），冇 = direct_link
          let source: 'browse' | 'search' | 'seller_profile' | 'direct_link' = 'direct_link';
          try {
            const s = sessionStorage.getItem('analytics_listing_source');
            if (s === 'search' || s === 'browse' || s === 'seller_profile') source = s;
            sessionStorage.removeItem('analytics_listing_source');
          } catch {}
          track('listing_viewed', {
            listing_id: l.id,
            tier: tierForPrice(l.priceHKD),
            price_hkd: l.priceHKD,
            category_id: l.category,
            source,
          });
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

  // Analytics（founder 2026-07-14 enhancement）：停留時間。SPA nav（cleanup）
  // 同 hard close（pagehide）都截；clamp 30 分鐘防掛機 tab 污染平均數。
  useEffect(() => {
    const startedAt = Date.now();
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      const dwell = Math.min(Math.round((Date.now() - startedAt) / 1000), 30 * 60);
      if (dwell >= 1) {
        track('listing_view_ended', { listing_id: id, dwell_seconds: dwell });
        flushAnalytics(true); // pagehide：lib 嘅 flush 已行完，補一槍 beacon
      }
    };
    window.addEventListener('pagehide', report);
    return () => { report(); window.removeEventListener('pagehide', report); };
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
    // Only the newest orders can still be active for this listing, so one page
    // is enough — this must not re-introduce an unbounded fetch.
    api.orders.list(50)
      .then(({ items: orders }) => {
        const match = orders.find((o: any) =>
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

  // Sell-success entry: /listing/:id?share=1 auto-opens the IG share wizard
  // for the owner right after 刊登 (highest-intent moment).
  useEffect(() => {
    if (isOwner && searchParams.get('share') === '1') setShareOpen(true);
  }, [isOwner, searchParams]);

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
    // Ack v2 (E, founder 2026-07-10): MEETUP_DIRECT 零佣金零託管 — 唔准 escrow
    if (paymentMethod === 'ONLINE_ESCROW' && deliveryMethod === 'MEETUP_DIRECT') {
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
      setError(_t('listing.error.chooseDelivery'));
      return;
    }
    if (authRequired && !selectedAuth) {
      setError(_t('listing.error.chooseAuth'));
      return;
    }
    if (!paymentMethod) {
      setError(_t('listing.error.choosePayment'));
      return;
    }
    const needsBranch = deliveryMethod === 'MEETUP_AUTH' || deliveryMethod === 'MEETUP_3WAY';
    if (needsBranch && !selectedBranchId) {
      setError(_t('listing.error.chooseBranch'));
      return;
    }
    if (deliveryMethod === 'MEETUP_DIRECT' && !meetupLocation) {
      setError(_t('listing.error.chooseMeetupLocation'));
      return;
    }
    if (deliveryMethod === 'MEETUP_DIRECT' && meetupLocation === 'OTHER' && !meetupCustomLocation.trim()) {
      setError(_t('listing.meetupDirect.locationRequired'));
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
    return <ListingDetailSkeleton />;
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
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-2 sm:px-6">
      {/* ═══ Breadcrumb ═══════════════════════════════════════════════════════ */}
      <nav className="py-5 text-[12px] text-neutral-text-hint">
        <Link href="/" className="transition hover:text-ink">{_t('listing.breadcrumb.home')}</Link>
        <span className="mx-1.5">/</span>
        {(() => {
          const cat = categoryByApiEnum(listing.category);
          if (!cat) return <span data-user-content className="text-neutral-text-muted">{listing.title}</span>;
          return (
            <>
              <Link href={`/browse?cat=${cat.id}` as any} className="transition hover:text-ink">
                {categoryLabel(cat.id, locale)}
              </Link>
              <span className="mx-1.5">/</span>
              {listing.brand && (() => {
                const bl = brandLabel(cat.id as any, listing.brand);
                return bl ? (
                  <>
                    <Link href={`/browse?cat=${cat.id}&brand=${listing.brand}` as any} className="transition hover:text-ink">
                      {bl}
                    </Link>
                    <span className="mx-1.5">/</span>
                  </>
                ) : null;
              })()}
              <span data-user-content className="truncate text-neutral-text-muted">{listing.title}</span>
            </>
          );
        })()}
      </nav>

      <div className="grid items-start gap-11 md:grid-cols-[1.05fr_0.95fr]">
        {/* ═══ Media gallery ═══════════════════════════════════════════════ */}
        {(() => {
          const imgs: string[] = listing.images ?? [];
          const slides: Array<{ kind: 'image' | 'video'; src: string; poster?: string }> =
            listing.videoUrl
              ? listing.videoIsCover
                ? [{ kind: 'video', src: listing.videoUrl, poster: listing.videoPosterUrl }, ...imgs.map((s) => ({ kind: 'image' as const, src: s }))]
                : [...imgs.map((s) => ({ kind: 'image' as const, src: s })), { kind: 'video', src: listing.videoUrl, poster: listing.videoPosterUrl }]
              : imgs.map((s) => ({ kind: 'image' as const, src: s }));
          const active = slides[activeImg] ?? slides[0];
          const brandWatermark = listing.brand
            ? brandLabel(categoryByApiEnum(listing.category)?.id as any, listing.brand) ?? listing.brand
            : categoryShortLabel(categoryByApiEnum(listing.category)?.id, locale);
          return (
            <div>
              <div
                className="relative aspect-square touch-pan-y select-none overflow-hidden rounded-[14px] border border-line bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee] shadow-sh2"
                onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; touchMoved.current = false; }}
                onTouchMove={(e) => {
                  if (touchStartX.current !== null && Math.abs((e.touches[0]?.clientX ?? 0) - touchStartX.current) > 10) touchMoved.current = true;
                }}
                onTouchEnd={(e) => {
                  // mobile swipe 揭相（#4）：橫掃 > 40px 先當有效，避免誤觸
                  if (touchStartX.current === null || slides.length < 2) return;
                  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
                  if (Math.abs(dx) > 40) {
                    setActiveImg((i) => dx < 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length);
                  }
                  touchStartX.current = null;
                }}
              >
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
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={active.src}
                        alt={listing.title}
                        onClick={() => { if (!touchMoved.current) setLightboxOpen(true); }}
                        className="h-full w-full cursor-zoom-in object-cover"
                      />
                      {/* 放大提示 */}
                      <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-medium text-white">
                        <ZoomIn className="h-3.5 w-3.5" /> {_t('listing.lightbox.zoom')}
                      </span>
                    </>
                  )
                ) : (
                  <div className="flex h-full items-center justify-center font-display-serif text-[16px] font-bold uppercase tracking-[0.18em] text-[#9aa3b5]">
                    {brandWatermark}
                  </div>
                )}
                {slides.length > 1 && (
                  <>
                    {/* 箭咀 desktop 先顯示；mobile 靠 swipe（#4），免箭咀擋相/打交叉 */}
                    <button
                      onClick={() => setActiveImg((i) => (i - 1 + slides.length) % slides.length)}
                      className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60 md:block"
                    ><ChevronLeft className="h-5 w-5" /></button>
                    <button
                      onClick={() => setActiveImg((i) => (i + 1) % slides.length)}
                      className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60 md:block"
                    ><ChevronRight className="h-5 w-5" /></button>
                    {/* Dot indicator — mobile 標準揭相提示（IG/Carousell muscle memory） */}
                    <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                      {slides.map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 rounded-full transition-all ${
                            activeImg === i ? 'w-4 bg-white' : 'w-1.5 bg-white/55'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {slides.length > 1 && (
                <div className="scrollbar-hide mt-3 flex touch-pan-x snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain pb-1">
                  {slides.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`relative h-[72px] w-[72px] shrink-0 snap-center overflow-hidden rounded-[10px] border-2 bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee] shadow-sh1 transition ${
                        activeImg === i ? 'border-verify' : 'border-line'
                      }`}
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
              {lightboxOpen && (
                <ImageLightbox
                  slides={slides}
                  index={activeImg}
                  setIndex={setActiveImg}
                  onClose={() => setLightboxOpen(false)}
                />
              )}
            </div>
          );
        })()}
        <div>
          {/* ── Pill row (Tier + Verify + Share) ── */}
          <div className="flex flex-wrap items-center gap-2">
            <TierPill tier={tier} showDescription className="!py-1 text-[11px]" />
            {tier === 3 && (
              <Pill variant="verify" size="md">{_t('listing.mandatoryAuthBadge')}</Pill>
            )}
            {/* Share — 人人可見（founder 2026-07-12），唔止 owner */}
            {(listing.images?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink shadow-sh1 transition hover:border-brand-600 hover:text-brand-700"
              >
                <Share2 className="h-3.5 w-3.5" /> {_t('listing.share')}
              </button>
            )}
          </div>

          {/* ── State banner — RIGHT below pill so status is clear before title ── */}
          {isOwner && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-verify-soft px-3 py-2 text-xs">
              <UserCheck className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="font-medium text-brand-800">{_t('listing.owner.banner')}</span>
              <span className="text-brand-600">·</span>
              <span className="text-brand-700">{_t('listing.owner.status', { status: _t(STATUS_LABEL_KEY[listing.status] ?? listing.status) })}</span>
            </div>
          )}
          {!isOwner && listing.status === 'RESERVED' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">{_t('listing.reserved.bannerTitle')}</p>
                <p className="mt-0.5 text-amber-800">{_t('listing.reserved.bannerDesc')}</p>
              </div>
            </div>
          )}
          {!isOwner && listing.status === 'SOLD' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-text-hint" />
              <div>
                <p className="font-medium text-neutral-text">{_t('listing.sold.bannerTitle')}</p>
                <p className="mt-0.5 text-neutral-text-muted">
                  {_t('listing.sold.bannerDesc')}
                </p>
              </div>
            </div>
          )}

          {/* ── L3 Serif big title ── */}
          <h1 data-user-content className="mt-4 font-display-serif text-[28px] font-bold leading-[1.2] tracking-[-0.01em] text-ink">
            {listing.title}
          </h1>

          {/* ── Mono subtitle — brand + condition compressed ── */}
          {(listing.brand || listing.condition) && (
            <div className="mt-2 text-[12px] tracking-[0.04em] text-neutral-text-hint">
              {[
                listing.brand
                  ? (() => {
                      const cat = categoryByApiEnum(listing.category);
                      return cat ? brandLabel(cat.id as any, listing.brand) : listing.brand;
                    })()
                  : null,
                listing.condition ? _t('listing.condition.sellerStated', { cond: conditionLabel(listing.condition, locale) }) : null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}

          {/* Small listing id line */}
          <p className="mt-1 font-mono text-[11px] text-neutral-text-hint">
            Listing #{listing.id.slice(0, 8)}
          </p>

          {/* Price — show negotiated price if locked */}
          {lockedOffer && lockedOffer.status === 'ACCEPTED' ? (
            <div className="mt-4">
              <p className="text-[32px] font-extrabold leading-none text-brand-700">{formatHKD(lockedOffer.priceHKD)}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                <span className="line-through">{_t('listing.price.original', { price: formatHKD(listing.priceHKD) })}</span>
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                  {_t('listing.price.negotiatedBadge')}
                </span>
              </p>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">{_t('listing.price.negotiatedConfirm')}</p>
                <p className="mt-0.5 text-amber-800">
                  {lockedOffer.paymentDeadlineAt
                    ? _t('listing.offer.paymentDeadline', { deadline: new Date(lockedOffer.paymentDeadlineAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK', { hour12: false }) })
                    : _t('listing.price.deadlineSoon')}
                </p>
                {effectivePrice < listing.priceHKD && tier !== tierForPrice(listing.priceHKD) && (
                  <p className="mt-1 text-amber-800">
                    {_t('listing.offer.tierNotice', { tier: _t(tier === 1 ? 'listing.offer.tier1' : tier === 2 ? 'listing.offer.tier2' : 'listing.offer.tier3') })}
                  </p>
                )}
              </div>
            </div>
          ) : listing.status === 'SOLD' && listing.actualSalePriceHKD != null ? (
            // Founder ruling 2026-06-11: 成交價可以公開
            // 2026-06-19 Q6=A: SOLD with original-price anchor — show full
            // strikethrough so buyers see the deal context.
            <div className="mt-4">
              <p className="text-[32px] font-extrabold leading-none text-neutral-text">{formatHKD(listing.actualSalePriceHKD)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {_t('listing.price.soldPrice')}
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
                <p className="text-[32px] font-extrabold leading-none text-danger">{formatHKD(listing.priceHKD)}</p>
                <p className="mt-1 text-sm">
                  <span className="text-slate-400 line-through">原價 {formatHKD(listing.originalPriceHKD)}</span>
                  <span className="ml-2 inline-flex items-center rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                    {savings.display} · {savings.savedDisplay}
                  </span>
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[32px] font-extrabold leading-none text-ink">{formatHKD(listing.priceHKD)}</p>
            );
          })()}

          {/* ═══ L3 Spec 2×2 grid ═══ Seller-declared attributes.
              Uses only structured fields we have; other rows fall back to "—". */}
          {(() => {
            const cat = categoryByApiEnum(listing.category);
            const districtLabelStr = stationDisplayLabel(listing.sellerDistrict) ?? '—';
            const spec = [
              // Attribution is not decoration: an unattributed 「狀況」 reads as a
              // fact the platform verified. Condition is the seller's claim and
              // has to say so, in the same words everywhere (founder 2026-08-02).
              { k: _t('listing.specConditionLabel'), v: listing.condition ? conditionLabel(listing.condition, locale) : '—' },
              { k: _t('listing.spec.category'), v: categoryLabel(cat?.id, locale) || '—' },
              { k: _t('listing.spec.brand'), v: listing.brand ? (cat ? brandLabel(cat.id as any, listing.brand) : listing.brand) : '—' },
              { k: _t('listing.spec.district'), v: districtLabelStr },
            ];
            return (
              <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-white shadow-sh1">
                {spec.map((s, i) => (
                  <div
                    key={s.k}
                    className={`px-4 py-3.5 ${i % 2 === 0 ? 'border-r border-line' : ''} ${i < 2 ? 'border-b border-line' : ''}`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-text-hint">
                      {s.k}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-neutral-text">{s.v}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ═══ L3 card-glow — Tier authentication trust panel ═══ */}
          <div className={`mt-5 rounded-xl border p-5 shadow-[0_12px_30px_-16px_rgba(0,135,102,0.4)] ${
            tier === 3 ? 'border-verify-border bg-verify-soft/40' : 'border-line bg-white'
          }`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
              {tier === 3 ? _t('listing.tier.trustPanelT3') : tier === 2 ? _t('listing.tier.trustPanelT2') : _t('listing.tier.trustPanelT1')}
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-neutral-text">
              {tier === 3
                ? _t('listing.tier.descT3')
                : tier === 2
                  ? _t('listing.tier.descT2')
                  : _t('listing.tier.descT1')}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-neutral-text-hint">
              {_t('listing.tier.disclaimer')}
            </p>
          </div>

          <p data-user-content className="mt-6 text-sm text-neutral-text-muted whitespace-pre-wrap">{listing.description}</p>

          {/* 上架時間 — 分鐘/小時/日 granularity */}
          {listing.createdAt && (
            <p className="mt-2 text-[11px] text-slate-400">
              {_t('listing.time.listedPrefix')}{(() => {
                const diff = Date.now() - new Date(listing.createdAt).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 1) return _t('listing.time.justNow');
                if (mins < 60) return _t('listing.time.minsAgo', { n: mins });
                const hours = Math.floor(mins / 60);
                if (hours < 24) return _t('listing.time.hoursAgo', { n: hours });
                const days = Math.floor(hours / 24);
                if (days < 30) return _t('listing.time.daysAgo', { n: days });
                const months = Math.floor(days / 30);
                if (months < 12) return _t('listing.time.monthsAgo', { n: months });
                return new Date(listing.createdAt).toLocaleDateString(locale === 'en' ? 'en-HK' : 'zh-HK');
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
                <span data-user-content className="font-medium text-slate-700 group-hover:text-brand-700">
                  {listing.seller.displayName}
                </span>
                <span className="text-[10px] text-slate-400 group-hover:text-brand-600">
                  {_t('listing.seller.viewProfile')}
                </span>
              </Link>
            ) : (
              <span className="text-xs text-slate-500">{_t('listing.seller.prefix')}<span data-user-content>{listing.seller?.displayName}</span></span>
            )}
            {me && !isOwner && (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {listing.status === 'SOLD'
                  ? _t('listing.chat.askSimilarSold')
                  : listing.status === 'RESERVED'
                    ? _t('listing.chat.askSimilarReserved')
                    : _t('listing.chat.contactSeller')}
              </button>
            )}
          </div>

          {isOwner ? (
            /* ── 賣家自己視角：管理資訊 + 同買家/鑑定家對話入口 ── */
            <div className="mt-6 space-y-4">
              {/* ── Seller Action Card — direct CTA when an order on this
                  listing needs jenny's attention. Source of CTA copy: SSOT
                  sellerActionCta() in @certifine/web-kit. */}
              {activeOrder && me && needsMyAction(activeOrder, me.id, 'seller') && (() => {
                const cta = sellerActionCta(activeOrder, locale);
                if (!cta) return null;
                const buyerName = activeOrder.buyer?.displayName ?? _t('orderDetail.label.buyer');
                const deliveryMetaForOrder = DELIVERY_META[activeOrder.deliveryMethod as DeliveryMethod];
                const deliveryLabel = deliveryMetaForOrder ? _t(deliveryMetaForOrder.labelKey) : activeOrder.deliveryMethod;
                return (
                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      {_t('listing.sellerAction.urgent')}
                    </p>
                    <p className="mt-1 text-base font-semibold text-amber-900">{cta.heading}</p>
                    <p className="mt-1 text-[11px] text-amber-800/80">
                      {_t('listing.order.number')} <span className="font-mono">#{activeOrder.id.slice(0, 8)}</span>
                      {' · '}
                      {_t('listing.order.boughtBy', { name: buyerName })}
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
                    <span className="font-medium text-slate-800">{_t('listing.sellerAction.inProgress')}</span>
                    <span className="ml-1.5 text-[11px] text-slate-600">
                      · {getStatusLabel(activeOrder.status, activeOrder.deliveryMethod, locale)}
                    </span>
                    <span className="ml-1.5 text-[10px] text-slate-400">
                      #{activeOrder.id.slice(0, 8)} · {activeOrder.buyer?.displayName ?? _t('orderDetail.label.buyer')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-600">{_t('listing.sellerAction.viewOrder')}</span>
                </a>
              )}

              {/* Owner conversations — let seller message any buyer/auth tied to this listing,
                  at any order status (lesson #1: never dead-end without navigation) */}
              {ownerConvs.length > 0 && (
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
                  <h4 className="mb-2 font-semibold text-brand-900">
                    {_t('listing.conversations.title', { n: ownerConvs.length })}
                  </h4>
                  <div className="space-y-1.5">
                    {ownerConvs.map((c) => {
                      // Label = other participants (excludes viewer). Pair channels
                      // naturally have just one other; 3-way has two.
                      const others = (c.parties ?? []).filter((p) => p.id !== me?.id);
                      const peopleLabel = others.length
                        ? others
                            .map((p) =>
                              p.role === 'AUTHENTICATOR' ? _t('listing.conversations.authenticatorPrefix', { name: p.displayName }) : p.displayName,
                            )
                            .join(' + ')
                        : c.counterparty?.displayName ?? _t('listing.conversations.counterpartyFallback');
                      // Kind badge distinguishes channels with overlapping people
                      const kindBadge =
                        c.kind === 'THREE_WAY' ? { text: _t('listing.conversations.threeWay'), cls: 'bg-slate-200 text-slate-700' }
                        : c.kind === 'BUYER_SELLER' ? { text: _t('listing.conversations.private'), cls: 'bg-amber-200 text-amber-800' }
                        : c.kind === 'BUYER_AUTH' ? { text: _t('listing.conversations.private'), cls: 'bg-amber-200 text-amber-800' }
                        : c.kind === 'SELLER_AUTH' ? { text: _t('listing.conversations.private'), cls: 'bg-amber-200 text-amber-800' }
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
                    {_t('listing.conversations.hint')}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <h4 className="mb-2 font-semibold">{_t('listing.seller.acceptedDelivery')}</h4>
                <div className="flex flex-wrap gap-2">
                  {allowedMethods.map((m) => (
                    <Badge key={m} variant="default">
                      {_t(DELIVERY_META[m].labelKey)}
                    </Badge>
                  ))}
                  {listing.sellerDistrict && (
                    <Badge variant="default">
                      <MapPin className="mr-0.5 inline h-3 w-3" />
                      {stationDisplayLabel(listing.sellerDistrict)}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {_t('listing.owner.buyerViewNote')}
                </p>
              </div>

              {/* Primary action: edit (only while ACTIVE) */}
              {listing.status === 'ACTIVE' && (
                <Link href={`/sell?edit=${listing.id}`} className="block">
                  <Button className="w-full">{_t('listing.seller.editListing')}</Button>
                </Link>
              )}

              <div className="flex gap-2">
                <Link href="/my-listings" className="flex-1">
                  <Button variant="outline" className="w-full">
                    {_t('listing.seller.myListings')}
                  </Button>
                </Link>
                <Link href="/orders?role=seller" className="flex-1">
                  <Button variant="outline" className="w-full">
                    {_t('listing.seller.mySoldOrders')}
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
                    <span className="font-medium text-brand-900">{_t('listing.buyer.trackOrderTitle')}</span>
                    <span className="ml-1.5 text-[11px] text-brand-700">
                      · {getStatusLabel(activeOrder.status, activeOrder.deliveryMethod, locale)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-brand-700">{_t('listing.buyer.trackOrder')}</span>
                </a>
              )}
              <p className="text-xs text-slate-500">
                {activeOrder && me && activeOrder.buyerId === me.id
                  ? _t('listing.buyer.cancelReleaseNote')
                  : <>{_t('listing.buyer.trackInOrders')}
                      {listing.status === 'RESERVED' && _t('listing.buyer.relistNote')}</>}
              </p>
            </div>
          ) : (
            <>
              {tier === 3 && (
                <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4" /> {_t('listing.t3Banner.title')}
                  </p>
                  <p className="mt-1 text-emerald-800">
                    {_t('listing.t3Banner.desc')}
                  </p>
                </div>
              )}

              {/* 步驟 1：揀交收方式 */}
              <section className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">1</span>
                  {_t('listing.step1.delivery')}
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
                            <p className="font-medium">{_t(meta.labelKey)}</p>
                            <p className="text-xs text-slate-500">{_t(meta.descKey)}</p>
                            {meta.needsAuth && (
                              <p className="mt-0.5 text-xs font-medium text-brand-600">
                                {_t('listing.authenticator.requiredSuffix', { suffix: disabledNoAuth ? _t('listing.authenticator.noneInCategory') : '' })}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {authenticators.length === 0 && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {_t('listing.step2.noAuthWarning')}
                    </p>
                  )}
                </div>
              </section>

              {/* 步驟 2：揀鑑定師（由交收方式決定是否出現）*/}
              {showAuthStep && (
                <section className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">
                    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">2</span>
                    {authRequired ? _t('listing.step2.authRequired') : _t('listing.step2.authOptional')}
                  </h3>
                  <div className="space-y-2">
                    {authenticators.length === 0 && (
                      <p className="text-xs text-slate-500">{_t('listing.step2.noAuthCategory')}</p>
                    )}
                    {authOptional && (
                      <Card
                        onClick={() => setSelectedAuth(null)}
                        className={`cursor-pointer transition ${selectedAuth === null ? 'border-brand-500 ring-2 ring-brand-200' : ''}`}
                      >
                        <CardContent className="p-3 text-sm">
                          <p className="font-medium">{_t('listing.step2.noAuth')}</p>
                          <p className="text-xs text-slate-500">{_t('listing.step2.noAuthDesc')}</p>
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
                                <p data-user-content className="truncate font-medium">{a.displayName}</p>
                                {a.storeName && (
                                  <p data-user-content className="truncate text-xs text-slate-500">{a.storeName}</p>
                                )}
                              </div>
                              <StarRating value={a.starRating} size="sm" />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                              <Badge variant="default">{_t('listing.authenticator.completedCount', { n: a.completedCount })}</Badge>
                              {a.district && (
                                <Badge variant="default">
                                  <MapPin className="mr-0.5 inline h-3 w-3" />
                                  {a.district}
                                </Badge>
                              )}
                              {a.acceptsMeetup && <Badge variant="default">{_t('listing.step2.acceptsMeetup')}</Badge>}
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-sm font-semibold text-brand-700">
                                {_t('messages.contextPane.authFee')} {formatHKD(fee)}
                                <span className="ml-1 text-xs font-normal text-slate-400">
                                  {_t('listing.authenticator.feeRateNote', { pct: Math.round(a.feeRatePct * 1000) / 10, min: formatHKD(a.feeMinHKD) })}
                                </span>
                              </span>
                              <Link
                                href={`/authenticator/${a.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-brand-600 hover:underline"
                              >
                                {_t('listing.step2.viewProfile')}
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
                    {_t('listing.branch.selectLabel')}
                  </label>
                  {!selectedAuth ? (
                    <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      {_t('listing.branch.pickAuthFirst')}
                    </p>
                  ) : branches.length === 0 ? (
                    <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {_t('listing.branch.noBranches')}
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
                                    {_t('listing.branch.primary')}
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
                                <p className="mt-0.5 text-[11px] text-slate-500">{_t('listing.authenticator.businessHours', { hours: b.businessHours })}</p>
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
                        {_t('listing.branch.disclaimer')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* MEETUP_DIRECT — 買家揀賣家建議地點，或填「其他」 */}
              {deliveryMethod === 'MEETUP_DIRECT' && (
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-medium text-slate-600">{_t('listing.meetupDirect.locationLabel')}</label>
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
                      {_t('listing.meetupDirect.other')}
                    </label>
                  </div>
                  {meetupLocation === 'OTHER' && (
                    <input
                      value={meetupCustomLocation}
                      onChange={(e) => setMeetupCustomLocation(e.target.value)}
                      placeholder={_t('listing.meetupDirect.locationPlaceholder')}
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-200"
                      autoFocus
                    />
                  )}
                  <p className="mt-1 text-[10px] text-slate-400">
                    {_t('listing.meetupDirect.hint')}
                  </p>
                </div>
              )}

              {/* 步驟 3：揀付款方式 */}
              <section className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {showAuthStep ? 3 : 2}
                  </span>
                  {_t('listing.step3.payment')}
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
                          // Ack v2 (E): 買賣雙方面交 — 平台唔 hold 錢，只准賣家直收
                          if (p === 'ONLINE_ESCROW' && deliveryMethod === 'MEETUP_DIRECT') return null;
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
                                  <p className="font-medium">{_t(meta.labelKey)}</p>
                                  <p className="text-xs text-slate-500">{_t(meta.descKey)}</p>
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
                            <strong>{_t('listing.payment.cashWarningTitle')}</strong>
                            {_t('listing.payment.cashWarningBody')}
                          </span>
                        </p>
                      )}
                      {paymentMethod === 'OFFLINE_CASH' && !isShipNoAuth && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {_t('listing.payment.offlineCashWarning')}
                        </p>
                      )}
                    </>
                  );
                })()}
              </section>

              {/* 費用明細 */}
              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <h4 className="mb-2 font-semibold">{_t('listing.fee.title')}</h4>
                <div className="space-y-1 text-slate-700">
                  <p className="flex justify-between">
                    <span>{_t('listing.fee.itemPrice')}</span>
                    <span>{formatHKD(fees.total)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>{_t('listing.fee.authFeeSellerPays', { who: selectedAuthObj ? _t('listing.fee.authFeeWho', { name: selectedAuthObj.displayName }) : '' })}</span>
                    <span className="text-slate-500">-{formatHKD(fees.authFee)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>{_t('listing.fee.platformFee')}</span>
                    <span className="text-slate-500">-{formatHKD(fees.platformFee)}</span>
                  </p>
                </div>
              </div>

              {error && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}

              <Button size="lg" className="mt-6 w-full" onClick={onBuy} disabled={busy}>
                {busy
                  ? _t('listing.buyButton.busy')
                  : paymentMethod === 'OFFLINE_CASH'
                    ? _t('listing.buyButton.offlineCash')
                    : _t('listing.buyButton.onlineEscrow')}
              </Button>

              {!me && (
                <p className="mt-2 text-center text-xs text-slate-400">
                  {_t('listing.auth.notLoggedIn')}<Link href="/login" className="text-brand-600 hover:underline">{_t('listing.auth.loginFirst')}</Link>
                </p>
              )}

            </>
          )}
        </div>
      </div>

      {/* ── Recommendations — same-category listings, 8 items ── */}
      {relatedListings.length > 0 && (
        <div className="mt-10 border-t border-slate-100 pt-8">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{_t('listing.related.title')}</h3>
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
                    <p data-user-content className="line-clamp-2 min-h-[2.25rem] text-xs leading-snug">{other.title}</p>
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
          counterpartyName={listing.seller?.displayName ?? _t('listing.seller.fallback')}
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
            activeConv.orderStatus === 'COMPLETED' ? _t('listing.chat.readonlyCompleted')
            : activeConv.orderStatus === 'REFUNDED' ? _t('listing.chat.readonlyRefunded')
            : activeConv.orderStatus === 'DISPUTED' ? _t('listing.chat.readonlyDisputed')
            : undefined
          }
        />
      )}

      {shareOpen && listing && (
        <ShareIgModal listing={listing} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

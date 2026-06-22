'use client';

// useSearchParams needs dynamic rendering — production build fix.
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  TierPill,
} from '@authentik/ui';
import {
  sellCategories, categoryById, categoryByApiEnum, tierForPrice,
  brandsForCategory, hasBrandPicker, brandFieldLabel,
} from '@authentik/utils';
import { api, hasToken, ApiError } from '@/lib/api';
import { ImagePlus, X } from 'lucide-react';

const MAX_IMAGES = 5;
// Sanity ceiling — bigger than any iPhone Pro Max RAW (~50MB). Anything past
// this is almost certainly accidental (4K video frame export etc.) so we reject.
const HARD_INPUT_MAX = 50 * 1024 * 1024;
// Target dimensions for upload — keeps payload under ~500KB per image,
// totally fine for product listings on mobile + desktop. iPhone photos shrink
// from ~5-12MB raw → ~300KB JPEG quality 0.82.
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.82;

type DeliveryMethod = 'SHIP' | 'MEETUP_AUTH' | 'MEETUP_3WAY' | 'MEETUP_DIRECT';

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string; desc: string }[] = [
  { value: 'SHIP', label: '物流寄送', desc: '有鑑定：你寄→鑑定師→買家；無鑑定：直寄買家' },
  { value: 'MEETUP_AUTH', label: '鑑定師面交', desc: '買家去鑑定師地點，當場鑑定 + 交收' },
  { value: 'MEETUP_3WAY', label: '三方面交', desc: '你、買家、鑑定師同場，當場鑑定 + 交收' },
  { value: 'MEETUP_DIRECT', label: '買賣雙方面交', desc: '純撮合、無鑑定，你同買家直接見面' },
];

/**
 * Client-side image compression — required because iPhone / Android cameras
 * shoot 4-15MB photos. We resize to ≤1600px on long side + JPEG quality 0.82,
 * resulting payload typically 200-500KB. Server has 25MB JSON ceiling, so
 * even uncompressed an iPhone shot would technically pass, but compression
 * keeps DB row size + network transfer reasonable. (Listing photos stored
 * as base64 in Postgres.)
 *
 * Handles HEIC indirectly: browser's drawImage() can render any format the
 * <img> tag can decode, so Safari on iOS handles HEIC natively.
 */
/**
 * Extract a frame from a video file at t=1s (or t=0 if very short).
 * Returns the frame as a JPEG data URL + the total video duration.
 * Used to make a poster thumbnail for browse cards + listing carousel.
 */
async function extractVideoFrame(videoObjectUrl: string): Promise<{ poster: string; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.onerror = () => reject(new Error('無法解碼影片'));
    v.onloadedmetadata = () => {
      const dur = v.duration || 0;
      // Seek to ~1s (or middle if very short)
      v.currentTime = Math.min(1, Math.max(0, dur * 0.25));
    };
    v.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = v.videoWidth || 1280;
        const h = v.videoHeight || 720;
        const ratio = Math.min(1, 1600 / Math.max(w, h));
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D 不支援'));
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const poster = canvas.toDataURL('image/jpeg', 0.82);
        resolve({ poster, durationSec: v.duration || 0 });
      } catch (e: any) {
        reject(e);
      }
    };
    v.src = videoObjectUrl;
  });
}

/** Read any File as base64 data URL (no compression — used for video). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('讀取檔案失敗'));
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
}

async function compressImageToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('讀取相片失敗'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('呢張相無法解碼（可能格式不支援）'));
      img.onload = () => {
        const { width, height } = img;
        const ratio = Math.min(1, COMPRESS_MAX_DIM / Math.max(width, height));
        const w = Math.round(width * ratio);
        const h = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D context 不支援'));
        ctx.drawImage(img, 0, 0, w, h);
        // Always output JPEG (small + universal). PNG/HEIC inputs are recompressed.
        resolve(canvas.toDataURL('image/jpeg', COMPRESS_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function SellPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get('edit') ?? null;
  const isEditMode = !!editId;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('handbag');
  /** Optional brand / sub-category. Holds either canonical enum id (e.g. "LV")
   *  picked from list, or free-text typed by user via "其他". */
  const [brand, setBrand] = useState<string>('');
  /** Dropdown open state + search filter inside the dropdown */
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState<string>('');
  /** True when user picked 「其他」 and is filling in custom brand name */
  const [brandCustomMode, setBrandCustomMode] = useState(false);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!brandOpen) return;
    function handler(e: MouseEvent) {
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(e.target as Node)) {
        setBrandOpen(false);
        setBrandSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [brandOpen]);
  const [price, setPrice] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  /**
   * Unified media items — preserves user-chosen order. Each item is either
   * an existing image (base64 from edit-mode prefill) or a newly-picked image
   * file (preview = object URL). Submit collapses these back into images[].
   */
  type MediaItem = { id: string; src: string; file?: File };
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  /** Video state — separate from image list because at most 1 video allowed. */
  type VideoState = { src: string; posterUrl: string; file?: File } | null;
  const [video, setVideo] = useState<VideoState>(null);
  /** OQ-1=B: seller can elect to use video as cover; default false. */
  const [videoIsCover, setVideoIsCover] = useState(false);
  /** Toggle fetched from /platform-config/videoUploadEnabled. */
  const [videoUploadEnabled, setVideoUploadEnabled] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  let _mediaIdCounter = useRef(0);
  function nextMediaId(): string {
    _mediaIdCounter.current += 1;
    return `m${_mediaIdCounter.current}`;
  }
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>(['SHIP']);
  const [sellerDistrict, setSellerDistrict] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Edit-mode prefill loading */
  const [loading, setLoading] = useState(isEditMode);
  // Price drop awareness (Founder ruling 2026-06-19):
  //   loadedPrice — current sale price at the time we loaded the form
  //   loadedOriginalPrice — anchor price (if listing currently in "on sale" state)
  //   loadedPendingPrice / pendingEffectiveAt — already-scheduled drop
  //   pendingOffersDialog — confirm dialog state for Q5 (offer-aware price change)
  //   dropToast — post-submit info: "特價已排程，48 小時後生效"
  const [loadedPrice, setLoadedPrice] = useState<number | null>(null);
  const [loadedOriginalPrice, setLoadedOriginalPrice] = useState<number | null>(null);
  const [loadedPendingPrice, setLoadedPendingPrice] = useState<number | null>(null);
  const [loadedPendingEffectiveAt, setLoadedPendingEffectiveAt] = useState<string | null>(null);
  const [pendingOffersDialog, setPendingOffersDialog] = useState<{ count: number } | null>(null);
  const [dropToast, setDropToast] = useState<string | null>(null);

  // Clear brand when category changes — brand list is category-specific
  function changeCategory(next: string) {
    if (next !== categoryId) {
      setCategoryId(next);
      setBrand('');
      setBrandSearch('');
      setBrandOpen(false);
      setBrandCustomMode(false);
    }
  }

  function toggleDelivery(m: DeliveryMethod) {
    setDeliveryMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  useEffect(() => {
    if (!hasToken()) {
      router.replace(`/login?redirect=${isEditMode ? `/sell?edit=${editId}` : '/sell'}`);
    }
  }, [router, isEditMode, editId]);

  // ── Edit mode: prefill form from existing listing ─────────────────────
  useEffect(() => {
    if (!isEditMode || !editId) return;
    let active = true;
    (async () => {
      try {
        const [listing, me] = await Promise.all([api.listings.get(editId), api.me()]);
        if (!active) return;
        // Authorization: must be seller + listing must be ACTIVE
        if (listing.seller?.id !== me.id) {
          setError('唔可以修改其他賣家嘅商品');
          setLoading(false);
          return;
        }
        if (listing.status !== 'ACTIVE') {
          setError('商品已被預訂或售出，唔可以修改');
          setLoading(false);
          return;
        }
        // Prefill
        setTitle(listing.title ?? '');
        setDescription(listing.description ?? '');
        setPrice(listing.priceHKD ?? '');
        setLoadedPrice(listing.priceHKD ?? null);
        setLoadedOriginalPrice(listing.originalPriceHKD ?? null);
        setLoadedPendingPrice(listing.pendingPriceHKD ?? null);
        setLoadedPendingEffectiveAt(listing.pendingPriceEffectiveAt ?? null);
        setMediaItems((listing.images ?? []).map((src: string) => ({ id: nextMediaId(), src })));
        if (listing.videoUrl) {
          setVideo({ src: listing.videoUrl, posterUrl: listing.videoPosterUrl ?? '' });
          setVideoIsCover(!!listing.videoIsCover);
        }
        setDeliveryMethods(listing.allowedDeliveryMethods ?? ['SHIP']);
        setSellerDistrict(listing.sellerDistrict ?? '');
        const catCfg = categoryByApiEnum(listing.category);
        if (catCfg) setCategoryId(catCfg.id);
        setBrand(listing.brand ?? '');
        // Detect free-text brand (not in preset list) so dropdown opens in custom mode
        if (catCfg && listing.brand) {
          const preset = brandsForCategory(catCfg.id as any).some((b) => b.id === listing.brand);
          if (!preset) setBrandCustomMode(true);
        }
      } catch (e: any) {
        setError(e instanceof ApiError ? e.message : '載入商品失敗');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isEditMode, editId]);

  const previewTier = typeof price === 'number' && price > 0 ? tierForPrice(price) : null;

  const totalImages = mediaItems.length;

  // Fetch videoUploadEnabled toggle on mount (public endpoint, no auth needed).
  useEffect(() => {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/api\/?$/, '');
    fetch(`${apiBase}/api/platform-config/videoUploadEnabled`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d) => setVideoUploadEnabled(!!d?.value?.enabled))
      .catch(() => setVideoUploadEnabled(false));
  }, []);

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    const insane = files.filter((f) => f.size > HARD_INPUT_MAX);
    const valid = files.filter((f) => f.size <= HARD_INPUT_MAX);
    const remaining = MAX_IMAGES - totalImages;
    const toAdd = valid.slice(0, remaining);
    const dropped = valid.length - toAdd.length;

    if (insane.length > 0 && dropped > 0) {
      setError(`部分圖片超過 50MB，另有圖片超出 ${MAX_IMAGES} 張上限，未能加入。`);
    } else if (insane.length > 0) {
      setError(`每張圖片不可超過 50MB，已略過 ${insane.length} 張超大圖片。`);
    } else if (dropped > 0) {
      setError(`最多只可上載 ${MAX_IMAGES} 張圖片。`);
    }

    if (toAdd.length === 0) { e.target.value = ''; return; }
    const newItems: MediaItem[] = toAdd.map((f) => ({
      id: nextMediaId(),
      src: URL.createObjectURL(f),
      file: f,
    }));
    setMediaItems((prev) => [...prev, ...newItems]);
    e.target.value = '';
  }

  function moveMedia(idx: number, dir: -1 | 1) {
    setMediaItems((prev) => {
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[idx]!;
      copy[idx] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  }

  function removeMedia(idx: number) {
    setMediaItems((prev) => {
      const item = prev[idx];
      // Revoke object URL only for new uploads (existing images use base64)
      if (item?.file && item.src.startsWith('blob:')) URL.revokeObjectURL(item.src);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // ── Video upload + frame extract ───────────────────────────────────────
  const VIDEO_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
  const VIDEO_MAX_SECONDS = 15;

  async function onVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > VIDEO_MAX_BYTES) {
      setError(`影片不可超過 15MB（你揀嘅檔案 ${Math.round(f.size / 1024 / 1024)}MB）`);
      return;
    }
    try {
      const objectUrl = URL.createObjectURL(f);
      const { poster, durationSec } = await extractVideoFrame(objectUrl);
      if (durationSec > VIDEO_MAX_SECONDS) {
        URL.revokeObjectURL(objectUrl);
        setError(`影片不可超過 ${VIDEO_MAX_SECONDS} 秒（你揀嘅 ${Math.round(durationSec)} 秒）`);
        return;
      }
      setVideo({ src: objectUrl, posterUrl: poster, file: f });
    } catch (err: any) {
      setError(err?.message ?? '影片處理失敗');
    }
  }

  function removeVideo() {
    if (video?.file && video.src.startsWith('blob:')) URL.revokeObjectURL(video.src);
    setVideo(null);
    setVideoIsCover(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hasToken()) { router.push('/login'); return; }
    if (typeof price !== 'number') { setError('請輸入價格'); return; }
    // Founder ruling 2026-06-21: 強制至少一張圖片或一段影片先可以上架
    if (totalImages === 0 && !video) { setError('請至少上載一張商品圖片或一段影片'); return; }
    if (deliveryMethods.length === 0) { setError('請至少揀一種接受嘅交收方式'); return; }

    setBusy(true);
    try {
      // Convert mediaItems → base64 array (order preserved).
      // Existing items already base64; new items get client-side compressed.
      const finalImages: string[] = await Promise.all(
        mediaItems.map(async (m) => m.file ? compressImageToDataURL(m.file) : m.src),
      );

      // Video: convert File to base64 if new; otherwise use existing src.
      let videoUrl: string | null | undefined = undefined;
      let videoPosterUrl: string | null | undefined = undefined;
      if (video?.file) {
        videoUrl = await fileToBase64(video.file);
        videoPosterUrl = video.posterUrl;
      } else if (video) {
        // Existing video (edit mode, not changed) — let server keep current
        videoUrl = video.src;
        videoPosterUrl = video.posterUrl;
      } else if (isEditMode) {
        // Video removed in edit
        videoUrl = null;
        videoPosterUrl = null;
      }

      const payload: any = {
        title,
        description,
        priceHKD: price,
        category: categoryById(categoryId)?.apiEnum ?? 'OTHER',
        brand: brand.trim() || undefined,
        images: finalImages,
        allowedDeliveryMethods: deliveryMethods,
        sellerDistrict: sellerDistrict.trim() || undefined,
      };
      if (videoUrl !== undefined) payload.videoUrl = videoUrl;
      if (videoPosterUrl !== undefined) payload.videoPosterUrl = videoPosterUrl;
      payload.videoIsCover = !!video && videoIsCover;

      // Founder ruling 2026-06-19 Q5: if editing + decreasing price + has
      // pending offers, surface a confirm dialog FIRST so seller can decide
      // whether to handle the offers before scheduling the drop.
      const isPriceDrop =
        isEditMode &&
        loadedPrice != null &&
        typeof price === 'number' &&
        price < loadedPrice &&
        !pendingOffersDialog; // only check once
      if (isPriceDrop && editId) {
        const { count } = await api.listings.activeOfferCount(editId);
        if (count > 0) {
          setPendingOffersDialog({ count });
          setBusy(false);
          return;
        }
      }
      const listing = isEditMode && editId
        ? await api.listings.update(editId, payload)
        : await api.listings.create(payload);
      // Post-submit: if a price drop was scheduled, inform seller with delay info.
      if (listing.priceChangeApplied === 'DROP') {
        const eta = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const etaStr = `${eta.getMonth() + 1}月${eta.getDate()}日 ${String(eta.getHours()).padStart(2,'0')}:${String(eta.getMinutes()).padStart(2,'0')}`;
        setDropToast(`特價已排程：將於 ${etaStr} 自動生效（48 小時後）`);
        // Keep on form so seller sees confirmation
        setLoadedPrice(listing.priceHKD);
        setLoadedPendingPrice(listing.pendingPriceHKD);
        setLoadedPendingEffectiveAt(listing.pendingPriceEffectiveAt);
        setPendingOffersDialog(null);
        return;
      }
      setPendingOffersDialog(null);
      router.push(`/listing/${listing.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} listing`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 h-72 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold">
        {isEditMode ? '編輯商品' : '上架新商品'}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {isEditMode
          ? '只可以喺商品上架中（未有買家落單）時修改。被預訂或售出後就會 locked。'
          : '賣家須通過 KYC · 商品鑑定費由賣家承擔（從成交價自動扣除）· 鑑定失敗則退回賣家'}
      </p>

      {/* Price-drop info banners (edit mode only) */}
      {isEditMode && loadedPendingPrice != null && loadedPendingEffectiveAt && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">⏳ 待生效特價：HKD {loadedPendingPrice.toLocaleString('en-HK')}</p>
          <p className="mt-0.5 text-xs text-amber-800">
            將於 {new Date(loadedPendingEffectiveAt).toLocaleString('zh-HK')} 自動生效。買家現在仍見到原售價。
          </p>
        </div>
      )}
      {isEditMode && loadedOriginalPrice != null && loadedPrice != null && loadedOriginalPrice > loadedPrice && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
          <p className="text-rose-800">
            🏷️ 已生效特價：HKD <span className="font-semibold">{loadedPrice.toLocaleString('en-HK')}</span>
            <span className="ml-2 text-xs text-rose-600">原價 HKD {loadedOriginalPrice.toLocaleString('en-HK')}</span>
          </p>
        </div>
      )}
      {dropToast && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✓ {dropToast}
        </div>
      )}
      {/* Q5 offer-aware confirm dialog */}
      {pendingOffersDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-semibold text-slate-900">確認減價？</h3>
            <p className="mt-2 text-sm text-slate-600">
              此商品有 <span className="font-semibold text-brand-700">{pendingOffersDialog.count}</span> 個未處理嘅議價。
              減價會排程喺 <span className="font-semibold">48 小時</span> 後生效；期間買家仍會見原售價，
              你嘅議價對手亦可能會基於原價繼續傾。建議先處理議價再改價。
            </p>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPendingOffersDialog(null)}>
                返回處理議價
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  // User confirmed — re-submit by simulating form event
                  const form = document.querySelector('form');
                  if (form) (form as HTMLFormElement).requestSubmit();
                }}
              >
                確認排程減價
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit}>
        {/* ── Media upload (images + optional video) ─────────────────── */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>商品相片{videoUploadEnabled ? ' / 影片' : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onFilesSelected}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={onVideoSelected}
            />

            {/* Image grid with ← → ✕ reorder buttons */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {mediaItems.map((m, i) => {
                const isCover = i === 0 && !(video && videoIsCover);
                return (
                  <div key={m.id} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.src}
                      alt={`商品圖片 ${i + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    {isCover && (
                      <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">主圖</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 p-0.5 text-white hover:bg-red-600"
                      aria-label="移除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {/* Reorder buttons */}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 rounded-b-lg bg-black/40 px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => moveMedia(i, -1)}
                        disabled={i === 0}
                        className="rounded p-0.5 text-white disabled:opacity-30 hover:bg-white/20"
                        aria-label="左移"
                      >‹</button>
                      <span className="text-[10px] text-white/80">{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => moveMedia(i, 1)}
                        disabled={i === mediaItems.length - 1}
                        className="rounded p-0.5 text-white disabled:opacity-30 hover:bg-white/20"
                        aria-label="右移"
                      >›</button>
                    </div>
                  </div>
                );
              })}
              {totalImages < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500"
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">加圖片</span>
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              最多 {MAX_IMAGES} 張 · 支援 iPhone / Android 原相（會自動壓縮）·
              用 ‹ › 調順序 · 第一張為主圖
            </p>

            {/* Video section (toggle gated) */}
            {videoUploadEnabled && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                {video ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {video.posterUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.posterUrl} alt="video poster" className="h-full w-full object-cover" />
                        ) : null}
                        <span className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow">▶</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">已加影片</p>
                        <p className="text-xs text-slate-500">≤ 15 秒 / ≤ 15MB · 自動截首幀做縮圖</p>
                        <label className="mt-1 flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={videoIsCover}
                            onChange={(e) => setVideoIsCover(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          將影片作為主圖（browse card cover）
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={removeVideo}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >移除</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-500"
                  >
                    ▶ 加入商品影片（選填，最多 15 秒）
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Basic info ────────────────────────────────────────────────── */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>商品基本資料</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">商品標題</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：Chanel Classic Flap Medium Caviar Black"
                className="mt-1"
                required
                minLength={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="cat">品類</Label>
                <select
                  id="cat"
                  value={categoryId}
                  onChange={(e) => changeCategory(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {sellCategories().map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.labelZh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="price">要價（HKD）</Label>
                <Input
                  id="price"
                  type="number"
                  value={price}
                  onChange={(e) =>
                    setPrice(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="48000"
                  className="mt-1"
                  min={1}
                  required
                />
              </div>
            </div>

            {/* Brand / sub-category picker — dropdown + sticky search + Others.
                Optional, hidden for OTHER category. */}
            {hasBrandPicker(categoryId as any) && (() => {
              const brands = brandsForCategory(categoryId as any);
              const fieldLabel = brandFieldLabel(categoryId as any);
              const search = brandSearch.trim().toLowerCase();
              const matched = search
                ? brands.filter((b) =>
                    b.label.toLowerCase().includes(search) || b.id.toLowerCase().includes(search),
                  )
                : brands;
              const selectedLabel = (() => {
                if (!brand) return null;
                const hit = brands.find((b) => b.id === brand);
                return hit?.label ?? brand; // free text falls through
              })();
              const isFreeText = brand && !brands.some((b) => b.id === brand);

              return (
                <div>
                  <Label>
                    {fieldLabel} <span className="text-xs font-normal text-slate-400">（選填）</span>
                  </Label>

                  {/* Mode A: user picked 「其他」 → free-text input */}
                  {brandCustomMode ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        autoFocus
                        value={brand}
                        onChange={(e) => setBrand(e.target.value.slice(0, 40))}
                        placeholder={`輸入${fieldLabel}名稱（最多 40 字）`}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => { setBrandCustomMode(false); setBrand(''); }}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        返回揀預設
                      </button>
                    </div>
                  ) : (
                    /* Mode B: dropdown combobox */
                    <div className="relative mt-1" ref={brandDropdownRef}>
                      <button
                        type="button"
                        onClick={() => { setBrandOpen((o) => !o); setBrandSearch(''); }}
                        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm transition hover:border-slate-400"
                      >
                        <span className={selectedLabel ? 'text-slate-900' : 'text-slate-400'}>
                          {selectedLabel ?? `請揀${fieldLabel}`}
                          {isFreeText && (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">
                              自訂
                            </span>
                          )}
                        </span>
                        <span className="ml-2 flex items-center gap-2">
                          {selectedLabel && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setBrand('');
                                setBrandOpen(false);
                              }}
                              className="text-xs text-rose-500 hover:underline"
                              title="清除"
                              role="button"
                            >
                              清除
                            </span>
                          )}
                          <span className="text-xs text-slate-400">{brandOpen ? '▲' : '▼'}</span>
                        </span>
                      </button>

                      {brandOpen && (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                          {/* Sticky search */}
                          <div className="border-b border-slate-100 p-2">
                            <Input
                              autoFocus
                              value={brandSearch}
                              onChange={(e) => setBrandSearch(e.target.value)}
                              placeholder={`搜尋${fieldLabel}…`}
                              className="h-8 text-sm"
                            />
                          </div>
                          {/* Scrollable list */}
                          <div className="max-h-64 overflow-y-auto">
                            {matched.length === 0 ? (
                              <p className="px-3 py-3 text-xs text-slate-500">
                                揾唔到「{brandSearch}」相關{fieldLabel}。揀「其他」自訂。
                              </p>
                            ) : (
                              matched.map((b) => (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => {
                                    setBrand(b.id);
                                    setBrandOpen(false);
                                    setBrandSearch('');
                                  }}
                                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-brand-50 ${
                                    brand === b.id ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                                  }`}
                                >
                                  <span>{b.label}</span>
                                  {brand === b.id && <span className="text-xs">✓</span>}
                                </button>
                              ))
                            )}
                          </div>
                          {/* "Others" pinned at bottom */}
                          <button
                            type="button"
                            onClick={() => {
                              setBrandOpen(false);
                              setBrandSearch('');
                              setBrand('');
                              setBrandCustomMode(true);
                            }}
                            className="flex w-full items-center justify-between border-t border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800 transition hover:bg-amber-100"
                          >
                            <span>＋ 其他（揾唔到我嘅{fieldLabel}）</span>
                            <span className="text-xs">自訂</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-1 text-[10px] text-slate-400">
                    揀預設{fieldLabel}之後將來可以幫你 AI 自動識別商品；自訂亦會儲存但 AI 識別會較弱。
                  </p>
                </div>
              );
            })()}

            <div>
              <Label htmlFor="desc">商品描述</Label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="購入日期、配件齊全度、瑕疵說明、購入地點 / 單據…"
                required
              />
            </div>
            {previewTier && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <span className="text-slate-600">此價格對應：</span>
                <span className="ml-2 inline-block">
                  <TierPill tier={previewTier} showDescription />
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 交收方式 ──────────────────────────────────────────────────── */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>接受嘅交收方式</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              揀你願意接受嘅交收方式（可多選），買家落單時會喺你接受嘅方式入面揀一種。
            </p>
            <div className="space-y-2">
              {DELIVERY_OPTIONS.map((opt) => {
                const checked = deliveryMethods.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${checked ? 'border-brand-500 bg-brand-50/40' : 'border-slate-200'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDelivery(opt.value)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-slate-500">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div>
              <Label htmlFor="district">你所在區域（面交配對用，選填）</Label>
              <Input
                id="district"
                value={sellerDistrict}
                onChange={(e) => setSellerDistrict(e.target.value)}
                placeholder="例：旺角 / 觀塘 / 銅鑼灣"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Founder ruling 2026-06-21: 強制至少 1 張圖或 1 段影片，否則 button disable */}
        {(totalImages === 0 && !video) && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⓘ 請先上載至少一張商品圖片或一段影片，先可以發佈上架。
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Link href={isEditMode && editId ? `/listing/${editId}` : '/browse'}>
            <Button type="button" variant="outline">取消</Button>
          </Link>
          <Button type="submit" disabled={busy || (totalImages === 0 && !video)}>
            {busy
              ? (isEditMode ? '儲存中…' : '發佈中…')
              : (isEditMode ? '儲存修改' : '發佈上架')}
          </Button>
        </div>
      </form>
    </div>
  );
}

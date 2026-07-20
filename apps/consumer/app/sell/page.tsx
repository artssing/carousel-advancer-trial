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
  ConfirmDialog,
  Input,
  Label,
  TierPill,
} from '@authentik/ui';
import {
  sellCategories, categoryById, categoryByApiEnum, tierForPrice,
  brandsForCategory, hasBrandPicker, brandFieldLabel, matchBrandFromTitle,
  CONDITION_GRADES, formatHKD, stationDisplayLabel, stationCodesFromValue,
} from '@authentik/utils';
import { api, hasToken, ApiError } from '@/lib/api';
import { StationPicker } from '@/components/station-picker';
import { ImagePlus, X, GripVertical } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, arrayMove, rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  /** Task #47 — smart brand-from-title matching. Tracks whether the current
   *  `brand` value came from auto-detection (so we can show a dismissible
   *  hint) vs a manual pick (so we never overwrite a deliberate user choice). */
  const [brandAutoDetected, setBrandAutoDetected] = useState(false);
  const [brandTouchedManually, setBrandTouchedManually] = useState(false);

  // Auto-detect brand from title as the seller types — only while they
  // haven't manually picked/typed a brand themselves (don't fight the user).
  useEffect(() => {
    if (isEditMode) return; // never auto-override a prefilled edit
    if (brandTouchedManually) return;
    if (!hasBrandPicker(categoryId as any)) return;
    const hit = matchBrandFromTitle(categoryId as any, title);
    if (hit) {
      setBrand(hit.id);
      setBrandAutoDetected(true);
    } else if (brandAutoDetected) {
      // title changed enough that the previous auto-match no longer applies
      setBrand('');
      setBrandAutoDetected(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, categoryId]);

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
  // 2026-06-30: seller-declared condition. Required for new listings.
  const [condition, setCondition] = useState<string>('');
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
  // MTR station codes (multi-candidate, e.g. ["MOK","TST"]) — stored CSV in
  // the same String? column (zero migration); legacy listings may hold old
  // free text — stationCodesFromValue()/stationDisplayLabel() render both.
  const [sellerStations, setSellerStations] = useState<string[]>([]);
  const [sellerMeetupLocations, setSellerMeetupLocations] = useState<string[]>(['']);
  const addMeetupLocation = () => setSellerMeetupLocations(prev => [...prev, '']);
  const updateMeetupLocation = (i: number, val: string) =>
    setSellerMeetupLocations(prev => prev.map((v, idx) => idx === i ? val : v));
  const removeMeetupLocation = (i: number) =>
    setSellerMeetupLocations(prev => prev.filter((_, idx) => idx !== i));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Edit-mode prefill loading */
  const [loading, setLoading] = useState(isEditMode);
  // Soft-delete inline 2-step confirm（edit mode only）
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  // Clear brand when category changes — brand list is category-specific.
  // Also reset the manual-touch flag so auto-detect can run fresh for the new category.
  function changeCategory(next: string) {
    if (next !== categoryId) {
      setCategoryId(next);
      setBrand('');
      setBrandSearch('');
      setBrandOpen(false);
      setBrandCustomMode(false);
      setBrandTouchedManually(false);
      setBrandAutoDetected(false);
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
        setSellerStations(stationCodesFromValue(listing.sellerDistrict));
        setSellerMeetupLocations(listing.sellerMeetupLocations?.length ? listing.sellerMeetupLocations : ['']);
        const catCfg = categoryByApiEnum(listing.category);
        if (catCfg) setCategoryId(catCfg.id);
        setBrand(listing.brand ?? '');
        setCondition(listing.condition ?? '');
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

  // ── dnd-kit reorder handler ───────────────────────────────────────────
  // Fires on drag release (mouse / touch / keyboard). arrayMove preserves all
  // MediaItem fields (id + src + file), only permutes order. Cover badge auto-
  // updates because it's derived from `i === 0` in the render loop.
  function onImageDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setMediaItems((prev) => {
      const oldIdx = prev.findIndex((m) => m.id === active.id);
      const newIdx = prev.findIndex((m) => m.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  // Sensors: pointer for desktop, touch w/ 200ms delay to distinguish drag vs
  // vertical scroll on mobile (Lesson #17 principle), keyboard for a11y.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    if (!condition) { setError('請揀商品狀況'); return; }

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
        condition,
        brand: brand.trim() || undefined,
        images: finalImages,
        allowedDeliveryMethods: deliveryMethods,
        sellerDistrict: sellerStations.join(',') || undefined,
        sellerMeetupLocations: deliveryMethods.includes('MEETUP_DIRECT')
          ? sellerMeetupLocations.map(l => l.trim()).filter(Boolean)
          : [],
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
      // New listing → land with IG share wizard open (sell-success share entry).
      router.push(isEditMode ? `/listing/${listing.id}` : `/listing/${listing.id}?share=1`);
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
        <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 h-72 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-8 sm:px-6">
     <div className="grid items-start gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
      <h1 className="font-display-serif text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
        {isEditMode ? '編輯商品' : '刊登出售'}
      </h1>
      <p className="mt-1.5 text-[13px] text-neutral-text-hint">
        {isEditMode
          ? '只可以喺商品上架中（未有買家落單）時修改。被預訂或售出後就會 locked。'
          : '填寫貨品資料。系統會按售價自動判斷鑑定分級。'}
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
            <h3 className="text-base font-semibold text-ink">確認減價？</h3>
            <p className="mt-2 text-sm text-neutral-text-muted">
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

            {/* Sortable image grid — drag/touch/keyboard to reorder.
                Whole tile is a drag handle for easy mobile targeting.
                Cover badge auto-updates because it's derived from `i === 0`. */}
            {mediaItems.length > 1 && (
              <p className="mb-2 text-[11px] text-neutral-text-hint">
                💡 拖拉圖片可改變次序；第一張自動成為主圖
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onImageDragEnd}
            >
              <SortableContext
                items={mediaItems.map((m) => m.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {mediaItems.map((m, i) => (
                    <SortableImageTile
                      key={m.id}
                      m={m}
                      index={i}
                      isCover={i === 0 && !(video && videoIsCover)}
                      onRemove={() => removeMedia(i)}
                    />
                  ))}
                  {totalImages < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-2 text-neutral-text-hint hover:border-brand-400 hover:text-brand-500"
                    >
                      <ImagePlus className="h-6 w-6" />
                      <span className="text-xs">加圖片</span>
                    </button>
                  )}
                </div>
              </SortableContext>
            </DndContext>
            <p className="mt-2 text-xs text-neutral-text-hint">
              最多 {MAX_IMAGES} 張 · 支援 iPhone / Android 原相（會自動壓縮）· 第一張為主圖
            </p>

            {/* Video section (toggle gated) */}
            {videoUploadEnabled && (
              <div className="mt-4 border-t border-line pt-4">
                {video ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                        {video.posterUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.posterUrl} alt="video poster" className="h-full w-full object-cover" />
                        ) : null}
                        <span className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow">▶</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">已加影片</p>
                        <p className="text-xs text-neutral-text-muted">≤ 15 秒 / ≤ 15MB · 自動截首幀做縮圖</p>
                        <label className="mt-1 flex items-center gap-2 text-xs text-neutral-text">
                          <input
                            type="checkbox"
                            checked={videoIsCover}
                            onChange={(e) => setVideoIsCover(e.target.checked)}
                            className="rounded border-line-2"
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
                    className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-2 px-4 py-3 text-sm text-neutral-text-muted hover:border-brand-400 hover:text-brand-500"
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
                  className="mt-1 flex h-10 w-full rounded-lg border border-line-2 bg-white px-3 text-sm"
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
                    {fieldLabel} <span className="text-xs font-normal text-neutral-text-hint">（選填）</span>
                  </Label>

                  {/* Mode A: user picked 「其他」 → free-text input */}
                  {brandCustomMode ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        autoFocus
                        value={brand}
                        onChange={(e) => { setBrand(e.target.value.slice(0, 40)); setBrandTouchedManually(true); setBrandAutoDetected(false); }}
                        placeholder={`輸入${fieldLabel}名稱（最多 40 字）`}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => { setBrandCustomMode(false); setBrand(''); setBrandTouchedManually(true); setBrandAutoDetected(false); }}
                        className="text-xs text-neutral-text-muted hover:underline"
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
                        className="flex h-10 w-full items-center justify-between rounded-lg border border-line-2 bg-white px-3 text-sm transition hover:border-line-2"
                      >
                        <span className={selectedLabel ? 'text-ink' : 'text-neutral-text-hint'}>
                          {selectedLabel ?? `請揀${fieldLabel}`}
                          {isFreeText && (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">
                              自訂
                            </span>
                          )}
                          {brandAutoDetected && !isFreeText && selectedLabel && (
                            <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[9px] text-emerald-700">
                              自動偵測
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
                                setBrandTouchedManually(true);
                                setBrandAutoDetected(false);
                              }}
                              className="text-xs text-rose-500 hover:underline"
                              title="清除"
                              role="button"
                            >
                              清除
                            </span>
                          )}
                          <span className="text-xs text-neutral-text-hint">{brandOpen ? '▲' : '▼'}</span>
                        </span>
                      </button>

                      {brandOpen && (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                          {/* Sticky search */}
                          <div className="border-b border-line p-2">
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
                              <p className="px-3 py-3 text-xs text-neutral-text-muted">
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
                                    setBrandTouchedManually(true);
                                    setBrandAutoDetected(false);
                                  }}
                                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-brand-50 ${
                                    brand === b.id ? 'bg-brand-50 text-brand-700' : 'text-neutral-text'
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
                              setBrandTouchedManually(true);
                              setBrandAutoDetected(false);
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

                  <p className="mt-1 text-[10px] text-neutral-text-hint">
                    揀預設{fieldLabel}之後將來可以幫你 AI 自動識別商品；自訂亦會儲存但 AI 識別會較弱。
                  </p>
                </div>
              );
            })()}

            {/* 商品狀況 — 2026-06-30 founder ruling: 新 listing 必填 */}
            <div>
              <Label htmlFor="condition">商品狀況 <span className="text-red-500">*</span></Label>
              <div className="mt-1 space-y-1.5">
                {CONDITION_GRADES.map((g) => (
                  <label
                    key={g.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                      condition === g.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-line hover:border-line-2 hover:bg-surface-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="condition"
                      value={g.id}
                      checked={condition === g.id}
                      onChange={() => setCondition(g.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{g.label}</p>
                      <p className="text-xs text-neutral-text-muted">{g.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-neutral-text-hint">
                成色由你申報，Certifine 不驗證。Tier 2/3 商品鑑定時以鑑定師意見為準。
              </p>
            </div>

            <div>
              <Label htmlFor="desc">商品描述</Label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-line-2 bg-white px-3 py-2 text-sm"
                placeholder="購入日期、配件齊全度、瑕疵說明、購入地點 / 單據…"
                required
              />
            </div>
            {previewTier && (
              <div className="rounded-lg bg-surface-2 p-3 text-sm">
                <span className="text-neutral-text-muted">此價格對應：</span>
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
            <p className="text-sm text-neutral-text-muted">
              揀你願意接受嘅交收方式（可多選），買家落單時會喺你接受嘅方式入面揀一種。
            </p>
            <div className="space-y-2">
              {DELIVERY_OPTIONS.map((opt) => {
                const checked = deliveryMethods.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${checked ? 'border-brand-500 bg-brand-50/40' : 'border-line'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDelivery(opt.value)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-neutral-text-muted">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div>
              <Label htmlFor="district">你所在區域（面交配對用，選填，可揀多個候選）</Label>
              {/* Structured MTR pick only — free text never lands (founder 2026-07-08) */}
              <StationPicker
                values={sellerStations}
                onChange={(codes) => {
                  setSellerStations(codes);
                  // Convenience: seed 面交地點 rows with newly-added station names
                  // so the seller refines (「旺角站 E 出口」) instead of typing from
                  // scratch — buyer picks among these rows at checkout.
                  setSellerMeetupLocations((prev) => {
                    const kept = prev.filter((p) => p.trim());
                    const labels = codes
                      .map((c) => stationDisplayLabel(c) ?? '')
                      .filter((l) => l && !kept.some((k) => k.startsWith(l)));
                    const next = [...kept, ...labels];
                    return next.length ? next : [''];
                  });
                }}
              />
            </div>
            {deliveryMethods.includes('MEETUP_DIRECT') && (
              <div className="mt-4">
                <Label>面交地點（買家落單時揀選）</Label>
                <p className="mb-2 text-xs text-neutral-text-muted">請提供至少一個建議面交地點，買家可揀選或填寫其他地點。</p>
                <div className="space-y-2">
                  {sellerMeetupLocations.map((loc, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={loc}
                        onChange={(e) => updateMeetupLocation(i, e.target.value)}
                        placeholder="例：旺角港鐵站 E 出口"
                        className="flex-1"
                      />
                      {sellerMeetupLocations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMeetupLocation(i)}
                          className="rounded-md px-2 text-neutral-text-hint hover:text-red-500"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addMeetupLocation}
                  className="mt-2 text-xs text-brand-600 hover:underline"
                >
                  + 加多一個地點
                </button>
              </div>
            )}
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

        <div className="mt-6 flex items-center gap-3 border-t border-line pt-6">
          <Link href={isEditMode && editId ? `/listing/${editId}` : '/browse'}>
            <Button type="button" variant="ghost">取消</Button>
          </Link>
          <Button type="submit" size="lg" className="flex-1" disabled={busy || (totalImages === 0 && !video)}>
            {busy
              ? (isEditMode ? '儲存中…' : '發佈中…')
              : (isEditMode ? '儲存修改' : '發佈刊登')}
          </Button>
        </div>

        {/* Soft delete（founder 2026-07-10）— ConfirmDialog v2 T3 light（可還原） */}
        {isEditMode && editId && (
          <>
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="mt-4 w-full rounded-xl border border-red-200 bg-white py-2.5 text-sm font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50"
            >
              刪除呢件商品
            </button>
            {deleteError && <p className="mt-2 text-xs font-medium text-red-700">{deleteError}</p>}
            <ConfirmDialog
              open={deleteConfirm}
              severity="danger"
              title="刪除呢件商品？"
              description={title}
              consequence="商品會即時落架，買家搵唔到。刪錯咗可以隨時喺「我的上架」還原。"
              confirmLabel="確認刪除"
              busy={deleting}
              onConfirm={async () => {
                setDeleting(true);
                setDeleteError(null);
                try {
                  await api.listings.softDelete(editId);
                  router.push('/my-listings');
                } catch (err: any) {
                  setDeleteError(err instanceof ApiError ? err.message : '刪除失敗');
                  setDeleting(false);
                  setDeleteConfirm(false);
                }
              }}
              onCancel={() => { setDeleteConfirm(false); setDeleteError(null); }}
            />
          </>
        )}
      </form>
      </div>

      {/* ═══ Sticky right rail — tier indicator + fee preview ═══ */}
      <aside className="chrome-follow lg:sticky lg:top-[calc(var(--chrome-h)+16px)]">
        {previewTier ? (
          <div className="mb-4 rounded-[10px] border border-verify-border bg-verify-soft p-4">
            <div className="text-[15px] font-bold text-verify">
              ◆ Tier {previewTier} · {previewTier === 3 ? '強制鑑定' : previewTier === 2 ? '可選鑑定' : '純撮合'}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-text-muted">
              {previewTier === 3
                ? '售價 ≥ HK$10,000，必須指定鑑定師，買家款項全程託管。'
                : previewTier === 2
                  ? '售價 HK$1,000–9,999，買家可選擇是否鑑定。'
                  : '售價 < HK$1,000，純撮合交易。'}
            </p>
          </div>
        ) : (
          <div className="mb-4 rounded-[10px] border border-line bg-surface-2 p-4 text-[12px] text-neutral-text-hint">
            輸入售價後，系統會即時顯示鑑定分級。
          </div>
        )}

        <div className="rounded-xl border border-line bg-white p-5 shadow-sh1">
          <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
            費用預覽
          </div>
          {(() => {
            const p = typeof price === 'number' ? price : 0;
            const platformFee = Math.round(p * 0.015);
            const net = p - platformFee;
            return (
              <>
                <div className="flex justify-between py-1.5 text-[13px] text-neutral-text-muted">
                  <span>售價</span><b className="font-semibold text-neutral-text">{formatHKD(p)}</b>
                </div>
                <div className="flex justify-between py-1.5 text-[13px] text-neutral-text-muted">
                  <span>平台費 1.5%</span><b className="font-semibold text-neutral-text">−{formatHKD(platformFee)}</b>
                </div>
                <div className="flex justify-between py-1.5 text-[13px] text-neutral-text-muted">
                  <span>鑑定費（買家付）</span><b className="font-semibold text-neutral-text">$0</b>
                </div>
                <hr className="my-2.5 border-t border-line" />
                <div className="flex items-baseline justify-between font-bold">
                  <span className="text-[14px] text-neutral-text">預計實收</span>
                  <span className="text-[18px] text-brand-700">{formatHKD(net)}</span>
                </div>
              </>
            );
          })()}
        </div>
        <p className="mt-3.5 text-[11px] leading-relaxed text-neutral-text-hint">
          最終金額以成交時 server 計算為準。平台為資訊中介，真偽由具名鑑定師負責。
        </p>
      </aside>
     </div>
    </div>
  );
}

// ── Sortable image tile (dnd-kit) ────────────────────────────────────────
// Whole tile is the drag handle for large mobile tap area. Delete button
// stops propagation so tapping ✕ doesn't accidentally start a drag.
function SortableImageTile({
  m, index, isCover, onRemove,
}: {
  m: { id: string; src: string; file?: File };
  index: number;
  isCover: boolean;
  onRemove: () => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: m.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the dragged tile above others and dim slightly for feedback.
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative aspect-square cursor-grab touch-none select-none active:cursor-grabbing"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={m.src}
        alt={`商品圖片 ${index + 1}`}
        className="h-full w-full rounded-lg object-cover pointer-events-none"
        draggable={false}
      />
      {isCover && (
        <span className="pointer-events-none absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
          主圖
        </span>
      )}
      {/* Grip hint — bottom-left, subtle. Hidden while dragging (visually redundant). */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/40 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
      >
        <GripVertical className="h-3 w-3" />
      </span>
      {/* Numeric order badge — helps user parse current order at a glance. */}
      <span className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
        {index + 1}
      </span>
      {/* Remove ✕ — stop propagation to avoid triggering drag when tapping. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-white hover:bg-red-600"
        aria-label="移除"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

'use client';

// useSearchParams needs dynamic rendering (not static prerender) — production build fix.
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Pill, StarRating } from '@authentik/ui';
import { Search, ShieldCheck, X } from 'lucide-react';
import { api, hasToken, clearToken } from '@/lib/api';
import { ProductCard, ProductCardSkeleton } from '@/components/product-card';

const PAGE_SIZE = 24;

interface SellerProfile {
  id: string;
  displayName: string;
  kycVerified: boolean;
  joinedAt: string;
  activeListingsCount: number;
  soldAsSellerCount: number;
  totalListings: number;
  authenticator: { id: string; storeName?: string; starRating: number; completedCount: number } | null;
  avgRating: number | null;
  reviewCount: number;
}

function joinYear(iso: string): string {
  return String(new Date(iso).getFullYear());
}

export default function SellerPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id;
  // Lesson #9: derive URL state via useSearchParams(), never useState(() => readUrl()).
  const q = searchParams.get('q') ?? '';
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<{ total: number; averageRating: number | null; items: any[] } | null>(null);
  const [inputValue, setInputValue] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync when the URL changes externally (back button / shared link).
  useEffect(() => { setInputValue(q); }, [q]);

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    Promise.all([
      api.users.sellerProfile(id),
      api.users.reviews(id),
    ])
      .then(([p, r]) => {
        setProfile(p);
        setReviews(r);
      })
      .catch((e: any) => {
        if (e?.status === 401) { clearToken(); router.replace('/login'); return; }
        setError(e?.message ?? '無法載入賣家資料');
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  // Listings re-fetch whenever the (URL-derived) query changes.
  useEffect(() => {
    if (!hasToken()) return;
    let stale = false;
    setListingsLoading(true);
    api.users.sellerListings(id, PAGE_SIZE, 0, q || undefined)
      .then((l) => {
        if (stale) return;
        setListings(l.items);
        setTotal(l.total);
        setHasMore(l.hasMore);
      })
      .catch(() => { /* profile-level error handling covers auth; keep prior list on transient fail */ })
      .finally(() => { if (!stale) setListingsLoading(false); });
    return () => { stale = true; };
  }, [id, q]);

  function onInputChange(value: string) {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      router.replace(trimmed ? `/seller/${id}?q=${encodeURIComponent(trimmed)}` : `/seller/${id}`);
    }, 300);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue('');
    router.replace(`/seller/${id}`);
  }

  function loadMore() {
    setLoadingMore(true);
    api.users.sellerListings(id, PAGE_SIZE, listings.length, q || undefined)
      .then((l) => {
        setListings((prev) => [...prev, ...l.items]);
        setTotal(l.total);
        setHasMore(l.hasMore);
      })
      .finally(() => setLoadingMore(false));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-container-l3 px-4 py-8 sm:px-6">
        <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
        <div className="mt-8 grid grid-cols-2 gap-[18px] md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <ProductCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-container-l3 px-4 py-8 sm:px-6">
        <p className="text-sm text-danger">{error ?? '找不到賣家'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 sm:px-6">
      {/* ═══ Profile header ═══ */}
      <section className="flex flex-col gap-5 py-8 sm:flex-row sm:items-center">
        <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#eef1f5] to-[#dfe4ee] font-display-serif text-[32px] font-extrabold text-ink">
          {profile.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display-serif text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">
              {profile.displayName}
            </h1>
            <Pill variant="status" size="md">賣家</Pill>
            {profile.kycVerified && (
              <Pill variant="verify" size="md">
                <ShieldCheck className="h-3 w-3" /> KYC 驗證
              </Pill>
            )}
            {profile.authenticator && (
              <Link href={`/authenticator/${profile.authenticator.id}` as any}>
                <Pill variant="gold" size="md" className="cursor-pointer">亦為鑑定師 →</Pill>
              </Link>
            )}
          </div>
          <div className="mt-1.5 font-mono text-[12px] tracking-[0.04em] text-neutral-text-hint">
            香港 · 加入於 {joinYear(profile.joinedAt)}
          </div>
          {/* pstats row */}
          <div className="mt-3 flex flex-wrap gap-9">
            <div>
              <div className="text-[22px] font-extrabold text-ink">{profile.soldAsSellerCount}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-neutral-text-hint">成交</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[22px] font-extrabold text-ink">
                {profile.reviewCount === 0 ? '—' : profile.avgRating?.toFixed(1)}
                {profile.reviewCount > 0 && profile.avgRating != null && (
                  <StarRating value={profile.avgRating} size="sm" />
                )}
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-neutral-text-hint">評分</div>
            </div>
            <div>
              <div className="text-[22px] font-extrabold text-ink">{profile.activeListingsCount}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-neutral-text-hint">在售</div>
            </div>
          </div>
        </div>
      </section>

      {/* Neutrality disclaimer */}
      <div className="max-w-[680px] rounded-lg border border-verify-border bg-verify-soft px-4 py-3 text-[12px] leading-relaxed text-verify">
        此為賣家公開檔案。評分與好評率由平台按實際成交演算派生，不可手改；平台為資訊中介，不對賣家或貨品作任何擔保。
      </div>

      {/* ═══ Listings ═══ */}
      <div className="mb-[18px] mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display-serif text-[27px] font-bold leading-tight tracking-[-0.01em] text-ink">
          在售貨品（{q ? `${total} / ${profile.activeListingsCount}` : total}）
        </h2>
        <div className="relative w-full sm:w-[300px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-text-hint" />
          <input
            type="search"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="喺呢位賣家嘅商品中搜尋…"
            className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-9 text-sm text-ink shadow-sh1 outline-none placeholder:text-neutral-text-hint focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          {inputValue && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="清除搜尋"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-neutral-text-hint hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {listingsLoading ? (
        <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : listings.length === 0 ? (
        q ? (
          <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-neutral-text-muted shadow-sh1">
            搵唔到「{q}」相關嘅商品。
            <button type="button" onClick={clearSearch} className="ml-2 font-semibold text-brand-700 hover:underline">
              清除搜尋
            </button>
          </p>
        ) : (
          <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-neutral-text-muted shadow-sh1">
            呢個賣家暫時冇上架中嘅商品。
          </p>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => <ProductCard key={l.id} listing={l} />)}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-line bg-white px-6 py-2.5 text-sm font-semibold text-ink shadow-sh1 hover:bg-surface-2 disabled:opacity-50"
              >
                {loadingMore ? '載入中…' : `載入更多（尚有 ${total - listings.length} 件）`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══ Reviews ═══ */}
      {reviews && (
        <section className="mt-14">
          <div className="mb-[18px] flex items-baseline gap-3">
            <h2 className="font-display-serif text-[27px] font-bold leading-tight tracking-[-0.01em] text-ink">
              買家評價
            </h2>
            {reviews.averageRating != null && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-text-muted">
                <StarRating value={reviews.averageRating} size="sm" />
                {reviews.averageRating.toFixed(1)} · {reviews.total} 個評價
              </span>
            )}
          </div>
          {reviews.items.length === 0 ? (
            <p className="max-w-[760px] rounded-xl border border-line bg-white p-6 text-center text-sm text-neutral-text-muted shadow-sh1">
              暫無買家評價
            </p>
          ) : (
            <div className="max-w-[760px] space-y-3">
              {reviews.items.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-white p-5 shadow-sh1">
                  <div className="flex items-center justify-between">
                    <b className="text-[15px] text-ink">{r.buyerName}</b>
                    <StarRating value={r.rating} size="sm" />
                  </div>
                  {r.comment && (
                    <p className="mt-2 text-[14px] leading-relaxed text-neutral-text-muted whitespace-pre-wrap">
                      {r.comment}
                    </p>
                  )}
                  <div className="mt-2 font-mono text-[12px] text-neutral-text-hint">
                    {new Date(r.createdAt).toLocaleDateString('zh-HK')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

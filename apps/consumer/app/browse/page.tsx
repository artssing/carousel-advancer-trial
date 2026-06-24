'use client';

// useSearchParams needs dynamic rendering (not static prerender) — production build fix.
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Card, CardContent, TierPill, Button, ListingThumb } from '@authentik/ui';
import {
  formatHKD, tierForPrice, browseCategories, categoryById, categoryByApiEnum, formatSavings,
  brandsForCategory, hasBrandPicker, brandFieldLabel, brandLabel, parseSearchQuery,
} from '@authentik/utils';
import { api } from '@/lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const DESKTOP_PAGE_SIZE = 24;
const MOBILE_PAGE_SIZE = 12;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛上架';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 日前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月前`;
  return `${Math.floor(months / 12)} 年前`;
}

// Derived from `packages/utils/categories.ts` — the canonical registry.
const BROWSE_CATEGORIES = browseCategories();

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
      <div className="aspect-square animate-pulse bg-slate-200" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const router = useRouter();
  // Reactive URL params — re-renders whenever query string changes (e.g. via TopNav Link).
  // Past bug: useState(() => URL) only reads once on mount, so navigating between
  // /browse?cat=X and /browse?cat=Y did not trigger a refresh.
  const searchParams = useSearchParams();
  const category = searchParams?.get('cat') ?? null;
  const searchQuery = searchParams?.get('q') ?? '';
  // Default to relevance ranking whenever there's a search query (so the best
  // match floats to the top); otherwise newest. Explicit sort param always wins.
  const sort =
    (searchParams?.get('sort') as 'newest' | 'priceAsc' | 'priceDesc' | 'relevance' | null) ??
    (searchQuery ? 'relevance' : 'newest');
  const minPriceStr = searchParams?.get('min') ?? '';
  const maxPriceStr = searchParams?.get('max') ?? '';
  const minPrice = minPriceStr ? Number(minPriceStr) : undefined;
  const maxPrice = maxPriceStr ? Number(maxPriceStr) : undefined;
  const brand = searchParams?.get('brand') ?? null;

  const [inputValue, setInputValue] = useState<string>(searchQuery);
  const [minInput, setMinInput] = useState(minPriceStr);
  const [maxInput, setMaxInput] = useState(maxPriceStr);
  useEffect(() => { setInputValue(searchQuery); }, [searchQuery]);
  useEffect(() => { setMinInput(minPriceStr); setMaxInput(maxPriceStr); }, [minPriceStr, maxPriceStr]);

  const [listings, setListings]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(false);
  const [total, setTotal]             = useState(0);
  const [isMobile, setIsMobile]       = useState(false);

  // ── sentinel node tracked via ref-callback ────────────────────────────────
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
  const sentinelRefCallback = useCallback((node: HTMLDivElement | null) => {
    setSentinelNode(node);
  }, []);

  // ── Synchronous refs to avoid stale closures ──────────────────────────────
  const loadingMoreRef = useRef(false);
  const hasMoreRef     = useRef(false);
  const offsetRef      = useRef(0);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  // ── Detect mobile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const pageSize = isMobile ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;

  // ── URL sync helpers ───────────────────────────────────────────────────────
  function buildUrl(cat: string | null, q: string, opts?: { sort?: string; min?: string; max?: string; brand?: string | null }) {
    const params = new URLSearchParams();
    if (cat) params.set('cat', cat);
    if (q)   params.set('q', q);
    const s = opts?.sort ?? sort;
    if (s && s !== 'newest') params.set('sort', s);
    const min = opts?.min ?? minPriceStr;
    if (min) params.set('min', min);
    const max = opts?.max ?? maxPriceStr;
    if (max) params.set('max', max);
    // brand: explicit null clears; undefined inherits current
    const br = opts?.brand === null ? null : (opts?.brand ?? brand);
    if (br) params.set('brand', br);
    const qs = params.toString();
    return qs ? `/browse?${qs}` : '/browse';
  }

  // Use push (not replace) so filter changes create history entries + force
  // useSearchParams to definitely re-fire even on same-path nav.
  function navigate(url: string) {
    router.push(url as Route);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function handleCategoryChange(newCat: string | null) {
    // Brand list is category-specific — clear stale brand when category changes
    navigate(buildUrl(newCat, searchQuery, { brand: null }));
  }
  function handleBrandChange(newBrand: string | null) {
    navigate(buildUrl(category, searchQuery, { brand: newBrand }));
  }
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) {
      navigate(buildUrl(category, ''));
      return;
    }
    // Smart parse: pull a category out of the query (auto-applied as a filter,
    // shown as a removable chip). Keep the FULL query text in `q` so the search
    // box + 搜尋 chip still show exactly what the customer typed — the category
    // keyword is only stripped internally when building the API call (see
    // `apiSearch` below), not from what the user sees.
    // A fresh search expresses fresh intent: if it detects a category, switch to
    // it (so "iphone 17 pro" → then "Chanel 手袋…" correctly re-targets handbag,
    // not stuck on the previous iphone filter). Only fall back to the current
    // category when the new query detects none (e.g. just "256gb").
    const parsed = parseSearchQuery(trimmed);
    const nextCat = parsed.categoryId ?? category;
    // Category changed → clear stale brand sub-filter (brand list is per-category).
    const brandOpt = nextCat !== category ? { brand: null as string | null } : {};
    navigate(buildUrl(nextCat, trimmed, { sort: 'relevance', ...brandOpt }));
  }
  function applyPriceFilter(e: React.FormEvent) {
    e.preventDefault();
    // Trim "0" / NaN values
    const cleanMin = minInput && Number(minInput) > 0 ? minInput : '';
    const cleanMax = maxInput && Number(maxInput) > 0 ? maxInput : '';
    navigate(buildUrl(category, searchQuery, { min: cleanMin, max: cleanMax }));
  }
  function setSort(s: 'newest' | 'priceAsc' | 'priceDesc' | 'relevance') {
    navigate(buildUrl(category, searchQuery, { sort: s }));
  }
  function clearAllFilters() {
    setMinInput(''); setMaxInput('');
    navigate(buildUrl(category, '', { sort: 'newest', min: '', max: '' }));
  }

  // The query text actually sent to the API for matching/ranking. We show the
  // FULL query in the search box + chip, but when the auto-detected category is
  // applied as a filter we strip its keyword from the API terms — otherwise the
  // word (e.g. 「手袋」) would be required in title/desc/brand text too and
  // over-filter. If the user removed/changed the category, the full text is used.
  const apiSearch = (() => {
    if (!searchQuery) return undefined;
    const parsed = parseSearchQuery(searchQuery);
    if (category && category === parsed.categoryId) {
      return parsed.terms.join(' ') || undefined;
    }
    return searchQuery;
  })();

  // ── Load first page when filters change ─────────
  useEffect(() => {
    setLoading(true);
    setListings([]);
    setHasMore(false);
    offsetRef.current = 0;
    loadingMoreRef.current = false;

    const enumVal = categoryById(category)?.apiEnum;
    api.listings
      .list(enumVal, pageSize, 0, apiSearch, {
        minPrice, maxPrice, sort, brand: brand ?? undefined,
      })
      .then(({ items, total: t, hasMore: more }) => {
        setListings(items);
        setTotal(t);
        setHasMore(more);
        hasMoreRef.current = more;
        offsetRef.current = items.length;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, brand, apiSearch, pageSize, sort, minPrice, maxPrice]);

  // ── loadMore ──────────────────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const enumVal = categoryById(category)?.apiEnum;
    const currentOffset = offsetRef.current;

    api.listings
      .list(enumVal, pageSize, currentOffset, apiSearch, {
        minPrice, maxPrice, sort, brand: brand ?? undefined,
      })
      .then(({ items, hasMore: more }) => {
        offsetRef.current = currentOffset + items.length;
        setListings((prev) => [...prev, ...items]);
        setHasMore(more);
        hasMoreRef.current = more;
      })
      .catch(() => {})
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [category, brand, apiSearch, pageSize, sort, minPrice, maxPrice]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; });

  // ── Mobile IntersectionObserver ───────────────────────────────────────────
  useEffect(() => {
    if (!isMobile || !sentinelNode) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '100px' },
    );
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [isMobile, sentinelNode]);

  const skeletonCount = pageSize;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="搜尋商品、品牌、型號…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          搜尋
        </button>
      </form>

      {/* ── Category chips ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <button
          onClick={() => handleCategoryChange(null)}
          className={`rounded-full border px-3 py-1 transition ${
            !category ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'
          }`}
        >
          全部
        </button>
        {BROWSE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => handleCategoryChange(c.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 transition ${
              category === c.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white'
            }`}
          >
            {c.labelZh}
            {!c.enabledInSell && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-medium text-amber-700">
                即將推出
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Brand sub-filter (appears only when a category with brands is selected) ── */}
      {category && hasBrandPicker(category as any) && (() => {
        const brands = brandsForCategory(category as any);
        const fieldLabel = brandFieldLabel(category as any);
        const allLabel = `所有${fieldLabel}`;
        return (
          <div className="mb-6 -mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-500">{fieldLabel}：</span>
            <button
              onClick={() => handleBrandChange(null)}
              className={`rounded-full border px-2.5 py-0.5 transition ${
                !brand ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'
              }`}
            >
              {allLabel}
            </button>
            {brands.slice(0, 10).map((b) => (
              <button
                key={b.id}
                onClick={() => handleBrandChange(b.id)}
                className={`rounded-full border px-2.5 py-0.5 transition ${
                  brand === b.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'
                }`}
              >
                {b.label}
              </button>
            ))}
            {/* If current brand is free-text (not in preset list), still show as active chip */}
            {brand && !brands.some((b) => b.id === brand) && (
              <button
                onClick={() => handleBrandChange(null)}
                className="rounded-full border border-brand-500 bg-brand-50 px-2.5 py-0.5 text-brand-700"
                title="點擊清除呢個自訂品牌 filter"
              >
                {brand} ×
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Sort + price filter bar ────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-white p-2 text-xs">
        {/* Sort */}
        <div className="flex items-center gap-1">
          <span className="text-slate-500">排序：</span>
          {([
            // 相關度 only makes sense (and is the default) when searching.
            ...(searchQuery ? [['relevance', '相關度'] as const] : []),
            ['newest',    '最新'],
            ['priceAsc',  '價低 ↑'],
            ['priceDesc', '價高 ↓'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={`rounded-full px-2 py-0.5 transition ${
                sort === k
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mx-1 h-4 w-px bg-slate-200" />
        {/* Price range */}
        <form onSubmit={applyPriceFilter} className="flex items-center gap-1.5">
          <span className="text-slate-500">價錢 HK$</span>
          <input
            type="number" inputMode="numeric" min={0}
            value={minInput} onChange={(e) => setMinInput(e.target.value)}
            placeholder="最低"
            className="w-20 rounded border border-slate-200 px-2 py-0.5 text-xs outline-none focus:border-brand-400"
          />
          <span className="text-slate-400">–</span>
          <input
            type="number" inputMode="numeric" min={0}
            value={maxInput} onChange={(e) => setMaxInput(e.target.value)}
            placeholder="最高"
            className="w-20 rounded border border-slate-200 px-2 py-0.5 text-xs outline-none focus:border-brand-400"
          />
          <button
            type="submit"
            className="rounded bg-slate-700 px-2 py-0.5 text-xs text-white hover:bg-slate-900"
          >
            套用
          </button>
          {(minPrice || maxPrice) && (
            <button
              type="button"
              onClick={() => navigate(buildUrl(category, searchQuery, { min: '', max: '' }))}
              className="text-[10px] text-slate-400 hover:text-red-600 hover:underline"
            >
              清除
            </button>
          )}
        </form>
      </div>

      {/* ── Active filters indicator ───────────────────────────────────────── */}
      {/* relevance is the implicit default while searching — not advertised as a
          removable filter chip (only the explicit price sorts are). */}
      {(sort === 'priceAsc' || sort === 'priceDesc' || minPrice || maxPrice || searchQuery || category) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-400">篩選中：</span>
          {category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-brand-700">
              品類：{categoryById(category)?.labelZh ?? category}
              <button onClick={() => navigate(buildUrl(null, searchQuery))} aria-label="移除品類">×</button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              搜尋：{searchQuery}
              <button onClick={() => navigate(buildUrl(category, ''))} aria-label="移除搜尋">×</button>
            </span>
          )}
          {(sort === 'priceAsc' || sort === 'priceDesc') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              排序：{sort === 'priceAsc' ? '價低→高' : '價高→低'}
              <button onClick={() => setSort(searchQuery ? 'relevance' : 'newest')} aria-label="重設排序">×</button>
            </span>
          )}
          {(minPrice || maxPrice) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
              價錢：HK${minPrice ?? '0'}–{maxPrice ? `HK$${maxPrice}` : '不限'}
              <button onClick={() => navigate(buildUrl(category, searchQuery, { min: '', max: '' }))} aria-label="移除價錢">×</button>
            </span>
          )}
          <button
            onClick={clearAllFilters}
            className="ml-1 text-slate-400 hover:text-red-600 hover:underline"
          >
            全部重設
          </button>
        </div>
      )}

      {/* ── Count ──────────────────────────────────────────────────────────── */}
      {!loading && (
        <p className="mb-4 text-xs text-slate-400">
          {searchQuery ? `「${searchQuery}」的搜尋結果 · ` : ''}
          共 {total} 件商品
          {(minPrice || maxPrice) && (
            <span className="ml-1">
              · HK${minPrice ?? '0'} – {maxPrice ? `HK$${maxPrice}` : '不限'}
            </span>
          )}
          {listings.length < total ? `・已顯示 ${listings.length} 件` : ''}
        </p>
      )}

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: skeletonCount }).map((_, i) => <SkeletonCard key={i} />)
          : listings.map((l) => (
              <Link key={l.id} href={`/listing/${l.id}`} className="flex">
                <Card className="flex w-full flex-col overflow-hidden transition hover:shadow-md">
                  <div className="relative aspect-square shrink-0">
                    {/* Browse cards use server-derived coverUrl (videoPoster if
                        videoIsCover, else images[0]). Falls back to branded
                        gradient placeholder when neither exists. */}
                    <ListingThumb
                      src={l.coverUrl ?? l.images?.[0] ?? null}
                      alt={l.title}
                      emoji={categoryByApiEnum(l.category)?.emoji}
                      className={`aspect-square h-full w-full ${l.status === 'RESERVED' ? 'opacity-75' : ''}`}
                    />
                    {l.status === 'RESERVED' && (
                      <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                        已 hold
                      </span>
                    )}
                    {l.hasVideo && (
                      <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                        ▶ 影片
                      </span>
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TierPill tier={tierForPrice(l.priceHKD) as 1 | 2 | 3} />
                      {l.brand && (() => {
                        const cat = categoryByApiEnum(l.category);
                        const label = cat ? brandLabel(cat.id as any, l.brand) : l.brand;
                        return label ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                            {label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">
                      {l.title}
                    </h3>
                    <div className="mt-auto">
                      {(() => {
                        const savings = formatSavings(l.originalPriceHKD, l.priceHKD);
                        return savings ? (
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <p className="text-base font-semibold text-rose-600">{formatHKD(l.priceHKD)}</p>
                            <p className="text-[11px] text-slate-400 line-through">{formatHKD(l.originalPriceHKD)}</p>
                            <span className="rounded bg-rose-100 px-1 py-0.5 text-[10px] font-medium text-rose-700">{savings.display}</span>
                          </div>
                        ) : (
                          <p className="text-base font-semibold">{formatHKD(l.priceHKD)}</p>
                        );
                      })()}
                      {l.createdAt && (
                        <p className="text-[10px] text-slate-400">{timeAgo(l.createdAt)}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}

        {loadingMore &&
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={`more-${i}`} />)}
      </div>

      {/* ── Empty ──────────────────────────────────────────────────────────── */}
      {!loading && listings.length === 0 && (() => {
        const activeCat = categoryById(category);
        const isComingSoon = activeCat && !activeCat.enabledInSell;
        return (
          <div className="mt-12 text-center">
            {isComingSoon ? (
              <>
                <p className="text-sm font-medium text-slate-700">
                  {activeCat.emoji} 「{activeCat.labelZh}」品類即將推出
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  我哋暫未開放此品類嘅交易，敬請期待。
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                {searchQuery ? `找不到「${searchQuery}」的相關商品。` : '此品類暫無商品。'}
              </p>
            )}
            <button
              onClick={() => { setInputValue(''); router.replace('/browse'); }}
              className="mt-2 text-xs text-brand-600 hover:underline"
            >
              查看全部
            </button>
          </div>
        );
      })()}

      {/* ── Desktop load more ──────────────────────────────────────────────── */}
      {!isMobile && hasMore && !loading && (
        <div className="mt-10 flex flex-col items-center gap-2">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? '載入中…' : '載入更多'}
          </Button>
          <p className="text-xs text-slate-400">已顯示 {listings.length} / {total} 件</p>
        </div>
      )}

      {/* ── Mobile sentinel ────────────────────────────────────────────────── */}
      {isMobile && <div ref={sentinelRefCallback} className="h-12" />}

      {/* ── End ────────────────────────────────────────────────────────────── */}
      {!hasMore && !loading && listings.length > 0 && (
        <p className="mt-8 text-center text-xs text-slate-400">
          — 已顯示全部 {total} 件商品 —
        </p>
      )}
    </div>
  );
}

'use client';

// useSearchParams needs dynamic rendering (not static prerender) — production build fix.
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Chip } from '@certifine/ui';
import { browseCategories, categoryById, CONDITION_GRADES } from '@certifine/domain';
import { brandsForCategory, hasBrandPicker, brandFieldLabel, brandLabel, parseSearchQuery, conditionLabel, categoryLabel, stationDisplayLabel, getClientLocale, createT } from '@certifine/web-kit';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { ProductCard, ProductCardSkeleton } from '@/components/product-card';

// ─── Constants ────────────────────────────────────────────────────────────────

const DESKTOP_PAGE_SIZE = 24;
const MOBILE_PAGE_SIZE = 12;
const BROWSE_CATEGORIES = browseCategories();

// L3 price tiers → 4 preset price-range choices in the sidebar.
// Selecting one writes the corresponding min/max to the URL.
const TIER_PRESETS = [
  { key: 't1', label: 'Tier 1 · < $1,000',   min: '',      max: '999'   },
  { key: 't2', label: 'Tier 2 · $1k–9,999',  min: '1000',  max: '9999'  },
  { key: 't3', label: 'Tier 3 · ≥ $10,000',  min: '10000', max: ''      },
] as const;
type TierKey = typeof TIER_PRESETS[number]['key'];

// ─── Sidebar primitives (.fgroup / .fitem from L3 theme) ─────────────────────

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-4 first:pt-0 last:border-b-0">
      <h4 className="mb-3 text-[13px] font-bold text-neutral-text">{title}</h4>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function FilterItem({
  label,
  selected,
  onClick,
  suffix,
  mode = 'radio',
}: {
  label: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  suffix?: React.ReactNode;
  /**
   * Affordance must match behaviour: single-select groups (category / tier /
   * condition) render a round radio dot; multi-select groups (brand) render a
   * square checkbox. Never show a checkbox on mutually-exclusive options.
   */
  mode?: 'radio' | 'checkbox';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role={mode === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={selected}
      className={`flex items-center gap-[9px] py-[5px] text-left text-[13px] transition ${
        selected ? 'text-neutral-text' : 'text-neutral-text-muted hover:text-neutral-text'
      }`}
    >
      {mode === 'radio' ? (
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
            selected ? 'border-verify' : 'border-line-2'
          }`}
          aria-hidden="true"
        >
          {selected && <span className="h-2 w-2 rounded-full bg-verify" />}
        </span>
      ) : (
        <span
          className={`h-4 w-4 shrink-0 rounded border-[1.5px] transition ${
            selected ? 'border-verify bg-verify' : 'border-line-2'
          }`}
          aria-hidden="true"
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {suffix && <span className="text-[11px] text-neutral-text-hint">{suffix}</span>}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams?.get('cat') ?? null;
  const searchQuery = searchParams?.get('q') ?? '';
  const sort =
    (searchParams?.get('sort') as 'newest' | 'priceAsc' | 'priceDesc' | 'relevance' | null) ??
    (searchQuery ? 'relevance' : 'newest');
  const minPriceStr = searchParams?.get('min') ?? '';
  const maxPriceStr = searchParams?.get('max') ?? '';
  const minPrice = minPriceStr ? Number(minPriceStr) : undefined;
  const maxPrice = maxPriceStr ? Number(maxPriceStr) : undefined;
  // Multi-select brand filter: comma-separated in URL (`brand=chanel,gucci`).
  const brandParam = searchParams?.get('brand') ?? '';
  const brands = useMemo(
    () => brandParam.split(',').map((b) => b.trim()).filter(Boolean),
    [brandParam],
  );
  const conditionMin = searchParams?.get('cond') ?? null;

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
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [locale, setLocale]            = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setLocale(getClientLocale());
    }
  }, []);

  const _t = createT(locale);

  // ── Mobile drawer: pending filter state ──────────────────────────────
  const [pendingCat, setPendingCat] = useState<string | null>(null);
  const [pendingBrands, setPendingBrands] = useState<string[]>([]);
  const [pendingCond, setPendingCond] = useState<string | null>(null);
  const [pendingMinP, setPendingMinP] = useState('');
  const [pendingMaxP, setPendingMaxP] = useState('');

  useEffect(() => {
    if (!drawerOpen) return;
    setPendingCat(category);
    setPendingBrands(brands);
    setPendingCond(conditionMin);
    setPendingMinP(minPriceStr);
    setPendingMaxP(maxPriceStr);
    setMinInput(minPriceStr);
    setMaxInput(maxPriceStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  // Effective sidebar values: pending in drawer, URL-backed otherwise
  const effCat = drawerOpen ? pendingCat : category;
  const effBrands = drawerOpen ? pendingBrands : brands;
  const effCond = drawerOpen ? pendingCond : conditionMin;
  const effMin = drawerOpen ? pendingMinP : minPriceStr;
  const effMax = drawerOpen ? pendingMaxP : maxPriceStr;

  const effCurrentTier = useMemo<TierKey | null>(() => {
    for (const p of TIER_PRESETS) {
      if (effMin === p.min && effMax === p.max) return p.key;
    }
    return null;
  }, [effMin, effMax]);

  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
  const sentinelRefCallback = useCallback((node: HTMLDivElement | null) => {
    setSentinelNode(node);
  }, []);

  const loadingMoreRef = useRef(false);
  const hasMoreRef     = useRef(false);
  const offsetRef      = useRef(0);
  // Analytics（spec §2.3）：同一 query 只 track 一次；event_id 留做
  // search_result_clicked 嘅 funnel join key（query_id）。
  const lastTrackedQueryRef = useRef<string | null>(null);
  const searchEventIdRef    = useRef<string | null>(null);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const pageSize = isMobile ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [drawerOpen]);

  // ── URL sync helpers ────────────────────────────────────────────────────
  function buildUrl(
    cat: string | null,
    q: string,
    opts?: { sort?: string; min?: string; max?: string; brands?: string[] | null; cond?: string | null },
  ) {
    const params = new URLSearchParams();
    if (cat) params.set('cat', cat);
    if (q)   params.set('q', q);
    const s = opts?.sort ?? sort;
    if (s && s !== 'newest') params.set('sort', s);
    const min = opts?.min ?? minPriceStr;
    if (min) params.set('min', min);
    const max = opts?.max ?? maxPriceStr;
    if (max) params.set('max', max);
    const br = opts?.brands === null ? [] : (opts?.brands ?? brands);
    if (br.length) params.set('brand', br.join(','));
    const cd = opts?.cond === null ? null : (opts?.cond ?? conditionMin);
    if (cd) params.set('cond', cd);
    const qs = params.toString();
    return qs ? `/browse?${qs}` : '/browse';
  }

  function navigate(url: string) {
    router.push(url as Route);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCategoryChange(newCat: string | null) {
    if (drawerOpen) {
      setPendingCat(newCat);
      setPendingBrands([]);
    } else {
      navigate(buildUrl(newCat, searchQuery, { brands: null }));
    }
  }
  /** Toggle a brand in/out of the multi-select set. */
  function handleBrandToggle(brandId: string) {
    if (drawerOpen) {
      setPendingBrands((prev) =>
        prev.includes(brandId) ? prev.filter((b) => b !== brandId) : [...prev, brandId],
      );
    } else {
      const next = brands.includes(brandId)
        ? brands.filter((b) => b !== brandId)
        : [...brands, brandId];
      navigate(buildUrl(category, searchQuery, { brands: next }));
    }
  }
  function clearBrands() {
    if (drawerOpen) {
      setPendingBrands([]);
    } else {
      navigate(buildUrl(category, searchQuery, { brands: null }));
    }
  }
  function handleConditionChange(newCond: string | null) {
    if (drawerOpen) {
      setPendingCond(newCond);
    } else {
      navigate(buildUrl(category, searchQuery, { cond: newCond }));
    }
  }
  function handleTierChange(t: TierKey | null) {
    if (t === null) {
      if (drawerOpen) {
        setPendingMinP('');
        setPendingMaxP('');
      } else {
        navigate(buildUrl(category, searchQuery, { min: '', max: '' }));
      }
      return;
    }
    const preset = TIER_PRESETS.find((p) => p.key === t)!;
    if (drawerOpen) {
      setPendingMinP(preset.min);
      setPendingMaxP(preset.max);
    } else {
      navigate(buildUrl(category, searchQuery, { min: preset.min, max: preset.max }));
    }
  }
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) { navigate(buildUrl(category, '')); return; }
    const parsed = parseSearchQuery(trimmed);
    const nextCat = parsed.categoryId ?? category;
    const brandOpt = nextCat !== category ? { brands: null as string[] | null } : {};
    // Smart-search auto-apply: seed `cond` from parsed conditionMin only if
    // it changed (avoid overwriting an explicit sidebar-picked value with the
    // same value + trip re-render). Chip UI + removal handler already exist.
    const condOpt = parsed.conditionMin && parsed.conditionMin !== conditionMin
      ? { cond: parsed.conditionMin }
      : {};
    navigate(buildUrl(nextCat, trimmed, { sort: 'relevance', ...brandOpt, ...condOpt }));
  }
  function applyPriceFilter(e: React.FormEvent) {
    e.preventDefault();
    const cleanMin = minInput && Number(minInput) > 0 ? minInput : '';
    const cleanMax = maxInput && Number(maxInput) > 0 ? maxInput : '';
    if (drawerOpen) {
      setPendingMinP(cleanMin);
      setPendingMaxP(cleanMax);
    } else {
      navigate(buildUrl(category, searchQuery, { min: cleanMin, max: cleanMax }));
    }
  }
  function setSort(s: 'newest' | 'priceAsc' | 'priceDesc' | 'relevance') {
    navigate(buildUrl(category, searchQuery, { sort: s }));
  }
  function clearAllFilters() {
    setMinInput(''); setMaxInput('');
    navigate(buildUrl(null, '', { sort: 'newest', min: '', max: '', brands: null, cond: null }));
  }
  function applyDrawerFilters() {
    navigate(buildUrl(pendingCat, searchQuery, {
      brands: pendingBrands.length > 0 ? pendingBrands : null,
      cond: pendingCond,
      min: pendingMinP,
      max: pendingMaxP,
    }));
    setDrawerOpen(false);
  }

  // Currently-selected tier preset (or null if no exact match).
  const currentTier = useMemo<TierKey | null>(() => {
    for (const p of TIER_PRESETS) {
      if (minPriceStr === p.min && maxPriceStr === p.max) return p.key;
    }
    return null;
  }, [minPriceStr, maxPriceStr]);

  const apiSearch = (() => {
    if (!searchQuery) return undefined;
    const parsed = parseSearchQuery(searchQuery);
    // When category OR condition was auto-applied via parsing (URL now reflects
    // them as filters), send only residual `terms` so server doesn't ALSO
    // require that phrase in title/description (double-restrict — same rule
    // as category consumption).
    const catAutoApplied = category && category === parsed.categoryId;
    const condAutoApplied = conditionMin && conditionMin === parsed.conditionMin;
    if (catAutoApplied || condAutoApplied) return parsed.terms.join(' ') || undefined;
    return searchQuery;
  })();

  // ── First page load ────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setListings([]);
    setHasMore(false);
    offsetRef.current = 0;
    loadingMoreRef.current = false;

    const enumVal = categoryById(category)?.apiEnum;
    api.listings
      .list(enumVal, pageSize, 0, apiSearch, {
        minPrice, maxPrice, sort, brand: brands.length ? brands.join(',') : undefined, conditionMin: conditionMin ?? undefined,
      })
      .then(({ items, total: t, hasMore: more }) => {
        setListings(items);
        setTotal(t);
        setHasMore(more);
        hasMoreRef.current = more;
        offsetRef.current = items.length;
        // Analytics：search_performed（+ zero_result）— 每個新 query 一次
        if (searchQuery && searchQuery !== lastTrackedQueryRef.current) {
          lastTrackedQueryRef.current = searchQuery;
          const parsed = parseSearchQuery(searchQuery);
          const props = {
            query_raw: searchQuery,
            parsed_category: parsed.categoryId ?? null,
            auto_applied_filters: [
              ...(parsed.categoryId ? [`category:${parsed.categoryId}`] : []),
              ...(parsed.conditionMin ? [`condition:${parsed.conditionMin}`] : []),
            ],
            remaining_terms: parsed.terms,
            result_count: t,
            sort,
          };
          searchEventIdRef.current = track('search_performed', props);
          if (t === 0) track('search_zero_result', props);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, brandParam, conditionMin, apiSearch, pageSize, sort, minPrice, maxPrice, searchQuery]);

  // ── loadMore ──────────────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const enumVal = categoryById(category)?.apiEnum;
    const currentOffset = offsetRef.current;
    api.listings
      .list(enumVal, pageSize, currentOffset, apiSearch, {
        minPrice, maxPrice, sort, brand: brands.length ? brands.join(',') : undefined, conditionMin: conditionMin ?? undefined,
      })
      .then(({ items, hasMore: more }) => {
        offsetRef.current = currentOffset + items.length;
        setListings((prev) => [...prev, ...items]);
        setHasMore(more);
        hasMoreRef.current = more;
      })
      .catch(() => {})
      .finally(() => { loadingMoreRef.current = false; setLoadingMore(false); });
  }, [category, brandParam, conditionMin, apiSearch, pageSize, sort, minPrice, maxPrice]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; });

  // ── Mobile IntersectionObserver ───────────────────────────────────────
  useEffect(() => {
    if (!isMobile || !sentinelNode) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '100px' },
    );
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [isMobile, sentinelNode]);

  // ── Sidebar body (rendered in desktop aside AND mobile drawer) ────────
  const sidebar = (
    <div>
      {/* 品類 */}
      <FilterGroup title={_t('browse.filter.group.category')}>
        <FilterItem
          label={_t('browse.filter.allCategories')}
          selected={!effCat}
          onClick={() => handleCategoryChange(null)}
        />
        {BROWSE_CATEGORIES.map((c) => (
          <FilterItem
            key={c.id}
            label={categoryLabel(c.id, locale)}
            selected={effCat === c.id}
            onClick={() => handleCategoryChange(c.id)}
            suffix={!c.enabledInSell ? _t('browse.filter.comingSoon') : undefined}
          />
        ))}
      </FilterGroup>

      {/* 價格層 */}
      <FilterGroup title={_t('browse.filter.group.priceTier')}>
        <FilterItem
          label={_t('browse.filter.unlimited')}
          selected={effCurrentTier === null && !effMin && !effMax}
          onClick={() => handleTierChange(null)}
        />
        {TIER_PRESETS.map((p) => (
          <FilterItem
            key={p.key}
            label={p.label}
            selected={effCurrentTier === p.key}
            onClick={() => handleTierChange(p.key)}
          />
        ))}
        {/* Custom range input — always visible under the presets */}
        <form onSubmit={applyPriceFilter} className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-neutral-text-hint">HK$</span>
          <input
            type="number" inputMode="numeric" min={0}
            value={minInput} onChange={(e) => setMinInput(e.target.value)}
            placeholder={_t('browse.filter.priceMin')}
            className="w-full max-w-[80px] rounded border border-line-2 px-2 py-1 text-[12px] outline-none focus:border-verify"
          />
          <span className="text-neutral-text-hint">–</span>
          <input
            type="number" inputMode="numeric" min={0}
            value={maxInput} onChange={(e) => setMaxInput(e.target.value)}
            placeholder={_t('browse.filter.priceMax')}
            className="w-full max-w-[80px] rounded border border-line-2 px-2 py-1 text-[12px] outline-none focus:border-verify"
          />
          <button
            type="submit"
            className="ml-auto rounded bg-neutral-text px-2 py-1 text-[11px] font-semibold text-white hover:bg-ink"
          >
            {_t('browse.filter.apply')}
          </button>
        </form>
      </FilterGroup>

      {/* 狀況 — "at-least" semantic, radio-style single selection */}
      <FilterGroup title={_t('browse.filter.group.condition')}>
        <p className="mb-2 text-[11px] text-neutral-text-hint">{_t('browse.filter.conditionHint')}</p>
        <FilterItem
          label={_t('browse.filter.unlimited')}
          selected={!effCond}
          onClick={() => handleConditionChange(null)}
        />
        {CONDITION_GRADES.map((g) => (
          <FilterItem
            key={g.id}
            label={conditionLabel(g.id, locale)}
            selected={effCond === g.id}
            onClick={() => handleConditionChange(g.id)}
          />
        ))}
      </FilterGroup>

      {/* 品牌 — only when a category with brands is selected. MULTI-select
          (checkbox affordance): picking several brands = OR match. */}
      {effCat && hasBrandPicker(effCat as any) && (() => {
        const catBrands = brandsForCategory(effCat as any);
        const fieldLabel = brandFieldLabel(effCat as any);
        // Brands in the URL that aren't in this category's curated list
        // (e.g. carried over from smart search / manual URL) — keep visible
        // + removable so the filter is never invisible.
        const customBrands = effBrands.filter((id) => !catBrands.some((b) => b.id === id));
        return (
          <FilterGroup title={fieldLabel}>
            <p className="mb-2 text-[11px] text-neutral-text-hint">{_t('browse.filter.brandMulti')}</p>
            <FilterItem
              mode="checkbox"
              label={_t('browse.filter.allBrands', { fieldLabel })}
              selected={effBrands.length === 0}
              onClick={clearBrands}
            />
            {catBrands.slice(0, 12).map((b) => (
              <FilterItem
                key={b.id}
                mode="checkbox"
                label={b.label}
                selected={effBrands.includes(b.id)}
                onClick={() => handleBrandToggle(b.id)}
              />
            ))}
            {customBrands.map((id) => (
              <FilterItem
                key={id}
                mode="checkbox"
                label={_t('browse.filter.customBrand', { id })}
                selected={true}
                onClick={() => handleBrandToggle(id)}
              />
            ))}
          </FilterGroup>
        );
      })()}
    </div>
  );

  return (
    <div className="mx-auto max-w-container-l3 px-4 sm:px-6">
      {/* ═══ Search row ═══════════════════════════════════════════════════════ */}
      <form onSubmit={handleSearch} className="pb-2 pt-6">
        <div className="flex overflow-hidden rounded-xl border border-line bg-white shadow-sh2">
          <label className="flex flex-1 items-center pl-5">
            <Search className="h-4 w-4 shrink-0 text-neutral-text-hint" />
            <input
              type="search"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={_t('browse.search.placeholder')}
              className="w-full border-0 py-[13px] pl-3 pr-4 text-[15px] text-neutral-text outline-none placeholder:text-neutral-text-hint"
            />
          </label>
          <button
            type="submit"
            className="shrink-0 bg-brand-600 px-6 text-[15px] font-bold text-white transition hover:bg-brand-400"
          >
            {_t('browse.search.button')}
          </button>
        </div>
      </form>

      {/* ═══ Active filter chips ═════════════════════════════════════════════ */}
      {(searchQuery || category || brands.length > 0 || conditionMin || minPriceStr || maxPriceStr) && (
        <div className="flex flex-wrap gap-2 pb-1 pt-2.5">
          {category && (
            <Chip
              onRemove={() => navigate(buildUrl(null, searchQuery, { brands: null }))}
              removeLabel={_t('browse.chip.removeCategory')}
            >
              {_t('browse.chip.category', { labelZh: categoryLabel(category as any, locale) || category })}
            </Chip>
          )}
          {/* One chip PER selected brand — each independently removable. */}
          {brands.map((id) => {
            const l = category ? brandLabel(category as any, id) : id;
            const fieldLabel = category ? brandFieldLabel(category as any) : 'Brand';
            return (
              <Chip
                key={id}
                onRemove={() => handleBrandToggle(id)}
                removeLabel={_t('browse.chip.removeBrand', { l: l || id })}
              >
                {_t('browse.chip.brand', { fieldLabel, l: l || id })}
              </Chip>
            );
          })}
          {conditionMin && (
            <Chip onRemove={() => handleConditionChange(null)} removeLabel={_t('browse.chip.removeCondition')}>
              {_t('browse.chip.condition', { conditionLabel: conditionLabel(conditionMin as any, locale) })}
            </Chip>
          )}
          {(minPriceStr || maxPriceStr) && (
            <Chip
              onRemove={() => navigate(buildUrl(category, searchQuery, { min: '', max: '' }))}
              removeLabel={_t('browse.chip.removePrice')}
            >
              {_t('browse.chip.price', { min: minPriceStr || '0', max: maxPriceStr ? `HK$${maxPriceStr}` : _t('browse.filter.unlimited') })}
            </Chip>
          )}
          {searchQuery && (
            <Chip onRemove={() => navigate(buildUrl(category, ''))} removeLabel={_t('browse.chip.removeSearch')}>
              {_t('browse.chip.search', { searchQuery })}
            </Chip>
          )}
          <button
            onClick={clearAllFilters}
            className="text-xs text-neutral-text-hint hover:text-danger hover:underline"
          >
            {_t('browse.filter.clearAll')}
          </button>
        </div>
      )}

      {/* ═══ Layout: sidebar + main ══════════════════════════════════════════ */}
      <div className="grid items-start gap-7 pt-4 md:grid-cols-[230px_1fr]">
        {/* Desktop sidebar */}
        <aside className="chrome-follow sticky top-[calc(var(--chrome-h)+16px)] hidden md:block">
          {sidebar}
        </aside>

        {/* Main results */}
        <div>
          {/* Results-top */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm text-neutral-text-muted">
              {loading
                ? _t('browse.loading')
                : (
                  <>
                    {_t('browse.resultCount', { total })}
                  </>
                )}
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile filter trigger */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-line-2 bg-white px-3 py-2 text-[13px] font-semibold text-neutral-text shadow-sh1 hover:border-verify md:hidden"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {_t('browse.filter.mobileDrawer')}
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="rounded-lg border border-line-2 bg-white px-3 py-2 text-[13px] text-neutral-text shadow-sh1 outline-none transition hover:border-verify focus:border-verify"
              >
                {searchQuery && <option value="relevance">{_t('browse.sort.relevance')}</option>}
                <option value="newest">{_t('browse.sort.newest')}</option>
                <option value="priceAsc">{_t('browse.sort.priceAsc')}</option>
                <option value="priceDesc">{_t('browse.sort.priceDesc')}</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3">
            {loading
              ? Array.from({ length: pageSize }).map((_, i) => <ProductCardSkeleton key={i} />)
              : listings.map((l, idx) => (
                  // display:contents wrapper — 唔影響 grid layout，純粹捕捉
                  // search_result_clicked（spec §2.3 funnel join）
                  <div
                    key={l.id}
                    className="contents"
                    onClickCapture={() => {
                      if (searchQuery && searchEventIdRef.current) {
                        track('search_result_clicked', {
                          query_id: searchEventIdRef.current,
                          listing_id: l.id,
                          result_position: idx + 1,
                        });
                      }
                      try { sessionStorage.setItem('analytics_listing_source', searchQuery ? 'search' : 'browse'); } catch {}
                    }}
                  >
                    <ProductCard
                      listing={l}
                      meta={
                        [
                          l.condition ? conditionLabel(l.condition, locale) : null,
                          stationDisplayLabel(l.sellerDistrict),
                        ].filter(Boolean).join(' · ') || undefined
                      }
                    />
                  </div>
                ))}
            {loadingMore &&
              Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={`more-${i}`} />)}
          </div>

          {/* Empty */}
          {!loading && listings.length === 0 && (() => {
            const activeCat = categoryById(category);
            const isComingSoon = activeCat && !activeCat.enabledInSell;
            return (
              <div className="mt-14 rounded-xl border border-line bg-white p-10 text-center shadow-sh1">
                {isComingSoon ? (
                  <>
                    <p className="font-display-serif text-lg font-bold text-ink">
                      {_t('browse.empty.comingSoon', { emoji: activeCat.emoji, labelZh: categoryLabel(activeCat.id, locale) })}
                    </p>
                    <p className="mt-2 text-sm text-neutral-text-muted">
                      {_t('browse.empty.comingSoonDesc')}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-neutral-text-muted">
                    {searchQuery ? _t('browse.empty.noResult', { searchQuery }) : _t('browse.empty.noFilterResult')}
                  </p>
                )}
                <button
                  onClick={() => { setInputValue(''); router.replace('/browse'); }}
                  className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  {_t('browse.empty.viewAll')}
                </button>
              </div>
            );
          })()}

          {/* Desktop load more */}
          {!isMobile && hasMore && !loading && (
            <div className="mt-10 flex flex-col items-center gap-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-line-2 bg-white px-6 py-3 text-sm font-semibold text-neutral-text shadow-sh1 transition hover:border-verify hover:text-verify disabled:opacity-40"
              >
                {loadingMore ? _t('browse.loadMore.loading') : _t('browse.loadMore')}
              </button>
              <p className="text-xs text-neutral-text-hint">{_t('browse.loadMore.shown', { 'listings.length': listings.length, total })}</p>
            </div>
          )}

          {/* Mobile sentinel */}
          {isMobile && <div ref={sentinelRefCallback} className="h-12" />}

          {/* End */}
          {!hasMore && !loading && listings.length > 0 && (
            <p className="mt-8 text-center text-xs text-neutral-text-hint">
              {_t('browse.endOfResults', { total })}
            </p>
          )}
        </div>
      </div>

      {/* ═══ Mobile filter drawer ═══════════════════════════════════════════ */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-sh3">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="font-display-serif text-lg font-bold text-ink">{_t('browse.filter.mobileDrawer')}</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-2 text-neutral-text-muted hover:bg-surface-2"
                aria-label={_t('browse.filter.closeAriaLabel')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {sidebar}
            </div>
            <div className="border-t border-line bg-white p-4">
              <button
                type="button"
                onClick={applyDrawerFilters}
                className="w-full rounded-lg bg-brand-600 py-3 text-[15px] font-bold text-white transition hover:bg-brand-400"
              >
                {_t('browse.filter.drawerViewResults', { total })}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

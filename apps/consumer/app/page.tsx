'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
  browseCategories, type CategoryConfig,
} from '@authentik/utils';
import { api } from '@/lib/api';
import { AuthTicker } from '@/components/auth-ticker';
import { ProductCard, ProductCardSkeleton } from '@/components/product-card';

// ─── Category meta ────────────────────────────────────────────────────────────
const CATEGORY_SECTIONS = browseCategories();

const HOT_SEARCHES = [
  { label: 'Chanel Classic Flap', cat: 'handbag' },
  { label: 'Rolex 黑水鬼',         cat: 'watch'   },
  { label: 'Air Jordan 1',          cat: 'sneaker' },
  { label: 'Hermès Birkin',         cat: 'handbag' },
  { label: 'Pokémon PSA',           cat: 'pokemon_card' },
];

// ─── L3 Product Card (.p-card) ────────────────────────────────────────────────

// ProductCard + skeleton moved to `components/product-card.tsx` for reuse.

// ─── L3 Section header ─────────────────────────────────────────────────────

function SectionHead({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mt-14 mb-5 flex items-baseline justify-between">
      <h2 className="font-display-serif text-[27px] font-bold leading-tight tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {href && (
        <Link href={href as any} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          {linkLabel ?? '查看全部'} →
        </Link>
      )}
    </div>
  );
}

// ─── L3 Category tile ─────────────────────────────────────────────────────

function CategoryTile({ cat, count }: { cat: CategoryConfig; count: number | null }) {
  const disabled = !cat.enabledInSell;
  return (
    <Link
      href={`/browse?cat=${cat.id}` as any}
      className="group relative flex aspect-[1/0.78] items-end overflow-hidden rounded-[14px] border border-line bg-gradient-to-br from-[#eef1f5] to-[#e2e8f0] p-4 shadow-sh2 transition duration-200 hover:-translate-y-0.5 hover:shadow-sh3"
    >
      {/* Watermark emoji (bottom-right) — big, subtle */}
      <span className="pointer-events-none absolute -bottom-3 right-2 select-none text-[80px] leading-none opacity-30 transition duration-200 group-hover:scale-105">
        {cat.emoji}
      </span>
      {/* Item count top-right */}
      <span className="absolute right-4 top-3 text-[11px] font-semibold text-neutral-text-hint">
        {count === null ? '' : `${count} 件`}
      </span>
      {/* Category name bottom-left */}
      <div className="relative">
        <div className="text-base font-extrabold text-ink">{cat.labelZh}</div>
        {disabled && (
          <div className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            即將推出
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [categoryListings, setCategoryListings] = useState<Record<string, any[]>>({});
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.listings.list(undefined, 8, 0, undefined, { sort: 'newest' }).then(({ items, total }) => ({
        id: '__recent__', items, total,
      })),
      ...CATEGORY_SECTIONS.map((cat) =>
        api.listings.list(cat.apiEnum, 4, 0).then(({ items, total }) => ({ id: cat.id, items, total })),
      ),
    ])
      .then((results) => {
        const map: Record<string, any[]> = {};
        const counts: Record<string, number> = {};
        results.forEach(({ id, items, total }) => {
          if (id === '__recent__') setRecent(items);
          else { map[id] = items; counts[id] = total; }
        });
        setCategoryListings(map);
        setCategoryCounts(counts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : '/browse');
  }

  return (
    <div className="mx-auto max-w-container-l3 px-4 sm:px-6">
      {/* ═══ Hero ══════════════════════════════════════════════════════════ */}
      <section className="pb-10 pt-16 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
          Search · Verify · Buy
        </p>
        <h1 className="mx-auto mt-4 max-w-[760px] font-display-serif text-[36px] font-bold leading-[1.15] tracking-[-0.01em] text-ink sm:text-[46px]">
          搵真貨，<span className="text-brand-600">鑑定通過</span>才成交
        </h1>
        <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-relaxed text-neutral-text-muted">
          逾一萬件正品貨源，每宗高價交易經具名鑑定師把關、款項託管。
        </p>

        {/* Search bar — L3 sh-3 heavy floating */}
        <form
          onSubmit={onSearch}
          className="mx-auto mt-8 flex max-w-[680px] items-stretch overflow-hidden rounded-[14px] border border-line bg-white shadow-sh3"
        >
          <div className="relative flex flex-1 items-center pl-5">
            <Search className="h-4 w-4 text-neutral-text-hint" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋品牌、型號，例如 Rolex Submariner、Chanel Classic Flap"
              className="w-full border-0 px-4 py-[17px] text-[15px] text-neutral-text outline-none placeholder:text-neutral-text-hint"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 bg-brand-600 px-8 text-[15px] font-bold text-white transition hover:bg-brand-400"
          >
            搜尋
          </button>
        </form>

        {/* Hot search pills */}
        <div className="mx-auto mt-4 flex flex-wrap justify-center gap-2">
          {HOT_SEARCHES.map((h) => (
            <Link
              key={h.label}
              href={`/browse?cat=${h.cat}` as any}
              className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] text-neutral-text-muted shadow-sh1 transition hover:border-brand-600 hover:text-brand-600"
            >
              {h.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ Realtime auth ticker ══════════════════════════════════════════ */}
      <AuthTicker />

      {/* ═══ 熱門品類 ═══════════════════════════════════════════════════════ */}
      <SectionHead title="熱門品類" href="/browse" linkLabel="全部品類" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {CATEGORY_SECTIONS.map((cat) => (
          <CategoryTile
            key={cat.id}
            cat={cat}
            count={loading ? null : (categoryCounts[cat.id] ?? 0)}
          />
        ))}
      </div>

      {/* ═══ 最新上架 4-col grid ═══════════════════════════════════════════ */}
      {(loading || recent.length > 0) && (
        <>
          <SectionHead title="最新上架" href="/browse?sort=newest" />
          <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : recent.map((l) => <ProductCard key={l.id} listing={l} />)}
          </div>
        </>
      )}

      {/* ═══ Per-category rows ═══════════════════════════════════════════ */}
      {CATEGORY_SECTIONS.map((cat) => {
        const items = categoryListings[cat.id] ?? [];
        if (!loading && items.length === 0) return null;
        return (
          <div key={cat.id}>
            <SectionHead title={`${cat.emoji} ${cat.labelZh}`} href={`/browse?cat=${cat.id}`} />
            <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3 lg:grid-cols-4">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
                : items.slice(0, 4).map((l) => <ProductCard key={l.id} listing={l} />)}
            </div>
          </div>
        );
      })}

      <div className="h-10" />
    </div>
  );
}

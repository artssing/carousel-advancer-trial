'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, TierPill, ListingThumb } from '@authentik/ui';
import { ShieldCheck, Camera, Coins, Search, ChevronRight } from 'lucide-react';
import { formatHKD, tierForPrice, browseCategories, categoryByApiEnum, type CategoryConfig } from '@authentik/utils';
import { api } from '@/lib/api';

// ─── Category meta ────────────────────────────────────────────────────────────
// Derived from `packages/utils/categories.ts` — the canonical registry.
const CATEGORY_SECTIONS = browseCategories();

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 日前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月前`;
  return `${Math.floor(months / 12)} 年前`;
}

const HOT_SEARCHES = [
  { label: 'Chanel Classic Flap', cat: 'handbag' },
  { label: 'Rolex 黑水鬼',         cat: 'watch'   },
  { label: 'iPhone 15 Pro',        cat: 'iphone'  },
  { label: 'PSA 10 Charizard',     cat: 'pokemon_card' },
  { label: 'Jordan 1 Chicago',     cat: 'sneaker' },
  { label: 'Bearbrick 1000%',      cat: 'designer_toy' },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="w-44 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white md:w-56">
      <div className="aspect-square animate-pulse bg-slate-200" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-12 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ l }: { l: any }) {
  const tier = tierForPrice(l.priceHKD) as 1 | 2 | 3;
  return (
    <Link href={`/listing/${l.id}`} className="w-44 shrink-0 md:w-56">
      <Card className="flex h-full flex-col overflow-hidden transition hover:shadow-md">
        <ListingThumb
          src={l.coverUrl ?? l.images?.[0] ?? null}
          alt={l.title}
          emoji={categoryByApiEnum(l.category)?.emoji}
          className="aspect-square"
        />
        <CardContent className="flex flex-1 flex-col p-3">
          {/* TierPill — fixed single-line height */}
          <div className="h-6 shrink-0">
            <TierPill tier={tier} className="text-[10px] !py-0.5" />
          </div>
          {/* Title — fixed 2-line height */}
          <h3 className="mt-1.5 line-clamp-2 min-h-[2.25rem] text-xs font-medium leading-snug">{l.title}</h3>
          {/* Price + 上架時間 — pinned to bottom */}
          <div className="mt-auto pt-1.5">
            <p className="text-sm font-semibold">{formatHKD(l.priceHKD)}</p>
            {l.createdAt && (
              <p className="text-[10px] text-slate-400">{timeAgo(l.createdAt)}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({ cat, items, loading }: { cat: CategoryConfig; items: any[]; loading: boolean }) {
  if (!loading && items.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">{cat.emoji} {cat.labelZh}</h2>
            <p className="text-xs text-slate-400">{cat.labelEn}</p>
          </div>
          {!cat.enabledInSell && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              即將推出
            </span>
          )}
        </div>
        <Link href={`/browse?cat=${cat.id}`} className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
          查看全部 <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide touch-pan-x overscroll-x-contain">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          : items.map((l) => <ListingCard key={l.id} l={l} />)}
      </div>
    </section>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [categoryListings, setCategoryListings] = useState<Record<string, any[]>>({});
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      // Recent listings (across all categories, newest)
      api.listings.list(undefined, 8, 0, undefined, { sort: 'newest' }).then(({ items }) => ({ id: '__recent__', items })),
      ...CATEGORY_SECTIONS.map((cat) =>
        api.listings.list(cat.apiEnum, 8, 0).then(({ items }) => ({ id: cat.id, items })),
      ),
    ])
      .then((results) => {
        const map: Record<string, any[]> = {};
        results.forEach(({ id, items }) => {
          if (id === '__recent__') setRecent(items);
          else map[id] = items;
        });
        setCategoryListings(map);
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
    <div className="mx-auto max-w-[1400px] px-4 md:px-8">

      {/* ── Search-first hero ─────────────────────────────────────────────── */}
      <section className="py-12 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-brand-500">
          由業界星級鑑定師驗證
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-900 md:text-4xl">
          搵真貨，由鑑定師保證。
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          HKD 10,000+ 強制鑑定 · 鑑定師具名 + E&amp;O 保險
        </p>

        {/* Search bar */}
        <form onSubmit={onSearch} className="mx-auto mt-6 flex max-w-xl items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋品牌、型號、關鍵字…"
              className="h-13 w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="submit"
            className="h-13 shrink-0 rounded-2xl bg-brand-600 px-5 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            搜尋
          </button>
        </form>

        {/* Hot searches */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-slate-400">熱門：</span>
          {HOT_SEARCHES.map((h) => (
            <Link
              key={h.label}
              href={`/browse?cat=${h.cat}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
            >
              {h.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Category strip ────────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 py-4">
        {/* Mobile: horizontal scroll edge-to-edge; Desktop: fixed-width centred row */}
        <div className="mx-auto flex max-w-fit gap-2 overflow-x-auto pb-1 scrollbar-hide touch-pan-x overscroll-x-contain md:overflow-x-visible">
          {CATEGORY_SECTIONS.map((cat) => (
            <Link
              key={cat.id}
              href={`/browse?cat=${cat.id}`}
              className="group flex aspect-square w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md md:w-28"
            >
              <span className="text-2xl md:text-3xl">{cat.emoji}</span>
              <span className="text-center text-[10px] font-medium leading-tight text-slate-600 md:text-[11px]">
                {cat.shortLabel}
              </span>
              {!cat.enabledInSell && (
                <span className="text-[9px] text-amber-600">即將推出</span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* ── 最新上架 strip ────────────────────────────────────────────────── */}
      {(loading || recent.length > 0) && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">最新上架</h2>
            <Link href="/browse?sort=newest" className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
              睇全部 <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide touch-pan-x overscroll-x-contain">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : recent.map((l) => <ListingCard key={l.id} l={l} />)}
          </div>
        </section>
      )}

      {/* ── Per-category rows ─────────────────────────────────────────────── */}
      {CATEGORY_SECTIONS.map((cat) => (
        <CategoryRow
          key={cat.id}
          cat={cat}
          items={categoryListings[cat.id] ?? []}
          loading={loading}
        />
      ))}

      {/* ── Trust strip (minimal, bottom) ─────────────────────────────────── */}
      <section className="mt-16 mb-8 grid gap-3 border-t border-slate-100 pt-8 text-center md:grid-cols-3">
        {[
          { icon: <ShieldCheck className="h-5 w-5 text-brand-500" />, title: '3 級鑑定制', desc: '萬元以上強制 · 按成交價自動分級' },
          { icon: <Camera       className="h-5 w-5 text-brand-500" />, title: '全程錄影 + 電子簽名', desc: '鑑定師具名 · 有片有報告可追討' },
          { icon: <Coins        className="h-5 w-5 text-brand-500" />, title: 'Escrow 託管', desc: '鑑定通過 + 收貨後才放款給賣家' },
        ].map((t) => (
          <div key={t.title} className="flex flex-col items-center gap-1.5 px-4">
            {t.icon}
            <p className="text-sm font-semibold text-slate-800">{t.title}</p>
            <p className="text-xs text-slate-400">{t.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

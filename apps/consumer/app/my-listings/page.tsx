'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge, Button, TierPill, ListingThumb } from '@authentik/ui';
import { formatHKD, tierForPrice, categoryByApiEnum } from '@authentik/utils';
import { Coins, ShoppingBag, TrendingUp } from 'lucide-react';
import { api, hasToken } from '@/lib/api';

type StatusFilter = 'all' | 'ACTIVE' | 'RESERVED' | 'SOLD';

const STATUS_LABEL: Record<string, { text: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
  ACTIVE:   { text: '上架中',  variant: 'success' },
  DRAFT:    { text: '草稿',    variant: 'default' },
  RESERVED: { text: '已預留',  variant: 'warning' },
  SOLD:     { text: '已售出',  variant: 'default' },
  REMOVED:  { text: '已下架',  variant: 'danger' },
};

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '寄送',
  MEETUP_AUTH: '鑑定師面交',
  MEETUP_3WAY: '三方面交',
  MEETUP_DIRECT: '雙方面交',
};

export default function MyListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ active: number; reserved: number; sold: number; completedOrders: number; lifetimeEarnings: number; monthEarnings: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!hasToken()) {
      router.replace('/login?redirect=/my-listings');
      return;
    }
    Promise.all([api.listings.mine(), api.listings.mineStats()])
      .then(([l, s]) => {
        setListings(l);
        setStats(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const active   = listings.filter((l) => l.status === 'ACTIVE');
  const reserved = listings.filter((l) => l.status === 'RESERVED');
  const sold     = listings.filter((l) => l.status === 'SOLD');
  const other    = listings.filter((l) => !['ACTIVE', 'RESERVED', 'SOLD'].includes(l.status));

  // Order: reserved (action needed) → active → sold → other
  const allSorted = [...reserved, ...active, ...sold, ...other];
  const sorted = useMemo(() => {
    if (statusFilter === 'all') return allSorted;
    return allSorted.filter((l) => l.status === statusFilter);
  }, [allSorted, statusFilter]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">我的商品</h1>
          {!loading && (
            <p className="mt-0.5 text-xs text-slate-400">
              共 {listings.length} 件商品
              {active.length > 0 && ` · ${active.length} 件上架中`}
              {reserved.length > 0 && ` · ${reserved.length} 件已預留`}
              {sold.length > 0 && ` · ${sold.length} 件已售出`}
            </p>
          )}
        </div>
        <Link href="/sell">
          <Button size="sm">上架新商品</Button>
        </Link>
      </div>

      {/* ── Earnings stats card ────────────────────────────────────────────── */}
      {!loading && stats && (
        <div className="mb-4 grid grid-cols-3 gap-3 rounded-2xl border border-slate-100 bg-gradient-to-br from-brand-50 to-white p-4">
          <div>
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <Coins className="h-3 w-3" /> 累計收入
            </p>
            <p className="mt-0.5 font-display text-lg font-bold text-brand-700">
              {formatHKD(stats.lifetimeEarnings)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <TrendingUp className="h-3 w-3" /> 本月收入
            </p>
            <p className="mt-0.5 font-display text-lg font-bold text-emerald-700">
              {formatHKD(stats.monthEarnings)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <ShoppingBag className="h-3 w-3" /> 完成單數
            </p>
            <p className="mt-0.5 font-display text-lg font-bold text-slate-800">
              {stats.completedOrders}
            </p>
          </div>
        </div>
      )}

      {/* ── Status filter tabs ─────────────────────────────────────────────── */}
      {!loading && listings.length > 0 && (
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
          {([
            ['all', '全部', listings.length],
            ['ACTIVE', '上架中', active.length],
            ['RESERVED', '已預留', reserved.length],
            ['SOLD', '已售出', sold.length],
          ] as const).map(([k, label, count]) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k as StatusFilter)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs transition ${
                statusFilter === k
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0 text-[9px] ${
                statusFilter === k ? 'bg-white/20' : 'bg-white text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex gap-4 p-4">
                <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-5 w-28 animate-pulse rounded-full bg-slate-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && listings.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-3xl">🏪</p>
          <p className="mt-3 font-medium text-slate-700">你未有上架任何商品</p>
          <p className="mt-1 text-sm text-slate-400">上架商品後會喺呢度管理。</p>
          <Link href="/sell"><Button className="mt-4">上架商品</Button></Link>
        </div>
      )}

      {/* Listing cards */}
      {!loading && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((l) => {
            const img = l.images?.[0];
            const tier = tierForPrice(l.priceHKD) as 1 | 2 | 3;
            const st = STATUS_LABEL[l.status] ?? { text: l.status, variant: 'default' as const };
            const methods: string[] = l.allowedDeliveryMethods ?? [];

            return (
              <Link key={l.id} href={`/listing/${l.id}`}>
                <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
                  l.status === 'RESERVED' ? 'border-amber-300' : 'border-slate-100'
                }`}>
                  <div className="flex gap-4 p-4">
                    {/* Image */}
                    <ListingThumb
                      src={img}
                      alt={l.title}
                      emoji={categoryByApiEnum(l.category)?.emoji}
                      className="h-20 w-20 shrink-0 rounded-xl"
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-semibold text-slate-900">{l.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {l.originalPriceHKD && l.originalPriceHKD > l.priceHKD ? (
                          <>
                            <span className="text-base font-bold text-rose-600">{formatHKD(l.priceHKD)}</span>
                            <span className="text-xs text-slate-400 line-through">{formatHKD(l.originalPriceHKD)}</span>
                          </>
                        ) : (
                          <span className="text-base font-bold text-brand-600">{formatHKD(l.priceHKD)}</span>
                        )}
                        <TierPill tier={tier} />
                        <Badge variant={st.variant}>{st.text}</Badge>
                      </div>
                      {/* Pending price drop pill — seller-only awareness (Q4=A) */}
                      {l.pendingPriceHKD && l.pendingPriceEffectiveAt && (
                        <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          ⏳ 待生效特價 HKD {l.pendingPriceHKD.toLocaleString('en-HK')} · {new Date(l.pendingPriceEffectiveAt).toLocaleString('zh-HK')}
                        </div>
                      )}

                      {/* Delivery methods */}
                      {methods.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {methods.map((m: string) => (
                            <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              {DELIVERY_LABEL[m] ?? m}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Date */}
                      {l.createdAt && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          上架：{new Date(l.createdAt).toLocaleDateString('zh-HK')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

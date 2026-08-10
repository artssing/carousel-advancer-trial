'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Pill, TierPill, ListingThumb, ConfirmDialog } from '@authentik/ui';
import { formatHKD, tierForPrice, categoryByApiEnum,
  getClientLocale, createT,
} from '@authentik/utils';
import { api, hasToken } from '@/lib/api';
import { ShareIgModal, type ShareListing } from '@/components/share-ig-modal';

type StatusFilter = 'all' | 'ACTIVE' | 'RESERVED' | 'SOLD';

// textKey, not text — module scope has no locale.
const STATUS_PILL: Record<string, { textKey: string; variant: 'verify' | 'status' | 'tier' | 'gold' }> = {
  ACTIVE:   { textKey: 'myListings.pillText.active',   variant: 'verify' },
  DRAFT:    { textKey: 'myListings.pillText.draft',    variant: 'tier' },
  RESERVED: { textKey: 'myListings.pillText.reserved', variant: 'status' },
  SOLD:     { textKey: 'myListings.pillText.sold',     variant: 'tier' },
  REMOVED:  { textKey: 'myListings.pillText.removed',  variant: 'tier' },
};

const DELIVERY_LABEL_KEY: Record<string, string> = {
  SHIP: 'myListings.deliveryLabel.ship',
  MEETUP_AUTH: 'myListings.deliveryLabel.meetupAuth',
  MEETUP_3WAY: 'myListings.deliveryLabel.meetup3way',
  MEETUP_DIRECT: 'myListings.deliveryLabel.meetupDirect',
};

/** Compact money for the stat card, e.g. HK$1.82M / HK$120K / HK$8,500. */
function compactHKD(v: number): string {
  if (v >= 1_000_000) return `HK$${(v / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
  if (v >= 10_000) return `HK$${(v / 1_000).toFixed(0)}K`;
  return formatHKD(v);
}

export default function MyListingsPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ active: number; reserved: number; sold: number; completedOrders: number; lifetimeEarnings: number; monthEarnings: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [shareListing, setShareListing] = useState<ShareListing | null>(null);
  // Soft-delete inline 2-step confirm（lesson #16 — terminal action 必須二次確認）
  const [deletePrompt, setDeletePrompt] = useState<string | null>(null);
  const [actBusy, setActBusy] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);

  function reload() {
    Promise.all([api.listings.mine(), api.listings.mineStats()])
      .then(([l, s]) => { setListings(l); setStats(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!hasToken()) {
      router.replace('/login?redirect=/my-listings');
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function doDelete(id: string) {
    setActBusy(id);
    setActError(null);
    try {
      await api.listings.softDelete(id);
      setDeletePrompt(null);
      reload();
    } catch (e: any) {
      setActError(e?.message ?? _t('myListings.error.delete'));
    } finally {
      setActBusy(null);
    }
  }

  async function doRestore(id: string) {
    setActBusy(id);
    setActError(null);
    try {
      await api.listings.restoreOwn(id);
      reload();
    } catch (e: any) {
      setActError(e?.message ?? _t('myListings.error.restore'));
    } finally {
      setActBusy(null);
    }
  }

  const active   = listings.filter((l) => l.status === 'ACTIVE');
  const reserved = listings.filter((l) => l.status === 'RESERVED');
  const sold     = listings.filter((l) => l.status === 'SOLD');
  const other    = listings.filter((l) => !['ACTIVE', 'RESERVED', 'SOLD'].includes(l.status));

  const allSorted = [...reserved, ...active, ...sold, ...other];
  const sorted = useMemo(() => {
    if (statusFilter === 'all') return allSorted;
    return allSorted.filter((l) => l.status === statusFilter);
  }, [allSorted, statusFilter]);

  const statCards = [
    { n: String(active.length),   l: _t('myListings.statLabel.active') },
    { n: String(reserved.length), l: _t('myListings.statLabel.inProgress') },
    { n: String(sold.length),     l: _t('myListings.statLabel.sold') },
    { n: stats ? compactHKD(stats.lifetimeEarnings) : '—', l: _t('myListings.stat.earnings') },
  ];

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-8 sm:px-6">
      {/* ═══ Head ═══ */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink">
            {_t('myListings.pageTitle')}
          </h1>
          <p className="mt-1 text-[13px] text-neutral-text-hint">{_t('myListings.pageSubtitle')}</p>
        </div>
        <Link href="/sell">
          <Button>{_t('myListings.newListing')}</Button>
        </Link>
      </div>
      {actError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actError}</p>
      )}

      {/* ═══ Statbar ═══ */}
      <div className="mb-7 grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.l} className="rounded-xl border border-line bg-white p-5 shadow-sh1">
            <div className="text-[32px] font-extrabold leading-none text-ink">{s.n}</div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ═══ Tabs ═══ */}
      {!loading && listings.length > 0 && (
        <div className="mb-6 flex gap-1 overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain border-b border-line">
          {([
            ['all', _t('myListings.tab.all'), listings.length],
            ['ACTIVE', _t('myListings.statLabel.active'), active.length],
            ['RESERVED', _t('myListings.statLabel.inProgress'), reserved.length],
            ['SOLD', _t('myListings.statLabel.sold'), sold.length],
          ] as const).map(([k, label, count]) => {
            const isActive = statusFilter === k;
            return (
              <button
                key={k}
                onClick={() => setStatusFilter(k as StatusFilter)}
                className={`shrink-0 -mb-px border-b-2 px-4 py-3 text-[14px] font-semibold transition ${
                  isActive
                    ? 'border-brand-600 text-ink'
                    : 'border-transparent text-neutral-text-hint hover:text-neutral-text-muted'
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 shadow-sh1">
              <div className="h-16 w-16 shrink-0 animate-pulse rounded-[10px] bg-surface-2" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && listings.length === 0 && (
        <div className="mt-14 rounded-xl border border-line bg-white p-10 text-center shadow-sh1">
          <p className="text-3xl">🏪</p>
          <p className="mt-3 font-medium text-neutral-text">{_t('myListings.empty.title')}</p>
          <p className="mt-1 text-sm text-neutral-text-hint">{_t('myListings.emptyHint')}</p>
          <Link href="/sell"><Button className="mt-5">{_t('myListings.empty.sellButton')}</Button></Link>
        </div>
      )}

      {/* ═══ Listing rows ═══ */}
      {!loading && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((l) => {
            const img = l.images?.[0];
            const tier = tierForPrice(l.priceHKD) as 1 | 2 | 3;
            const st = STATUS_PILL[l.status] ?? { textKey: l.status, variant: 'tier' as const };
            const methods: string[] = l.allowedDeliveryMethods ?? [];
            const ageDays = l.createdAt
              ? Math.max(0, Math.floor((Date.now() - new Date(l.createdAt).getTime()) / 86400000))
              : null;

            return (
              <div
                key={l.id}
                // 成個 row clickable（stretched-link，lesson #19）：title link 有
                // after:inset-0 overlay 蓋全行；action buttons 用 relative 升上層。
                className={`relative flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 shadow-sh1 transition hover:shadow-sh2 ${
                  l.status === 'RESERVED' ? 'border-verify' : 'border-line'
                }`}
              >
                <Link href={`/listing/${l.id}`} className="shrink-0">
                  <ListingThumb
                    src={img}
                    alt={l.title}
                    emoji={categoryByApiEnum(l.category)?.emoji}
                    className="h-16 w-16 rounded-[10px]"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={`/listing/${l.id}`} className="block truncate text-[14px] font-semibold text-neutral-text after:absolute after:inset-0 after:content-[''] hover:text-brand-700">
                    {l.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-neutral-text-hint">
                    <TierPill tier={tier} className="text-[10px] !py-0.5" />
                    <span>·</span>
                    {ageDays != null && <span>{_t('myListings.listedDays', { n: ageDays })}</span>}
                    {methods.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{methods.map((m) => _t(DELIVERY_LABEL_KEY[m] ?? m)).join(' / ')}</span>
                      </>
                    )}
                  </div>
                  {l.pendingPriceHKD && l.pendingPriceEffectiveAt && (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      {_t('myListings.pendingPrice', { price: l.pendingPriceHKD.toLocaleString('en-HK'), date: new Date(l.pendingPriceEffectiveAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK') })}
                    </div>
                  )}
                </div>

                <Pill variant={st.variant} size="md" className="hidden shrink-0 sm:inline-flex">
                  {_t(st.textKey)}
                </Pill>

                <div className="shrink-0 text-right">
                  {l.originalPriceHKD && l.originalPriceHKD > l.priceHKD ? (
                    <>
                      <div className="text-[16px] font-extrabold text-danger">{formatHKD(l.priceHKD)}</div>
                      <div className="text-[11px] text-neutral-text-hint line-through">{formatHKD(l.originalPriceHKD)}</div>
                    </>
                  ) : (
                    <div className="text-[16px] font-extrabold text-ink">{formatHKD(l.priceHKD)}</div>
                  )}
                </div>

                <div className="relative flex shrink-0 flex-col gap-1.5 sm:flex-row">
                  {(l.status === 'ACTIVE' || l.status === 'DRAFT') && (
                    <Link href={`/sell?edit=${l.id}` as any}>
                      <Button variant="ghost" size="sm">{_t('myListings.edit')}</Button>
                    </Link>
                  )}
                  {l.status === 'ACTIVE' && (l.images?.length ?? 0) > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setShareListing(l)}>{_t('myListings.share')}</Button>
                  )}
                  <Link href={`/listing/${l.id}`}>
                    <Button variant="ghost" size="sm">{_t('myListings.view')}</Button>
                  </Link>
                  {/* Soft delete（founder 2026-07-10）— ConfirmDialog v2 */}
                  {(l.status === 'ACTIVE' || l.status === 'DRAFT') && (
                    <Button variant="ghost" size="sm" className="!text-red-600 hover:!bg-red-50" onClick={() => setDeletePrompt(l.id)}>
                      {_t('myListings.delete')}
                    </Button>
                  )}
                  {/* REMOVED：自刪可還原；平台下架要搵客服 */}
                  {l.status === 'REMOVED' && (
                    l.removedByRole === 'ADMIN' ? (
                      <span className="self-center text-[11px] text-neutral-text-hint">{_t('myListings.removedByAdmin')}</span>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={actBusy === l.id} onClick={() => doRestore(l.id)}>
                        {actBusy === l.id ? '…' : _t('myListings.restore')}
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {shareListing && <ShareIgModal listing={shareListing} entry="my_listings" onClose={() => setShareListing(null)} />}

      {/* ConfirmDialog v2 — soft delete（可還原，T3） */}
      <ConfirmDialog
        open={!!deletePrompt}
        severity="danger"
        title={_t('myListings.deleteDialog.title')}
        description={deletePrompt ? listings.find((l) => l.id === deletePrompt)?.title : undefined}
        consequence={_t('myListings.removeConsequence')}
        confirmLabel={_t('myListings.deleteDialog.confirm')}
        busy={actBusy === deletePrompt}
        onConfirm={() => deletePrompt && doDelete(deletePrompt)}
        onCancel={() => setDeletePrompt(null)}
      />
    </div>
  );
}

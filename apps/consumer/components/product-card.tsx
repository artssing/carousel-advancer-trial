import Link from 'next/link';
import { TierPill } from '@authentik/ui';
import { formatHKD, tierForPrice, categoryByApiEnum } from '@authentik/utils';

/**
 * L3 Product card — the `.p-card` primitive from design-samples/final-L3.
 * Shared by home page grids + browse page results.
 *
 * Design contract:
 *   - `.p-card` — rounded-xl white bg + border-line + shadow-sh1
 *   - Hover — translateY(-2px) + shadow-sh3
 *   - `.ph` — aspect-square gradient placeholder (with brand watermark fallback)
 *   - Verify pill overlay top-left when tier === 3 (proxied for verified status)
 *   - `.body` — title 2-line clamp + optional meta line + row (price + tier pill)
 */

export interface ProductCardProps {
  listing: {
    id: string;
    title: string;
    priceHKD: number;
    category: string;
    brand?: string | null;
    coverUrl?: string | null;
    images?: string[];
    condition?: string | null;
    sellerDistrict?: string | null;
    /** Listing lifecycle — drives the corner ribbon (已預留 / 已售出). */
    status?: string | null;
  };
  /** Optional secondary line under the title (e.g. "九成新 · 尖沙咀"). */
  meta?: string;
}

/**
 * Top-left 45° corner ribbon. One coherent system, mutually exclusive, priority
 * SOLD > RESERVED > tier-3. Colours: 已售出 slate (dim, but card stays a link so
 * the buyer can still open the listing / seller profile), 已預留 amber, tier-3
 * brand green.
 *
 * NOTE: the tier-3 badge is NOT a verification claim — a listing is not
 * authenticated pre-sale (authentication happens per-order after purchase) and
 * there is no cert field on Listing. It reads 「必經鑑定」(Tier 3 = mandatory
 * authentication) to stay accurate + platform-neutral. Do NOT relabel it 「已驗證」.
 */
function CornerRibbon({ status, tier }: { status?: string | null; tier: 1 | 2 | 3 }) {
  let label: string | null = null;
  let cls = '';
  if (status === 'SOLD') {
    label = '已售出';
    cls = 'bg-slate-500';
  } else if (status === 'RESERVED') {
    label = '已預留';
    cls = 'bg-amber-500';
  } else if (tier === 3) {
    label = '必經鑑定';
    cls = 'bg-brand-600';
  }
  if (!label) return null;
  return (
    <span
      className={`pointer-events-none absolute -left-[42px] top-[18px] z-10 w-[150px] -rotate-45 py-1 text-center text-[11px] font-bold tracking-[0.06em] text-white shadow-md ${cls}`}
    >
      {label}
    </span>
  );
}

export function ProductCard({ listing: l, meta }: ProductCardProps) {
  const tier = tierForPrice(l.priceHKD) as 1 | 2 | 3;
  const cat = categoryByApiEnum(l.category);
  const cover = l.coverUrl ?? l.images?.[0] ?? null;
  const brandLabel = l.brand ?? cat?.shortLabel ?? '';
  const isSold = l.status === 'SOLD';
  return (
    <Link
      href={`/listing/${l.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sh1 transition duration-150 hover:-translate-y-0.5 hover:shadow-sh3"
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-[#eef1f5] to-[#e2e7ee]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={l.title}
            className={`absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${isSold ? 'opacity-55 grayscale-[35%]' : ''}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center font-display-serif text-[13px] font-bold uppercase tracking-[0.14em] text-[#9aa3b5]">
            {brandLabel}
          </div>
        )}
        <CornerRibbon status={l.status} tier={tier} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3.5">
        <h3 className="line-clamp-2 min-h-[2.6em] text-sm font-semibold leading-snug text-neutral-text">
          {l.title}
        </h3>
        <p className="text-xs text-neutral-text-hint">
          {meta ?? cat?.shortLabel ?? ''}
        </p>
        {/* 價錢 + tier 直度 stack：窄卡（mobile 2-col）一行放唔到會撞，
            stack 之後任何闊度都唔撞（founder 2026-07-20 mobile bug #2）。
            闊卡（≥ sm）先並排返一行。 */}
        <div className="mt-auto flex flex-col items-start gap-1 pt-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <span className="text-base font-extrabold text-ink">{formatHKD(l.priceHKD)}</span>
          <TierPill tier={tier} className="max-w-full shrink-0 text-[10px] !py-0.5" />
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sh1">
      <div className="skeleton aspect-square !rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-2/3" />
        <div className="skeleton h-5 w-1/3" />
      </div>
    </div>
  );
}

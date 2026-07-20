/**
 * Custom 404 — invalid / removed link landing page.
 *
 * Pattern reference: large C2C marketplaces (Carousell / Vinted / eBay) all
 * treat 404 as a re-engagement surface, not a dead end: friendly headline,
 * plain-language explanation of WHY the link may be broken, then route the
 * visitor straight back into browse via primary CTA + popular category
 * shortcuts. Categories derive from the SSOT helper (lesson #8) — never a
 * hardcoded parallel list.
 *
 * Server component on purpose: no client state needed, renders instantly.
 */
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { browseCategories } from '@authentik/utils';

export default function NotFound() {
  const cats = browseCategories().slice(0, 6);
  return (
    <div className="mx-auto flex max-w-container-l3 flex-col items-center px-4 py-20 text-center sm:px-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-2">
        <SearchX className="h-9 w-9 text-neutral-text-hint" strokeWidth={1.5} />
      </div>

      <div className="mt-6 font-mono text-[13px] uppercase tracking-[0.14em] text-neutral-text-hint">
        404 · Page not found
      </div>
      <h1 className="mt-3 font-display-serif text-[34px] font-bold leading-[1.15] tracking-[-0.01em] text-ink sm:text-[42px]">
        搵唔到呢個頁面
      </h1>
      <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-neutral-text-muted">
        條 link 可能打錯咗、商品已經落架，或者賣家已經移除咗呢個頁面。
        唔緊要 —— 好嘢仲有好多。
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/browse"
          className="rounded-lg bg-brand-600 px-7 py-3 text-sm font-semibold text-white shadow-sh2 hover:bg-brand-700"
        >
          瀏覽全部商品
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-line bg-white px-7 py-3 text-sm font-semibold text-ink shadow-sh1 hover:bg-surface-2"
        >
          返回首頁
        </Link>
      </div>

      <div className="mt-14 w-full max-w-[560px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">
          熱門品類
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          {cats.map((c) => (
            <Link
              key={c.id}
              href={`/browse?category=${c.id}`}
              className="rounded-full border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink shadow-sh1 hover:border-brand-600 hover:text-brand-700"
            >
              {c.emoji} {c.shortLabel}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

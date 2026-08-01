import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { ShareRedirect } from './redirect-client';
import { getOgListing, getSharePreview, listingMetadata } from '@/lib/listing-og';

/**
 * Social-share landing page. A shared Facebook/WhatsApp link points here so the
 * crawler reads the generated share card as og:image (see redirect-client.tsx
 * for why we can't server-redirect). Humans are bounced to the real listing.
 */
export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const share = await getSharePreview(params.id);
  if (!share) return {};
  const listing = await getOgListing(share.listingId);
  // The generated card replaces the listing photo — that's the whole point of
  // routing the share through /s/:id.
  const image = /^https?:\/\//.test(share.imageUrl) ? share.imageUrl : undefined;
  return listingMetadata(listing, image);
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const share = await getSharePreview(params.id);
  const listingHref = (
    share?.listingId
      ? `/listing/${share.listingId}?utm_source=social&utm_medium=share`
      : '/browse'
  ) as Route;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-1 px-6 text-center">
      <ShareRedirect href={listingHref} />
      <div className="text-[18px] font-extrabold tracking-[0.2em] text-ink">
        CERTI<span className="text-brand-600">·</span>FINE
      </div>
      <p className="text-sm text-neutral-text-hint">正在前往商品頁…</p>
      <Link href={listingHref} className="text-sm font-semibold text-brand-600 underline">
        如未自動跳轉，按此
      </Link>
    </main>
  );
}

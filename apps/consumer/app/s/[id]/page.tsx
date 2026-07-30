import type { Metadata } from 'next';
import Link from 'next/link';
import { ShareRedirect } from './redirect-client';

/**
 * Social-share landing page. A shared Facebook/WhatsApp link points here so the
 * crawler reads the generated collage as og:image (see redirect-client.tsx for
 * why we can't server-redirect). Humans are bounced to the real listing.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function getShare(id: string): Promise<{ id: string; imageUrl: string; listingId: string } | null> {
  try {
    const res = await fetch(`${API_URL}/share-previews/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getListing(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_URL}/listings/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const share = await getShare(params.id);
  if (!share) return {};
  const l = await getListing(share.listingId);

  const title = l?.title ? `${l.title} · Certifine` : 'Certifine';
  const price = typeof l?.priceHKD === 'number' ? `HK$${l.priceHKD.toLocaleString('en-HK')}` : '';
  const description = [price, l?.sellerDistrict, '香港認證二手交易平台'].filter(Boolean).join(' · ');
  const image = /^https?:\/\//.test(share.imageUrl) ? share.imageUrl : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Certifine',
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const share = await getShare(params.id);
  const listingHref = share?.listingId
    ? `/listing/${share.listingId}?utm_source=social&utm_medium=share`
    : '/browse';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-1 px-6 text-center">
      <ShareRedirect href={listingHref} />
      <div className="text-[18px] font-extrabold tracking-[0.2em] text-ink">
        CERTI<span className="text-brand-600">·</span>FINE
      </div>
      <p className="text-sm text-neutral-text-hint">正在前往商品頁…</p>
      <Link href={listingHref as any} className="text-sm font-semibold text-brand-600 underline">
        如未自動跳轉，按此
      </Link>
    </main>
  );
}

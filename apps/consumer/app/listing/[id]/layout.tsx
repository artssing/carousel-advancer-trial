import type { Metadata } from 'next';

/**
 * Server layout that wraps the (client) listing page purely to attach
 * per-listing OpenGraph / Twitter meta. This is what makes a shared listing
 * link render a rich card in Facebook / WhatsApp / Messenger / X — those
 * crawlers are logged-out, so the underlying GET /listings/:id must stay public
 * (it uses OptionalJwtAuthGuard). og:image needs an absolute, publicly
 * reachable URL — we only emit it when the first image is http(s).
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  try {
    const res = await fetch(`${API_URL}/listings/${params.id}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const l = await res.json();

    const title = l.title ? `${l.title} · Certifine` : 'Certifine';
    const price =
      typeof l.priceHKD === 'number' ? `HK$${l.priceHKD.toLocaleString('en-HK')}` : '';
    const description = [price, l.sellerDistrict, '香港認證二手交易平台']
      .filter(Boolean)
      .join(' · ');

    const first = Array.isArray(l.images) ? l.images[0] : undefined;
    const image = typeof first === 'string' && /^https?:\/\//.test(first) ? first : undefined;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        siteName: 'Certifine',
        images: image ? [{ url: image, width: 600, height: 600 }] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return {};
  }
}

export default function ListingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

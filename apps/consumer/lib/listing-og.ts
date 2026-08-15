import type { Metadata } from 'next';
import { formatHKD } from '@certifine/web-kit';

/**
 * SSOT for the OpenGraph / Twitter card of anything that represents a listing:
 * the listing page itself (`/listing/:id`) and the share landing page
 * (`/s/:id`, whose og:image is the generated share card instead).
 *
 * Server-side only — these run in `generateMetadata`, where the crawler is
 * logged out, so every fetch here must hit a public endpoint.
 *
 * Platform neutrality (CLAUDE.md): the description says what the platform DOES
 * (第三方鑑定) — never that this item has been authenticated. Any authenticity
 * claim belongs to a named authenticator, and a listing carries none pre-sale.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/** Only the fields the card actually renders. */
export interface OgListing {
  title?: string;
  priceHKD?: number;
  images?: unknown;
  sellerDistrict?: string | null;
}

async function getJson<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getOgListing = (id: string) => getJson<OgListing>(`/listings/${id}`, 300);

export const getSharePreview = (id: string) =>
  getJson<{ id: string; imageUrl: string; listingId: string }>(`/share-previews/${id}`, 60);

/** First listing photo, only if it's an absolute URL a crawler can fetch. */
export function firstAbsoluteImage(images: unknown): string | undefined {
  const first = Array.isArray(images) ? images[0] : undefined;
  return typeof first === 'string' && /^https?:\/\//.test(first) ? first : undefined;
}

/**
 * Build the shared card. `imageUrl` overrides the listing photo — that's how
 * `/s/:id` swaps in the generated 1.91:1 share card.
 */
export function listingMetadata(l: OgListing | null, imageUrl?: string): Metadata {
  const title = l?.title ? `${l.title} · Certifine` : 'Certifine';
  const price = typeof l?.priceHKD === 'number' ? formatHKD(l.priceHKD) : '';
  const description = [price, l?.sellerDistrict, '香港第三方鑑定二手平台']
    .filter(Boolean)
    .join(' · ');
  const image = imageUrl ?? firstAbsoluteImage(l?.images);

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

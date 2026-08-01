import type { Metadata } from 'next';
import { getOgListing, listingMetadata } from '@/lib/listing-og';

/**
 * Server layout that wraps the (client) listing page purely to attach
 * per-listing OpenGraph / Twitter meta. This is what makes a shared listing
 * link render a rich card in Facebook / WhatsApp / Messenger / X — those
 * crawlers are logged-out, so the underlying GET /listings/:id must stay public
 * (it uses OptionalJwtAuthGuard). Card shape lives in lib/listing-og.ts, shared
 * with the /s/:id share landing page.
 */
export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  return listingMetadata(await getOgListing(params.id));
}

export default function ListingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

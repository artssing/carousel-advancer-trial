'use client';

import { useEffect } from 'react';

/**
 * Client-side redirect for the /s/:id share page. We do NOT server-redirect —
 * a 307 would stop the og:image (the collage) from ever being served, and the
 * Facebook/WhatsApp crawler would follow it to the listing and read that page's
 * meta instead. Crawlers don't run JS, so they read the og tags here; humans get
 * bounced to the listing by this effect.
 */
export function ShareRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return null;
}

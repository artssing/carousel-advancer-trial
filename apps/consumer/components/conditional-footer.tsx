'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './footer';

/** Hide the global Footer on app-like pages (e.g. /messages) where its
 *  presence forces a body scroll. Normal content pages keep the Footer. */
const HIDDEN_ON: string[] = ['/messages'];

export function ConditionalFooter() {
  const pathname = usePathname() ?? '';
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }
  return <Footer />;
}

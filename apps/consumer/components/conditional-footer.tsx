'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './footer';

/** Hide the global Footer on app-like pages (e.g. /messages) where its
 *  presence forces a body scroll. Auth pages (/login /register) also skip it
 *  — they're focused single-viewport flows w/ their own bottom accent, and
 *  having a full footer below the navy hero creates an ugly gap at scroll. */
const HIDDEN_ON: string[] = ['/messages', '/login', '/register'];

export function ConditionalFooter() {
  const pathname = usePathname() ?? '';
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }
  return <Footer />;
}

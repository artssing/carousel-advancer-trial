'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * L3 sticky chrome controller with hide-on-scroll-down / show-on-scroll-up.
 *
 * Layout:
 *   - Banner is sticky top:0, ALWAYS visible when in view (never hides).
 *     Reason: CRITICAL banners are the whole point of the banner system —
 *     hiding them on scroll would defeat their purpose.
 *   - Nav is sticky top:var(--banner-h), transform-translates up when the user
 *     scrolls down past a threshold, transforms back when they scroll up.
 *     Because the wrapping <BannerBar> has z-40 and the nav has z-30, the nav
 *     slides visually behind the banner (banner covers any overlap).
 *
 * CSS vars written:
 *   - `--banner-h` = current banner height (drives nav's sticky top).
 *   - `--chrome-h` = currently-visible chrome height. When nav is shown,
 *     bannerH + navH; when hidden, bannerH only. Sticky sub-rails on inner
 *     pages read this via `top-[calc(var(--chrome-h)+16px)]` so they slide
 *     UP smoothly when the nav hides — the "最美觀" behaviour.
 *
 * Known caveat: TopNav's mobile hamburger drawer is `fixed inset-0 z-50`
 * INSIDE the nav container, so a CSS transform on the container makes the
 * drawer's `fixed` positioning relative to the transformed ancestor rather
 * than the viewport. In practice this is invisible to the user because the
 * drawer covers the entire viewport regardless, and the user isn't scrolling
 * while the drawer is open. If it ever surfaces, portal the drawer to
 * document.body.
 */
const HIDE_THRESHOLD_PX = 8;   // min downward delta before hiding nav
const SHOW_THRESHOLD_PX = 6;   // min upward delta before re-showing
const PIN_ZONE_PX = 12;        // near top: always show

interface Props {
  banner: React.ReactNode;
  nav: React.ReactNode;
}

export function ChromeHeightObserver({ banner, nav }: Props) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [navHidden, setNavHidden] = useState(false);

  const bannerH = useRef(0);
  const navH = useRef(0);
  const lastY = useRef(0);
  const ticking = useRef(false);

  function writeChromeHVar(hiddenNow: boolean) {
    const total = bannerH.current + (hiddenNow ? 0 : navH.current);
    document.documentElement.style.setProperty('--chrome-h', `${Math.round(total)}px`);
  }

  // Measure banner + nav heights, keep CSS vars in sync.
  useEffect(() => {
    function measure() {
      const bh = bannerRef.current?.getBoundingClientRect().height ?? 0;
      const nh = navRef.current?.getBoundingClientRect().height ?? 0;
      bannerH.current = bh;
      navH.current = nh;
      document.documentElement.style.setProperty('--banner-h', `${Math.round(bh)}px`);
      writeChromeHVar(navHidden);
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (bannerRef.current) ro.observe(bannerRef.current);
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
    // navHidden intentionally omitted — the separate effect below re-writes
    // chrome-h whenever it flips, and re-measuring is height-driven only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-write chrome-h whenever nav visibility flips (independent of measure).
  useEffect(() => {
    writeChromeHVar(navHidden);
  }, [navHidden]);

  // Scroll direction listener → toggle navHidden.
  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        // Near page top: always pin nav (avoid flicker at the boundary).
        if (y < bannerH.current + navH.current + PIN_ZONE_PX) {
          setNavHidden(false);
        } else if (dy > HIDE_THRESHOLD_PX) {
          setNavHidden(true);
        } else if (dy < -SHOW_THRESHOLD_PX) {
          setNavHidden(false);
        }
        lastY.current = y;
        ticking.current = false;
      });
    }
    lastY.current = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div ref={bannerRef} className="sticky top-0 z-40">
        {banner}
      </div>
      <div
        ref={navRef}
        className={`sticky top-[var(--banner-h,0px)] z-30 transition-transform duration-300 ease-out will-change-transform ${
          navHidden ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        {nav}
      </div>
    </>
  );
}

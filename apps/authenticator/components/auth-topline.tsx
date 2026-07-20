'use client';

import type { ReactNode } from 'react';

/**
 * L3 sticky page header for the 鑑定師 Portal main pane.
 * Source: design-samples/authenticator-L3/theme.css `.topline`.
 *
 * Each page renders <AuthTopline title="..." subtitle="..." action={...} />
 * at the top of its content. It sticks to the top of the main scroll area
 * with a translucent white background + backdrop blur.
 */
interface Props {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function AuthTopline({ title, subtitle, action }: Props) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-white/90 px-6 py-5 backdrop-blur-[10px] md:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] font-bold leading-tight tracking-[-0.01em] text-authBrand-900 md:text-[28px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-neutral-text-hint">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Standard main-pane content wrapper for authenticator pages.
 * Matches `.content` from theme.css (padding + max width).
 */
export function AuthContent({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[1080px] px-6 pb-16 pt-6 md:px-8">
      {children}
    </div>
  );
}

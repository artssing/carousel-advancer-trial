import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * L3 Pill base component — small rounded label used for status, tier,
 * verify signal, gold accent, and buyer/seller declared metadata.
 *
 * Extracted from the original TierPill (see components/tier-pill.tsx) so
 * that all four L3 pill variants (verify / gold / tier / status) share a
 * single sizing + typography contract. Callers that need Tier-specific
 * label + icon should keep using TierPill (which is now a preset of Pill).
 *
 * L3 spec: 11px letter-spaced uppercase, 5px 11px padding, 999px radius,
 * 1px border with variant-specific soft bg.
 */

export const pillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-[0.05em]',
  {
    variants: {
      variant: {
        verify: 'border-verify-border bg-verify-soft text-verify',
        gold: 'border-[#ecdcba] bg-[#f6efe0] text-gold',
        tier: 'border-line-2 bg-surface-2 text-neutral-text-muted',
        status: 'border-[#d5e0ec] bg-[#eef3f8] text-ink',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-[11px] py-[5px] text-[11px]',
      },
    },
    defaultVariants: {
      variant: 'tier',
      size: 'md',
    },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {}

export function Pill({ className, variant, size, ...props }: PillProps) {
  return <span className={cn(pillVariants({ variant, size }), className)} {...props} />;
}

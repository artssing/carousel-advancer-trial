import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * L3 Chip — removable filter tag. Used on browse page above the results
 * to show applied filters ("品類：名牌手袋 ✕"). Distinct from Pill: the
 * chip is interactive (removable) and always carries a close affordance.
 *
 * L3 spec: 12px semibold, verify-soft bg, verify-border, 999px radius.
 * If interactive, X icon on the right calls onRemove.
 */
export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
  /** Removal button aria-label, e.g. `移除 品類：名牌手袋`. */
  removeLabel?: string;
}

export function Chip({ className, onRemove, removeLabel, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-verify-border bg-verify-soft px-3 py-1 text-xs font-semibold text-verify',
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 rounded-full p-0.5 text-neutral-text-hint transition hover:bg-black/5 hover:text-verify"
          aria-label={removeLabel ?? '移除'}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

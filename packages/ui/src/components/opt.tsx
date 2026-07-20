import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * L3 Opt — selectable option card (radio-style) used across sell / checkout
 * forms. Matches design-samples/final-L3/theme.css .opt pattern:
 *  - Row layout: dot + title + description
 *  - Selected: verify-soft bg, action-coloured dot with inner white ring
 *  - Shadow-sh1 by default, hover raises border to line-2
 *
 * Fully controlled — parent owns the `selected` boolean and calls onSelect.
 * Renders as a &lt;button&gt; so keyboard / touch semantics are correct
 * (radio-like exclusive selection is up to the parent).
 */
export interface OptProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect' | 'title'> {
  selected: boolean;
  onSelect: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
}

export function Opt({
  selected,
  onSelect,
  title,
  description,
  className,
  ...props
}: OptProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border bg-white p-4 text-left shadow-sh1 transition',
        selected
          ? 'border-verify bg-verify-soft'
          : 'border-line hover:border-line-2',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 rounded-full border-[1.5px] transition',
          selected
            ? 'border-verify bg-verify shadow-[inset_0_0_0_3px_#fff]'
            : 'border-line-2',
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-neutral-text">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-neutral-text-hint">{description}</span>
        )}
      </span>
    </button>
  );
}

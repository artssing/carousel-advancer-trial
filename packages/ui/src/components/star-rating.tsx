import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '../lib/cn';

export interface StarRatingProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showValue?: boolean;
}

const sizeMap = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

/**
 * Founder ruling 2026-06-21: partial-fill嘅 star — e.g. 4.8 顯示頭 4 顆 100% 填滿
 * + 第 5 顆由左至右填 80%、右邊 20% 留白。
 *
 * Renders two overlapping Star icons per slot:
 *   - base layer: outline (slate-300)
 *   - overlay layer: filled (yellow-400), wrapped in a div with width = fill%
 *     and overflow-hidden — so the partial chunk is precisely cropped.
 */
export function StarRating({
  value,
  max = 5,
  size = 'md',
  className,
  showValue = false,
}: StarRatingProps) {
  const sizeClass = sizeMap[size];
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: max }, (_, i) => {
        const fillPct = Math.max(0, Math.min(1, value - i)) * 100;
        return (
          <span key={i} className={cn('relative inline-block', sizeClass)}>
            <Star className={cn(sizeClass, 'fill-none text-slate-300')} />
            {fillPct > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fillPct}%` }}
                aria-hidden="true"
              >
                <Star className={cn(sizeClass, 'fill-yellow-400 text-yellow-400')} />
              </span>
            )}
          </span>
        );
      })}
      {showValue && <span className="ml-1 text-xs text-slate-600">{value.toFixed(1)}</span>}
    </span>
  );
}

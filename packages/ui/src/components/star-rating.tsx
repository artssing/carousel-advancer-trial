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

export function StarRating({
  value,
  max = 5,
  size = 'md',
  className,
  showValue = false,
}: StarRatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i < Math.round(value));
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {stars.map((filled, i) => (
        <Star
          key={i}
          className={cn(
            sizeMap[size],
            filled ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-slate-300',
          )}
        />
      ))}
      {showValue && <span className="ml-1 text-xs text-slate-600">{value.toFixed(1)}</span>}
    </span>
  );
}

import * as React from 'react';
import { useState } from 'react';
import { cn } from '../lib/cn';

/**
 * Listing image thumbnail with branded gradient placeholder.
 *
 * Founder ruling 2026-06-21: 「customer 冇圖片時，應該要顯示一個更好睇既圖片／
 * background color，而唔係白色」. This component is the SSOT for that fallback;
 * use everywhere (browse card, orders list, my-listings, conversation drawer,
 * order detail, seller/auth profile) instead of inline `<div bg-slate-100>📦</div>`.
 *
 * Behaviour:
 *   - If `src` provided → render <img object-cover>
 *   - Otherwise → branded gradient + large category emoji centered
 *
 * Note: forward-going sell flow now enforces image/video required, so the
 * placeholder mostly serves legacy listings and edge states.
 */
export interface ListingThumbProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  /** Category emoji (default 📦). Use `categoryById(cat)?.emoji` from @authentik/utils. */
  emoji?: string;
  /** Tailwind classes for the outer wrapper (controls aspect / radius / size). */
  className?: string;
  /** Tailwind classes applied to inner `<img>` when src present. */
  imgClassName?: string;
  loading?: 'eager' | 'lazy';
}

export function ListingThumb({
  src,
  alt = '',
  emoji = '📦',
  className,
  imgClassName,
  loading = 'lazy',
  ...rest
}: ListingThumbProps) {
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <div className={cn('overflow-hidden bg-slate-100', className)} {...rest}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading={loading}
          className={cn('h-full w-full object-cover', imgClassName)}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }
  // Branded placeholder — soft brand/slate gradient + ring + centered emoji
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden',
        'bg-gradient-to-br from-brand-50 via-slate-100 to-brand-100',
        'ring-1 ring-inset ring-slate-200',
        className,
      )}
      role="img"
      aria-label={alt || '未提供商品圖片'}
      {...rest}
    >
      <span className="select-none text-4xl opacity-60 sm:text-5xl">{emoji}</span>
    </div>
  );
}

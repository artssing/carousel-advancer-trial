import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-[0_8px_20px_-10px_rgba(0,135,102,0.5)]',
        secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
        outline: 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-900',
        // L3 ghost — white card-like button with subtle shadow (distinct from `outline`
        // which is a flat white/slate). Matches design-samples/final-L3/theme.css .btn-ghost.
        ghost: 'border border-line-2 bg-white text-neutral-text hover:border-brand-600 hover:text-brand-600 shadow-sh1',
        // L3 navy — ink primary for secondary hero CTA and admin-adjacent flows.
        navy: 'bg-ink text-white hover:bg-ink-700 shadow-[0_8px_20px_-10px_rgba(10,37,64,0.5)]',
        danger: 'bg-trust-red text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

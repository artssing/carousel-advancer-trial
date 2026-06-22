'use client';

/** Vertical accordion picker — replaces horizontal tabs.
 *  Each method renders as a tappable row; the selected row expands inline
 *  to show the method's body (card form / wallet QR / etc.).
 *  Booking.com / Trip.com default pattern. */
import type { ReactNode } from 'react';
import { PAYMENT_METHODS, type PaymentMethodId } from '@/lib/payment-methods';

interface Props {
  active: PaymentMethodId;
  onChange: (id: PaymentMethodId) => void;
  /** Body to render inside the active row (caller's responsibility). */
  renderBody: (id: PaymentMethodId) => ReactNode;
}

export function MethodAccordion({ active, onChange, renderBody }: Props) {
  return (
    <ol className="space-y-2">
      {PAYMENT_METHODS.map((m) => {
        const isActive = m.id === active;
        return (
          <li
            key={m.id}
            className={`overflow-hidden rounded-xl border transition ${
              isActive
                ? 'border-brand-500 bg-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            {/* Row header — radio + icon + label + tagline + chevron */}
            <button
              type="button"
              onClick={() => onChange(m.id)}
              aria-pressed={isActive}
              aria-expanded={isActive}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              {/* Radio dot */}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  isActive ? 'border-brand-600' : 'border-slate-300'
                }`}
              >
                {isActive && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
              </span>

              {/* Icon + label + tagline */}
              <span className="flex flex-1 items-center gap-2 min-w-0">
                <span className="text-xl">{m.icon}</span>
                <span className="flex flex-col min-w-0">
                  <span
                    className={`text-sm font-medium ${
                      isActive ? 'text-brand-800' : 'text-slate-800'
                    }`}
                  >
                    {m.label}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">{m.tagline}</span>
                </span>
              </span>

              {/* Chevron */}
              <span
                className={`shrink-0 text-xs transition-transform ${
                  isActive ? 'rotate-180 text-brand-600' : 'text-slate-400'
                }`}
                aria-hidden
              >
                ▾
              </span>
            </button>

            {/* Inline body — only rendered when active */}
            {isActive && (
              <div className="border-t border-slate-100 bg-slate-50/30 p-4">
                {renderBody(m.id)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

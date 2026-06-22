'use client';

/** Slim amber banner shown when STRIPE_MODE=mock. Disclosure expands to show
 *  test card numbers for manual QA. Hidden in test/live mode. */
import { useState } from 'react';
import { TEST_CARDS } from '@/lib/payment-methods';

export function TestModeBanner({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false);
  if (!visible) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-900">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span>🧪</span>
          <span>測試模式 — 輸入下方測試卡號模擬付款</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[10px] font-medium underline-offset-2 hover:underline"
        >
          {open ? '收起' : '查看測試卡號'}
        </button>
      </div>
      {open && (
        <div className="border-t border-amber-200 px-3 py-2 font-mono text-[11px]">
          <table className="w-full">
            <tbody>
              {TEST_CARDS.map((c) => (
                <tr key={c.number} className="border-b border-amber-100 last:border-0">
                  <td className="py-1 pr-3">{c.number.replace(/(\d{4})(?=\d)/g, '$1 ')}</td>
                  <td className="py-1 text-amber-800">{c.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

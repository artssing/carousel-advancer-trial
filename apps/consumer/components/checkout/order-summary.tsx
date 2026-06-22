'use client';

/** Sticky order summary sidebar (desktop) / collapsible pill (mobile).
 *  All amounts read from server-computed Order.totals (lesson — never recompute). */
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { formatHKD } from '@authentik/utils';

interface Props {
  order: any;
  amountHKD: number;
  isHold: boolean;
}

export function OrderSummary({ order, amountHKD, isHold }: Props) {
  const [openMobile, setOpenMobile] = useState(false);
  return (
    <>
      {/* Mobile collapsed pill (visible < md) */}
      <button
        type="button"
        onClick={() => setOpenMobile((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:hidden"
        aria-expanded={openMobile}
      >
        <span className="font-medium text-slate-700">你支付</span>
        <span className="flex items-center gap-1">
          <span className="text-lg font-bold text-brand-700">{formatHKD(amountHKD)}</span>
          <span className="text-xs text-slate-400">{openMobile ? '▴' : '▾'}</span>
        </span>
      </button>
      {openMobile && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-xs md:hidden">
          <Breakdown order={order} amountHKD={amountHKD} isHold={isHold} />
        </div>
      )}

      {/* Desktop sticky sidebar (visible ≥ md) */}
      <aside className="hidden md:block md:sticky md:top-4 md:w-80 md:shrink-0">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">訂單摘要</h3>
          <Breakdown order={order} amountHKD={amountHKD} isHold={isHold} />
        </div>
      </aside>
    </>
  );
}

function Breakdown({ order, amountHKD, isHold }: Props) {
  return (
    <>
      <div className="space-y-2">
        <Row label="商品價格" value={formatHKD(order.salePriceHKD)} />
        {order.authFeeHKD > 0 && (
          <Row
            label={`鑑定費${order.authenticator?.displayName ? `（${order.authenticator.displayName}）` : ''}`}
            value={formatHKD(order.authFeeHKD)}
          />
        )}
        <Row label="平台費（1.5%）" value={formatHKD(order.platformFeeHKD)} />
      </div>
      <hr className="my-3 border-slate-200" />
      <div className="flex items-baseline justify-between">
        <span className="text-base font-semibold text-slate-800">你支付</span>
        <span className="text-xl font-bold text-brand-700">{formatHKD(amountHKD)}</span>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 p-2 text-[11px] text-slate-600">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <p>
          {isHold
            ? '平台 hold 信用卡，鑑定通過 / 交收完成先正式扣款。取消會自動釋放，1-5 日內銀行帳單消失。'
            : 'Tier 1 訂單即時扣款。如取消會 refund，銀行 5-10 個工作天入賬。'}
        </p>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

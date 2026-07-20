'use client';

/** L3 Order summary — sticky right-column .card-glow with fee breakdown.
 *  All amounts read from server-computed Order.totals (lesson — never recompute). */
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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
        className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-sh1 md:hidden"
        aria-expanded={openMobile}
      >
        <span className="font-medium text-neutral-text">應付總額</span>
        <span className="flex items-center gap-1.5">
          <span className="text-[20px] font-extrabold text-brand-700">{formatHKD(amountHKD)}</span>
          <span className="text-xs text-neutral-text-hint">{openMobile ? '▴' : '▾'}</span>
        </span>
      </button>
      {openMobile && (
        <div className="mb-3 mt-2 rounded-xl border border-line bg-white p-4 shadow-sh1 md:hidden">
          <Breakdown order={order} amountHKD={amountHKD} isHold={isHold} />
        </div>
      )}

      {/* Desktop sticky sidebar (visible ≥ md) — L3 card-glow */}
      <aside className="chrome-follow hidden md:sticky md:top-[calc(var(--chrome-h)+16px)] md:block md:w-[380px] md:shrink-0">
        <div className="rounded-xl border border-verify-border bg-white p-6 shadow-[0_12px_30px_-16px_rgba(0,135,102,0.4)]">
          <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
            費用明細
          </div>
          <Breakdown order={order} amountHKD={amountHKD} isHold={isHold} />
        </div>
      </aside>
    </>
  );
}

function Breakdown({ order, amountHKD, isHold }: Props) {
  return (
    <>
      <div className="flex flex-col">
        <Row label="貨品價格" value={formatHKD(order.salePriceHKD)} />
        {order.authFeeHKD > 0 && (
          <Row
            label="鑑定費"
            hint={order.authenticator?.displayName ?? undefined}
            value={formatHKD(order.authFeeHKD)}
          />
        )}
        <Row label="平台服務費" hint="1.5%" value={formatHKD(order.platformFeeHKD)} />
      </div>
      <hr className="my-3 border-t border-line" />
      <div className="flex items-baseline justify-between font-semibold">
        <span className="text-[15px] text-neutral-text">應付總額</span>
        <span className="text-[24px] font-extrabold text-brand-700">{formatHKD(amountHKD)}</span>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-verify-border bg-verify-soft/70 px-3 py-2.5 text-[12px] leading-relaxed text-verify">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {isHold
            ? '款項受平台託管保障，鑑定通過並完成交收前不會放款予賣家；鑑定不通過可全額退款。'
            : 'Tier 1 訂單即時扣款。如取消會 refund，銀行 5–10 個工作天入賬。'}
        </p>
      </div>
    </>
  );
}

function Row({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-2 text-[14px]">
      <span className="text-neutral-text-muted">
        {label}
        {hint && (
          <span className="mt-0.5 block text-[11px] text-neutral-text-hint">{hint}</span>
        )}
      </span>
      <span className="text-neutral-text">{value}</span>
    </div>
  );
}

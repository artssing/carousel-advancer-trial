'use client';

import { PAYOUT_STATUS_META, type PayoutStatusKey } from '@authentik/utils';

export function StatusPill({ status }: { status: PayoutStatusKey | string }) {
  const meta = PAYOUT_STATUS_META[status as PayoutStatusKey] ?? { label: status, tone: 'slate' as const };
  const toneCls: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneCls[meta.tone]}`}>
      {meta.label}
    </span>
  );
}

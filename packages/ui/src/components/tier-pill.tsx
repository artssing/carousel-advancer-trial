'use client';

import * as React from 'react';
import { ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { createT, getClientLocale, type TLocale } from '@certifine/web-kit';
import { cn } from '../lib/cn';

export type AuthenticationTier = 1 | 2 | 3;

const tierConfig: Record<
  AuthenticationTier,
  { label: string; band: string; descriptionKey: string; classes: string; icon: React.ComponentType<{ className?: string }> }
> = {
  1: {
    label: 'Tier 1 · Match-only',
    band: '< HKD 1,000',
    descriptionKey: 'ui.tierPill.tier1.description',
    classes: 'bg-slate-100 text-slate-700 ring-slate-200',
    icon: Shield,
  },
  2: {
    label: 'Tier 2 · Optional Auth',
    band: 'HKD 1,000–10,000',
    descriptionKey: 'ui.tierPill.tier2.description',
    classes: 'bg-amber-50 text-amber-800 ring-amber-200',
    icon: ShieldAlert,
  },
  3: {
    // NOT "Verified" (founder 2026-08-02): the pill names the tier's RULE, like
    // the other two — nothing about a listing is authenticated before it sells,
    // so a per-item "Verified" would be the platform asserting authenticity.
    label: 'Tier 3 · Mandatory Auth',
    band: '> HKD 10,000',
    descriptionKey: 'ui.tierPill.tier3.description',
    classes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    icon: ShieldCheck,
  },
};

export interface TierPillProps {
  tier: AuthenticationTier;
  showDescription?: boolean;
  className?: string;
}

export function TierPill({ tier, showDescription = false, className }: TierPillProps) {
  // The price band is data and reads the same in both locales; only the rule
  // word ('純撮合' / 'Matchmaking only') is copy. `ui.tierPill.*` existed in
  // the SSOT with no consumer — QA IN-03 found this rendering Chinese on an
  // otherwise-English listing page.
  const [locale, setLocale] = React.useState<TLocale>('zh');
  React.useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const cfg = tierConfig[tier];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        cfg.classes,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{cfg.label}</span>
      {showDescription && <span className="text-[10px] opacity-75">· {cfg.band} · {_t(cfg.descriptionKey)}</span>}
    </span>
  );
}

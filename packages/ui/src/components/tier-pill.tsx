import * as React from 'react';
import { ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { cn } from '../lib/cn';

export type AuthenticationTier = 1 | 2 | 3;

const tierConfig: Record<
  AuthenticationTier,
  { label: string; description: string; classes: string; icon: React.ComponentType<{ className?: string }> }
> = {
  1: {
    label: 'Tier 1 · Match-only',
    description: '< HKD 1,000 · 純撮合',
    classes: 'bg-slate-100 text-slate-700 ring-slate-200',
    icon: Shield,
  },
  2: {
    label: 'Tier 2 · Optional Auth',
    description: 'HKD 1,000–10,000 · 可選鑑定',
    classes: 'bg-amber-50 text-amber-800 ring-amber-200',
    icon: ShieldAlert,
  },
  3: {
    label: 'Tier 3 · Verified',
    description: '> HKD 10,000 · 強制鑑定',
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
      {showDescription && <span className="text-[10px] opacity-75">· {cfg.description}</span>}
    </span>
  );
}

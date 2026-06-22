'use client';

/** Three-icon trust strip. Platform-neutral copy: no "Authentik 保證" /
 *  "我哋認證" — rephrase to facts user can verify. */
import { Lock, ShieldCheck, Clock } from 'lucide-react';

export function TrustStrip() {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-[10px] text-slate-600 sm:text-[11px]">
      <Item icon={<Lock className="h-3.5 w-3.5 text-emerald-600" />} text="SSL 加密傳輸" />
      <Item icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />} text="第三方鑑定師核實" />
      <Item icon={<Clock className="h-3.5 w-3.5 text-emerald-600" />} text="平台 escrow 保管" />
    </div>
  );
}

function Item({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      {icon}
      <span>{text}</span>
    </div>
  );
}

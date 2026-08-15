'use client';

/** Three-icon trust strip. Platform-neutral copy: no "Certifine 保證" /
 *  "我哋認證" — rephrase to facts user can verify. */
import { useEffect, useState } from 'react';
import { Lock, ShieldCheck, Clock } from 'lucide-react';
import { getClientLocale, createT } from '@certifine/web-kit';

export function TrustStrip() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-[10px] text-slate-600 sm:text-[11px]">
      <Item icon={<Lock className="h-3.5 w-3.5 text-emerald-600" />} text={_t('checkout.trust.ssl')} />
      <Item icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />} text={_t('checkout.trust.namedAuthenticator')} />
      <Item icon={<Clock className="h-3.5 w-3.5 text-emerald-600" />} text={_t('checkout.trust.escrow')} />
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

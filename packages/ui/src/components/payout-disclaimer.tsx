'use client';

import React, { useEffect, useState } from 'react';
import { createT, getClientLocale, type TLocale } from '@certifine/web-kit';

/**
 * 平台中立提款 disclaimer — 任何 cashout 相關 view 必須出。
 * 唔可以各 page 自寫 (lesson #8 SSOT)，唔可以承諾「即日到帳」(L'Oréal v eBay)。
 *
 * Copy lives in `ui.payoutDisclaimer.text`. The key already existed; this
 * component just never read it, so all three wallet screens rendered Chinese
 * to English readers even though each page held zero Chinese literals of its
 * own — found by QA case IN-03 on 2026-08-10.
 */
export function PayoutDisclaimer({ className = '' }: { className?: string }) {
  const [locale, setLocale] = useState<TLocale>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  return (
    <p className={`rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 ${className}`}>
      {_t('ui.payoutDisclaimer.text')}
    </p>
  );
}

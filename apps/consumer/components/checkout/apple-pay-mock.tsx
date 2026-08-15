'use client';

/** Mock Apple Pay button — native pill style. Mock-only: shows fake
 *  "Touch ID 驗證中…" spinner 2s then onResolve('success'). Dev toggle for fail. */
import { useEffect, useState } from 'react';
import { getClientLocale, createT } from '@certifine/web-kit';
import { Button } from '@certifine/ui';

interface Props {
  onResolve: (outcome: 'success' | 'fail') => void;
  busy: boolean;
}

export function ApplePayMock({ onResolve, busy }: Props) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const [phase, setPhase] = useState<'idle' | 'verifying'>('idle');

  function startMock(outcome: 'success' | 'fail') {
    setPhase('verifying');
    setTimeout(() => {
      setPhase('idle');
      onResolve(outcome);
    }, 1500);
  }

  return (
    <div className="rounded-xl border border-slate-900 bg-black p-4 text-white">
      <p className="text-sm font-medium"> Pay</p>
      <p className="mt-1 text-[11px] text-white/70">
        {_t('checkout.applePay.notice')}
      </p>

      {phase === 'verifying' ? (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-sm">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {_t('checkout.applePay.verifying')}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => startMock('success')}
            className="border-white/30 text-white hover:bg-white/10"
          >
            {_t('checkout.wallet.mockSuccess')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => startMock('fail')}
            className="border-white/30 text-white hover:bg-white/10"
          >
            {_t('checkout.wallet.mockFail')}
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';

/** Wallet flow panel (Alipay HK / WeChat Pay HK / FPS) — fake QR + countdown.
 *  Mock-only: emits onResolve('success' | 'fail') when user taps the dev
 *  buttons or after auto-resolve timer expires. */
import { useEffect, useState } from 'react';
import { Button } from '@authentik/ui';
import { getClientLocale, createT } from '@authentik/utils';
import type { PaymentMethodId } from '@/lib/payment-methods';

interface Props {
  method: PaymentMethodId;          // ALIPAY_HK / WECHAT_HK / FPS
  amountHKD: number;
  onResolve: (outcome: 'success' | 'fail') => void;
  busy: boolean;
}

// instructionKey, not text — this map is module scope.
const METHOD_COPY: Record<string, { name?: string; nameKey?: string; instructionKey: string; brandColor: string }> = {
  ALIPAY_HK: {
    name: 'Alipay HK',
    instructionKey: 'checkout.wallet.alipayInstruction',
    brandColor: 'bg-blue-50 border-blue-300 text-blue-900',
  },
  WECHAT_HK: {
    name: 'WeChat Pay HK',
    instructionKey: 'checkout.wallet.wechatInstruction',
    brandColor: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  },
  FPS: {
    nameKey: 'checkout.method.fps',
    instructionKey: 'checkout.wallet.fpsInstruction',
    brandColor: 'bg-amber-50 border-amber-300 text-amber-900',
  },
};

export function WalletPanel({ method, amountHKD, onResolve, busy }: Props) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const copy = METHOD_COPY[method] ?? METHOD_COPY.ALIPAY_HK;
  const [seconds, setSeconds] = useState(300);   // 5-min fake expiry

  useEffect(() => {
    if (busy) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');

  return (
    <div className={`rounded-xl border p-4 ${copy!.brandColor}`}>
      <p className="text-sm font-semibold">{copy!.nameKey ? _t(copy!.nameKey) : copy!.name}</p>
      <div className="my-3 flex items-center justify-center">
        {/* Placeholder QR — diagonal pattern, ~160px square */}
        <div
          aria-label="QR code (mock)"
          className="grid h-40 w-40 grid-cols-12 grid-rows-12 overflow-hidden rounded-md border border-slate-300 bg-white"
        >
          {Array.from({ length: 144 }).map((_, i) => (
            <span
              key={i}
              className={(i * 7 + Math.floor(i / 13)) % 3 === 0 ? 'bg-slate-900' : ''}
            />
          ))}
        </div>
      </div>
      <p className="text-center text-xs">{_t(copy!.instructionKey)}</p>
      <p className="mt-1 text-center text-[11px] opacity-70">
        {_t('checkout.wallet.amountLine', { amount: amountHKD.toLocaleString(), mm, ss })}
      </p>

      {busy ? (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {_t('checkout.wallet.waiting')}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-current/20 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve('success')}
          >
            {_t('checkout.wallet.mockSuccess')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve('fail')}
          >
            {_t('checkout.wallet.mockFail')}
          </Button>
        </div>
      )}
      <p className="mt-2 text-center text-[9px] opacity-60">
        {_t('checkout.wallet.mockNotice')}
      </p>
    </div>
  );
}

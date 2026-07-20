'use client';

/** Wallet flow panel (Alipay HK / WeChat Pay HK / FPS) — fake QR + countdown.
 *  Mock-only: emits onResolve('success' | 'fail') when user taps the dev
 *  buttons or after auto-resolve timer expires. */
import { useEffect, useState } from 'react';
import { Button } from '@authentik/ui';
import type { PaymentMethodId } from '@/lib/payment-methods';

interface Props {
  method: PaymentMethodId;          // ALIPAY_HK / WECHAT_HK / FPS
  amountHKD: number;
  onResolve: (outcome: 'success' | 'fail') => void;
  busy: boolean;
}

const METHOD_COPY: Record<string, { name: string; instruction: string; brandColor: string }> = {
  ALIPAY_HK: {
    name: 'Alipay HK',
    instruction: '請喺 Alipay HK app 掃描上方 QR code 確認付款',
    brandColor: 'bg-blue-50 border-blue-300 text-blue-900',
  },
  WECHAT_HK: {
    name: 'WeChat Pay HK',
    instruction: '請喺 WeChat app 掃描上方 QR code 確認付款',
    brandColor: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  },
  FPS: {
    name: 'FPS 轉數快',
    instruction: '請開啟你嘅銀行 app → 轉數快 → 掃描 QR code（收款人：Certifine Escrow）',
    brandColor: 'bg-amber-50 border-amber-300 text-amber-900',
  },
};

export function WalletPanel({ method, amountHKD, onResolve, busy }: Props) {
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
      <p className="text-sm font-semibold">{copy!.name}</p>
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
      <p className="text-center text-xs">{copy!.instruction}</p>
      <p className="mt-1 text-center text-[11px] opacity-70">
        金額：HK${amountHKD.toLocaleString()} · 有效期 {mm}:{ss}
      </p>

      {busy ? (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          等待確認中…
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-current/20 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve('success')}
          >
            🧪 模擬成功
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve('fail')}
          >
            🧪 模擬失敗
          </Button>
        </div>
      )}
      <p className="mt-2 text-center text-[9px] opacity-60">
        Mock 模式：dev 按掣模擬 wallet 回覆 · 真實環境會 redirect 去 wallet app
      </p>
    </div>
  );
}

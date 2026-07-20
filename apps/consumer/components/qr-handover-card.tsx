'use client';

/**
 * Ack v2 QR 交收卡（founder 2026-07-10）。
 * 買家取貨（BUYER_PICKUP）/ 賣家到店交貨（SELLER_DROPOFF）都用呢張卡：
 * 每 55 秒向 server 攞新 token（60 秒過期，一次性），render 做 QR 畀鑑定師
 * scan。冇 fallback — founder 拍板：冇電 = 交收唔到。
 */
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';

export function QrHandoverCard({ orderId, role }: { orderId: string; role: 'pickup' | 'dropoff' }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const { token } = await api.orders.handoverToken(orderId);
      const url = await QRCode.toDataURL(token, { width: 240, margin: 1 });
      setDataUrl(url);
      setSecondsLeft(60);
    } catch (e: any) {
      setError(e?.message ?? '攞唔到 QR 碼，請重試');
    }
  }, [orderId]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 55 * 1000);
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh]);

  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-verify-soft p-4 text-center">
      <p className="text-sm font-bold text-brand-800">
        {role === 'pickup' ? '到店取貨 — 出示此 QR 碼畀鑑定師 scan' : '到店交貨 — 出示此 QR 碼畀鑑定師 scan'}
      </p>
      {error ? (
        <div className="mx-auto mt-3 flex h-[240px] w-[240px] items-center justify-center rounded-lg bg-white p-4">
          <div>
            <p className="text-xs text-danger">{error}</p>
            <button type="button" onClick={refresh} className="mt-2 text-xs font-semibold text-brand-700 hover:underline">
              重試
            </button>
          </div>
        </div>
      ) : dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="交收 QR 碼" className="mx-auto mt-3 h-[240px] w-[240px] rounded-lg bg-white" />
      ) : (
        <div className="mx-auto mt-3 h-[240px] w-[240px] animate-pulse rounded-lg bg-white" />
      )}
      <p className="mt-2 text-[11px] text-brand-700">
        每 60 秒自動更新（{secondsLeft}s）· 一次性，截圖無效
      </p>
      <p className="mt-1 text-[11px] text-neutral-text-muted">
        鑑定師 scan 完會核對訂單 + 商品，確認後
        {role === 'pickup' ? '交收即完成' : '正式接收件貨開始鑑定'}
      </p>
    </div>
  );
}

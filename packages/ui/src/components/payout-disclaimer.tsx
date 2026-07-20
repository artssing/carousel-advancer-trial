import React from 'react';

/**
 * 平台中立提款 disclaimer — 任何 cashout 相關 view 必須出。
 * 唔可以各 page 自寫 (lesson #8 SSOT)，唔可以承諾「即日到帳」(L'Oréal v eBay)。
 */
export function PayoutDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 ${className}`}>
      Certifine 為資訊中介服務商，未持有任何支付牌照。提款款項由獨立支付合作夥伴根據您指定嘅帳戶資料處理。
      預計到帳時間 1–3 個工作天，實際時間視乎銀行安排，平台不作保證。
    </p>
  );
}

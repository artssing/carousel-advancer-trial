'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/**
 * E&O 保險警告 — moved OUT of sidebar into main-content ribbon.
 * Reason (coordinator note 2026-07-05): amber alert on the deep-indigo
 * sidebar bg is visually jarring + this is a legally-sensitive disclaimer
 * that shouldn't be truncated inside chrome. Kept as an OPT-IN component
 * so pages that surface it (dashboard, profile) render it near the top.
 */
export function EAndOWarning({
  eAndOInsuranceExpiresAt,
}: {
  eAndOInsuranceExpiresAt: string | null | undefined;
}) {
  if (!eAndOInsuranceExpiresAt) return null;

  const daysLeft = Math.ceil(
    (new Date(eAndOInsuranceExpiresAt).getTime() - Date.now()) / 86400000,
  );

  if (daysLeft > 30) return null;

  const isExpired = daysLeft <= 0;
  const text = isExpired ? '你嘅 E&O 責任保險已過期' : `你嘅 E&O 責任保險喺 ${daysLeft} 日後到期`;

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3.5 ${
      isExpired
        ? 'border-verdict-fail-border bg-verdict-fail-soft'
        : 'border-verdict-incon-border bg-verdict-incon-soft'
    }`}>
      <AlertTriangle
        className={`mt-0.5 h-5 w-5 shrink-0 ${
          isExpired ? 'text-verdict-fail' : 'text-verdict-incon'
        }`}
      />
      <div className="flex-1 text-[13px]">
        <p className={`font-semibold ${isExpired ? 'text-verdict-fail' : 'text-verdict-incon'}`}>
          {text}
        </p>
        <p className="mt-0.5 text-[12px] text-neutral-text-muted">
          未有有效 E&O 保險期間，你不能接受新鑑定訂單。請即
          <Link href="/profile" className="mx-1 font-semibold underline">更新保險資料</Link>。
        </p>
      </div>
    </div>
  );
}

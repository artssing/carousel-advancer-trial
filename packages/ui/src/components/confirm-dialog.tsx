'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';
import { cn } from '../lib/cn';

/**
 * Shared confirmation dialog for IRREVERSIBLE / DESTRUCTIVE actions.
 *
 * Founder ruling 2026-06-24: critical actions (e.g. authenticator verdict
 * submit, dispute, admin unsuspend) must surface a styled confirm — not
 * `window.confirm()` (ugly) and not raw click (mis-click hazard). This is the
 * SSOT for that dialog; do NOT roll your own modal per page.
 *
 * Use this for *simple yes/no* irreversible actions. For row-level confirms
 * where an inline 2-step panel reads more naturally (e.g. OfferCard withdraw),
 * keep the existing inline pattern — both are valid.
 *
 * Behaviour:
 *   - Click backdrop OR press Esc → cancel
 *   - Initial focus → cancel button (safer default for destructive actions)
 *   - `severity` controls the accent colour of the confirm button:
 *       danger  → red    (deletes / cancels / refunds / submits irreversible verdict)
 *       warning → amber  (reversible but consequential — e.g. unsuspend account)
 *       info    → brand  (mild — re-publish, restore archived)
 *   - `requireReason` adds a textarea; confirm stays disabled until non-empty;
 *     onConfirm receives the trimmed reason string.
 *   - `busy` shows a spinner state and disables both buttons (use during await).
 *
 * The component is uncontrolled re: open/close — parent owns the `open` state.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  title: string;
  /** Body content. Plain string or any node (lists / price summary / etc). */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: 'danger' | 'warning' | 'info';
  busy?: boolean;
  /** Show a textarea; confirm disabled until user types something. */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  reasonLabel?: string;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = '確認',
  cancelLabel = '取消',
  severity = 'danger',
  busy = false,
  requireReason = false,
  reasonPlaceholder = '請輸入原因…',
  reasonLabel = '原因',
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset the reason field every time the dialog opens fresh.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  // Focus management — cancel is the safer default for destructive prompts.
  // If a reason is required, focus the textarea so the user can type immediately.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (requireReason) textareaRef.current?.focus();
      else cancelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, requireReason]);

  // Esc → cancel. Use keydown on document so it catches even when focus is in
  // the textarea (input doesn't bubble Esc to the dialog otherwise).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const canConfirm = !busy && (!requireReason || trimmedReason.length > 0);

  const severityClasses = {
    danger:  'bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-400',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-400',
    info:    'bg-brand-600 hover:bg-brand-700 text-white focus-visible:ring-brand-400',
  }[severity];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => { if (!busy) onCancel(); }}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-md rounded-xl bg-white shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-150',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-2">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {description && (
            <div className="mt-2 text-sm leading-relaxed text-slate-600">{description}</div>
          )}
          {requireReason && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700">{reasonLabel}</label>
              <textarea
                ref={textareaRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                rows={3}
                disabled={busy}
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-400"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 rounded-b-xl bg-slate-50 px-4 py-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(requireReason ? trimmedReason : undefined)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2',
              severityClasses,
            )}
          >
            {busy ? '處理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

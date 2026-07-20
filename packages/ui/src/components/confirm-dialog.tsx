'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * ConfirmDialog v2 — SSOT confirmation modal for IRREVERSIBLE / DESTRUCTIVE
 * actions（docs/proposals/confirm-dialog-proposal.md，founder 拍板 2026-07-12）。
 *
 * v2 supersedes lesson #16's inline 2-step MECHANISM（原則不變：terminal action
 * 必須二次確認）— founder ruling：所有 confirm 一律用呢個 modal，包括 row-level
 * 細動作，唔准 inline strip / window.confirm / 自製 modal。
 *
 * Severity tiers（proposal §B）:
 *   T1 郁錢/不可逆   → severity="danger" + requireReason（force actions 加 typedConfirmation）
 *   T2 不可逆-ish    → severity="danger"|"warning"，簡單確認
 *   T3 可還原        → severity="info" light（soft delete — 講明「可以隨時還原」）
 *   T4 trivial       → 唔好用 dialog，事後 toast
 *
 * Portal-adaptive（lesson #18 — 三個 portal token 有意分家）:
 *   consumer（default）→ 白卡 + brand 綠 info
 *   authenticator      → 白卡 + authBrand 靛藍 info
 *   admin              → dark slate 卡（bg-slate-800，融入 admin dark theme）
 *
 * Behaviour:
 *   - Esc → cancel（永遠得 — a11y，busy 時除外）
 *   - Backdrop click → cancel；`dismissOnBackdrop={false}`（T1 郁錢 action 用）
 *     時只可以撳「取消」掣離開
 *   - 初始 focus 落取消掣；requireReason 時 focus textarea
 *   - Focus trap：Tab/Shift+Tab 只喺 dialog 內循環
 *   - Mobile（<640px）：bottom sheet — 全寬、只圓上角、buttons 直排（取消在上）
 *   - `typedConfirmation="XXXX"`：要打中先 unlock 確認掣（admin force actions）
 */
export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  title: string;
  /** Body content — 講「做緊咩/點解」。 */
  description?: React.ReactNode;
  /** 「呢個動作會…」下一步後果，一句白話。獨立 prop 逼使用者寫清楚。 */
  consequence?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: 'danger' | 'warning' | 'info';
  /** 邊個 portal 用 — 控制卡色 + info accent（default consumer）。 */
  portal?: 'consumer' | 'authenticator' | 'admin';
  busy?: boolean;
  /** Show a textarea; confirm disabled until user types something. */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  reasonLabel?: string;
  /** 要一字不差打中呢個 string 先 unlock 確認掣（force refund / release 用）。 */
  typedConfirmation?: string;
  /** false = 撳背景唔會關（T1 郁錢 action）。Default true。 */
  dismissOnBackdrop?: boolean;
}

const ICONS = { danger: AlertTriangle, warning: AlertCircle, info: Info } as const;

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  consequence,
  confirmLabel = '確認',
  cancelLabel = '取消',
  severity = 'danger',
  portal = 'consumer',
  busy = false,
  requireReason = false,
  reasonPlaceholder = '請輸入原因…',
  reasonLabel = '原因',
  typedConfirmation,
  dismissOnBackdrop = true,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState('');
  const [typed, setTyped] = React.useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset inputs every time the dialog opens fresh.
  useEffect(() => {
    if (open) { setReason(''); setTyped(''); }
  }, [open]);

  // Focus management — cancel is the safer default for destructive prompts.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (requireReason) textareaRef.current?.focus();
      else cancelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, requireReason]);

  // Esc → cancel（always allowed — a11y）+ focus trap（Tab cycles inside panel）.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) { onCancel(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, textarea, input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const typedOk = !typedConfirmation || typed.trim() === typedConfirmation;
  const canConfirm = !busy && (!requireReason || trimmedReason.length > 0) && typedOk;

  const dark = portal === 'admin';
  const infoAccent = portal === 'authenticator'
    ? 'bg-authBrand-500 hover:bg-authBrand-600 text-white focus-visible:ring-authBrand-400'
    : 'bg-brand-600 hover:bg-brand-700 text-white focus-visible:ring-brand-400';
  const severityClasses = {
    danger:  'bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-400',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-400',
    info:    infoAccent,
  }[severity];
  const iconColor = {
    danger: 'text-red-500 bg-red-500/10',
    warning: 'text-amber-500 bg-amber-500/10',
    info: dark ? 'text-sky-400 bg-sky-400/10' : portal === 'authenticator' ? 'text-authBrand-500 bg-authBrand-500/10' : 'text-brand-600 bg-brand-600/10',
  }[severity];
  const Icon = ICONS[severity];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={consequence ? 'confirm-dialog-consequence' : undefined}
      className="fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => { if (!busy && dismissOnBackdrop) onCancel(); }}
        aria-hidden="true"
      />
      {/* Panel — bottom sheet on mobile, centered card on desktop */}
      <div
        ref={panelRef}
        className={cn(
          'relative w-full shadow-2xl',
          'rounded-t-2xl sm:rounded-xl',
          requireReason || typedConfirmation ? 'sm:max-w-lg' : 'sm:max-w-md',
          'animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 sm:slide-in-from-bottom-0 duration-150',
          dark ? 'bg-slate-800 border border-slate-700' : 'bg-white',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag-handle hint */}
        <div className={cn('mx-auto mt-2.5 h-1 w-9 rounded-full sm:hidden', dark ? 'bg-slate-600' : 'bg-slate-300')} />

        <div className="px-6 pt-5 pb-2">
          <div className="flex items-start gap-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconColor)}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="confirm-dialog-title" className={cn('text-base font-semibold', dark ? 'text-slate-100' : 'text-slate-900')}>
                {title}
              </h2>
              {description && (
                <div className={cn('mt-1.5 text-sm leading-relaxed', dark ? 'text-slate-300' : 'text-slate-600')}>
                  {description}
                </div>
              )}
              {consequence && (
                <p
                  id="confirm-dialog-consequence"
                  className={cn(
                    'mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed',
                    dark ? 'bg-slate-900/60 text-slate-400' : 'bg-slate-50 text-slate-500',
                  )}
                >
                  ↳ {consequence}
                </p>
              )}
            </div>
          </div>

          {requireReason && (
            <div className="mt-3">
              <label className={cn('block text-xs font-medium', dark ? 'text-slate-300' : 'text-slate-700')}>{reasonLabel}</label>
              <textarea
                ref={textareaRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                rows={3}
                disabled={busy}
                className={cn(
                  'mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none',
                  dark
                    ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-slate-400'
                    : 'border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-400',
                )}
              />
            </div>
          )}

          {typedConfirmation && (
            <div className="mt-3">
              <label className={cn('block text-xs font-medium', dark ? 'text-slate-300' : 'text-slate-700')}>
                輸入 <span className="font-mono font-bold">{typedConfirmation}</span> 以確認
              </label>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={typedConfirmation}
                disabled={busy}
                className={cn(
                  'mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none',
                  dark
                    ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-600 focus:border-slate-400'
                    : 'border-slate-300 placeholder:text-slate-300 focus:border-red-400 focus:ring-1 focus:ring-red-300',
                )}
              />
            </div>
          )}
        </div>

        {/* Actions — mobile: stacked, cancel on TOP (thumb-safe); desktop: cancel left / confirm right */}
        <div
          className={cn(
            'flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-end',
            'rounded-b-none sm:rounded-b-xl',
            dark ? 'bg-slate-900/50' : 'bg-slate-50',
          )}
        >
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={cn(
              'w-full rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 sm:w-auto sm:py-1.5',
              dark
                ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:ring-slate-400'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400',
            )}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(requireReason ? trimmedReason : undefined)}
            className={cn(
              'w-full rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 sm:w-auto sm:py-1.5',
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

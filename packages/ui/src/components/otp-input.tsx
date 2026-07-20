'use client';

/**
 * OtpInput — 6-box one-time-code input（payout 2FA MVP，founder 2026-07-13，
 * docs/proposals/payout-2fa-proposal.md）。
 *
 * Behaviour:
 *  • Digit typed → auto-advance to next box; Backspace on empty box → previous.
 *  • Paste anywhere → digits distributed across boxes from the start.
 *  • onComplete fires exactly when all boxes are filled (auto-submit UX).
 *
 * Portal-adaptive（lesson #18 — consumer 綠 / authenticator 靛藍 有意分家）:
 * behaviour parity across portals, visual token diverges via `portal` prop.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export interface OtpInputProps {
  length?: number;
  /** Called with the current (possibly partial) code on every change. */
  onChange?: (code: string) => void;
  /** Called once when every box is filled. */
  onComplete: (code: string) => void;
  disabled?: boolean;
  /** Shows red borders (wrong code). Cleared on next keystroke by parent re-render. */
  error?: boolean;
  autoFocus?: boolean;
  /** 邊個 portal — 控制 focus accent（default consumer 綠）。 */
  portal?: 'consumer' | 'authenticator' | 'admin';
  /** Increment to clear all boxes + refocus (parent resets after a wrong code). */
  resetKey?: number;
}

export function OtpInput({
  length = 6,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = true,
  portal = 'consumer',
  resetKey = 0,
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setDigits(Array(length).fill(''));
    if (autoFocus) refs.current[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, length]);

  const accent =
    portal === 'authenticator'
      ? 'focus:border-authBrand-500 focus:ring-authBrand-500/30'
      : portal === 'admin'
        ? 'focus:border-sky-400 focus:ring-sky-400/30'
        : 'focus:border-brand-600 focus:ring-brand-600/30';

  function commit(next: string[]) {
    setDigits(next);
    const code = next.join('');
    onChange?.(code);
    if (next.every((d) => d !== '')) onComplete(code);
  }

  function handleChange(idx: number, raw: string) {
    const chars = raw.replace(/\D/g, '');
    if (!chars) {
      const next = [...digits];
      next[idx] = '';
      commit(next);
      return;
    }
    // Multi-char = paste (or fast IME) — distribute from this box onwards.
    const next = [...digits];
    let i = idx;
    for (const c of chars) {
      if (i >= length) break;
      next[i] = c;
      i += 1;
    }
    commit(next);
    refs.current[Math.min(i, length - 1)]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      e.preventDefault();
      const next = [...digits];
      next[idx - 1] = '';
      commit(next);
      refs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < length - 1) refs.current[idx + 1]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="一次性驗證碼">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length /* allow paste of full code into one box */}
          value={d}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`第 ${i + 1} 位`}
          className={cn(
            'h-12 w-10 rounded-lg border text-center text-lg font-semibold outline-none transition focus:ring-2',
            error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-900',
            disabled && 'opacity-50',
            accent,
          )}
        />
      ))}
    </div>
  );
}

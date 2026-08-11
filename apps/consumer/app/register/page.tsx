'use client';

// useSearchParams needs dynamic rendering — production build fix.
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Check, Search, Tag } from 'lucide-react';
import { api, setToken, ApiError } from '@/lib/api';
import { CATEGORIES, categoryShortLabel, type CategoryId,
  getClientLocale, createT,
} from '@authentik/utils';
import { AuthHeroPanel } from '@/components/auth/auth-hero-panel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * Register v2 (2026-07-05) — L3 two-column funnel matching design-samples/final-L3/register-split.html.
 *
 * Flow (per Coordinator 2026-07-05 ruling): only 3 mandatory steps.
 *   1. METHOD    — Google (feature-toggled) / Apple (off) / 用電郵繼續
 *   2. ACCOUNT   — email + password (18+ consent + strength meter)
 *   3. EMAIL_OTP — 6-box code entry, dev-mode fixed 888888
 *   → account created + JWT stored
 *   4. INTERESTS — chips (可略過，post-account so friction is post-conversion)
 *   5. DONE      — 2 next-action cards + phone-bind + KYC nudges as OPTIONAL cards
 *
 * Fake stats / testimonials / verified-cards from sample: NOT ported (see AuthHeroPanel doc).
 * Region + KYC-in-flow: deferred to Profile page per coordinator.
 */

type Step = 'METHOD' | 'ACCOUNT' | 'EMAIL_OTP' | 'INTERESTS' | 'DONE';

const FUNNEL_ORDER: Step[] = ['ACCOUNT', 'EMAIL_OTP', 'INTERESTS'];

// Category chips shown in step 4. Uses SSOT + emoji from packages/utils.
// enabledInBrowse = user-facing catalog; excludes internal `other` bucket.
const INTEREST_OPTIONS = Object.values(CATEGORIES)
  .filter((c) => c.enabledInBrowse)
  .map((c) => ({ id: c.id as CategoryId, apiEnum: c.apiEnum, emoji: c.emoji }));

function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
// Indexed by password-strength score. Keys, not text: the labels have to
// follow the locale, and this array lives outside the component where _t
// does not exist, so the lookup happens at the use site.
const PW_LABEL_KEYS = [null, 'register.strength.weak', 'register.strength.fair', 'register.strength.good', 'register.strength.strong'] as const;

export default function RegisterPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const router = useRouter();
  const [step, setStep] = useState<Step>('METHOD');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Feature toggles for OAuth methods.
  const [googleOn, setGoogleOn] = useState(false);
  const [appleOn, setAppleOn] = useState(false);
  useEffect(() => {
    api.config.flag('authGoogleEnabled').then(setGoogleOn).catch(() => {});
    api.config.flag('authAppleEnabled').then(setAppleOn).catch(() => {});
  }, []);

  // Step 2 — email + password + consent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [consent, setConsent] = useState(false);
  const strength = scorePassword(password);

  // Step 3 — 6 digit OTP boxes
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!otpSentAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [otpSentAt]);
  const resendCooldownSec = otpSentAt ? Math.max(0, 60 - Math.floor((now - otpSentAt) / 1000)) : 0;

  // Step 4 — interests (Category apiEnum values sent to server)
  const [interests, setInterests] = useState<Set<string>>(new Set());

  // ── Handlers ──────────────────────────────────────────────────────
  async function onGoogleSignIn() {
    setError(null);
    window.location.href = `${API_URL}/auth/google?redirect=${encodeURIComponent('/')}`;
  }

  async function onSendOtp() {
    setError(null);
    if (!email.trim()) { setError(_t('register.error.emailRequired')); return; }
    if (password.length < 6) { setError(_t('register.error.passwordMin')); return; }
    if (!displayName.trim()) { setError(_t('auth.completeProfile.emptyNameError')); return; }
    if (!consent) { setError(_t('register.error.consentRequired')); return; }
    setLoading(true);
    try {
      await api.emailSendOtp(email.trim(), 'REGISTER_EMAIL');
      setOtpSentAt(Date.now());
      setStep('EMAIL_OTP');
      // Focus first OTP box next paint.
      setTimeout(() => otpRefs.current[0]?.focus(), 60);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : _t('register.error.sendOtp'));
    } finally { setLoading(false); }
  }

  async function onResendOtp() {
    if (resendCooldownSec > 0) return;
    setError(null);
    setOtp(['', '', '', '', '', '']);
    setLoading(true);
    try {
      await api.emailSendOtp(email.trim(), 'REGISTER_EMAIL');
      setOtpSentAt(Date.now());
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : _t('register.error.sendFailed'));
    } finally { setLoading(false); }
  }

  async function onVerifyAndRegister() {
    setError(null);
    const code = otp.join('');
    if (code.length !== 6) { setError(_t('register.error.otpRequired')); return; }
    setLoading(true);
    try {
      const res = await api.register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        emailOtp: code,
      });
      setToken(res.accessToken);
      setStep('INTERESTS');
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : _t('register.error.registerFailed'));
    } finally { setLoading(false); }
  }

  async function onSaveInterests(skip = false) {
    setError(null);
    setLoading(true);
    try {
      // Interests are saved by /me PATCH (backend accepts `interests` array).
      if (!skip && interests.size > 0) {
        await api.updateMe({ interests: Array.from(interests) as any });
      }
      setStep('DONE');
    } catch (err: any) {
      // Non-fatal: interests are optional, still let user continue.
      // eslint-disable-next-line no-console
      console.warn('save interests failed', err);
      setStep('DONE');
    } finally { setLoading(false); }
  }

  function onOtpChange(i: number, v: string) {
    const digit = v.replace(/\D/g, '').slice(0, 1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  }
  function onOtpKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  }
  function onOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    const next = digits.split('').concat(Array(6).fill('')).slice(0, 6);
    setOtp(next);
    otpRefs.current[Math.min(digits.length, 5)]?.focus();
  }

  function toggleInterest(apiEnum: string) {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(apiEnum)) next.delete(apiEnum); else next.add(apiEnum);
      return next;
    });
  }

  // Progress dots — funnel steps only (METHOD / DONE don't count)
  const funnelIdx = FUNNEL_ORDER.indexOf(step as any);
  const showProgress = funnelIdx >= 0;

  // ── Layout ────────────────────────────────────────────────────────
  return (
    <div className="grid min-h-[calc(100dvh-var(--chrome-h))] lg:grid-cols-[1.05fr_0.95fr]">
      <AuthHeroPanel />

      <div className="flex items-center justify-center bg-white px-6 py-10">
        <div className="w-full max-w-[400px]">
          {/* Corner switch to /login */}
          <div className="mb-2 text-right text-[13px] text-neutral-text-hint">
            {_t('register.hasAccount')}
            <Link href="/login" className="ml-1 font-semibold text-brand-600 hover:underline">
              {_t('register.tab.login')}
            </Link>
          </div>

          {/* Segmented tabs — sync w/ login page */}
          {step === 'METHOD' && (
            <div className="mb-5 flex rounded-[11px] bg-surface-2 p-1">
              <Link
                href="/login"
                className="flex-1 rounded-[8px] py-2.5 text-center text-[14px] font-bold text-neutral-text-hint transition hover:text-neutral-text-muted"
              >
                {_t('register.tab.login')}
              </Link>
              <span className="flex-1 rounded-[8px] bg-white py-2.5 text-center text-[14px] font-bold text-ink shadow-sh1">
                {_t('register.tab.register')}
              </span>
            </div>
          )}

          {/* Progress dots */}
          {showProgress && (
            <div className="mb-4 flex gap-1.5">
              {FUNNEL_ORDER.map((s, n) => (
                <span
                  key={s}
                  className={`h-[5px] flex-1 rounded-full transition ${
                    n < funnelIdx ? 'bg-brand-600' : n === funnelIdx ? 'bg-brand-400' : 'bg-line'
                  }`}
                />
              ))}
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
          )}

          {/* ── STEP 1: METHOD ── */}
          {step === 'METHOD' && (
            <>
              <h1 className="text-[24px] font-extrabold tracking-[-0.01em] text-ink">
                {_t('register.step.methodTitle')}
              </h1>
              <p className="mt-1.5 text-[14px] text-neutral-text-muted">
                {_t('register.step.methodDesc')}
              </p>

              <div className="mt-5 flex flex-col gap-2.5">
                {googleOn && (
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="flex items-center justify-center gap-2.5 rounded-[9px] border border-line-2 bg-white py-3 text-[14px] font-semibold text-neutral-text shadow-sh1 transition hover:border-brand-600 hover:bg-surface-2"
                  >
                    <GoogleIcon /> {_t('register.googleContinue')}
                  </button>
                )}
                {appleOn && (
                  <button
                    type="button"
                    onClick={() => setError(_t('register.appleComingSoon'))}
                    className="flex items-center justify-center gap-2.5 rounded-[9px] border border-line-2 bg-white py-3 text-[14px] font-semibold text-neutral-text shadow-sh1 transition hover:border-brand-600 hover:bg-surface-2"
                  >
                    <AppleIcon /> {_t('register.appleContinue')}
                  </button>
                )}
              </div>

              {(googleOn || appleOn) && (
                <div className="my-4 flex items-center gap-3 text-[12px] text-neutral-text-hint">
                  <span className="h-px flex-1 bg-line" /> {_t('register.orEmailDivider')}
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep('ACCOUNT')}
                className="w-full rounded-[9px] bg-brand-600 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(0,135,102,0.6)] transition hover:bg-brand-700"
              >
                {_t('register.continueEmail')}
              </button>

              <p className="mt-4 text-center text-[12px] leading-relaxed text-neutral-text-hint">
                {_t('register.legal.prefix')}
                <Link href="/terms" className="mx-1 font-semibold text-brand-600 hover:underline">{_t('register.legal.terms')}</Link>
                {_t('register.legal.and')}
                <Link href="/privacy" className="mx-1 font-semibold text-brand-600 hover:underline">{_t('register.legal.privacy')}</Link>{_t('register.legal.suffix')}
              </p>
            </>
          )}

          {/* ── STEP 2: ACCOUNT ── */}
          {step === 'ACCOUNT' && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">
                {_t('register.step.accountNum')}
              </p>
              <h1 className="mt-1.5 text-[24px] font-extrabold tracking-[-0.01em] text-ink">
                {_t('register.step.accountTitle')}
              </h1>
              <p className="mt-1.5 text-[14px] text-neutral-text-muted">
                {_t('register.step.accountDesc')}
              </p>

              <Field label={_t('register.displayNameLabel')} hint={_t('register.displayNameHint')}>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ernest Wong"
                  className={INPUT_CLS}
                  autoFocus
                />
              </Field>

              <Field label={_t('account.profile.security.email.heading')}>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={INPUT_CLS}
                />
              </Field>

              <Field label={_t('register.passwordLabel')} hint={_t('register.passwordHint')} nomargin>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                />
                <div className="mt-2 flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full transition ${
                        i < strength ? 'bg-brand-400' : 'bg-line'
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-neutral-text-hint">
                  {_t('register.strengthPrefix')}{PW_LABEL_KEYS[strength] ? _t(PW_LABEL_KEYS[strength]!) : '—'}
                </p>
              </Field>

              <label className="mb-3.5 mt-4 flex items-start gap-2.5 text-[13px] leading-[1.55] text-neutral-text-muted">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                />
                <span>
                  {_t('register.consentLabel')}
                  <Link href="/terms" className="mx-1 font-semibold text-brand-600 hover:underline">{_t('register.legal.terms')}</Link>
                  {_t('register.legal.and')}
                  <Link href="/privacy" className="mx-1 font-semibold text-brand-600 hover:underline">{_t('register.legal.privacy')}</Link>{_t('register.legal.suffix')}
                </span>
              </label>

              <button
                onClick={onSendOtp}
                disabled={loading}
                className="w-full rounded-[9px] bg-brand-600 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(0,135,102,0.6)] transition hover:bg-brand-700 disabled:opacity-40"
              >
                {loading ? _t('register.sendOtp.busy') : _t('register.sendOtp')}
              </button>

              <button
                onClick={() => setStep('METHOD')}
                className="mt-3.5 flex items-center gap-1 text-[13px] text-neutral-text-hint hover:text-neutral-text-muted"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> {_t('register.back')}
              </button>
            </>
          )}

          {/* ── STEP 3: EMAIL OTP ── */}
          {step === 'EMAIL_OTP' && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">
                {_t('register.step.otpNum')}
              </p>
              <h1 className="mt-1.5 text-[24px] font-extrabold tracking-[-0.01em] text-ink">
                {_t('register.step.otpTitle')}
              </h1>
              <p className="mt-1.5 text-[14px] text-neutral-text-muted">
                {_t('register.otpSentTo')} <span className="font-semibold text-neutral-text">{email}</span>{_t('register.otpSentTo.suffix')}
              </p>

              {/* Dev mode banner — Lesson #11 pattern */}
              <p className="mb-3 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                {_t('register.devNotice')}
                <code className="ml-1 font-mono font-bold">888888</code>
              </p>

              <div className="mt-3 flex gap-2.5">
                {otp.map((v, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={v}
                    onChange={(e) => onOtpChange(i, e.target.value)}
                    onKeyDown={(e) => onOtpKey(i, e)}
                    onPaste={onOtpPaste}
                    className="h-[58px] w-full rounded-[10px] border border-line-2 bg-white text-center font-mono text-[23px] font-extrabold text-ink outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-400/40"
                  />
                ))}
              </div>

              <div className="mt-3 text-center text-[13px] text-neutral-text-hint">
                {_t('register.notReceived')}
                <button
                  onClick={onResendOtp}
                  disabled={resendCooldownSec > 0 || loading}
                  className="ml-1 font-semibold text-brand-600 hover:underline disabled:text-neutral-text-hint disabled:no-underline"
                >
                  {resendCooldownSec > 0 ? _t('register.resendCooldown', { seconds: resendCooldownSec }) : _t('register.resend')}
                </button>
              </div>

              <button
                onClick={onVerifyAndRegister}
                disabled={loading || otp.join('').length !== 6}
                className="mt-4 w-full rounded-[9px] bg-brand-600 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(0,135,102,0.6)] transition hover:bg-brand-700 disabled:opacity-40"
              >
                {loading ? _t('register.verifyButton.busy') : _t('register.verifyButton')}
              </button>

              <button
                onClick={() => setStep('ACCOUNT')}
                className="mt-3.5 flex items-center gap-1 text-[13px] text-neutral-text-hint hover:text-neutral-text-muted"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> {_t('register.backEdit')}
              </button>
            </>
          )}

          {/* ── STEP 4: INTERESTS ── */}
          {step === 'INTERESTS' && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">
                {_t('register.step.interestsNum')}
              </p>
              <h1 className="mt-1.5 text-[24px] font-extrabold tracking-[-0.01em] text-ink">
                {_t('register.step.interestsTitle')}
              </h1>
              <p className="mt-1.5 text-[14px] text-neutral-text-muted">
                {_t('register.step.interestsDesc')}
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                {INTEREST_OPTIONS.map((c) => {
                  const on = interests.has(c.apiEnum);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleInterest(c.apiEnum)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] font-semibold transition ${
                        on
                          ? 'border-verify bg-verify-soft text-brand-700'
                          : 'border-line-2 bg-white text-neutral-text-muted hover:border-brand-600 hover:text-brand-600'
                      }`}
                    >
                      <span>{c.emoji}</span>
                      <span>{categoryShortLabel(c.id, locale)}</span>
                      {on && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex gap-2.5">
                <button
                  onClick={() => onSaveInterests(true)}
                  disabled={loading}
                  className="flex-1 rounded-[9px] border border-line-2 bg-white py-3 text-[14px] font-bold text-neutral-text shadow-sh1 transition hover:border-brand-600 hover:text-brand-600 disabled:opacity-40"
                >
                  {_t('register.skip')}
                </button>
                <button
                  onClick={() => onSaveInterests(false)}
                  disabled={loading}
                  className="flex-1 rounded-[9px] bg-brand-600 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(0,135,102,0.6)] transition hover:bg-brand-700 disabled:opacity-40"
                >
                  {loading ? _t('register.saving') : _t('register.continueCount', { count: interests.size })}
                </button>
              </div>
            </>
          )}

          {/* ── STEP 5: DONE ── */}
          {step === 'DONE' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-[78px] w-[78px] items-center justify-center rounded-full border border-verify-border bg-verify-soft">
                <Check className="h-[34px] w-[34px] text-brand-600" strokeWidth={2.5} />
              </div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.01em] text-ink">
                {_t('register.welcomePrefix')}{displayName || _t('register.friend')}{_t('register.welcomeSuffix')}
              </h1>
              <p className="mt-2 text-[14px] text-neutral-text-muted">
                {_t('register.doneDesc')}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Link
                  href="/browse"
                  className="rounded-xl border border-line bg-white p-4 text-left shadow-sh1 transition hover:-translate-y-0.5 hover:border-brand-600 hover:shadow-sh3"
                >
                  <Search className="h-6 w-6 text-brand-600" />
                  <p className="mt-2 text-[15px] font-bold text-ink">{_t('register.card.browseTitle')}</p>
                  <p className="mt-0.5 text-[12px] text-neutral-text-hint">{_t('register.card.browseDesc')}</p>
                </Link>
                <Link
                  href="/sell"
                  className="rounded-xl border border-line bg-white p-4 text-left shadow-sh1 transition hover:-translate-y-0.5 hover:border-brand-600 hover:shadow-sh3"
                >
                  <Tag className="h-6 w-6 text-brand-600" />
                  <p className="mt-2 text-[15px] font-bold text-ink">{_t('register.card.sellTitle')}</p>
                  <p className="mt-0.5 text-[12px] text-neutral-text-hint">{_t('register.card.sellDesc')}</p>
                </Link>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-neutral-text-hint">
                {_t('register.securityHint.prefix')}
                <Link href="/account/profile" className="mx-1 font-semibold text-brand-600 hover:underline">{_t('account.profile.page.title')}</Link>
                {_t('register.securityHint.suffix')}
              </p>

              <button
                onClick={() => { router.push('/'); router.refresh(); }}
                className="mt-5 w-full rounded-[9px] bg-brand-600 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(0,135,102,0.6)] transition hover:bg-brand-700"
              >
                {_t('register.goHome')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── UI primitives ──
const INPUT_CLS = 'w-full rounded-[9px] border border-line-2 bg-white px-3.5 py-3 text-[15px] outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-400/30';

function Field({
  label, hint, children, nomargin,
}: { label: string; hint?: string; children: React.ReactNode; nomargin?: boolean }) {
  return (
    <label className={`block ${nomargin ? '' : 'mb-3.5'}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">
        {label}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-neutral-text-hint">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/>
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z"/>
      <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z"/>
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 6.5l3.8 3C6.5 6.8 9 4.8 12 4.8z"/>
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#000">
      <path d="M16.4 12.8c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.2 2.6 2.1 1-.04 1.5-.7 2.7-.7s1.6.7 2.8.6c1.2 0 1.9-1 2.6-2 .8-1.2 1.2-2.3 1.2-2.4-.03-.01-2.3-.9-2.4-3.2z"/>
    </svg>
  );
}

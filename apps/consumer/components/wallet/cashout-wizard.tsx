'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardContent, OtpInput } from '@certifine/ui';
import { payoutMethodDisplayLabel, PAYOUT_METHOD_TYPES, PAYOUT_MIN_HKD, type PayoutMethodTypeKey } from '@certifine/domain';
import { formatHKD, getClientLocale, createT } from '@certifine/web-kit';
import { api, ApiError } from '@/lib/api';
import { AlertTriangle, Check, ChevronRight, Loader2, ShieldCheck, X } from 'lucide-react';

type Method = {
  id: string; type: PayoutMethodTypeKey;
  accountIdentifier: string; bankCode: string | null;
  accountName: string; nameMatchesKyc: boolean;
  isDefault: boolean; isVerified: boolean;
};

interface Props {
  /** Pre-fetched available balance (HKD) */
  availableHKD: number;
  /** Server-fetched fee */
  feeHKD: number;
  /** Min withdraw */
  minHKD?: number;
  /** Max withdraw */
  maxHKD?: number;
  /** Pre-fetched payout methods */
  methods: Method[];
  /** Called after successful submit; parent should refetch balance + close modal */
  onSuccess: (ref: string) => void;
  /** Cancel */
  onCancel: () => void;
}

// 2FA（founder 2026-07-13）: 'otp' step sits between confirm and done —
// initiate() 發 email OTP + 凍結 intent，confirm() 帶 code 先真正建 request。
type Step = 'method' | 'amount' | 'preview' | 'confirm' | 'otp' | 'submitting' | 'done';

export function CashoutWizard({
  availableHKD,
  feeHKD,
  minHKD = PAYOUT_MIN_HKD,
  maxHKD = 50_000,
  methods,
  onSuccess,
  onCancel,
}: Props) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0];
  const [step, setStep] = useState<Step>(methods.length === 0 ? 'method' : 'method');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(defaultMethod?.id ?? null);
  const [amountStr, setAmountStr] = useState(String(Math.max(minHKD, Math.min(availableHKD, maxHKD))));
  const [error, setError] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  // ── 2FA state ──
  const [intentId, setIntentId] = useState<string | null>(null);
  const [maskedTarget, setMaskedTarget] = useState<string>('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResetKey, setOtpResetKey] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpBusy, setOtpBusy] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null;
  const amount = parseInt(amountStr, 10) || 0;
  const net = Math.max(0, amount - feeHKD);

  const amountInvalid = useMemo(() => {
    if (amount < minHKD) return _t('account.wallet.cashout.error.min', { min: minHKD });
    if (amount > maxHKD) return _t('account.wallet.cashout.error.max', { max: maxHKD.toLocaleString() });
    if (amount > availableHKD) return _t('account.wallet.cashout.error.exceedsBalance', { available: availableHKD.toLocaleString() });
    return null;
  }, [amount, minHKD, maxHKD, availableHKD]);

  /** Step confirm → otp: server validates + freezes intent + sends email OTP. */
  async function initiate() {
    if (!selectedMethod) return;
    setStep('submitting');
    setError(null);
    setOtpError(null);
    try {
      const res = await api.wallet.initiatePayout({
        payoutMethodId: selectedMethod.id,
        amountHKD: amount,
      });
      setIntentId(res.intentId);
      setMaskedTarget(res.maskedTarget);
      setResendCooldown(60);
      setStep('otp');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : _t('account.wallet.cashout.error.failed'));
      setStep('preview');
    }
  }

  /** Amount / method 改咗 = 新 intent = 新 OTP（anti-replay）— resend 都行呢條。 */
  async function resendOtp() {
    if (resendCooldown > 0 || !selectedMethod) return;
    setOtpError(null);
    setOtpResetKey((k) => k + 1);
    try {
      const res = await api.wallet.initiatePayout({
        payoutMethodId: selectedMethod.id,
        amountHKD: amount,
      });
      setIntentId(res.intentId);
      setMaskedTarget(res.maskedTarget);
      setResendCooldown(60);
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : _t('account.walletMethods.otp.resendError'));
    }
  }

  async function submitCode(code: string) {
    if (!intentId || otpBusy) return;
    setOtpBusy(true);
    setOtpError(null);
    try {
      const res = await api.wallet.confirmPayout({ intentId, code });
      setSuccessRef(res.reference);
      setStep('done');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : _t('account.walletMethods.otp.verifyError');
      setOtpError(msg);
      setOtpResetKey((k) => k + 1); // 清空重入
    } finally {
      setOtpBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      // T1 郁錢（ruling #16）：OTP step 唔准 backdrop dismiss，防誤觸廢咗成個 intent
      onClick={step === 'otp' ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{_t('account.wallet.cashout.title')}</h2>
          <button onClick={onCancel} className="rounded-full p-1 hover:bg-slate-100" aria-label={_t('account.wallet.cashout.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step: pick method */}
        {step === 'method' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{_t('account.wallet.cashout.pickAccount')}</p>
            {methods.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-slate-600">
                  {_t('account.wallet.cashout.noAccount')}
                  <Link href="/account/wallet/methods" className="ml-1 text-brand-600 underline">
                    {_t('account.wallet.cashout.addOne')}
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {methods.map((m) => (
                  <Card
                    key={m.id}
                    onClick={() => setSelectedMethodId(m.id)}
                    className={`cursor-pointer transition ${selectedMethodId === m.id ? 'border-brand-500 ring-2 ring-brand-200' : ''}`}
                  >
                    <CardContent className="flex items-center gap-3 p-3 text-sm">
                      <span className="text-xl">
                        {PAYOUT_METHOD_TYPES.find((t) => t.key === m.type)?.icon ?? '💳'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {payoutMethodDisplayLabel(m.type, m.accountIdentifier, m.bankCode)}
                        </p>
                        <p className="truncate text-xs text-slate-500">{m.accountName}</p>
                      </div>
                      {m.isDefault && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          {_t('account.walletMethods.method.defaultPill')}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                ))}
                <Link href="/account/wallet/methods" className="block text-center text-xs text-brand-600 hover:underline">
                  {_t('account.wallet.cashout.addAccount')}
                </Link>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={onCancel} className="flex-1">{_t('account.wallet.cashout.cancel')}</Button>
              <Button
                onClick={() => setStep('amount')}
                disabled={!selectedMethodId}
                className="flex-1"
              >{_t('account.wallet.cashout.next')}</Button>
            </div>
          </div>
        )}

        {/* Step: amount */}
        {step === 'amount' && selectedMethod && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {_t('account.wallet.cashout.available')} <span className="font-semibold text-slate-900">{formatHKD(availableHKD)}</span>
            </p>
            <label className="block text-sm">
              <span className="block text-slate-700">{_t('account.wallet.cashout.amountLabel')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={minHKD}
                max={Math.min(maxHKD, availableHKD)}
                step="1"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {_t('account.wallet.cashout.range', { min: minHKD, max: Math.min(maxHKD, availableHKD).toLocaleString() })}
              </span>
              {amountInvalid && (
                <span className="mt-1 block text-xs text-red-600">{amountInvalid}</span>
              )}
            </label>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setStep('method')} className="flex-1">{_t('listing.share.back')}</Button>
              <Button onClick={() => setStep('preview')} disabled={!!amountInvalid} className="flex-1">{_t('account.wallet.cashout.next')}</Button>
            </div>
          </div>
        )}

        {/* Step: preview + confirm */}
        {(step === 'preview' || step === 'confirm' || step === 'submitting') && selectedMethod && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <Row label={_t('account.wallet.cashout.row.amount')} value={formatHKD(amount)} />
              <Row label={_t('account.wallet.cashout.row.fee')} value={feeHKD === 0 ? _t('account.wallet.cashout.feeFree') : formatHKD(feeHKD)} />
              <div className="my-1 border-t border-slate-200" />
              <Row label={_t('account.wallet.cashout.row.net')} value={<span className="font-semibold text-slate-900">{formatHKD(net)}</span>} />
              <div className="my-1 border-t border-slate-200" />
              <Row
                label={_t('account.payouts.detail.accountLabel')}
                value={payoutMethodDisplayLabel(selectedMethod.type, selectedMethod.accountIdentifier, selectedMethod.bankCode)}
              />
              <Row label={_t('account.wallet.cashout.row.eta')} value={_t('account.wallet.cashout.etaValue')} />
            </div>

            {!selectedMethod.nameMatchesKyc && (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {_t('account.wallet.cashout.nameMismatch', { name: selectedMethod.accountName })}
                </span>
              </p>
            )}

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
            )}

            {step !== 'confirm' && step !== 'submitting' && (
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={() => setStep('amount')} className="flex-1">{_t('listing.share.back')}</Button>
                <Button onClick={() => setStep('confirm')} className="flex-1">{_t('account.wallet.cashout.confirm')}</Button>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                <p className="font-semibold">{_t('account.wallet.cashout.irreversibleTitle')}</p>
                <p>
                  {_t('account.wallet.cashout.irreversibleBody')}
                </p>
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setStep('preview')} className="flex-1">{_t('account.wallet.cashout.cancel')}</Button>
                  <Button onClick={initiate} className="flex-1 bg-red-600 hover:bg-red-700">
                    {_t('account.wallet.cashout.understand')}
                  </Button>
                </div>
              </div>
            )}

            {step === 'submitting' && (
              <div className="flex items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" /> {_t('account.wallet.cashout.processing')}
              </div>
            )}
          </div>
        )}

        {/* Step: OTP 2FA（founder 2026-07-13） */}
        {step === 'otp' && selectedMethod && (
          <div className="space-y-4">
            <div className="space-y-1 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-600/10">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
              </div>
              <p className="text-sm font-semibold text-slate-900">{_t('account.wallet.cashout.otpTitle')}</p>
              <p className="text-xs text-slate-500">
                {_t('account.wallet.cashout.otpSentTo')} <span className="font-medium text-slate-700">{maskedTarget}</span>
              </p>
              <p className="text-xs text-slate-500">
                {_t('account.wallet.cashout.withdrawTo', { amount: formatHKD(amount) })}{' '}
                {payoutMethodDisplayLabel(selectedMethod.type, selectedMethod.accountIdentifier, selectedMethod.bankCode)}
              </p>
            </div>

            <OtpInput
              portal="consumer"
              onComplete={submitCode}
              disabled={otpBusy}
              error={!!otpError}
              resetKey={otpResetKey}
            />

            {otpBusy && (
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {_t('account.walletMethods.otpPanel.verifying')}
              </div>
            )}
            {otpError && (
              <p className="rounded-md border border-red-200 bg-red-50 p-2 text-center text-xs text-red-700">
                {otpError}
              </p>
            )}

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => { setStep('preview'); setIntentId(null); setOtpError(null); }}
                className="text-slate-500 hover:text-slate-700 hover:underline"
              >
                {_t('account.walletMethods.otpPanel.backLink')}
              </button>
              <button
                type="button"
                onClick={resendOtp}
                disabled={resendCooldown > 0}
                className="text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
              >
                {resendCooldown > 0 ? _t('account.walletMethods.resendIn', { s: resendCooldown }) : _t('account.walletMethods.otpPanel.resendLink')}
              </button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && successRef && (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-base font-semibold">{_t('account.wallet.cashout.doneTitle')}</p>
            <p className="text-xs text-slate-500">{_t('account.wallet.cashout.refLabel')}</p>
            <p className="font-mono text-sm text-slate-800">{successRef}</p>
            <p className="text-xs text-slate-500">
              {_t('account.wallet.cashout.doneBody')}
            </p>
            <div className="flex gap-2">
              <Link href="/account/wallet/payouts" className="flex-1">
                <Button variant="secondary" className="w-full">{_t('account.wallet.cashout.viewHistory')}</Button>
              </Link>
              <Button onClick={() => onSuccess(successRef)} className="flex-1">{_t('account.wallet.cashout.done')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  );
}

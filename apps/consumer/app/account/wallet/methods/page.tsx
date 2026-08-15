'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Pill, PayoutDisclaimer, ConfirmDialog, OtpInput } from '@certifine/ui';
import { HK_BANKS, PAYOUT_METHOD_TYPES, validatePayoutAccount, payoutMethodDisplayLabel, type PayoutMethodTypeKey } from '@certifine/domain';
import { getClientLocale, createT } from '@certifine/web-kit';
import { api, hasToken, ApiError } from '@/lib/api';
import { Plus, Star, Trash2, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { AccountSidebar } from '@/components/account/account-sidebar';

type Method = Awaited<ReturnType<typeof api.wallet.methods>>[number];

export default function MethodsPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const router = useRouter();
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add form state
  const [type, setType] = useState<PayoutMethodTypeKey>('FPS_PHONE');
  const [identifier, setIdentifier] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 2FA state（founder 2026-07-13：新增收款戶口 = ATO 第一步，都要 step-up）
  const [otpIntentId, setOtpIntentId] = useState<string | null>(null);
  const [otpMasked, setOtpMasked] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResetKey, setOtpResetKey] = useState(0);
  const [otpBusy, setOtpBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function refresh() {
    try {
      const m = await api.wallet.methods();
      setMethods(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : _t('account.walletMethods.error.load'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasToken()) {
      router.replace('/login?next=/account/wallet/methods');
      return;
    }
    refresh();
  }, [router]);

  function resetForm() {
    setType('FPS_PHONE');
    setIdentifier('');
    setBankCode('');
    setAccountName('');
    setIsDefault(false);
    setFormError(null);
  }

  async function submitAdd() {
    setFormError(null);
    const meta = PAYOUT_METHOD_TYPES.find((t) => t.key === type)!;
    if (!accountName.trim()) {
      setFormError(_t('account.walletMethods.addForm.nameRequired'));
      return;
    }
    const v = validatePayoutAccount(type, identifier, meta.needsBank ? bankCode : undefined);
    if (!v.ok) {
      setFormError(v.reason ?? _t('account.walletMethods.error.invalidAccount'));
      return;
    }
    setSubmitting(true);
    try {
      // 2FA step 1: server validates + freezes intent + sends email OTP.
      const res = await api.wallet.initiateAddMethod({
        type,
        accountIdentifier: identifier.trim(),
        bankCode: meta.needsBank ? bankCode : undefined,
        accountName: accountName.trim(),
        isDefault,
      });
      setOtpIntentId(res.intentId);
      setOtpMasked(res.maskedTarget);
      setOtpError(null);
      setResendCooldown(60);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : _t('account.walletMethods.addForm.genericError'));
    } finally {
      setSubmitting(false);
    }
  }

  /** 2FA step 2: verify code → method actually created. */
  async function submitOtpCode(code: string) {
    if (!otpIntentId || otpBusy) return;
    setOtpBusy(true);
    setOtpError(null);
    try {
      await api.wallet.confirmAddMethod({ intentId: otpIntentId, code });
      setOtpIntentId(null);
      setAdding(false);
      resetForm();
      await refresh();
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : _t('account.walletMethods.otp.verifyError'));
      setOtpResetKey((k) => k + 1);
    } finally {
      setOtpBusy(false);
    }
  }

  /** Resend = fresh intent + fresh OTP（anti-replay：舊 code 對新 intent 無效）。 */
  async function resendOtp() {
    if (resendCooldown > 0) return;
    const meta = PAYOUT_METHOD_TYPES.find((t) => t.key === type)!;
    setOtpError(null);
    setOtpResetKey((k) => k + 1);
    try {
      const res = await api.wallet.initiateAddMethod({
        type,
        accountIdentifier: identifier.trim(),
        bankCode: meta.needsBank ? bankCode : undefined,
        accountName: accountName.trim(),
        isDefault,
      });
      setOtpIntentId(res.intentId);
      setOtpMasked(res.maskedTarget);
      setResendCooldown(60);
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : _t('account.walletMethods.otp.resendError'));
    }
  }

  async function setAsDefault(id: string) {
    try {
      await api.wallet.setDefault(id);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : _t('account.walletMethods.operationError'));
    }
  }

  async function confirmDelete(id: string) {
    try {
      await api.wallet.deleteMethod(id);
      setDeletingId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : _t('account.walletMethods.deleteError'));
      setDeletingId(null);
    }
  }

  const typeMeta = PAYOUT_METHOD_TYPES.find((t) => t.key === type)!;

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-8 sm:px-6">
      <div className="grid items-start gap-8 lg:grid-cols-[220px_1fr]">
        <AccountSidebar />

        <section className="max-w-[640px]">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="font-display-serif text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">
              {_t('account.walletMethods.heading')}
            </h1>
            {!adding && (
              <Button size="sm" onClick={() => setAdding(true)}>{_t('account.walletMethods.addButton')}</Button>
            )}
          </div>

          {loading ? (
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <>
              {error && <div className="mb-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

              {/* ═══ Method rows ═══ */}
              {methods.length === 0 && !adding && (
                <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-neutral-text-muted shadow-sh1">
                  {_t('account.walletMethods.empty')}
                </p>
              )}
              {methods.map((m) => (
                <div key={m.id} className="mb-3 flex items-center gap-3.5 rounded-xl border border-line bg-white p-4 shadow-sh1">
                  <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[18px] font-extrabold text-ink">
                    {PAYOUT_METHOD_TYPES.find((t) => t.key === m.type)?.icon ?? '💳'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-neutral-text">
                      {payoutMethodDisplayLabel(m.type, m.accountIdentifier, m.bankCode)}
                      {m.isDefault && <Pill variant="verify" size="sm">{_t('account.walletMethods.method.defaultPill')}</Pill>}
                    </div>
                    <div className="mt-1 text-[12px] text-neutral-text-hint">
                      {m.accountName}
                      {!m.nameMatchesKyc && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-amber-700">
                          <AlertTriangle className="h-3 w-3" /> {_t('account.walletMethods.method.nameMismatch')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {!m.isDefault && (
                      <button onClick={() => setAsDefault(m.id)} className="flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline">
                        <Star className="h-3 w-3" /> {_t('account.walletMethods.method.setDefault')}
                      </button>
                    )}
                    <button onClick={() => setDeletingId(m.id)} className="flex items-center gap-1 text-[12px] text-neutral-text-hint hover:text-danger">
                      <Trash2 className="h-3 w-3" /> {_t('account.walletMethods.method.delete')}
                    </button>
                  </div>
                </div>
              ))}

              {/* ═══ 2FA OTP panel（founder 2026-07-13：加戶口 = ATO 第一步要閘）═══ */}
              {adding && otpIntentId && (
                <div className="mt-2 rounded-xl border border-line bg-white p-5 shadow-sh1">
                  <div className="mb-4 space-y-1 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-600/10">
                      <ShieldCheck className="h-5 w-5 text-brand-600" />
                    </div>
                    <p className="text-[14px] font-semibold text-neutral-text">{_t('account.walletMethods.otpPanel.heading')}</p>
                    <p className="text-xs text-neutral-text-muted">
                      {_t('account.walletMethods.otpPanel.body')}
                    </p>
                    <p className="text-xs text-neutral-text-muted">
                      {_t('account.walletMethods.otpSentTo')} <span className="font-medium text-neutral-text">{otpMasked}</span>
                    </p>
                  </div>

                  <OtpInput
                    portal="consumer"
                    onComplete={submitOtpCode}
                    disabled={otpBusy}
                    error={!!otpError}
                    resetKey={otpResetKey}
                  />

                  {otpBusy && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-neutral-text-hint">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {_t('account.walletMethods.otpPanel.verifying')}
                    </div>
                  )}
                  {otpError && (
                    <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-center text-xs text-danger">{otpError}</p>
                  )}

                  <div className="mt-4 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => { setOtpIntentId(null); setOtpError(null); }}
                      className="text-neutral-text-hint hover:text-neutral-text hover:underline"
                    >
                      {_t('account.walletMethods.otpPanel.backLink')}
                    </button>
                    <button
                      type="button"
                      onClick={resendOtp}
                      disabled={resendCooldown > 0}
                      className="text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-neutral-text-hint disabled:no-underline"
                    >
                      {resendCooldown > 0 ? _t('account.walletMethods.resendIn', { s: resendCooldown }) : _t('account.walletMethods.otpPanel.resendLink')}
                    </button>
                  </div>
                </div>
              )}

              {/* ═══ Add form ═══ */}
              {adding && !otpIntentId && (
                <div className="mt-2 rounded-xl border border-line bg-white p-5 shadow-sh1">
                  <h3 className="mb-3 text-[14px] font-semibold text-neutral-text">{_t('account.walletMethods.addForm.heading')}</h3>

                  <label className="mb-3.5 block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">{_t('account.walletMethods.addForm.typeLabel')}</span>
                    <select
                      value={type}
                      onChange={(e) => { setType(e.target.value as PayoutMethodTypeKey); setIdentifier(''); setBankCode(''); }}
                      className="w-full rounded-[8px] border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-verify"
                    >
                      {PAYOUT_METHOD_TYPES.map((m) => (
                        <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
                      ))}
                    </select>
                  </label>

                  {typeMeta.needsBank && (
                    <label className="mb-3.5 block">
                      <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">{_t('account.walletMethods.addForm.bankLabel')}</span>
                      <select
                        value={bankCode}
                        onChange={(e) => setBankCode(e.target.value)}
                        className="w-full rounded-[8px] border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-verify"
                      >
                        <option value="">{_t('account.walletMethods.addForm.bankPlaceholder')}</option>
                        {HK_BANKS.map((b) => (
                          <option key={b.code} value={b.code}>{b.code} · {b.name}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="mb-3.5 block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">{typeMeta.needsBank ? _t('account.walletMethods.addForm.accountLabel') : _t('account.walletMethods.addForm.identifierLabel')}</span>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={typeMeta.placeholder}
                      className="w-full rounded-[8px] border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-verify"
                    />
                    <span className="mt-1 block text-[11px] text-neutral-text-hint">{typeMeta.helper}</span>
                  </label>

                  <label className="mb-3.5 block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">{_t('account.walletMethods.addForm.accountNameLabel')}</span>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder={_t('account.walletMethods.addForm.accountNamePlaceholder')}
                      className="w-full rounded-[8px] border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-verify"
                    />
                  </label>

                  <label className="mb-3.5 flex items-center gap-2 text-[13px] text-neutral-text-muted">
                    <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                    {_t('account.walletMethods.addForm.defaultCheckbox')}
                  </label>

                  {formError && (
                    <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{formError}</p>
                  )}

                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => { setAdding(false); resetForm(); }} className="flex-1">{_t('account.walletMethods.cancel')}</Button>
                    <Button onClick={submitAdd} disabled={submitting} className="flex-1">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : _t('account.walletMethods.addForm.submitButton')}
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <PayoutDisclaimer />
              </div>
            </>
          )}
        </section>
      </div>
      {/* ConfirmDialog v2（founder 2026-07-12） */}
      <ConfirmDialog
        open={!!deletingId}
        severity="danger"
        title={_t('account.walletMethods.delete.confirmDialog.title')}
        consequence={_t('account.walletMethods.delete.confirmDialog.body')}
        confirmLabel={_t('account.walletMethods.delete.confirmDialog.confirmLabel')}
        onConfirm={() => deletingId && confirmDelete(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

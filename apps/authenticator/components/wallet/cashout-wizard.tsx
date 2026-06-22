'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardContent } from '@authentik/ui';
import { formatHKD, payoutMethodDisplayLabel, PAYOUT_METHOD_TYPES, PAYOUT_MIN_HKD, type PayoutMethodTypeKey } from '@authentik/utils';
import { api, ApiError } from '@/lib/api';
import { AlertTriangle, Check, ChevronRight, Loader2, X } from 'lucide-react';

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
  /** Override navigation when user has no methods (defaults to consumer link) */
  onAddMethodClick?: () => void;
  /** History route — default /account/wallet/payouts */
  historyHref?: string;
}

type Step = 'method' | 'amount' | 'preview' | 'confirm' | 'submitting' | 'done';

export function CashoutWizard({
  availableHKD,
  feeHKD,
  minHKD = PAYOUT_MIN_HKD,
  maxHKD = 50_000,
  methods,
  onSuccess,
  onCancel,
  onAddMethodClick,
  historyHref = '/earnings',
}: Props) {
  const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0];
  const [step, setStep] = useState<Step>(methods.length === 0 ? 'method' : 'method');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(defaultMethod?.id ?? null);
  const [amountStr, setAmountStr] = useState(String(Math.max(minHKD, Math.min(availableHKD, maxHKD))));
  const [error, setError] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  const selectedMethod = methods.find((m) => m.id === selectedMethodId) ?? null;
  const amount = parseInt(amountStr, 10) || 0;
  const net = Math.max(0, amount - feeHKD);

  const amountInvalid = useMemo(() => {
    if (amount < minHKD) return `最低提款 HKD ${minHKD}`;
    if (amount > maxHKD) return `單次上限 HKD ${maxHKD.toLocaleString()}`;
    if (amount > availableHKD) return `超出可提取餘額 (HKD ${availableHKD.toLocaleString()})`;
    return null;
  }, [amount, minHKD, maxHKD, availableHKD]);

  async function submit() {
    if (!selectedMethod) return;
    setStep('submitting');
    setError(null);
    try {
      const res = await api.wallet.createRequest({
        payoutMethodId: selectedMethod.id,
        amountHKD: amount,
      });
      setSuccessRef(res.reference);
      setStep('done');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '提款失敗，請稍後再試');
      setStep('preview');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">申請提款</h2>
          <button onClick={onCancel} className="rounded-full p-1 hover:bg-slate-100" aria-label="關閉">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step: pick method */}
        {step === 'method' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">請揀提款帳戶</p>
            {methods.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-slate-600">
                  你仲未有提款帳戶。
                  {onAddMethodClick ? (
                    <button onClick={onAddMethodClick} className="ml-1 text-brand-600 underline">
                      新增 →
                    </button>
                  ) : (
                    <Link href="/account/wallet/methods" className="ml-1 text-brand-600 underline">
                      去新增 →
                    </Link>
                  )}
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
                          預設
                        </span>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {onAddMethodClick ? (
                  <button onClick={onAddMethodClick} className="block w-full text-center text-xs text-brand-600 hover:underline">
                    + 新增提款帳戶
                  </button>
                ) : (
                  <Link href="/account/wallet/methods" className="block text-center text-xs text-brand-600 hover:underline">
                    + 新增提款帳戶
                  </Link>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={onCancel} className="flex-1">取消</Button>
              <Button
                onClick={() => setStep('amount')}
                disabled={!selectedMethodId}
                className="flex-1"
              >下一步</Button>
            </div>
          </div>
        )}

        {/* Step: amount */}
        {step === 'amount' && selectedMethod && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              可提取餘額 <span className="font-semibold text-slate-900">{formatHKD(availableHKD)}</span>
            </p>
            <label className="block text-sm">
              <span className="block text-slate-700">提款金額 (HKD)</span>
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
                每次提款 HKD {minHKD} – HKD {Math.min(maxHKD, availableHKD).toLocaleString()}
              </span>
              {amountInvalid && (
                <span className="mt-1 block text-xs text-red-600">{amountInvalid}</span>
              )}
            </label>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setStep('method')} className="flex-1">上一步</Button>
              <Button onClick={() => setStep('preview')} disabled={!!amountInvalid} className="flex-1">下一步</Button>
            </div>
          </div>
        )}

        {/* Step: preview + confirm */}
        {(step === 'preview' || step === 'confirm' || step === 'submitting') && selectedMethod && (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <Row label="提款金額" value={formatHKD(amount)} />
              <Row label="平台手續費" value={feeHKD === 0 ? '免費（目前）' : formatHKD(feeHKD)} />
              <div className="my-1 border-t border-slate-200" />
              <Row label="實收金額" value={<span className="font-semibold text-slate-900">{formatHKD(net)}</span>} />
              <div className="my-1 border-t border-slate-200" />
              <Row
                label="到帳帳戶"
                value={payoutMethodDisplayLabel(selectedMethod.type, selectedMethod.accountIdentifier, selectedMethod.bankCode)}
              />
              <Row label="預計到帳" value="1–3 個工作天" />
            </div>

            {!selectedMethod.nameMatchesKyc && (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  此帳戶持有人姓名 ({selectedMethod.accountName}) 與你嘅 KYC 登記姓名唔同。如出現問題，平台難以協助追索。
                </span>
              </p>
            )}

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
            )}

            {step !== 'confirm' && step !== 'submitting' && (
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={() => setStep('amount')} className="flex-1">上一步</Button>
                <Button onClick={() => setStep('confirm')} className="flex-1">確認提款</Button>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                <p className="font-semibold">⚠️ 提款一旦處理將不可撤回</p>
                <p>
                  如帳戶資料有誤，款項或需 5–10 個工作天追回。請再次核對到帳帳戶。
                </p>
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setStep('preview')} className="flex-1">取消</Button>
                  <Button onClick={submit} className="flex-1 bg-red-600 hover:bg-red-700">
                    我明白，確認提款
                  </Button>
                </div>
              </div>
            )}

            {step === 'submitting' && (
              <div className="flex items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" /> 處理中…
              </div>
            )}
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && successRef && (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-base font-semibold">提款申請已提交</p>
            <p className="text-xs text-slate-500">查詢編號</p>
            <p className="font-mono text-sm text-slate-800">{successRef}</p>
            <p className="text-xs text-slate-500">
              預計 1–3 個工作天到帳。可喺「提款紀錄」追蹤狀態。
            </p>
            <div className="flex gap-2">
              <Link href={historyHref} className="flex-1">
                <Button variant="secondary" className="w-full">關閉</Button>
              </Link>
              <Button onClick={() => onSuccess(successRef)} className="flex-1">完成</Button>
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

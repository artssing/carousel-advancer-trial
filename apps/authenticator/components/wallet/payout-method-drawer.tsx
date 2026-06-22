'use client';

import { useState } from 'react';
import { Button, Card, CardContent } from '@authentik/ui';
import {
  HK_BANKS, PAYOUT_METHOD_TYPES, validatePayoutAccount,
  payoutMethodDisplayLabel, type PayoutMethodTypeKey,
} from '@authentik/utils';
import { api, ApiError } from '@/lib/api';
import { AlertTriangle, Loader2, Star, Trash2, X } from 'lucide-react';

type Method = {
  id: string; type: PayoutMethodTypeKey;
  accountIdentifier: string; bankCode: string | null;
  accountName: string; nameMatchesKyc: boolean;
  isDefault: boolean; isVerified: boolean;
};

export function PayoutMethodDrawer({
  methods, onClose, onChanged,
}: {
  methods: Method[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(methods.length === 0);
  const [type, setType] = useState<PayoutMethodTypeKey>('FPS_PHONE');
  const [identifier, setIdentifier] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typeMeta = PAYOUT_METHOD_TYPES.find((t) => t.key === type)!;

  function reset() {
    setType('FPS_PHONE'); setIdentifier(''); setBankCode(''); setAccountName(''); setIsDefault(false); setFormError(null);
  }

  async function submitAdd() {
    setFormError(null);
    if (!accountName.trim()) { setFormError('請輸入帳戶持有人姓名'); return; }
    const v = validatePayoutAccount(type, identifier, typeMeta.needsBank ? bankCode : undefined);
    if (!v.ok) { setFormError(v.reason ?? '帳戶資料無效'); return; }
    setSubmitting(true);
    try {
      await api.wallet.addMethod({
        type, accountIdentifier: identifier.trim(),
        bankCode: typeMeta.needsBank ? bankCode : undefined,
        accountName: accountName.trim(), isDefault,
      });
      reset(); setAdding(false); onChanged();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : '新增失敗');
    } finally { setSubmitting(false); }
  }

  async function setAsDefault(id: string) {
    try { await api.wallet.setDefault(id); onChanged(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '操作失敗'); }
  }

  async function doDelete(id: string) {
    try { await api.wallet.deleteMethod(id); setDeletingId(null); onChanged(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '刪除失敗'); setDeletingId(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">提款帳戶</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        <div className="space-y-2">
          {methods.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center gap-3 p-3 text-sm">
                <span className="text-xl">{PAYOUT_METHOD_TYPES.find((t) => t.key === m.type)?.icon ?? '💳'}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {payoutMethodDisplayLabel(m.type, m.accountIdentifier, m.bankCode)}
                    {m.isDefault && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">預設</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {m.accountName}
                    {!m.nameMatchesKyc && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> 姓名不符
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                  {!m.isDefault && (
                    <button onClick={() => setAsDefault(m.id)} className="flex items-center gap-1 text-brand-600 hover:underline">
                      <Star className="h-3 w-3" /> 設為預設
                    </button>
                  )}
                  {deletingId === m.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => doDelete(m.id)} className="text-red-600 hover:underline">確定</button>
                      <button onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingId(m.id)} className="flex items-center gap-1 text-slate-500 hover:text-red-600">
                      <Trash2 className="h-3 w-3" /> 刪除
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {adding ? (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3">
            <h3 className="text-sm font-semibold">新增帳戶</h3>
            <label className="block text-sm">
              <span className="block text-slate-700">提款方式</span>
              <select
                value={type}
                onChange={(e) => { setType(e.target.value as PayoutMethodTypeKey); setIdentifier(''); setBankCode(''); }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {PAYOUT_METHOD_TYPES.map((m) => (
                  <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
                ))}
              </select>
            </label>
            {typeMeta.needsBank && (
              <label className="block text-sm">
                <span className="block text-slate-700">銀行</span>
                <select value={bankCode} onChange={(e) => setBankCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— 揀銀行 —</option>
                  {HK_BANKS.map((b) => <option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="block text-slate-700">{typeMeta.needsBank ? '戶口號碼' : '帳號識別符'}</span>
              <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                placeholder={typeMeta.placeholder}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <span className="mt-1 block text-xs text-slate-500">{typeMeta.helper}</span>
            </label>
            <label className="block text-sm">
              <span className="block text-slate-700">帳戶持有人姓名</span>
              <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)}
                placeholder="與銀行 / FPS 登記姓名一致"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              設為預設
            </label>
            {formError && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{formError}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setAdding(false); reset(); }} className="flex-1">
                {methods.length === 0 ? '稍後再加' : '取消'}
              </Button>
              <Button onClick={submitAdd} disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : '儲存帳戶'}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setAdding(true)} className="mt-3 w-full">+ 新增帳戶</Button>
        )}
      </div>
    </div>
  );
}

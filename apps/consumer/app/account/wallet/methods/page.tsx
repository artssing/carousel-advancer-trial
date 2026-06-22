'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, PayoutDisclaimer } from '@authentik/ui';
import {
  HK_BANKS, PAYOUT_METHOD_TYPES, validatePayoutAccount,
  payoutMethodDisplayLabel, type PayoutMethodTypeKey,
} from '@authentik/utils';
import { api, hasToken, ApiError } from '@/lib/api';
import { ArrowLeft, Plus, Star, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

type Method = Awaited<ReturnType<typeof api.wallet.methods>>[number];

export default function MethodsPage() {
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

  async function refresh() {
    try {
      const m = await api.wallet.methods();
      setMethods(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '載入失敗');
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
      setFormError('請輸入帳戶持有人姓名');
      return;
    }
    const v = validatePayoutAccount(type, identifier, meta.needsBank ? bankCode : undefined);
    if (!v.ok) {
      setFormError(v.reason ?? '帳戶資料無效');
      return;
    }
    setSubmitting(true);
    try {
      await api.wallet.addMethod({
        type,
        accountIdentifier: identifier.trim(),
        bankCode: meta.needsBank ? bankCode : undefined,
        accountName: accountName.trim(),
        isDefault,
      });
      setAdding(false);
      resetForm();
      await refresh();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : '新增失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function setAsDefault(id: string) {
    try {
      await api.wallet.setDefault(id);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '操作失敗');
    }
  }

  async function confirmDelete(id: string) {
    try {
      await api.wallet.deleteMethod(id);
      setDeletingId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '刪除失敗');
      setDeletingId(null);
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-500">載入中…</div>;

  const typeMeta = PAYOUT_METHOD_TYPES.find((t) => t.key === type)!;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header className="flex items-center gap-2">
        <Link href="/account/wallet" className="rounded-md p-1 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold">提款帳戶</h1>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* List */}
      <div className="space-y-2">
        {methods.length === 0 && !adding && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-slate-500">
              你仲未有提款帳戶。撳「新增帳戶」開始。
            </CardContent>
          </Card>
        )}
        {methods.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center gap-3 p-4 text-sm">
              <span className="text-xl">
                {PAYOUT_METHOD_TYPES.find((t) => t.key === m.type)?.icon ?? '💳'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {payoutMethodDisplayLabel(m.type, m.accountIdentifier, m.bankCode)}
                  {m.isDefault && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      預設
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {m.accountName}
                  {!m.nameMatchesKyc && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> 姓名與 KYC 唔同
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {!m.isDefault && (
                  <button
                    onClick={() => setAsDefault(m.id)}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <Star className="h-3 w-3" /> 設為預設
                  </button>
                )}
                {deletingId === m.id ? (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-600">確定刪除？</span>
                    <button onClick={() => confirmDelete(m.id)} className="text-red-600 hover:underline">確定</button>
                    <button onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">取消</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(m.id)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" /> 刪除
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add form */}
      {adding ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">新增提款帳戶</h3>

            <label className="block text-sm">
              <span className="block text-slate-700">提款方式</span>
              <select
                value={type}
                onChange={(e) => { setType(e.target.value as PayoutMethodTypeKey); setIdentifier(''); setBankCode(''); }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {PAYOUT_METHOD_TYPES.map((m) => (
                  <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
                ))}
              </select>
            </label>

            {typeMeta.needsBank && (
              <label className="block text-sm">
                <span className="block text-slate-700">銀行</span>
                <select
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">— 揀銀行 —</option>
                  {HK_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>{b.code} · {b.name}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm">
              <span className="block text-slate-700">{typeMeta.needsBank ? '戶口號碼' : '帳號識別符'}</span>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={typeMeta.placeholder}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="mt-1 block text-xs text-slate-500">{typeMeta.helper}</span>
            </label>

            <label className="block text-sm">
              <span className="block text-slate-700">帳戶持有人姓名</span>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="與銀行 / FPS 登記嘅姓名一致"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>設為預設帳戶</span>
            </label>

            {formError && (
              <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{formError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => { setAdding(false); resetForm(); }} className="flex-1">
                取消
              </Button>
              <Button onClick={submitAdd} disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : '儲存帳戶'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)} className="w-full">
          <Plus className="mr-1 h-4 w-4" /> 新增帳戶
        </Button>
      )}

      <PayoutDisclaimer />
    </div>
  );
}

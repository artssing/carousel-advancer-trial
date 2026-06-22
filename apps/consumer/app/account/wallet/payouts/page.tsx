'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, PayoutDisclaimer } from '@authentik/ui';
import { formatHKD, PAYOUT_STATUS_META, type PayoutStatusKey } from '@authentik/utils';
import { api, hasToken, ApiError } from '@/lib/api';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { StatusPill } from '@/components/wallet/status-pill';

type Request = Awaited<ReturnType<typeof api.wallet.requests>>[number];

const FAIL_REASON_LABEL: Record<string, string> = {
  BANK_REJECTED: '銀行拒收',
  INVALID_ACCOUNT: '帳戶資料無效',
  BENEFICIARY_MISMATCH: '收款人姓名不符',
  KYC_REQUIRED: '需要進階身份驗證',
};

export default function PayoutsHistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | PayoutStatusKey>('ALL');
  const [copied, setCopied] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  async function refresh() {
    try {
      const r = await api.wallet.requests();
      setItems(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasToken()) {
      router.replace('/login?next=/account/wallet/payouts');
      return;
    }
    refresh();
  }, [router]);

  // Auto-refresh if any active mock state machine running
  useEffect(() => {
    const active = items.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING');
    if (!active) return;
    const t = setTimeout(() => { setTick((n) => n + 1); refresh(); }, 3000);
    return () => clearTimeout(t);
  }, [items, tick]);

  function copy(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopied(s);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const filtered = filter === 'ALL' ? items : items.filter((r) => r.status === filter);
  const tabs: Array<{ key: 'ALL' | PayoutStatusKey; label: string }> = [
    { key: 'ALL', label: '全部' },
    { key: 'PENDING', label: '待處理' },
    { key: 'PROCESSING', label: '處理中' },
    { key: 'SUCCEEDED', label: '已完成' },
    { key: 'FAILED', label: '失敗' },
  ];

  if (loading) return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-500">載入中…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header className="flex items-center gap-2">
        <Link href="/account/wallet" className="rounded-md p-1 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold">提款紀錄</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            尚未有任何提款紀錄
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{formatHKD(r.amountHKD)}</p>
                    <p className="text-xs text-slate-500">
                      實收 {formatHKD(r.netHKD)} · 手續費 {r.feeHKD === 0 ? '免費' : formatHKD(r.feeHKD)}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">到帳帳戶</span>
                    <span className="truncate text-right">
                      {r.methodSnapshot?.displayLabel ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">參考編號</span>
                    <button
                      onClick={() => copy(r.reference)}
                      className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-brand-600"
                    >
                      {r.reference}
                      {copied === r.reference ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">提交時間</span>
                    <span>{new Date(r.createdAt).toLocaleString('zh-HK')}</span>
                  </div>
                  {r.processedAt && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">處理時間</span>
                      <span>{new Date(r.processedAt).toLocaleString('zh-HK')}</span>
                    </div>
                  )}
                </div>

                {r.status === 'FAILED' && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                    <p className="font-semibold">
                      失敗原因：{FAIL_REASON_LABEL[r.failureReason ?? ''] ?? r.failureReason ?? '未知'}
                    </p>
                    <p className="mt-1">
                      請喺
                      <Link href="/account/wallet/methods" className="ml-1 underline">提款帳戶</Link>
                      核對資料，或者
                      <Link href="/account/wallet" className="ml-1 underline">重新申請提款</Link>。
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PayoutDisclaimer />
    </div>
  );
}

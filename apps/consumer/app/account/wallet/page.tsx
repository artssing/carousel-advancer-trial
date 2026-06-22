'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, PayoutDisclaimer } from '@authentik/ui';
import { formatHKD, PAYOUT_STATUS_META, payoutMethodDisplayLabel, type PayoutMethodTypeKey, type PayoutStatusKey } from '@authentik/utils';
import { api, hasToken, ApiError } from '@/lib/api';
import { CashoutWizard } from '@/components/wallet/cashout-wizard';
import { StatusPill } from '@/components/wallet/status-pill';
import { ChevronRight, Lock, Wallet as WalletIcon, Clock, TrendingUp, Send } from 'lucide-react';

type Balance = Awaited<ReturnType<typeof api.wallet.balance>>;
type Method = Awaited<ReturnType<typeof api.wallet.methods>>[number];
type Request = Awaited<ReturnType<typeof api.wallet.requests>>[number];

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [recent, setRecent] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pollTick, setPollTick] = useState(0);

  async function refresh() {
    try {
      setError(null);
      const [b, m, r] = await Promise.all([
        api.wallet.balance(),
        api.wallet.methods(),
        api.wallet.requests(),
      ]);
      setBalance(b);
      setMethods(m);
      setRecent(r.slice(0, 5));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasToken()) {
      router.replace('/login?next=/account/wallet');
      return;
    }
    refresh();
  }, [router]);

  // Poll while any payout is PENDING/PROCESSING (mock state machine)
  useEffect(() => {
    const active = recent.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING');
    if (!active) return;
    const t = setTimeout(() => {
      setPollTick((n) => n + 1);
      refresh();
    }, 3000);
    return () => clearTimeout(t);
  }, [recent, pollTick]);

  if (loading) return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-500">載入中…</div>;
  if (error) return <div className="mx-auto max-w-3xl p-6 text-sm text-red-600">{error}</div>;
  if (!balance) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <WalletIcon className="h-6 w-6 text-brand-600" /> 我的錢包
        </h1>
        <Link href="/account/wallet/methods" className="text-xs text-brand-600 hover:underline">
          管理提款帳戶 →
        </Link>
      </header>

      {/* Balance three-tier */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <BalanceTile
              icon={<Lock className="h-4 w-4" />}
              label="鎖定中"
              hint="鑑定 / 爭議中"
              valueHKD={balance.lockedHKD}
              tone="slate"
            />
            <BalanceTile
              icon={<Clock className="h-4 w-4" />}
              label="待結算"
              hint="完成 72 小時後可提取"
              valueHKD={balance.pendingHoldHKD}
              tone="amber"
            />
            <BalanceTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="可提取"
              hint="現在可申請提款"
              valueHKD={balance.availableHKD}
              tone="emerald"
              emphasis
            />
            <BalanceTile
              icon={<Send className="h-4 w-4" />}
              label="提款處理中"
              hint={balance.inFlightCount > 0 ? `${balance.inFlightCount} 筆已申請、未到帳` : '無進行中提款'}
              valueHKD={balance.inFlightHKD}
              tone="blue"
            />
          </div>
          <Button
            onClick={() => setWizardOpen(true)}
            disabled={balance.availableHKD < balance.minHKD}
            className="w-full"
          >
            申請提款
          </Button>
          {balance.availableHKD < balance.minHKD && balance.availableHKD > 0 && (
            <p className="text-center text-xs text-slate-500">
              最低提款金額 HKD {balance.minHKD}。
            </p>
          )}
          {balance.availableHKD === 0 && (
            <p className="text-center text-xs text-slate-500">
              暫無可提取餘額。完成交易並過咗 72 小時保護期後即可提款。
            </p>
          )}
        </CardContent>
      </Card>

      {/* Breakdown by source */}
      {balance.breakdown.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">餘額來源</h3>
            <ul className="space-y-2">
              {balance.breakdown.map((b) => (
                <li key={`${b.orderId}-${b.role}`} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/orders/${b.orderId}`} className="block truncate text-slate-900 hover:text-brand-600 hover:underline">
                      {b.listingTitle}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {b.role === 'SELLER' ? '銷售收入' : '鑑定收入'}
                      {b.bucket === 'PENDING' && b.eligibleAt && (
                        <span className="ml-2">· 可提取於 {new Date(b.eligibleAt).toLocaleDateString('zh-HK')}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium ${
                      b.bucket === 'AVAILABLE' ? 'text-emerald-700'
                        : b.bucket === 'PENDING' ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {formatHKD(b.amountHKD)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recent payouts */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">最近提款</h3>
            <Link href="/account/wallet/payouts" className="text-xs text-brand-600 hover:underline">
              全部紀錄 →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">尚未有提款紀錄</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{formatHKD(r.amountHKD)}</p>
                    <p className="truncate text-xs text-slate-500">
                      {r.methodSnapshot?.displayLabel ?? '—'} · {r.reference}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <PayoutDisclaimer />

      {wizardOpen && (
        <CashoutWizard
          availableHKD={balance.availableHKD}
          feeHKD={balance.payoutFeeHKD}
          minHKD={balance.minHKD}
          maxHKD={balance.maxHKD}
          methods={methods as any}
          onSuccess={() => {
            setWizardOpen(false);
            refresh();
          }}
          onCancel={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}

function BalanceTile({
  icon, label, hint, valueHKD, tone, emphasis,
}: {
  icon: React.ReactNode; label: string; hint: string; valueHKD: number;
  tone: 'slate' | 'amber' | 'emerald' | 'blue'; emphasis?: boolean;
}) {
  const toneCls = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : tone === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : tone === 'blue'
    ? 'border-blue-200 bg-blue-50 text-blue-900'
    : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <div className={`rounded-lg border ${toneCls} p-3`}>
      <p className="flex items-center gap-1.5 text-xs">{icon} {label}</p>
      <p className={`mt-1 font-semibold ${emphasis ? 'text-2xl' : 'text-xl'}`}>
        {formatHKD(valueHKD)}
      </p>
      <p className="text-[11px] opacity-75">{hint}</p>
    </div>
  );
}


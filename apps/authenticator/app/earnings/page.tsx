'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, PayoutDisclaimer } from '@authentik/ui';
import { formatHKD, PAYOUT_STATUS_META, type PayoutStatusKey } from '@authentik/utils';
import { api, hasToken, type InboxOrder } from '@/lib/api';
import { CashoutWizard } from '@/components/wallet/cashout-wizard';
import { PayoutMethodDrawer } from '@/components/wallet/payout-method-drawer';
import { Wallet, Lock, Clock, TrendingUp, Copy, Check, Send } from 'lucide-react';

interface MonthBucket { m: string; revenue: number; count: number; }

type Balance = Awaited<ReturnType<typeof api.wallet.balance>>;
type Method = Awaited<ReturnType<typeof api.wallet.methods>>[number];
type Request = Awaited<ReturnType<typeof api.wallet.requests>>[number];

const FAIL_REASON: Record<string, string> = {
  BANK_REJECTED: '銀行拒收',
  INVALID_ACCOUNT: '帳戶資料無效',
  BENEFICIARY_MISMATCH: '收款人姓名不符',
};

export default function EarningsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wallet state
  const [balance, setBalance] = useState<Balance | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [payouts, setPayouts] = useState<Request[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  async function refreshWallet() {
    try {
      const [b, m, r] = await Promise.all([
        api.wallet.balance(), api.wallet.methods(), api.wallet.requests(),
      ]);
      setBalance(b); setMethods(m); setPayouts(r);
    } catch (e: any) {
      // Silent — earnings page main UX still works without wallet
      // eslint-disable-next-line no-console
      console.warn('wallet load failed', e);
    }
  }

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    api.orders.inbox().then(setOrders).catch((e) => setError(e.message)).finally(() => setLoading(false));
    refreshWallet();
  }, [router]);

  // Poll while any payout is active
  useEffect(() => {
    const active = payouts.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING');
    if (!active) return;
    const t = setTimeout(() => { setTick((n) => n + 1); refreshWallet(); }, 3000);
    return () => clearTimeout(t);
  }, [payouts, tick]);

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-12 text-sm text-slate-500">載入中…</div>;
  if (error) return <div className="mx-auto max-w-4xl px-6 py-12 text-sm text-red-600">{error}</div>;

  const DONE_STATUSES = ['AUTH_PASSED', 'AUTH_FAILED', 'SHIPPED_TO_BUYER', 'DELIVERED', 'COMPLETED'];
  const completed = orders.filter((o) => DONE_STATUSES.includes(o.status));
  const pending = orders.filter((o) => ['PAID', 'SHIPPED_TO_AUTHENTICATOR', 'AUTHENTICATING'].includes(o.status));

  const totalEarned = completed.reduce((s, o) => s + (o.authFeeHKD ?? 0), 0);
  const pendingEarnings = pending.reduce((s, o) => s + (o.authFeeHKD ?? 0), 0);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthCompleted = completed.filter((o) => (o.createdAt ?? '').startsWith(currentMonth));
  const thisMonthEarned = thisMonthCompleted.reduce((s, o) => s + (o.authFeeHKD ?? 0), 0);

  const byMonth = new Map<string, MonthBucket>();
  for (const o of completed) {
    const m = (o.createdAt ?? '').slice(0, 7) || '未知';
    const b = byMonth.get(m) ?? { m, revenue: 0, count: 0 };
    b.revenue += o.authFeeHKD ?? 0; b.count += 1;
    byMonth.set(m, b);
  }
  const months = Array.from(byMonth.values()).sort((a, b) => b.m.localeCompare(a.m));
  const recentPayouts = payouts.slice(0, 5);

  function copy(s: string) {
    navigator.clipboard.writeText(s).then(() => { setCopied(s); setTimeout(() => setCopied(null), 1500); });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold">收入儀表板</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-400">本月收入</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{formatHKD(thisMonthEarned)}</p>
            <p className="mt-1 text-xs text-slate-500">{thisMonthCompleted.length} 件 · {currentMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-400">累計已完成收入</p>
            <p className="mt-1 text-2xl font-bold text-brand-600">{formatHKD(totalEarned)}</p>
            <p className="mt-1 text-xs text-slate-500">{completed.length} 件已完成</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-400">進行中預計收入</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{formatHKD(pendingEarnings)}</p>
            <p className="mt-1 text-xs text-slate-500">{pending.length} 件處理中</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>月份收入</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {months.length === 0 ? (
            <p className="text-sm text-slate-500">暫無已完成的鑑定收入。</p>
          ) : (
            (() => {
              const maxRev = Math.max(...months.map((m) => m.revenue), 1);
              return months.map((m) => (
                <div key={m.m} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{m.m}</p>
                      <p className="text-xs text-slate-500">{m.count} 件鑑定</p>
                    </div>
                    <p className="text-lg font-semibold">{formatHKD(m.revenue)}</p>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-brand-400 transition-all"
                      style={{ width: `${(m.revenue / maxRev) * 100}%` }} />
                  </div>
                </div>
              ));
            })()
          )}
        </CardContent>
      </Card>

      {/* ── Wallet / Cashout section (Q3: self-service replacing auto-monthly) ── */}
      {balance && (
        <Card className="mt-6 border-brand-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-brand-600" /> 提取收入
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile icon={<Lock className="h-4 w-4" />} label="鎖定中" hint="鑑定 / 爭議" value={balance.lockedHKD} tone="slate" />
              <Tile icon={<Clock className="h-4 w-4" />} label="待結算" hint="72 小時後可提取" value={balance.pendingHoldHKD} tone="amber" />
              <Tile icon={<TrendingUp className="h-4 w-4" />} label="可提取" hint="即可申請" value={balance.availableHKD} tone="emerald" emphasis />
              <Tile
                icon={<Send className="h-4 w-4" />}
                label="提款處理中"
                hint={balance.inFlightCount > 0 ? `${balance.inFlightCount} 筆未到帳` : '無進行中提款'}
                value={balance.inFlightHKD}
                tone="blue"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setWizardOpen(true)} disabled={balance.availableHKD < balance.minHKD} className="flex-1">
                申請提款
              </Button>
              <Button variant="secondary" onClick={() => setMethodsOpen(true)} className="flex-1">
                管理提款帳戶 ({methods.length})
              </Button>
            </div>
            {balance.availableHKD === 0 && (
              <p className="text-center text-xs text-slate-500">
                暫無可提取餘額。完成鑑定並過咗 72 小時保護期後即可提款。
              </p>
            )}

            {recentPayouts.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-semibold text-slate-600">最近提款</p>
                <ul className="space-y-1.5">
                  {recentPayouts.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          {formatHKD(r.amountHKD)} · {r.methodSnapshot?.displayLabel ?? '—'}
                        </p>
                        <button
                          onClick={() => copy(r.reference)}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-brand-600"
                        >
                          {r.reference}
                          {copied === r.reference ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                        {r.status === 'FAILED' && r.failureReason && (
                          <p className="text-[11px] text-red-600">失敗：{FAIL_REASON[r.failureReason] ?? r.failureReason}</p>
                        )}
                      </div>
                      <StatusPill status={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <PayoutDisclaimer />
          </CardContent>
        </Card>
      )}

      {wizardOpen && balance && (
        <CashoutWizard
          availableHKD={balance.availableHKD}
          feeHKD={balance.payoutFeeHKD}
          minHKD={balance.minHKD}
          maxHKD={balance.maxHKD}
          methods={methods as any}
          onSuccess={() => { setWizardOpen(false); refreshWallet(); }}
          onCancel={() => setWizardOpen(false)}
          onAddMethodClick={() => { setWizardOpen(false); setMethodsOpen(true); }}
          historyHref="/earnings"
        />
      )}
      {methodsOpen && (
        <PayoutMethodDrawer
          methods={methods as any}
          onClose={() => setMethodsOpen(false)}
          onChanged={refreshWallet}
        />
      )}
    </div>
  );
}

function Tile({
  icon, label, hint, value, tone, emphasis,
}: { icon: React.ReactNode; label: string; hint: string; value: number; tone: 'slate' | 'amber' | 'emerald' | 'blue'; emphasis?: boolean }) {
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
      <p className={`mt-1 font-semibold ${emphasis ? 'text-2xl' : 'text-xl'}`}>{formatHKD(value)}</p>
      <p className="text-[11px] opacity-75">{hint}</p>
    </div>
  );
}

function StatusPill({ status }: { status: PayoutStatusKey | string }) {
  const meta = PAYOUT_STATUS_META[status as PayoutStatusKey] ?? { label: status, tone: 'slate' as const };
  const toneCls: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneCls[meta.tone]}`}>
      {meta.label}
    </span>
  );
}

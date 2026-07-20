'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PayoutDisclaimer } from '@authentik/ui';
import { formatHKD, PAYOUT_STATUS_META, type PayoutStatusKey } from '@authentik/utils';
import { api, hasToken, type InboxOrder } from '@/lib/api';
import { CashoutWizard } from '@/components/wallet/cashout-wizard';
import { PayoutMethodDrawer } from '@/components/wallet/payout-method-drawer';
import { AuthTopline, AuthContent } from '@/components/auth-topline';
import { Copy, Check } from 'lucide-react';

interface MonthBucket { m: string; revenue: number; count: number; }

type Balance = Awaited<ReturnType<typeof api.wallet.balance>>;
type Method = Awaited<ReturnType<typeof api.wallet.methods>>[number];
type Request = Awaited<ReturnType<typeof api.wallet.requests>>[number];

const FAIL_REASON: Record<string, string> = {
  BANK_REJECTED: '銀行拒收',
  INVALID_ACCOUNT: '帳戶資料無效',
  BENEFICIARY_MISMATCH: '收款人姓名不符',
};

type TxnFilter = 'ALL' | 'PAID' | 'PENDING' | 'PAYOUT';

export default function EarningsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [balance, setBalance] = useState<Balance | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [payouts, setPayouts] = useState<Request[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<TxnFilter>('ALL');

  async function refreshWallet() {
    try {
      const [b, m, r] = await Promise.all([
        api.wallet.balance(), api.wallet.methods(), api.wallet.requests(),
      ]);
      setBalance(b); setMethods(m); setPayouts(r);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('wallet load failed', e);
    }
  }

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    api.orders.inbox().then(setOrders).catch((e) => setError(e.message)).finally(() => setLoading(false));
    refreshWallet();
  }, [router]);

  useEffect(() => {
    const active = payouts.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING');
    if (!active) return;
    const t = setTimeout(() => { setTick((n) => n + 1); refreshWallet(); }, 3000);
    return () => clearTimeout(t);
  }, [payouts, tick]);

  if (loading) {
    return (
      <>
        <AuthTopline title="收入" subtitle="款項於鑑定通過並完成交收後入賬" />
        <AuthContent><div className="h-40 animate-pulse rounded-xl bg-surface-2" /></AuthContent>
      </>
    );
  }
  if (error) {
    return (
      <>
        <AuthTopline title="收入" />
        <AuthContent><p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p></AuthContent>
      </>
    );
  }

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

  function copy(s: string) {
    navigator.clipboard.writeText(s).then(() => { setCopied(s); setTimeout(() => setCopied(null), 1500); });
  }

  const tabs: { key: TxnFilter; label: string }[] = [
    { key: 'ALL', label: '全部' },
    { key: 'PAID', label: '已入賬' },
    { key: 'PENDING', label: '待入賬' },
    { key: 'PAYOUT', label: '提現' },
  ];

  return (
    <>
      <AuthTopline title="收入" subtitle="款項於鑑定通過並完成交收後入賬" />
      <AuthContent>
        {/* ═══ Balance card — sample .balcard ═══ */}
        <div className="relative overflow-hidden rounded-[14px] bg-gradient-to-br from-authBrand-900 to-authBrand-700 p-7 text-white shadow-auth-sh3">
          <div className="text-[12px] uppercase tracking-[0.1em] text-authBrand-200">可提現餘額</div>
          <div className="mt-2 text-[38px] font-extrabold leading-none">
            {formatHKD(balance?.availableHKD ?? 0)}
          </div>
          {(balance?.lockedHKD ?? 0) + (balance?.pendingHoldHKD ?? 0) > 0 && (
            <div className="mt-1.5 text-[13px] text-authBrand-200">
              另有 {formatHKD((balance?.lockedHKD ?? 0) + (balance?.pendingHoldHKD ?? 0))} 待入賬（
              {pending.length} 宗鑑定進行中）
            </div>
          )}
          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              disabled={!balance || balance.availableHKD < balance.minHKD}
              className="rounded-lg bg-authBrand-500 px-5 py-2.5 text-[14px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600 disabled:opacity-40"
            >
              提現
            </button>
            <button
              type="button"
              onClick={() => setMethodsOpen(true)}
              className="rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-white/20"
            >
              管理提款帳戶 ({methods.length})
            </button>
          </div>
          <span className="pointer-events-none absolute bottom-3.5 right-5 text-[14px] font-extrabold tracking-[0.16em] opacity-30">
            AUTHENTICATOR
          </span>
        </div>

        {balance && balance.availableHKD < balance.minHKD && balance.availableHKD > 0 && (
          <p className="mt-2 text-xs text-neutral-text-hint">最低提款金額 HKD {balance.minHKD}。</p>
        )}

        {/* ═══ Sub-stats row ═══ */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-line bg-white p-5 shadow-auth-sh1">
            <div className="text-[22px] font-extrabold text-authBrand-900">{formatHKD(thisMonthEarned)}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">
              本月收入 · {thisMonthCompleted.length} 件
            </div>
          </div>
          <div className="rounded-xl border border-line bg-white p-5 shadow-auth-sh1">
            <div className="text-[22px] font-extrabold text-authBrand-900">{completed.length}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">
              累計完成
            </div>
          </div>
          <div className="rounded-xl border border-line bg-white p-5 shadow-auth-sh1">
            <div className="text-[22px] font-extrabold text-authBrand-900">{formatHKD(totalEarned)}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">
              累計收入
            </div>
          </div>
        </div>

        {/* ═══ Transactions card w/ tabs ═══ */}
        <div className="mt-5 rounded-xl border border-line bg-white p-5 shadow-auth-sh1">
          <div className="mb-4 flex gap-1 overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain border-b border-line">
            {tabs.map((t) => {
              const isActive = filter === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`shrink-0 -mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold transition ${
                    isActive
                      ? 'border-authBrand-500 text-authBrand-900'
                      : 'border-transparent text-neutral-text-hint hover:text-neutral-text-muted'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Completed txn rows */}
          {(filter === 'ALL' || filter === 'PAID') && completed.slice(0, 20).map((o) => (
            <TxnRow
              key={`c-${o.id}`}
              icon="✓"
              iconColor="text-verdict-pass"
              title={`${o.listing?.title ?? '訂單'} · 鑑定費`}
              subtitle={`訂單 #${o.id.slice(0, 8).toUpperCase()} · 已通過 · 已入賬 · ${(o.createdAt ?? '').slice(0, 10)}`}
              amount={`+${formatHKD(o.authFeeHKD ?? 0)}`}
              amountColor="text-verdict-pass"
            />
          ))}

          {/* Pending rows */}
          {(filter === 'ALL' || filter === 'PENDING') && pending.slice(0, 20).map((o) => (
            <TxnRow
              key={`p-${o.id}`}
              icon="◷"
              iconColor="text-verdict-incon"
              title={`${o.listing?.title ?? '訂單'} · 鑑定費`}
              subtitle={`訂單 #${o.id.slice(0, 8).toUpperCase()} · 鑑定中 · 待入賬`}
              amount={formatHKD(o.authFeeHKD ?? 0)}
              amountColor="text-neutral-text-hint"
            />
          ))}

          {/* Payout rows */}
          {(filter === 'ALL' || filter === 'PAYOUT') && payouts.slice(0, 10).map((r) => (
            <div key={`r-${r.id}`} className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[15px] font-extrabold text-neutral-text-muted">
                ↑
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-neutral-text">
                  提現至 {r.methodSnapshot?.displayLabel ?? '—'}
                </p>
                <button
                  onClick={() => copy(r.reference)}
                  className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-neutral-text-hint hover:text-authBrand-500"
                >
                  {r.reference}
                  {copied === r.reference ? <Check className="h-3 w-3 text-verdict-pass" /> : <Copy className="h-3 w-3" />}
                </button>
                {r.status === 'FAILED' && r.failureReason && (
                  <p className="mt-0.5 text-[11px] text-danger">失敗：{FAIL_REASON[r.failureReason] ?? r.failureReason}</p>
                )}
              </div>
              <StatusPill status={r.status} />
              <span className="shrink-0 text-[14px] font-bold text-neutral-text">
                −{formatHKD(r.amountHKD)}
              </span>
            </div>
          ))}

          {completed.length === 0 && pending.length === 0 && payouts.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-text-hint">暫無交易紀錄。</p>
          )}
        </div>

        {/* ═══ Monthly breakdown ═══ */}
        {months.length > 0 && (
          <div className="mt-5 rounded-xl border border-line bg-white p-5 shadow-auth-sh1">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
              月份收入
            </div>
            <div className="space-y-3">
              {(() => {
                const maxRev = Math.max(...months.map((m) => m.revenue), 1);
                return months.map((m) => (
                  <div key={m.m}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="font-semibold text-neutral-text">{m.m}</span>
                      <span className="text-neutral-text-muted">
                        {formatHKD(m.revenue)} · {m.count} 件
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-2">
                      <div
                        className="h-1.5 rounded-full bg-authBrand-500 transition-all"
                        style={{ width: `${(m.revenue / maxRev) * 100}%` }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        <div className="mt-4">
          <PayoutDisclaimer />
        </div>

        <p className="mt-2 text-[11px] text-neutral-text-hint">
          「不通過」及「未能確定」不影響鑑定費收取。金額以 server 記錄為準。
        </p>
      </AuthContent>

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
    </>
  );
}

function TxnRow({
  icon, iconColor, title, subtitle, amount, amountColor,
}: {
  icon: string; iconColor: string; title: string; subtitle: string;
  amount: string; amountColor: string;
}) {
  return (
    <div className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0">
      <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[15px] font-extrabold ${iconColor}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-neutral-text">{title}</p>
        <p className="mt-0.5 truncate text-[12px] text-neutral-text-hint">{subtitle}</p>
      </div>
      <span className={`shrink-0 text-[14px] font-bold ${amountColor}`}>{amount}</span>
    </div>
  );
}

function StatusPill({ status }: { status: PayoutStatusKey | string }) {
  const meta = PAYOUT_STATUS_META[status as PayoutStatusKey] ?? { label: status, tone: 'slate' as const };
  // Map generic tones to authenticator L3 verdict palette where sensible.
  const toneCls: Record<string, string> = {
    amber: 'bg-verdict-incon-soft text-verdict-incon',
    blue: 'bg-authBrand-soft text-authBrand-600',
    emerald: 'bg-verdict-pass-soft text-verdict-pass',
    red: 'bg-verdict-fail-soft text-verdict-fail',
    slate: 'bg-surface-2 text-neutral-text-muted',
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${toneCls[meta.tone]}`}>
      {meta.label}
    </span>
  );
}

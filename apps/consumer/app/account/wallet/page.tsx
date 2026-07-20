'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PayoutDisclaimer } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';
import { api, hasToken, ApiError } from '@/lib/api';
import { CashoutWizard } from '@/components/wallet/cashout-wizard';
import { StatusPill } from '@/components/wallet/status-pill';
import { AccountSidebar } from '@/components/account/account-sidebar';

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
      setRecent(r.slice(0, 6));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasToken()) { router.replace('/login?next=/account/wallet'); return; }
    refresh();
  }, [router]);

  useEffect(() => {
    const active = recent.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING');
    if (!active) return;
    const t = setTimeout(() => { setPollTick((n) => n + 1); refresh(); }, 3000);
    return () => clearTimeout(t);
  }, [recent, pollTick]);

  const heldTotal = balance ? balance.lockedHKD + balance.pendingHoldHKD : 0;

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-8 sm:px-6">
      <div className="grid items-start gap-8 lg:grid-cols-[220px_1fr]">
        <AccountSidebar />

        <section>
          <h1 className="mb-5 font-display-serif text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">
            錢包
          </h1>

          {loading ? (
            <div className="h-40 animate-pulse rounded-[14px] bg-surface-2" />
          ) : error ? (
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          ) : balance ? (
            <>
              {/* ═══ Navy balance card ═══ */}
              <div className="relative overflow-hidden rounded-[14px] bg-gradient-to-br from-ink to-[#123f5f] p-7 text-white shadow-sh3">
                <div className="text-[12px] uppercase tracking-[0.1em] text-[#9db4cc]">可提現餘額</div>
                <div className="mt-2 text-[38px] font-extrabold leading-none">{formatHKD(balance.availableHKD)}</div>
                {heldTotal > 0 && (
                  <div className="mt-1.5 text-[13px] text-[#9db4cc]">
                    另有 {formatHKD(heldTotal)} 託管中（待鑑定 / 交收完成後入賬）
                  </div>
                )}
                <div className="mt-5 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setWizardOpen(true)}
                    disabled={balance.availableHKD < balance.minHKD}
                    className="rounded-lg bg-brand-600 px-5 py-2.5 text-[14px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(0,135,102,0.5)] transition hover:bg-brand-400 disabled:opacity-40"
                  >
                    提現
                  </button>
                  <Link
                    href="/account/wallet/payouts"
                    className="rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-white/20"
                  >
                    交易紀錄
                  </Link>
                </div>
                <span className="pointer-events-none absolute bottom-3.5 right-5 font-display-serif text-[14px] font-extrabold tracking-[0.16em] opacity-35">
                  SECURE ESCROW
                </span>
              </div>

              {balance.availableHKD < balance.minHKD && balance.availableHKD > 0 && (
                <p className="mt-2 text-xs text-neutral-text-hint">最低提款金額 HKD {balance.minHKD}。</p>
              )}

              {/* ═══ Subcards ═══ */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-line bg-white p-5 shadow-sh1">
                  <div className="text-[22px] font-extrabold text-ink">{formatHKD(heldTotal)}</div>
                  <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">託管中</div>
                </div>
                <div className="rounded-xl border border-line bg-white p-5 shadow-sh1">
                  <div className="text-[22px] font-extrabold text-ink">{formatHKD(balance.grossEarnedHKD)}</div>
                  <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">累計收入</div>
                </div>
              </div>

              {/* ═══ Balance sources (income) ═══ */}
              {balance.breakdown.length > 0 && (
                <div className="mt-4 rounded-xl border border-line bg-white p-5 shadow-sh1">
                  <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">餘額來源</div>
                  {balance.breakdown.map((b) => (
                    <div key={`${b.orderId}-${b.role}`} className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0">
                      <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[15px] font-extrabold ${b.bucket === 'AVAILABLE' ? 'text-verify' : 'text-neutral-text-muted'}`}>
                        {b.bucket === 'AVAILABLE' ? '＋' : '◷'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/orders/${b.orderId}`} className="block truncate text-[14px] font-semibold text-neutral-text hover:text-brand-700">
                          {b.listingTitle}
                        </Link>
                        <div className="mt-0.5 text-[12px] text-neutral-text-hint">
                          {b.role === 'SELLER' ? '銷售收入' : '鑑定收入'}
                          {b.bucket === 'PENDING' && b.eligibleAt && (
                            <span> · 可提取於 {new Date(b.eligibleAt).toLocaleDateString('zh-HK')}</span>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 text-[14px] font-bold ${b.bucket === 'AVAILABLE' ? 'text-verify' : 'text-neutral-text-hint'}`}>
                        {b.bucket === 'AVAILABLE' ? '+' : ''}{formatHKD(b.amountHKD)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ═══ Recent payouts (outflow) ═══ */}
              <div className="mt-4 rounded-xl border border-line bg-white p-5 shadow-sh1">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">最近提款</div>
                  <Link href="/account/wallet/payouts" className="text-[12px] font-semibold text-brand-600 hover:underline">全部紀錄 →</Link>
                </div>
                {recent.length === 0 ? (
                  <p className="py-4 text-center text-[13px] text-neutral-text-hint">尚未有提款紀錄</p>
                ) : (
                  recent.map((r) => (
                    <div key={r.id} className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0">
                      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[15px] font-extrabold text-neutral-text-muted">↑</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-neutral-text">提現至 {r.methodSnapshot?.displayLabel ?? '—'}</div>
                        <div className="mt-0.5 truncate text-[12px] text-neutral-text-hint">{r.reference}</div>
                      </div>
                      <StatusPill status={r.status} />
                      <span className="shrink-0 text-[14px] font-bold text-neutral-text">−{formatHKD(r.amountHKD)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4">
                <PayoutDisclaimer />
              </div>
            </>
          ) : null}

          {wizardOpen && balance && (
            <CashoutWizard
              availableHKD={balance.availableHKD}
              feeHKD={balance.payoutFeeHKD}
              minHKD={balance.minHKD}
              maxHKD={balance.maxHKD}
              methods={methods as any}
              onSuccess={() => { setWizardOpen(false); refresh(); }}
              onCancel={() => setWizardOpen(false)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

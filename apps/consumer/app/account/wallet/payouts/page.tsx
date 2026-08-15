'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PayoutDisclaimer } from '@certifine/ui';
import { type PayoutStatusKey } from '@certifine/domain';
import { formatHKD, getClientLocale, createT } from '@certifine/web-kit';
import { api, hasToken, ApiError } from '@/lib/api';
import { Copy, Check } from 'lucide-react';
import { StatusPill } from '@/components/wallet/status-pill';
import { AccountSidebar } from '@/components/account/account-sidebar';

type Request = Awaited<ReturnType<typeof api.wallet.requests>>[number];

const FAIL_REASON_LABEL: Record<string, string> = {
  BANK_REJECTED: 'account.payouts.fail.bankRejected',
  INVALID_ACCOUNT: 'account.payouts.fail.invalidAccount',
  BENEFICIARY_MISMATCH: 'account.payouts.fail.beneficiaryMismatch',
  KYC_REQUIRED: 'account.payouts.fail.kycRequired',
};

export default function PayoutsHistoryPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

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
      setError(e instanceof ApiError ? e.message : _t('account.payouts.error.load'));
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
    { key: 'ALL', label: _t('account.payouts.tab.all') },
    { key: 'PENDING', label: _t('account.payouts.tab.pending') },
    { key: 'PROCESSING', label: _t('account.payouts.tab.processing') },
    { key: 'SUCCEEDED', label: _t('account.payouts.tab.succeeded') },
    { key: 'FAILED', label: _t('account.payouts.tab.failed') },
  ];

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 pt-8 sm:px-6">
      <div className="grid items-start gap-8 lg:grid-cols-[220px_1fr]">
        <AccountSidebar />

        <section className="max-w-[720px]">
          <h1 className="mb-5 font-display-serif text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">
            {_t('account.payouts.page.title')}
          </h1>

          {/* L3 underline tabs */}
          <div className="mb-5 flex gap-1 overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain border-b border-line">
            {tabs.map((t) => {
              const isActive = filter === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`shrink-0 -mb-px border-b-2 px-4 py-3 text-[14px] font-semibold transition ${
                    isActive ? 'border-brand-600 text-ink' : 'border-transparent text-neutral-text-hint hover:text-neutral-text-muted'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <>
              {error && <div className="mb-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

              {filtered.length === 0 ? (
                <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-neutral-text-muted shadow-sh1">
                  {_t('account.payouts.empty')}
                </p>
              ) : (
                <div className="space-y-3">
                  {filtered.map((r) => (
                    <div key={r.id} className="rounded-xl border border-line bg-white p-5 shadow-sh1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[18px] font-extrabold text-ink">{formatHKD(r.amountHKD)}</p>
                          <p className="mt-0.5 text-[12px] text-neutral-text-hint">
                            {_t('account.payouts.netAndFee', { net: formatHKD(r.netHKD), fee: r.feeHKD === 0 ? _t('account.payouts.detail.feeFree') : formatHKD(r.feeHKD) })}
                          </p>
                        </div>
                        <StatusPill status={r.status} />
                      </div>

                      <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-[13px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-text-hint">{_t('account.payouts.detail.accountLabel')}</span>
                          <span className="truncate text-right text-neutral-text-muted">{r.methodSnapshot?.displayLabel ?? '—'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-text-hint">{_t('account.payouts.detail.referenceLabel')}</span>
                          <button onClick={() => copy(r.reference)} className="inline-flex items-center gap-1 font-mono text-neutral-text-muted hover:text-brand-600">
                            {r.reference}
                            {copied === r.reference ? <Check className="h-3 w-3 text-verify" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-text-hint">{_t('account.payouts.detail.submittedAtLabel')}</span>
                          <span className="text-neutral-text-muted">{new Date(r.createdAt).toLocaleString('zh-HK')}</span>
                        </div>
                        {r.processedAt && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-neutral-text-hint">{_t('account.payouts.detail.processedAtLabel')}</span>
                            <span className="text-neutral-text-muted">{new Date(r.processedAt).toLocaleString('zh-HK')}</span>
                          </div>
                        )}
                      </div>

                      {r.status === 'FAILED' && (
                        <div className="mt-3 rounded-lg bg-danger-soft p-3 text-[12px] text-danger">
                          <p className="font-semibold">
                            {_t('account.payouts.failReasonPrefix')}{FAIL_REASON_LABEL[r.failureReason ?? ''] ? _t(FAIL_REASON_LABEL[r.failureReason ?? '']!) : r.failureReason ?? _t('account.payouts.failure.unknown')}
                          </p>
                          <p className="mt-1">
                            {_t('account.payouts.fixPrefix')}<Link href="/account/wallet/methods" className="mx-1 underline">{_t('account.payouts.failure.methodsLinkLabel')}</Link>{_t('account.payouts.fixMiddle')}
                            <Link href="/account/wallet" className="mx-1 underline">{_t('account.payouts.failure.retryLinkLabel')}</Link>{_t('account.payouts.fixSuffix')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <PayoutDisclaimer />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

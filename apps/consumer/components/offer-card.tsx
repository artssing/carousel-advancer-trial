'use client';

/**
 * OfferCard — renders an offer message bubble in conversation.
 *
 * Used by ConversationPane when it detects a message body matching
 * `__OFFER__:<offerId>`. Fetches the offer via API and renders:
 *   - Original listing price vs proposed price
 *   - Round number + proposer
 *   - Countdown (computed at render, no live tick)
 *   - Action buttons (accept / reject / counter / withdraw) based on viewer role
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tag, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@authentik/ui';
import { getClientLocale, createT } from '@authentik/utils';

interface OfferRow {
  id: string;
  conversationId: string;
  listingId: string;
  proposedByUserId: string;
  proposedByRole: 'BUYER' | 'SELLER';
  priceHKD: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED' | 'WITHDRAWN';
  parentOfferId: string | null;
  roundNumber: number;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  acceptedByUserId: string | null;
  paymentDeadlineAt: string | null;
  listing?: { id: string; title: string; priceHKD: number; sellerId: string };
  proposedBy?: { id: string; displayName: string };
}

function fmtHKD(n: number) {
  return `HK$${n.toLocaleString('en-HK')}`;
}

/** Returns a t() key + its params, not text — module scope has no locale. */
function fmtTimeLeft(expiresAt: string): { labelKey: string; params: Record<string, number>; tone: 'green' | 'amber' | 'red' | 'expired' } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { labelKey: 'messages.offer.timeLeft.expired', params: {}, tone: 'expired' };
  const hours = Math.floor(ms / 3600_000);
  const mins = Math.floor((ms % 3600_000) / 60_000);
  const labelKey = hours > 0 ? 'messages.offer.timeLeft.hours' : 'messages.offer.timeLeft.mins';
  const params = { h: hours, m: mins };
  if (hours >= 12) return { labelKey, params, tone: 'green' };
  if (hours >= 6) return { labelKey, params, tone: 'amber' };
  return { labelKey, params, tone: 'red' };
}

function statusBadge(status: OfferRow['status']): { textKey: string; bg: string; fg: string } {
  switch (status) {
    case 'PENDING':   return { textKey: 'messages.offer.status.pending',   bg: 'bg-amber-100',   fg: 'text-amber-800' };
    case 'ACCEPTED':  return { textKey: 'messages.offer.status.accepted',  bg: 'bg-emerald-100', fg: 'text-emerald-800' };
    case 'REJECTED':  return { textKey: 'messages.offer.status.rejected',  bg: 'bg-slate-200',   fg: 'text-slate-600' };
    case 'COUNTERED': return { textKey: 'messages.offer.status.countered', bg: 'bg-slate-200',   fg: 'text-slate-600' };
    case 'EXPIRED':   return { textKey: 'messages.offer.status.expired',   bg: 'bg-slate-200',   fg: 'text-slate-500' };
    case 'WITHDRAWN': return { textKey: 'messages.offer.status.withdrawn', bg: 'bg-slate-200',   fg: 'text-slate-500' };
  }
}

interface OfferCardProps {
  offerId: string;
  currentUserId: string;
  /** Optional callback to refresh conversation messages after action */
  onAction?: () => void;
}

export function OfferCard({ offerId, currentUserId, onAction }: OfferCardProps) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterPrice, setCounterPrice] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  // ConfirmDialog v2（founder 2026-07-12）：reject 都要二次確認
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);

  function load() {
    api.offers.get(offerId).then(setOffer).catch((e) => setError(e?.message ?? _t('messages.offer.error.load')));
  }

  useEffect(() => { load(); }, [offerId]);

  async function act(fn: () => Promise<any>) {
    setBusy(true); setError(null);
    try {
      await fn();
      load();
      onAction?.();
    } catch (e: any) {
      setError(e?.message ?? _t('messages.offer.error.action'));
    } finally { setBusy(false); }
  }

  if (error && !offer) {
    return (
      <div className="my-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        {_t('messages.offer.error.loadPrefix')}{error}
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="my-2 h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
    );
  }

  const isProposer = offer.proposedByUserId === currentUserId;
  const proposerName = isProposer ? _t('messages.offer.you') : (offer.proposedBy?.displayName ?? (offer.proposedByRole === 'BUYER' ? _t('orderDetail.label.buyerFallback') : _t('orderDetail.label.sellerFallback')));
  const originalPrice = offer.listing?.priceHKD;
  const savings = originalPrice ? originalPrice - offer.priceHKD : 0;
  const savingsPct = originalPrice ? Math.round((savings / originalPrice) * 100) : 0;
  const badge = statusBadge(offer.status);
  const timeLeft = offer.status === 'PENDING' ? fmtTimeLeft(offer.expiresAt) : null;

  // Anti-collusion neutral confirmation banner
  const isSteepDiscount = originalPrice && (offer.priceHKD < originalPrice * 0.5);

  return (
    <div className="my-2 overflow-hidden rounded-xl border-2 border-amber-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2">
        <div className="flex items-center gap-1.5 text-amber-900">
          <Tag className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{_t('messages.offer.roundTitle', { round: offer.roundNumber })}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.fg}`}>
          {_t(badge.textKey)}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-3 text-sm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {originalPrice !== undefined && (
            <>
              <span className="text-xs text-slate-500">{_t('messages.offer.originalPrice')}</span>
              <span className="text-right text-xs text-slate-500 line-through">{fmtHKD(originalPrice)}</span>
            </>
          )}
          <span className="font-medium text-slate-700">{_t('messages.offer.proposedPrice')}</span>
          <span className="text-right font-semibold text-slate-900">{fmtHKD(offer.priceHKD)}</span>
          {/* 「節省」係買家視角嘅 framing — 只有買家提出嘅低於原價 offer 先顯示，
              避免賣家自己提出低價嗰陣出現「節省」呢個邏輯衝突 */}
          {savings > 0 && offer.proposedByRole === 'BUYER' && (
            <>
              <span className="text-xs text-emerald-600">{_t('messages.offer.saving')}</span>
              <span className="text-right text-xs text-emerald-600">{fmtHKD(savings)} ({savingsPct}%)</span>
            </>
          )}
        </div>

        <p className="mt-2 text-[11px] text-slate-500">
          {_t('messages.offer.proposedBy', { name: proposerName })}
          {timeLeft && (
            <span className={`ml-2 inline-flex items-center gap-1 ${
              timeLeft.tone === 'red' ? 'text-red-600'
              : timeLeft.tone === 'amber' ? 'text-amber-700'
              : timeLeft.tone === 'expired' ? 'text-slate-400'
              : 'text-emerald-700'
            }`}>
              <Clock className="h-3 w-3" />{_t(timeLeft.labelKey, timeLeft.params)}
            </span>
          )}
        </p>

        {isSteepDiscount && offer.status === 'PENDING' && (
          <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{_t('messages.offer.lowballWarning')}</span>
          </div>
        )}

        {/* ACCEPTED → buyer CTA */}
        {offer.status === 'ACCEPTED' && offer.listing && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
            <p className="text-xs font-medium text-emerald-800">
              {_t('messages.offer.acceptedTitle')}
              {offer.paymentDeadlineAt && (
                <span className="ml-1 text-emerald-700">
                  {_t('messages.offer.paymentDeadline', { deadline: new Date(offer.paymentDeadlineAt).toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
                </span>
              )}
            </p>
            {/* Buyer (proposer if BUYER, or recipient if seller proposed) sees CTA */}
            <Link
              href={`/listing/${offer.listingId}?offerId=${offer.id}`}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              {_t('messages.offer.orderNow', { price: fmtHKD(offer.priceHKD) })}
            </Link>
          </div>
        )}

        {/* Action buttons — only for counterparty + PENDING */}
        {offer.status === 'PENDING' && !isProposer && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.offers.accept(offer.id))}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />{_t('messages.offer.accept')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejectConfirmOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />{_t('messages.offer.reject')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCounterOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />{_t('messages.offer.counterNew')}
            </button>
          </div>
        )}

        {/* Counter-offer form */}
        {counterOpen && offer.status === 'PENDING' && !isProposer && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2">
            <span className="text-[10px] text-slate-500">HK$</span>
            <input
              type="number"
              value={counterPrice}
              onChange={(e) => setCounterPrice(e.target.value)}
              placeholder={String(offer.priceHKD)}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              min={1}
            />
            <button
              type="button"
              disabled={busy || !counterPrice || Number(counterPrice) <= 0}
              onClick={() => act(() => api.offers.counter(offer.id, Number(counterPrice)))}
              className="rounded bg-brand-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {_t('messages.offer.counter')}
            </button>
          </div>
        )}

        {/* Proposer-side: withdraw option */}
        {offer.status === 'PENDING' && isProposer && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">{_t('messages.offer.waiting')}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setWithdrawConfirmOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              {_t('messages.offer.withdraw')}
            </button>
          </div>
        )}

        {/* ConfirmDialog v2（founder 2026-07-12）— 撤回 / 拒絕 一律 modal */}
        <ConfirmDialog
          open={withdrawConfirmOpen}
          onCancel={() => setWithdrawConfirmOpen(false)}
          onConfirm={() => {
            setWithdrawConfirmOpen(false);
            act(() => api.offers.withdraw(offer.id));
          }}
          title={_t('messages.offer.withdrawConfirm.title')}
          consequence={_t('messages.offer.withdrawConfirm.consequence')}
          confirmLabel={_t('messages.offer.withdrawConfirm.label')}
          severity="danger"
          busy={busy}
        />
        <ConfirmDialog
          open={rejectConfirmOpen}
          onCancel={() => setRejectConfirmOpen(false)}
          onConfirm={() => {
            setRejectConfirmOpen(false);
            act(() => api.offers.reject(offer.id));
          }}
          title={_t('messages.offer.rejectConfirm.title')}
          consequence={_t('messages.offer.rejectConfirm.consequence')}
          confirmLabel={_t('messages.offer.rejectConfirm.label')}
          severity="warning"
          busy={busy}
        />

        {error && (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</p>
        )}
      </div>
    </div>
  );
}

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

function fmtTimeLeft(expiresAt: string): { label: string; tone: 'green' | 'amber' | 'red' | 'expired' } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: '已過期', tone: 'expired' };
  const hours = Math.floor(ms / 3600_000);
  const mins = Math.floor((ms % 3600_000) / 60_000);
  const label = hours > 0 ? `剩 ${hours} 小時 ${mins} 分` : `剩 ${mins} 分鐘`;
  if (hours >= 12) return { label, tone: 'green' };
  if (hours >= 6) return { label, tone: 'amber' };
  return { label, tone: 'red' };
}

function statusBadge(status: OfferRow['status']): { text: string; bg: string; fg: string } {
  switch (status) {
    case 'PENDING':   return { text: '待回覆',   bg: 'bg-amber-100',   fg: 'text-amber-800' };
    case 'ACCEPTED':  return { text: '已接受',   bg: 'bg-emerald-100', fg: 'text-emerald-800' };
    case 'REJECTED':  return { text: '已拒絕',   bg: 'bg-slate-200',   fg: 'text-slate-600' };
    case 'COUNTERED': return { text: '已還價',   bg: 'bg-slate-200',   fg: 'text-slate-600' };
    case 'EXPIRED':   return { text: '已過期',   bg: 'bg-slate-200',   fg: 'text-slate-500' };
    case 'WITHDRAWN': return { text: '已撤回',   bg: 'bg-slate-200',   fg: 'text-slate-500' };
  }
}

interface OfferCardProps {
  offerId: string;
  currentUserId: string;
  /** Optional callback to refresh conversation messages after action */
  onAction?: () => void;
}

export function OfferCard({ offerId, currentUserId, onAction }: OfferCardProps) {
  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterPrice, setCounterPrice] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);

  function load() {
    api.offers.get(offerId).then(setOffer).catch((e) => setError(e?.message ?? '無法載入'));
  }

  useEffect(() => { load(); }, [offerId]);

  async function act(fn: () => Promise<any>) {
    setBusy(true); setError(null);
    try {
      await fn();
      load();
      onAction?.();
    } catch (e: any) {
      setError(e?.message ?? '操作失敗');
    } finally { setBusy(false); }
  }

  if (error && !offer) {
    return (
      <div className="my-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        議價載入失敗：{error}
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="my-2 h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
    );
  }

  const isProposer = offer.proposedByUserId === currentUserId;
  const proposerName = isProposer ? '你' : (offer.proposedBy?.displayName ?? (offer.proposedByRole === 'BUYER' ? '買家' : '賣家'));
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
          <span className="text-xs font-semibold">議價 · 第 {offer.roundNumber} 輪</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.fg}`}>
          {badge.text}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-3 text-sm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {originalPrice !== undefined && (
            <>
              <span className="text-xs text-slate-500">原價</span>
              <span className="text-right text-xs text-slate-500 line-through">{fmtHKD(originalPrice)}</span>
            </>
          )}
          <span className="font-medium text-slate-700">提議價</span>
          <span className="text-right font-semibold text-slate-900">{fmtHKD(offer.priceHKD)}</span>
          {/* 「節省」係買家視角嘅 framing — 只有買家提出嘅低於原價 offer 先顯示，
              避免賣家自己提出低價嗰陣出現「節省」呢個邏輯衝突 */}
          {savings > 0 && offer.proposedByRole === 'BUYER' && (
            <>
              <span className="text-xs text-emerald-600">節省</span>
              <span className="text-right text-xs text-emerald-600">{fmtHKD(savings)} ({savingsPct}%)</span>
            </>
          )}
        </div>

        <p className="mt-2 text-[11px] text-slate-500">
          由 {proposerName} 提出
          {timeLeft && (
            <span className={`ml-2 inline-flex items-center gap-1 ${
              timeLeft.tone === 'red' ? 'text-red-600'
              : timeLeft.tone === 'amber' ? 'text-amber-700'
              : timeLeft.tone === 'expired' ? 'text-slate-400'
              : 'text-emerald-700'
            }`}>
              <Clock className="h-3 w-3" />{timeLeft.label}
            </span>
          )}
        </p>

        {isSteepDiscount && offer.status === 'PENDING' && (
          <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>提議價格比原價低超過 50%，請確認此為你同意嘅成交價。</span>
          </div>
        )}

        {/* ACCEPTED → buyer CTA */}
        {offer.status === 'ACCEPTED' && offer.listing && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
            <p className="text-xs font-medium text-emerald-800">
              ✓ 議價成功
              {offer.paymentDeadlineAt && (
                <span className="ml-1 text-emerald-700">
                  · 付款期限 {new Date(offer.paymentDeadlineAt).toLocaleString('zh-HK', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
            {/* Buyer (proposer if BUYER, or recipient if seller proposed) sees CTA */}
            <Link
              href={`/listing/${offer.listingId}?offerId=${offer.id}`}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              立即落單（鎖定 {fmtHKD(offer.priceHKD)}）→
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
              <CheckCircle2 className="h-3.5 w-3.5" />接受
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.offers.reject(offer.id))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />拒絕
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCounterOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />另出價
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
              還價
            </button>
          </div>
        )}

        {/* Proposer-side: withdraw option */}
        {offer.status === 'PENDING' && isProposer && !withdrawConfirmOpen && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">等待對方回覆…</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setWithdrawConfirmOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              撤回出價
            </button>
          </div>
        )}

        {/* Withdraw confirmation panel */}
        {offer.status === 'PENDING' && isProposer && withdrawConfirmOpen && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="text-xs font-medium text-red-900">確認撤回出價？</p>
                <p className="mt-0.5 text-[11px] text-red-700">
                  撤回後呢個出價會立即作廢，對方就再見唔到。如果想 keep 繼續傾，可以等對方還價或者直接「另出價」。
                </p>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWithdrawConfirmOpen(false)}
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setWithdrawConfirmOpen(false);
                  act(() => api.offers.withdraw(offer.id));
                }}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                確認撤回
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</p>
        )}
      </div>
    </div>
  );
}

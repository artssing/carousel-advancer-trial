'use client';

/**
 * Buyer checkout — ONLINE_ESCROW Phase 1, Agoda/Trip.com-style two-panel.
 *
 * Layout:
 *   - Desktop ≥ md: form (flex-1) | sticky OrderSummary (w-80)
 *   - Mobile: collapsed summary pill at top, sticky submit button at bottom
 *
 * Flow:
 *   1. Load order + payment status
 *   2. User picks method tab → method-specific panel
 *   3. Card form: validate Luhn + expiry + CVV + name; submit sends ONLY card
 *      number (testCard) as Stripe would never let us send raw card data
 *   4. Wallet/FPS: mock QR + 5s auto-resolve OR dev buttons
 *   5. Apple Pay: mock Touch ID
 *   6. On success: SuccessOverlay + 3s countdown → /orders/[id]
 *
 * Lesson #11 — every button has a real handler; the disabled "save card" has
 * a visible Phase 2 label so user knows it's coming.
 * Lesson #16 — abandoning the page after intent created prompts a confirm
 * (handled by browser navigation; future: in-page modal).
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, hasToken, clearToken } from '@/lib/api';
import { type PaymentMethodId } from '@/lib/payment-methods';
import { MethodAccordion } from '@/components/checkout/method-accordion';
import { CardForm, isCardFormValid, type CardFormValue } from '@/components/checkout/card-form';
import { WalletPanel } from '@/components/checkout/wallet-panel';
import { ApplePayMock } from '@/components/checkout/apple-pay-mock';
import { OrderSummary } from '@/components/checkout/order-summary';
import { TestModeBanner } from '@/components/checkout/test-mode-banner';
import { TrustStrip } from '@/components/checkout/trust-strip';

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams() as { orderId: string };
  const orderId = params.orderId;

  // ── Data state ─────────────────────────────────────────────────────────
  const [order, setOrder] = useState<any | null>(null);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.payments.status>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────
  const [method, setMethod] = useState<PaymentMethodId>('CARD');
  const [cardValue, setCardValue] = useState<CardFormValue>({
    number: '', expiry: '', cvv: '', name: '', brand: 'unknown',
  });
  const [showCardErrors, setShowCardErrors] = useState(false);

  // ── Submit state ──────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<{ code: string; msg: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // ── Load order + status on mount ─────────────────────────────────────
  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    Promise.all([api.orders.get(orderId), api.payments.status(orderId)])
      .then(([o, s]) => { setOrder(o); setStatus(s); })
      .catch((e) => {
        if (e?.status === 401) { clearToken(); router.replace('/login'); return; }
        setLoadError(e?.message ?? '無法載入訂單');
      })
      .finally(() => setLoading(false));
  }, [orderId, router]);

  // ── After success: countdown + redirect ──────────────────────────────
  useEffect(() => {
    if (!success) return;
    if (redirectCountdown === 0) {
      router.replace(`/orders/${orderId}` as any);
      return;
    }
    const t = setTimeout(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [success, redirectCountdown, orderId, router]);

  // ── Shared confirm-mock pipeline ─────────────────────────────────────
  async function runConfirm(testCard: string) {
    setBusy(true);
    setPaymentError(null);
    try {
      const created = paymentId
        ? { paymentId, clientSecret: '', amountHKD: status?.payment?.amountHKD ?? 0, mode: status?.stripeMode ?? 'mock' as const }
        : await api.payments.createIntent(orderId);
      setPaymentId(created.paymentId);

      const r = await api.payments.confirmMock(orderId, created.paymentId, testCard, method);
      if (r.ok) {
        setSuccess(true);
      } else {
        setPaymentError({ code: r.code ?? 'unknown', msg: r.message ?? '付款失敗，請重試' });
      }
    } catch (e: any) {
      setPaymentError({ code: 'server', msg: e?.message ?? '網絡錯誤，請稍後重試' });
    } finally {
      setBusy(false);
    }
  }

  // ── Method-specific submit handlers ──────────────────────────────────
  async function submitCard() {
    if (!isCardFormValid(cardValue)) {
      setShowCardErrors(true);
      return;
    }
    await runConfirm(cardValue.number);
  }
  async function submitWallet(outcome: 'success' | 'fail') {
    // Map outcome to mock test card so backend produces matching result
    await runConfirm(outcome === 'success' ? '4242424242424242' : '4000000000000002');
  }
  function tryAgainSameCard() {
    setPaymentError(null);
    submitCard();
  }
  function switchCard() {
    setPaymentError(null);
    setCardValue({ number: '', expiry: '', cvv: '', name: '', brand: 'unknown' });
    setShowCardErrors(false);
  }

  // ── Loading / guard states ───────────────────────────────────────────
  if (loading) return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-slate-500">載入中…</div>;
  if (loadError) return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-red-600">{loadError}</div>;
  if (!order || !status) return null;

  if (order.paymentMethod !== 'ONLINE_ESCROW') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-slate-600">此訂單為線下現金，無需網上付款。</p>
        <Link href={`/orders/${orderId}` as any} className="mt-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> 返回訂單
        </Link>
      </div>
    );
  }

  const total = order.salePriceHKD + order.authFeeHKD + order.platformFeeHKD;
  const isHold = order.salePriceHKD >= 1000;

  // ── Success state — takes over the whole page ────────────────────────
  if (success || order.status !== 'AWAITING_PAYMENT') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="rounded-full bg-emerald-100 p-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">付款成功</h1>
        <p className="mt-2 text-sm text-slate-600">
          {isHold
            ? `平台已 hold 你嘅 ${formatHKD(total)} 直至鑑定完成。鑑定師核實後先正式扣款。`
            : `平台已正式扣款 ${formatHKD(total)}（Tier 1 即時 charge）。`}
        </p>
        <p className="mt-4 text-xs text-slate-400">
          正在跳轉去你嘅訂單… <span className="font-mono">{redirectCountdown}</span>
        </p>
        <Link href={`/orders/${orderId}` as any} className="mt-4">
          <Button>立即前往訂單</Button>
        </Link>
      </div>
    );
  }

  // ── Main checkout ─────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/orders/${orderId}` as any} className="hover:text-slate-800">
          訂單 #{orderId.slice(0, 8)}
        </Link>
        <span>→</span>
        <span className="font-medium text-slate-800">付款</span>
      </nav>

      {/* Two-panel layout: form left + summary right (desktop) */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex-1 min-w-0">
          {/* Mobile summary at top */}
          <div className="md:hidden">
            <OrderSummary order={order} amountHKD={total} isHold={isHold} />
          </div>

          <h1 className="mt-2 font-display text-xl font-bold md:mt-0">揀付款方式</h1>

          <div className="mt-3">
            <TestModeBanner visible={status.stripeMode === 'mock'} />
          </div>

          {/* Vertical accordion — selected row expands to show form / wallet panel */}
          <div className="mt-3">
            <MethodAccordion
              active={method}
              onChange={(m) => { setMethod(m); setPaymentError(null); }}
              renderBody={(id) => {
                if (id === 'CARD') {
                  return (
                    <CardForm
                      value={cardValue}
                      onChange={setCardValue}
                      showErrors={showCardErrors}
                    />
                  );
                }
                if (id === 'ALIPAY_HK' || id === 'WECHAT_HK' || id === 'FPS') {
                  return (
                    <WalletPanel
                      method={id}
                      amountHKD={total}
                      onResolve={submitWallet}
                      busy={busy}
                    />
                  );
                }
                if (id === 'APPLE_PAY') {
                  return <ApplePayMock onResolve={submitWallet} busy={busy} />;
                }
                return null;
              }}
            />
          </div>

          {/* Error banner */}
          {paymentError && (
            <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
              <div className="flex items-start gap-2 text-sm text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">付款失敗</p>
                  <p className="mt-0.5 text-xs">{paymentError.msg}</p>
                  <p className="mt-1 text-[10px] text-rose-600">code: {paymentError.code}</p>
                </div>
              </div>
              {method === 'CARD' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={switchCard}>換一張卡</Button>
                  <Button size="sm" onClick={tryAgainSameCard} disabled={busy}>重試同一張卡</Button>
                </div>
              )}
            </div>
          )}

          {/* Trust strip */}
          <div className="mt-4">
            <TrustStrip />
          </div>

          {/* Submit button — only for CARD (wallet flows use their own buttons) */}
          {method === 'CARD' && (
            <>
              {/* Desktop submit */}
              <Button
                className="mt-4 hidden w-full md:flex"
                size="lg"
                disabled={busy}
                onClick={submitCard}
              >
                {busy ? '處理中…' : isHold ? `授權 ${formatHKD(total)}` : `付款 ${formatHKD(total)}`}
              </Button>
              <p className="mt-2 hidden text-center text-[10px] text-slate-400 md:block">
                撳「{isHold ? '授權' : '付款'}」即代表你同意平台條款 + 鑑定流程
              </p>

              {/* Mobile sticky submit */}
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 shadow-lg md:hidden">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={busy}
                  onClick={submitCard}
                >
                  {busy ? '處理中…' : isHold ? `授權 ${formatHKD(total)}` : `付款 ${formatHKD(total)}`}
                </Button>
              </div>
              {/* Spacer for mobile sticky button */}
              <div className="h-20 md:hidden" />
            </>
          )}
        </div>

        {/* Desktop right summary */}
        <OrderSummary order={order} amountHKD={total} isHold={isHold} />
      </div>
    </div>
  );
}

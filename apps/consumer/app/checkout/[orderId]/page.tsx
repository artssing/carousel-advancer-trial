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
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, hasToken, clearToken } from '@/lib/api';
import { track } from '@/lib/analytics';
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

  // ── Review → Pay 兩步（founder 2026-07-20）────────────────────────────
  // Local state（唔落 URL）：線性一次性 funnel step，deadline SSOT 喺 server。
  const [step, setStep] = useState<'review' | 'pay'>('review');
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const warnedRef = useRef(false);
  const reviewTrackedRef = useRef(false);

  // ── Form state ────────────────────────────────────────────────────────
  const [method, setMethod] = useState<PaymentMethodId>('CARD');
  const [cardValue, setCardValue] = useState<CardFormValue>({
    number: '', expiry: '', cvv: '', name: '', brand: 'unknown',
  });
  const [showCardErrors, setShowCardErrors] = useState(false);

  // ── Submit state ──────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [intentInfo, setIntentInfo] =
    useState<Awaited<ReturnType<typeof api.payments.createIntent>> | null>(null);
  const [paymentError, setPaymentError] = useState<{ code: string; msg: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // ── Load order + status on mount ─────────────────────────────────────
  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    Promise.all([api.orders.get(orderId), api.payments.status(orderId)])
      .then(([o, s]) => {
        setOrder(o);
        setStatus(s);
        // 買家中途離開再返嚟：deadline 存喺 server — 有 deadline = 已確認過
        // review，直接跳去 pay step 接續倒數。
        if (s?.paymentDeadlineAt) {
          setDeadlineMs(new Date(s.paymentDeadlineAt).getTime());
          setStep('pay');
        }
        // Analytics（spec §2.6）：入 checkout page = funnel step 2
        if (o?.status === 'AWAITING_PAYMENT') {
          track('checkout_started', {
            listing_id: o.listing?.id ?? o.listingId,
            tier: o.tier ?? undefined,
            price_hkd: o.salePriceHKD,
          });
          if (!s?.paymentDeadlineAt && !reviewTrackedRef.current) {
            reviewTrackedRef.current = true;
            track('checkout_review_viewed', {
              order_id: orderId,
              listing_id: o.listing?.id ?? o.listingId,
              tier: o.tier ?? undefined,
            });
          }
        }
      })
      .catch((e) => {
        if (e?.status === 401) { clearToken(); router.replace('/login'); return; }
        setLoadError(e?.message ?? '無法載入訂單');
      })
      .finally(() => setLoading(false));
  }, [orderId, router]);

  // ── Deadline ticking clock（pay step 先行）───────────────────────────
  useEffect(() => {
    if (step !== 'pay' || !deadlineMs) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, deadlineMs]);

  const remainingSec = deadlineMs ? Math.max(0, Math.floor((deadlineMs - nowMs) / 1000)) : null;
  const deadlineExpired =
    (deadlineMs !== null && remainingSec === 0) || status?.orderStatus === 'PAYMENT_EXPIRED';

  // <5 分鐘警告 toast（一次過）
  useEffect(() => {
    if (step !== 'pay' || remainingSec === null || warnedRef.current) return;
    if (remainingSec > 0 && remainingSec < 300) {
      warnedRef.current = true;
      track('checkout_deadline_warning_shown', { order_id: orderId, remaining_seconds: remainingSec });
    }
  }, [step, remainingSec, orderId]);

  // ── Review 確認 → server 開 30 分鐘鐘 → 入 pay step ──────────────────
  async function confirmReview() {
    setConfirmBusy(true);
    setReviewError(null);
    try {
      const r = await api.orders.confirmReview(orderId);
      setDeadlineMs(new Date(r.paymentDeadlineAt).getTime());
      setStep('pay');
      track('checkout_review_confirmed', {
        order_id: orderId,
        listing_id: order?.listing?.id ?? order?.listingId,
        tier: order?.tier ?? undefined,
        total_hkd: order ? order.salePriceHKD + order.authFeeHKD + order.platformFeeHKD : 0,
      });
    } catch (e: any) {
      // e.g. 俾另一位買家搶先 confirm 咗 — 留喺 review step 顯示，唔好炸成頁
      setReviewError(e?.message ?? '確認失敗，請重試');
    } finally {
      setConfirmBusy(false);
    }
  }

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

  // ── Shared confirm pipeline ──────────────────────────────────────────
  // mock mode: single confirm-mock API call (in-process simulation).
  // test/live mode: confirm against the payment gateway directly (stand-in
  // for stripe.js), then poll /status until the webhook flips the order —
  // same topology as production Stripe.
  function fireCompletedAnalytics() {
    // Analytics（spec §2.6）：付款成功 = funnel step 3
    track('checkout_completed', {
      order_id: orderId,
      listing_id: order?.listing?.id ?? order?.listingId,
      total_hkd: order?.totals?.totalHKD ?? status?.payment?.amountHKD ?? 0,
    });
  }

  /** Poll payment status until webhook lands (PAID / FAILED) or timeout. */
  async function pollUntilSettled(): Promise<
    { ok: true } | { ok: false; code: string; msg: string }
  > {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const s = await api.payments.status(orderId);
        if (s.orderStatus === 'PAYMENT_EXPIRED') {
          return { ok: false, code: 'expired', msg: '付款時限已過，訂單已取消 — 請重新落單' };
        }
        if (s.orderStatus !== 'AWAITING_PAYMENT') return { ok: true };
        const p = s.payment;
        if (p?.status === 'AUTHORIZED' || p?.status === 'CAPTURED') return { ok: true };
        if (p?.status === 'FAILED') {
          return { ok: false, code: p.failureCode ?? 'unknown', msg: p.failureMessage ?? '付款失敗，請重試' };
        }
      } catch { /* transient poll error — keep trying */ }
    }
    return { ok: false, code: 'timeout', msg: '付款確認超時 — 請稍後喺訂單頁檢查狀態，唔好重複付款' };
  }

  async function runConfirm(testCard: string) {
    if (deadlineExpired) {
      setPaymentError({ code: 'expired', msg: '付款時限已過 — 請重新落單' });
      return;
    }
    setBusy(true);
    setPaymentError(null);
    try {
      const created = intentInfo ?? (await api.payments.createIntent(orderId));
      setIntentInfo(created);

      if (created.mode !== 'mock' && created.gatewayUrl) {
        // Real-topology path: browser → gateway confirm → webhook → poll
        api.payments.logMethod(orderId, method).catch(() => {}); // audit, non-blocking
        const g = await api.payments.confirmViaGateway(created.gatewayUrl, created.clientSecret, testCard);
        if (g.error) {
          setPaymentError({ code: g.error.code, msg: g.error.message });
          return;
        }
        const settled = await pollUntilSettled();
        if (settled.ok) {
          setSuccess(true);
          fireCompletedAnalytics();
        } else {
          setPaymentError({ code: settled.code, msg: settled.msg });
        }
        return;
      }

      const r = await api.payments.confirmMock(orderId, created.paymentId, testCard, method);
      if (r.ok) {
        setSuccess(true);
        fireCompletedAnalytics();
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
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="rounded-full bg-amber-100 p-4 text-3xl">💵</div>
        <h1 className="mt-4 text-xl font-bold">此訂單為線下現金交收</h1>
        <p className="mt-2 text-sm text-slate-600">
          {order.deliveryMethod === 'MEETUP_DIRECT'
            ? '直接面交訂單必須現金支付，冇網上付款步驟。同賣家約好時間地點，見面一手交錢一手交貨。'
            : '呢張單揀咗線下現金，冇網上付款步驟。'}
        </p>
        <Link href={`/orders/${orderId}` as any} className="mt-5">
          <Button>知道喇，去訂單頁跟進</Button>
        </Link>
      </div>
    );
  }

  const total = order.salePriceHKD + order.authFeeHKD + order.platformFeeHKD;
  const isHold = order.salePriceHKD >= 1000;

  // ── 付款時限已過 — 全頁接管（ruling：重行成個流程，冇一鍵重開）─────────
  if (order.status === 'PAYMENT_EXPIRED' || (order.status === 'AWAITING_PAYMENT' && deadlineExpired)) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="rounded-full bg-red-100 p-4 text-3xl">⏰</div>
        <h1 className="mt-4 text-2xl font-bold">付款時限已過</h1>
        <p className="mt-2 text-sm text-slate-600">
          訂單超過 30 分鐘未完成付款，已自動取消，貨品已重新上架俾其他買家。
          如仍想購買，請返回商品頁重新落單。
        </p>
        <Link href={`/listing/${order.listing?.id ?? order.listingId}` as any} className="mt-5">
          <Button>返回商品頁重新落單</Button>
        </Link>
        <Link href="/browse" className="mt-3 text-sm text-brand-600 hover:underline">
          瀏覽其他貨品
        </Link>
      </div>
    );
  }

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
  const tier = order.salePriceHKD >= 10000 ? 3 : order.salePriceHKD >= 1000 ? 2 : 1;

  return (
    <div className="mx-auto max-w-container-l3 px-4 pb-16 sm:px-6">
      {/* ═══ L3 Steps banner（review→pay 兩步，founder 2026-07-20）═══ */}
      <div className="flex flex-wrap items-center gap-6 border-b border-line py-4 text-[13px] text-neutral-text-hint">
        <span>1 購物車</span>
        <span className={`flex items-center gap-2 ${step === 'review' ? 'font-semibold text-ink' : ''}`}>
          {step === 'review' && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
          2 確認訂單
        </span>
        <span className={`flex items-center gap-2 ${step === 'pay' ? 'font-semibold text-ink' : ''}`}>
          {step === 'pay' && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
          3 付款
        </span>
        <span>4 完成</span>
        <span className="ml-auto flex items-center gap-3">
          {step === 'pay' && remainingSec !== null && (
            <span
              className={`rounded-full border px-3 py-1 font-mono text-[12px] font-bold ${
                remainingSec < 300
                  ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
                  : remainingSec < 600
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-line bg-white text-neutral-text'
              }`}
              title="付款時限 — 過時訂單自動取消"
            >
              ⏱ 剩餘 {String(Math.floor(remainingSec / 60)).padStart(2, '0')}:{String(remainingSec % 60).padStart(2, '0')}
            </span>
          )}
          <span className="font-mono text-[12px] text-neutral-text-hint">安全結帳 · #{orderId.slice(0, 8)}</span>
        </span>
      </div>
      {step === 'pay' && remainingSec !== null && remainingSec < 300 && remainingSec > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-700">
          ⏰ 付款時限快到（剩 {Math.ceil(remainingSec / 60)} 分鐘）— 請盡快完成付款，否則訂單會自動取消。
        </div>
      )}

      <div className="pt-8">
        <h1 className="font-display-serif text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">
          {step === 'review' ? '確認訂單' : '付款'}
        </h1>
        <p className="mt-1 text-[13px] text-neutral-text-hint">
          {tier === 3
            ? 'Tier 3 高價貨品 · 需經第三方鑑定師鑑定後放款'
            : tier === 2
              ? 'Tier 2 · 買家可選鑑定師增加信心'
              : 'Tier 1 · 純撮合'}
        </p>
      </div>

      {/* ═══ Two-panel L3 layout: form left + card-glow summary right ═══ */}
      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          {/* Mobile summary at top */}
          <div className="md:hidden">
            <OrderSummary order={order} amountHKD={total} isHold={isHold} />
          </div>

          {step === 'review' && (
            <>
              {/* ── Review step：你揀咗啲乜（founder 2026-07-20）── */}
              <div className="rounded-xl border border-line bg-white p-6 shadow-sh1">
                <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                  商品
                </div>
                <div className="flex items-start gap-4">
                  {order.listing?.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={order.listing.images[0]}
                      alt={order.listing?.title ?? ''}
                      className="h-20 w-20 shrink-0 rounded-lg border border-line object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{order.listing?.title}</p>
                    <p className="mt-1 text-[15px] font-bold text-brand-700">{formatHKD(order.salePriceHKD)}</p>
                  </div>
                </div>

                <div className="mb-3 mt-6 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                  交收方式
                </div>
                <p className="text-sm text-neutral-text">
                  {order.deliveryMethod === 'SHIP' &&
                    (order.authenticator
                      ? '📦 賣家寄件 — 先寄去鑑定師，鑑定通過後轉寄俾你（SF Express）'
                      : '📦 賣家直接寄俾你（SF Express）')}
                  {order.deliveryMethod === 'MEETUP_AUTH' && '🏬 鑑定師分店交收 — 賣家交貨去分店，鑑定通過後你去分店取貨'}
                  {order.deliveryMethod === 'MEETUP_3WAY' && '🤝 三方同場面交 — 你、賣家、鑑定師約同一時間地點，即場鑑定即場交收'}
                  {order.deliveryMethod === 'MEETUP_DIRECT' && '🤝 同賣家直接面交'}
                </p>
                {(order.meetupBranchSnapshot as any)?.name && (
                  <p className="mt-1 text-[13px] text-neutral-text-hint">
                    📍 {(order.meetupBranchSnapshot as any).name}
                    {(order.meetupBranchSnapshot as any).address ? ` · ${(order.meetupBranchSnapshot as any).address}` : ''}
                  </p>
                )}

                <div className="mb-3 mt-6 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                  鑑定
                </div>
                {order.authenticator ? (
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-4 py-3">
                    <span className="text-xl">🔍</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{order.authenticator.displayName}</p>
                      <p className="text-[12px] text-neutral-text-hint">
                        ★ {Number(order.authenticator.starRating ?? 0).toFixed(1)} · 鑑定費 {formatHKD(order.authFeeHKD)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-text-hint">無鑑定（Tier 1 純撮合）</p>
                )}

                <div className="mt-6 rounded-lg border border-verify-border bg-emerald-50/50 px-4 py-3 text-[13px] leading-relaxed text-neutral-text">
                  🛡️ {isHold
                    ? '託管保障：確認付款後，平台會 hold 住呢筆錢（唔會即刻過數俾賣家）。鑑定師核實正貨後先正式扣款放行；鑑定唔過會全額退返俾你。'
                    : 'Tier 1 訂單即時扣款，交收完成前平台託管，有問題可以開爭議。'}
                </div>
              </div>

              {reviewError && (
                <div className="rounded-xl border border-danger/40 bg-danger-soft p-4 text-sm text-danger shadow-sh1">
                  <p className="font-medium">⚠️ {reviewError}</p>
                  <Link href={`/listing/${order.listing?.id ?? order.listingId}` as any} className="mt-2 inline-block text-[13px] underline">
                    返回商品頁
                  </Link>
                </div>
              )}
              <Button className="w-full" size="lg" disabled={confirmBusy} onClick={confirmReview}>
                {confirmBusy ? '處理中…' : '確認訂單，前往付款'}
              </Button>
              <p className="text-center text-[11px] text-neutral-text-hint">
                確認前貨品唔會為你保留，可以隨時
                <Link href={`/listing/${order.listing?.id ?? order.listingId}` as any} className="underline">
                  返回上一頁修改
                </Link>
                ；確認後貨品會為你鎖定 30 分鐘，超時未付款訂單自動取消。
              </p>
            </>
          )}

          {step === 'pay' && (
          <>
          <div className="rounded-xl border border-line bg-white p-6 shadow-sh1">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
              揀付款方式
            </div>

            <TestModeBanner visible={status.stripeMode !== 'live'} />

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
          </div>

          {/* Error banner */}
          {paymentError && (
            <div className="rounded-xl border border-danger/40 bg-danger-soft p-4 shadow-sh1">
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">付款失敗</p>
                  <p className="mt-0.5 text-xs">{paymentError.msg}</p>
                  <p className="mt-1 text-[10px] opacity-70">code: {paymentError.code}</p>
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
          <TrustStrip />

          {/* Submit button — only for CARD (wallet flows use their own buttons) */}
          {method === 'CARD' && (
            <>
              {/* Desktop submit */}
              <Button
                className="hidden w-full md:flex"
                size="lg"
                disabled={busy}
                onClick={submitCard}
              >
                {busy ? '處理中…' : isHold ? `授權 ${formatHKD(total)}` : `確認並付款 ${formatHKD(total)}`}
              </Button>
              <p className="hidden text-center text-[10px] text-neutral-text-hint md:block">
                撳「{isHold ? '授權' : '確認並付款'}」即表示你同意 Certifine 服務條款 + 鑑定流程
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
          </>
          )}
        </div>

        {/* Desktop right summary */}
        <OrderSummary order={order} amountHKD={total} isHold={isHold} />
      </div>
    </div>
  );
}

/**
 * Stripe adapter — abstracts the SDK so the rest of the app code can speak
 * to ONE interface regardless of whether we're in mock / test / live mode.
 *
 * Mode is controlled by env STRIPE_MODE:
 *   - mock  (default for dev): deterministic in-memory simulation, no network,
 *           no SDK install required. Always returns success unless the test
 *           "card number" matches a known decline pattern (see DECLINE_CARDS).
 *   - test  : real Stripe SDK in test mode (4242 4242 4242 4242 works)
 *   - live  : real Stripe SDK in production mode (REAL MONEY)
 *
 * Migration to real Stripe = (a) `npm install stripe` (b) set STRIPE_MODE=test
 * (c) set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in .env (d) restart.
 *
 * See docs/stripe-setup.md for the full production checklist.
 */
import { randomBytes } from 'crypto';

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'        // 3DS challenge
  | 'processing'
  | 'requires_capture'       // authorized but not captured (manual capture)
  | 'succeeded'
  | 'canceled';

export interface PaymentIntent {
  id: string;
  status: PaymentIntentStatus;
  amount: number;            // in cents (HKD * 100)
  currency: string;
  captureMethod: 'automatic' | 'manual';
  clientSecret: string;
  failureCode?: string;
  failureMessage?: string;
  metadata: Record<string, string>;
}

export interface CreateIntentArgs {
  amountHKD: number;
  captureMethod: 'automatic' | 'manual';
  metadata: { orderId: string; userId: string };
}

export interface ConfirmIntentArgs {
  intentId: string;
  /** Mock-mode only: test card number to simulate accept / decline. */
  testCard?: string;
}

/** Test-mode card-number → behavior map (Stripe-compatible). */
const DECLINE_CARDS: Record<string, { code: string; msg: string }> = {
  '4000000000000002': { code: 'card_declined',       msg: '信用卡被拒，請核對資料或換一張卡' },
  '4000000000009995': { code: 'insufficient_funds',  msg: '餘額不足，請換一張卡' },
  '4000002500003155': { code: 'authentication_required', msg: '需要 3D Secure 驗證（mock 模式：自動 fail）' },
};

const STRIPE_MODE = (process.env.STRIPE_MODE ?? 'mock').toLowerCase() as 'mock' | 'test' | 'live';

// In-memory store for mock mode — keyed by intent id.
const mockStore = new Map<string, PaymentIntent>();

function genIntentId(): string {
  return `mock_pi_${randomBytes(8).toString('hex')}`;
}
function genSecret(intentId: string): string {
  return `${intentId}_secret_${randomBytes(6).toString('hex')}`;
}

// ── Mock implementation ─────────────────────────────────────────────────
async function mockCreateIntent(args: CreateIntentArgs): Promise<PaymentIntent> {
  const id = genIntentId();
  const intent: PaymentIntent = {
    id,
    amount: args.amountHKD * 100,
    currency: 'hkd',
    captureMethod: args.captureMethod,
    status: 'requires_confirmation',
    clientSecret: genSecret(id),
    metadata: args.metadata,
  };
  mockStore.set(id, intent);
  return intent;
}

async function mockConfirmIntent(args: ConfirmIntentArgs): Promise<PaymentIntent> {
  const intent = mockStore.get(args.intentId);
  if (!intent) throw new Error(`Mock intent ${args.intentId} not found`);
  // Simulate decline if a test card matches
  if (args.testCard && DECLINE_CARDS[args.testCard]) {
    const reject = DECLINE_CARDS[args.testCard]!;
    intent.status = 'requires_payment_method';   // Stripe re-prompts for new card
    intent.failureCode = reject.code;
    intent.failureMessage = reject.msg;
    return intent;
  }
  // Success path
  intent.failureCode = undefined;
  intent.failureMessage = undefined;
  intent.status = intent.captureMethod === 'automatic' ? 'succeeded' : 'requires_capture';
  return intent;
}

async function mockCaptureIntent(intentId: string): Promise<PaymentIntent> {
  const intent = mockStore.get(intentId);
  if (!intent) throw new Error(`Mock intent ${intentId} not found`);
  if (intent.status !== 'requires_capture' && intent.status !== 'succeeded') {
    throw new Error(`Cannot capture intent in status ${intent.status}`);
  }
  intent.status = 'succeeded';
  return intent;
}

async function mockCancelIntent(intentId: string): Promise<PaymentIntent> {
  const intent = mockStore.get(intentId);
  if (!intent) throw new Error(`Mock intent ${intentId} not found`);
  intent.status = 'canceled';
  return intent;
}

async function mockRefundIntent(intentId: string): Promise<{ id: string; status: string }> {
  const intent = mockStore.get(intentId);
  if (!intent) throw new Error(`Mock intent ${intentId} not found`);
  return { id: `mock_re_${randomBytes(8).toString('hex')}`, status: 'succeeded' };
}

// ── Real Stripe stub (TODO: wire when STRIPE_MODE !== 'mock') ────────────
async function realStripeUnsupported(): Promise<never> {
  throw new Error(
    `STRIPE_MODE=${STRIPE_MODE} but the real SDK adapter is not wired yet. ` +
    `Install \`stripe\` package and implement the real-mode branches in stripe-adapter.ts. ` +
    `See docs/stripe-setup.md.`,
  );
}

// ── Public adapter API ──────────────────────────────────────────────────
export const stripeAdapter = {
  mode: STRIPE_MODE,

  async createIntent(args: CreateIntentArgs): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockCreateIntent(args);
    return realStripeUnsupported();
  },

  async confirmIntent(args: ConfirmIntentArgs): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockConfirmIntent(args);
    return realStripeUnsupported();
  },

  async captureIntent(intentId: string): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockCaptureIntent(intentId);
    return realStripeUnsupported();
  },

  async cancelIntent(intentId: string): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockCancelIntent(intentId);
    return realStripeUnsupported();
  },

  async refundIntent(intentId: string): Promise<{ id: string; status: string }> {
    if (STRIPE_MODE === 'mock') return mockRefundIntent(intentId);
    return realStripeUnsupported();
  },

  /** Verify webhook signature; mock mode always passes. */
  verifyWebhookSignature(payload: string, signature: string | undefined): boolean {
    if (STRIPE_MODE === 'mock') return true;
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) return false;
    // TODO: stripe.webhooks.constructEvent(payload, signature, secret) — throws on bad sig
    return false;
  },
};

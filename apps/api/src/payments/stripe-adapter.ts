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
 * See docs/setup/stripe-setup.md for the full production checklist.
 */
import { randomBytes } from 'crypto';
import Stripe from 'stripe';

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

// ── Real SDK (test / live) ──────────────────────────────────────────────
// STRIPE_API_BASE (e.g. http://localhost:4252) points the SDK at the local
// mock gateway (apps/mock-stripe). Unset = real Stripe servers. Everything
// else — request encoding, webhook signatures — is identical either way.
let stripeClient: Stripe | null = null;
function realStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(`STRIPE_MODE=${STRIPE_MODE} requires STRIPE_SECRET_KEY in env. See docs/setup/stripe-setup.md.`);
  }
  let opts: Stripe.StripeConfig = {};
  const base = process.env.STRIPE_API_BASE;
  if (base) {
    const u = new URL(base);
    opts = {
      host: u.hostname,
      port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
      protocol: u.protocol.replace(':', '') as 'http' | 'https',
      maxNetworkRetries: 1,
    };
  }
  stripeClient = new Stripe(key, opts);
  return stripeClient;
}

function fromStripeIntent(pi: Stripe.PaymentIntent): PaymentIntent {
  return {
    id: pi.id,
    status: pi.status as PaymentIntentStatus,
    amount: pi.amount,
    currency: pi.currency,
    captureMethod: pi.capture_method as 'automatic' | 'manual',
    clientSecret: pi.client_secret ?? '',
    failureCode: pi.last_payment_error?.code ?? undefined,
    failureMessage: pi.last_payment_error?.message ?? undefined,
    metadata: (pi.metadata ?? {}) as Record<string, string>,
  };
}

// ── Public adapter API ──────────────────────────────────────────────────
export const stripeAdapter = {
  mode: STRIPE_MODE,

  /** Public base URL of the gateway the BROWSER should confirm against.
   *  Only meaningful when running against the local mock gateway — real
   *  Stripe confirms via stripe.js, not a URL we hand out. */
  gatewayPublicUrl(): string | null {
    if (STRIPE_MODE === 'mock') return null;
    return process.env.STRIPE_API_BASE ?? null;
  },

  async createIntent(args: CreateIntentArgs): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockCreateIntent(args);
    const pi = await realStripe().paymentIntents.create({
      amount: args.amountHKD * 100,
      currency: 'hkd',
      capture_method: args.captureMethod,
      metadata: args.metadata,
    });
    return fromStripeIntent(pi);
  },

  async confirmIntent(args: ConfirmIntentArgs): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockConfirmIntent(args);
    // Real mode: confirm happens client-side (stripe.js / mock gateway
    // /confirm) and state lands via webhook — the server never confirms.
    throw new Error('confirmIntent is mock-mode only; real mode confirms client-side + webhook');
  },

  async captureIntent(intentId: string): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockCaptureIntent(intentId);
    return fromStripeIntent(await realStripe().paymentIntents.capture(intentId));
  },

  async cancelIntent(intentId: string): Promise<PaymentIntent> {
    if (STRIPE_MODE === 'mock') return mockCancelIntent(intentId);
    return fromStripeIntent(await realStripe().paymentIntents.cancel(intentId));
  },

  async refundIntent(intentId: string): Promise<{ id: string; status: string }> {
    if (STRIPE_MODE === 'mock') return mockRefundIntent(intentId);
    const re = await realStripe().refunds.create({ payment_intent: intentId });
    return { id: re.id, status: re.status ?? 'unknown' };
  },

  /** Verify webhook signature and return the parsed event; mock mode is a
   *  trusting JSON.parse (in-process mock never receives webhooks anyway).
   *  Throws on bad signature — caller maps to 400. */
  constructWebhookEvent(payload: Buffer | string, signature: string | undefined): { type: string; data: { object: any } } {
    if (STRIPE_MODE === 'mock') {
      return JSON.parse(payload.toString());
    }
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    if (!signature) throw new Error('Missing stripe-signature header');
    return realStripe().webhooks.constructEvent(payload, signature, secret) as any;
  },
};

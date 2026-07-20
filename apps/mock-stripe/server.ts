/**
 * Mock Stripe gateway — a STANDALONE server speaking Stripe's wire protocol,
 * so apps/api can run the REAL `stripe` SDK pointed at this host and the whole
 * topology (create intent → client-side confirm → signed webhook → order PAID)
 * matches production exactly. Going live = swap keys + remove STRIPE_API_BASE.
 *
 * Zero npm deps (node http + crypto only). Run via tsx:
 *   PORT=4252 STRIPE_SECRET_KEY=sk_test_mock STRIPE_WEBHOOK_SECRET=whsec_mock \
 *   WEBHOOK_URL=http://localhost:4010/api/webhooks/stripe \
 *   npx tsx apps/mock-stripe/server.ts
 *
 * Surface implemented (subset the platform uses):
 *   POST /v1/payment_intents            (form-encoded, Bearer auth — real SDK)
 *   GET  /v1/payment_intents/:id
 *   POST /v1/payment_intents/:id/capture
 *   POST /v1/payment_intents/:id/cancel
 *   POST /v1/refunds                    (payment_intent=pi_...)
 *   POST /confirm                       (JSON + CORS — browser stand-in for
 *                                        stripe.js confirmPayment; NOT a real
 *                                        Stripe route)
 * Webhooks fired (signed t=..,v1=HMAC-SHA256 — verifiable by
 * stripe.webhooks.constructEvent): payment_intent.succeeded /
 * .amount_capturable_updated / .payment_failed / .canceled, charge.refunded.
 *
 * State is in-memory — restart forgets intents (same limitation as the old
 * in-process mock; acceptable for dev/UAT).
 */
import http from 'http';
import { createHmac, randomBytes } from 'crypto';

const PORT = Number(process.env.PORT ?? 4242);
const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_mock';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_mock';
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? '';

type IntentStatus =
  | 'requires_payment_method' | 'requires_confirmation' | 'requires_action'
  | 'processing' | 'requires_capture' | 'succeeded' | 'canceled';

interface Intent {
  id: string;
  object: 'payment_intent';
  amount: number;
  currency: string;
  capture_method: 'automatic' | 'manual';
  client_secret: string;
  status: IntentStatus;
  metadata: Record<string, string>;
  latest_charge: string;
  last_payment_error: { code: string; message: string } | null;
  created: number;
}

const intents = new Map<string, Intent>();

// Same Stripe test-card semantics the old in-process mock used.
const DECLINE_CARDS: Record<string, { code: string; msg: string }> = {
  '4000000000000002': { code: 'card_declined', msg: '信用卡被拒，請核對資料或換一張卡' },
  '4000000000009995': { code: 'insufficient_funds', msg: '餘額不足，請換一張卡' },
  '4000002500003155': { code: 'authentication_required', msg: '需要 3D Secure 驗證（mock gateway：模擬 3DS fail）' },
};

const rid = (p: string) => `${p}_mockgw_${randomBytes(8).toString('hex')}`;

function log(msg: string) {
  console.log(`[mock-stripe] ${new Date().toISOString()} ${msg}`);
}

// ── Webhook delivery (signed exactly like real Stripe) ───────────────────
async function fireWebhook(type: string, obj: unknown, attempt = 1): Promise<void> {
  if (!WEBHOOK_URL) return;
  const payload = JSON.stringify({
    id: rid('evt'),
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: obj },
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${payload}`).digest('hex');
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` },
      body: payload,
    });
    log(`webhook ${type} → ${res.status}`);
    if (!res.ok && attempt < 3) throw new Error(`status ${res.status}`);
  } catch (e: any) {
    if (attempt < 3) {
      log(`webhook ${type} attempt ${attempt} failed (${e?.message}) — retrying in 2s`);
      setTimeout(() => void fireWebhook(type, obj, attempt + 1), 2000);
    } else {
      log(`webhook ${type} GAVE UP after 3 attempts (${e?.message})`);
    }
  }
}

// ── Request helpers ──────────────────────────────────────────────────────
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Parse Stripe SDK form-encoding: `metadata[orderId]=x` → {metadata:{orderId:'x'}} */
function parseForm(body: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const m = key.match(/^([^[]+)\[([^\]]+)\]$/);
    if (m) {
      out[m[1]!] = out[m[1]!] ?? {};
      out[m[1]!][m[2]!] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(json);
}

function stripeError(res: http.ServerResponse, status: number, message: string, code?: string) {
  send(res, status, { error: { type: 'invalid_request_error', message, ...(code ? { code } : {}) } });
}

// ── Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && path === '/') {
    return send(res, 200, { ok: true, service: 'mock-stripe', intents: intents.size, webhook: WEBHOOK_URL || null });
  }

  try {
    // ── Browser-facing confirm (stands in for stripe.js confirmPayment) ──
    if (req.method === 'POST' && path === '/confirm') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const { client_secret: cs, test_card: card } = body as { client_secret?: string; test_card?: string };
      const intent = [...intents.values()].find((i) => i.client_secret === cs);
      if (!intent) return stripeError(res, 404, 'No payment_intent matches that client_secret');
      if (intent.status === 'succeeded' || intent.status === 'requires_capture') {
        return send(res, 200, { status: intent.status }); // idempotent re-confirm
      }
      if (intent.status === 'canceled') return stripeError(res, 400, 'PaymentIntent is canceled');

      const decline = card ? DECLINE_CARDS[card] : undefined;
      if (decline) {
        intent.status = 'requires_payment_method';
        intent.last_payment_error = { code: decline.code, message: decline.msg };
        void fireWebhook('payment_intent.payment_failed', intent);
        return send(res, 200, { status: intent.status, error: intent.last_payment_error });
      }

      intent.last_payment_error = null;
      if (intent.capture_method === 'automatic') {
        intent.status = 'succeeded';
        void fireWebhook('payment_intent.succeeded', intent);
      } else {
        intent.status = 'requires_capture';
        void fireWebhook('payment_intent.amount_capturable_updated', intent);
      }
      log(`confirm ${intent.id} → ${intent.status}`);
      return send(res, 200, { status: intent.status });
    }

    // ── /v1/* requires Bearer secret key (like real Stripe) ─────────────
    if (path.startsWith('/v1/')) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${SECRET_KEY}`) {
        return stripeError(res, 401, 'Invalid API key provided');
      }
    }

    if (req.method === 'POST' && path === '/v1/payment_intents') {
      const f = parseForm(await readBody(req));
      const id = rid('pi');
      const intent: Intent = {
        id,
        object: 'payment_intent',
        amount: Number(f.amount ?? 0),
        currency: String(f.currency ?? 'hkd'),
        capture_method: (f.capture_method === 'manual' ? 'manual' : 'automatic'),
        client_secret: `${id}_secret_${randomBytes(6).toString('hex')}`,
        status: 'requires_payment_method',
        metadata: f.metadata ?? {},
        latest_charge: rid('ch'),
        last_payment_error: null,
        created: Math.floor(Date.now() / 1000),
      };
      intents.set(id, intent);
      log(`created ${id} amount=${intent.amount} capture=${intent.capture_method}`);
      return send(res, 200, intent);
    }

    const piMatch = path.match(/^\/v1\/payment_intents\/(pi_[a-z0-9_]+)(?:\/(capture|cancel))?$/);
    if (piMatch) {
      const intent = intents.get(piMatch[1]!);
      if (!intent) return stripeError(res, 404, `No such payment_intent: ${piMatch[1]}`);

      if (req.method === 'GET' && !piMatch[2]) return send(res, 200, intent);

      if (req.method === 'POST' && piMatch[2] === 'capture') {
        if (intent.status !== 'requires_capture') {
          return stripeError(res, 400, `PaymentIntent cannot capture in status ${intent.status}`);
        }
        intent.status = 'succeeded';
        void fireWebhook('payment_intent.succeeded', intent);
        log(`captured ${intent.id}`);
        return send(res, 200, intent);
      }

      if (req.method === 'POST' && piMatch[2] === 'cancel') {
        if (intent.status === 'succeeded') {
          return stripeError(res, 400, 'PaymentIntent already succeeded — use refunds');
        }
        intent.status = 'canceled';
        void fireWebhook('payment_intent.canceled', intent);
        log(`canceled ${intent.id}`);
        return send(res, 200, intent);
      }
    }

    if (req.method === 'POST' && path === '/v1/refunds') {
      const f = parseForm(await readBody(req));
      const intent = intents.get(String(f.payment_intent ?? ''));
      if (!intent) return stripeError(res, 404, `No such payment_intent: ${f.payment_intent}`);
      if (intent.status !== 'succeeded') {
        return stripeError(res, 400, `Cannot refund intent in status ${intent.status}`);
      }
      const refund = {
        id: rid('re'),
        object: 'refund',
        payment_intent: intent.id,
        charge: intent.latest_charge,
        amount: intent.amount,
        currency: intent.currency,
        status: 'succeeded',
      };
      void fireWebhook('charge.refunded', {
        id: intent.latest_charge,
        object: 'charge',
        payment_intent: intent.id,
        amount_refunded: intent.amount,
        refunded: true,
      });
      log(`refunded ${intent.id}`);
      return send(res, 200, refund);
    }

    return stripeError(res, 404, `Unrecognized request URL (${req.method}: ${path})`);
  } catch (e: any) {
    log(`ERROR ${req.method} ${path}: ${e?.message}`);
    return stripeError(res, 500, e?.message ?? 'Internal error');
  }
});

server.listen(PORT, () => {
  log(`listening on :${PORT} (webhook → ${WEBHOOK_URL || 'DISABLED'})`);
});

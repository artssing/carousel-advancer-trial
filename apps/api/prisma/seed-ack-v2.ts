/**
 * Ack v2 flow test data — one order per state so the founder can walk every
 * branch of the new acknowledgement model (docs/proposals/ack-model-v2-proposal.md).
 *
 * Usage (UAT):
 *   cd apps/api && DATABASE_URL=<uat url> npx tsx prisma/seed-ack-v2.ts
 *
 * Idempotent: deletes previous [ACKV2] orders/listings first.
 * Actors: alice@demo.hk (買家) / tom@demo.hk (賣家) / milan@authentik.hk (鑑定師)
 */
import { PrismaClient, OrderStatus, DeliveryMethod, PaymentMethod, ListingStatus, Category } from '@prisma/client';

const prisma = new PrismaClient();

const pic = (seed: string, n: number) =>
  Array.from({ length: n }, (_, i) => `https://picsum.photos/seed/ackv2-${seed}-${i}/800/800`);

interface Cfg {
  tag: string;            // scenario label in title
  price: number;
  status: OrderStatus;
  delivery: DeliveryMethod;
  payment: PaymentMethod;
  withAuth: boolean;
  extra?: Record<string, any>;
  evidence?: boolean;     // add OrderEvidence so verdict is submittable
  note: string;           // 測試指引（console 輸出）
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const CONFIGS: Cfg[] = [
  // ── A. SHIP + 鑑定 ──
  { tag: 'A1 賣家待寄出(鑑定)', price: 12000, status: OrderStatus.PAID, delivery: DeliveryMethod.SHIP, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    note: 'tom orders 頁：撳「已寄出至鑑定師」→ 要入 SF 單號' },
  { tag: 'A2 鑑定師待收件', price: 12800, status: OrderStatus.SHIPPED_TO_AUTHENTICATOR, delivery: DeliveryMethod.SHIP, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    extra: { sellerShipTrackingNo: 'SF0000011111', shippedToAuthAt: new Date() },
    note: 'milan portal：收件 ≥3 相 → 直入 AUTHENTICATING（冇賣家 ack）' },
  { tag: 'A3 鑑定中(SHIP)', price: 13500, status: OrderStatus.AUTHENTICATING, delivery: DeliveryMethod.SHIP, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true, evidence: true,
    extra: { sellerShipTrackingNo: 'SF0000022222', shippedToAuthAt: new Date(Date.now() - DAY), receivedByAuthAt: new Date(), authReceiptPhotos: pic('a3', 3), authReceiveAckAt: new Date() },
    note: 'milan：落 verdict（已有 evidence，可即提交）' },
  { tag: 'A4 PASSED待寄買家', price: 15000, status: OrderStatus.AUTH_PASSED, delivery: DeliveryMethod.SHIP, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    extra: { sellerShipTrackingNo: 'SF0000033333', authVerdict: 'PASSED', authCompletedAt: new Date(), authReceiptPhotos: pic('a4', 3) },
    note: 'tom（或 milan API）：「已寄出至買家」→ SF 單號 → autoCompleteAt=T+3' },
  { tag: 'A5 T+3倒數中', price: 16000, status: OrderStatus.SHIPPED_TO_BUYER, delivery: DeliveryMethod.SHIP, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    extra: { sellerShipTrackingNo: 'SF0000044444', authShipTrackingNo: 'SF0000055555', authVerdict: 'PASSED', shippedToBuyerAt: new Date(), autoCompleteAt: new Date(Date.now() + 2 * DAY) },
    note: 'alice orders 頁：見倒數 banner + 「提出爭議」button（唔會有確認收貨掣）' },
  { tag: 'A6 T+3已過期(cron示範)', price: 16800, status: OrderStatus.SHIPPED_TO_BUYER, delivery: DeliveryMethod.SHIP, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    extra: { sellerShipTrackingNo: 'SF0000066666', authVerdict: 'PASSED', shippedToBuyerAt: new Date(Date.now() - 4 * DAY), autoCompleteAt: new Date(Date.now() - HOUR) },
    note: '15 分鐘內 cron 會自動 COMPLETED + 放款（或重啟 API 即掃）' },
  // ── B. SHIP 無鑑定 ──
  { tag: 'B1 無鑑定待寄出', price: 800, status: OrderStatus.PAID, delivery: DeliveryMethod.SHIP, payment: PaymentMethod.OFFLINE_CASH, withAuth: false,
    note: 'tom：「已寄出至買家」→ SF 單號 → T+3 自動完成' },
  // ── C. MEETUP_AUTH + QR ──
  { tag: 'C1 賣家drop-off QR', price: 11000, status: OrderStatus.PAID, delivery: DeliveryMethod.MEETUP_AUTH, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    note: 'tom orders 頁：自動顯示 60 秒 QR；milan 去 3011/scan 用鏡頭 scan → 影 3 相 → CUSTODY' },
  { tag: 'C2 鑑定中(CUSTODY)', price: 11500, status: OrderStatus.CUSTODY, delivery: DeliveryMethod.MEETUP_AUTH, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true, evidence: true,
    extra: { custodyHeld: true, handoverPhotos: pic('c2', 3), authReceiveAckAt: new Date(), sellerHandoverAckAt: new Date(), receivedByAuthAt: new Date() },
    note: 'milan：落 verdict → PASSED 入 AWAITING_BUYER_PICKUP' },
  { tag: 'C3 買家pickup QR', price: 11800, status: OrderStatus.AWAITING_BUYER_PICKUP, delivery: DeliveryMethod.MEETUP_AUTH, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    extra: { custodyHeld: true, handoverPhotos: pic('c3', 3), authVerdict: 'PASSED', authCompletedAt: new Date() },
    note: 'alice orders 頁：自動顯示取貨 QR；milan scan → 確認交收 → COMPLETED+放款' },
  // ── D. MEETUP_3WAY ──
  { tag: 'D1 三方待開始', price: 22000, status: OrderStatus.PAID, delivery: DeliveryMethod.MEETUP_3WAY, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true,
    note: 'milan：「開始面交鑑定」' },
  { tag: 'D2 三方鑑定中', price: 23000, status: OrderStatus.AUTHENTICATING, delivery: DeliveryMethod.MEETUP_3WAY, payment: PaymentMethod.ONLINE_ESCROW, withAuth: true, evidence: true,
    extra: { receivedByAuthAt: new Date() },
    note: 'milan：verdict PASSED 必須剔「貨物已當面交予買家」→ 直接 COMPLETED+放款（alice 唔使 ack）' },
  // ── E. MEETUP_DIRECT ──
  { tag: 'E1 雙方面交(現金)', price: 500, status: OrderStatus.PAID, delivery: DeliveryMethod.MEETUP_DIRECT, payment: PaymentMethod.OFFLINE_CASH, withAuth: false,
    extra: { meetupFreeText: '旺角站 E 出口' },
    note: '零 ack — alice/tom orders 頁都冇任何 required button' },
  { tag: 'E2 雙方面交(legacy escrow)', price: 600, status: OrderStatus.PAID, delivery: DeliveryMethod.MEETUP_DIRECT, payment: PaymentMethod.ONLINE_ESCROW, withAuth: false,
    extra: { meetupFreeText: '中環站 A 出口' },
    note: 'legacy 單：alice 有「確認面交完成（放款畀賣家）」button' },
];

async function main() {
  const [alice, tom, milanUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'alice@demo.hk' } }),
    prisma.user.findUnique({ where: { email: 'tom@demo.hk' } }),
    prisma.user.findUnique({ where: { email: 'milan@authentik.hk' } }),
  ]);
  if (!alice || !tom || !milanUser) throw new Error('Demo accounts missing — run seed-demo-accounts first');
  const milan = await prisma.authenticator.findUnique({ where: { userId: milanUser.id } });
  if (!milan) throw new Error('Milan authenticator record missing');

  // Clean previous
  const oldOrders = await prisma.order.findMany({
    where: { listing: { title: { startsWith: '[ACKV2' } } },
    select: { id: true },
  });
  const oldIds = oldOrders.map((o) => o.id);
  await prisma.qrToken.deleteMany({ where: { orderId: { in: oldIds } } });
  await prisma.orderEvidence.deleteMany({ where: { orderId: { in: oldIds } } });
  await prisma.message.deleteMany({ where: { conversation: { orderId: { in: oldIds } } } });
  await prisma.conversation.deleteMany({ where: { orderId: { in: oldIds } } });
  await prisma.order.deleteMany({ where: { id: { in: oldIds } } });
  await prisma.listing.deleteMany({ where: { title: { startsWith: '[ACKV2' } } });
  console.log(`Cleaned ${oldIds.length} previous [ACKV2] orders`);

  for (const cfg of CONFIGS) {
    const listing = await prisma.listing.create({
      data: {
        sellerId: tom.id,
        category: Category.HANDBAG,
        title: `[ACKV2 ${cfg.tag}] Chanel Classic Flap`,
        description: `Ack v2 flow 測試單：${cfg.note}`,
        priceHKD: cfg.price,
        tier: cfg.price >= 10000 ? 3 : cfg.price >= 1000 ? 2 : 1,
        images: pic(cfg.tag.slice(0, 2), 2),
        coverUrl: pic(cfg.tag.slice(0, 2), 1)[0],
        status: ListingStatus.RESERVED,
        allowedDeliveryMethods: [cfg.delivery],
      },
    });
    const authFee = cfg.withAuth ? Math.round(cfg.price * 0.02) : 0;
    const platformFee = Math.round(cfg.price * 0.015);
    const order = await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId: alice.id,
        sellerId: tom.id,
        authenticatorId: cfg.withAuth ? milan.id : null,
        salePriceHKD: cfg.price,
        authFeeHKD: authFee,
        platformFeeHKD: platformFee,
        sellerNetHKD: cfg.price - authFee - platformFee,
        status: cfg.status,
        deliveryMethod: cfg.delivery,
        paymentMethod: cfg.payment,
        escrowHeld: cfg.payment === PaymentMethod.ONLINE_ESCROW,
        paidAt: new Date(),
        ...(cfg.extra ?? {}),
      },
    });
    if (cfg.evidence) {
      await prisma.orderEvidence.create({
        data: {
          orderId: order.id,
          uploaderUserId: milanUser.id,
          mediaUrl: pic(`ev-${cfg.tag.slice(0, 2)}`, 1)[0],
          mimeType: 'image/jpeg',
          sizeBytes: 120_000,
          kind: 'IMAGE',
        },
      });
    }
    console.log(`✓ ${cfg.tag.padEnd(24)} ${cfg.status.padEnd(24)} → ${cfg.note}`);
  }
  console.log(`\nDone — ${CONFIGS.length} 張 [ACKV2] 測試單。買家 alice@demo.hk / 賣家 tom@demo.hk / 鑑定師 milan@authentik.hk（password123）`);
}

main().finally(() => prisma.$disconnect());

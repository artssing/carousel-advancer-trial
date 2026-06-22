/**
 * Seed script: create one order per OrderStatus where Demo Seller is the BUYER.
 * Run: cd apps/api && set -a; . ./.env; set +a && node prisma/seed-test-orders.js
 *
 * We create a temporary "Test Seller B" user who owns the listings,
 * so Demo Seller can be the buyer without hitting the "cannot buy own listing" guard.
 */

const { PrismaClient, OrderStatus, DeliveryMethod, PaymentMethod, ListingStatus } = require('@prisma/client');

const prisma = new PrismaClient();

const BUYER_ID = 'cmpo6snzn0000svubye20pe46'; // Demo Seller (the account being tested)
const AUTH_MILAN = 'cmpo6snzz0003svubzdfugqz2';
const AUTH_PROCHECK = 'cmpo6so070006svub6l836ga9';

// One config per status to make each card visually distinct
const ORDER_CONFIGS = [
  {
    status: OrderStatus.AWAITING_PAYMENT,
    title: '[TEST] Chanel Boy Medium · Caviar Black',
    price: 25000,
    category: 'HANDBAG',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_MILAN,
    authFee: 1750,
  },
  {
    status: OrderStatus.PAID,
    title: '[TEST] Hermès Birkin 25 · Togo Gold',
    price: 180000,
    category: 'HANDBAG',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_MILAN,
    authFee: 12600,
  },
  {
    status: OrderStatus.SHIPPED_TO_AUTHENTICATOR,
    title: '[TEST] LV Speedy 25 · Monogram',
    price: 12000,
    category: 'HANDBAG',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_PROCHECK,
    authFee: 840,
  },
  {
    status: OrderStatus.AUTHENTICATING,
    title: '[TEST] Rolex Submariner 126610LN · 黑水鬼',
    price: 95000,
    category: 'WATCH',
    delivery: DeliveryMethod.MEETUP_AUTH,
    payment: PaymentMethod.OFFLINE_CASH,
    authId: AUTH_MILAN,
    authFee: 6650,
    meetup: 'Milan Station 旺角店',
  },
  {
    status: OrderStatus.AUTH_PASSED,
    title: '[TEST] PSA 10 Charizard Base Set 1st Ed',
    price: 45000,
    category: 'POKEMON_CARD',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_PROCHECK,
    authFee: 3150,
    verdict: 'PASSED',
    verdictNotes: 'Card grade confirmed PSA 10. Holographic pattern authentic.',
  },
  {
    status: OrderStatus.AUTH_FAILED,
    title: '[TEST] Gucci Marmont Mini · Red',
    price: 8500,
    category: 'HANDBAG',
    delivery: DeliveryMethod.MEETUP_3WAY,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_MILAN,
    authFee: 595,
    meetup: '旺角港鐵站 E2 出口',
    verdict: 'FAILED',
    verdictNotes: 'Hardware engraving inconsistent with genuine Gucci. Stitching irregular.',
  },
  {
    status: OrderStatus.SHIPPED_TO_BUYER,
    title: '[TEST] iPhone 15 Pro Max 256GB · 鈦金屬黑色',
    price: 9200,
    category: 'IPHONE',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_PROCHECK,
    authFee: 644,
    verdict: 'PASSED',
    verdictNotes: 'Serial verified with Apple. All functions tested OK.',
  },
  {
    status: OrderStatus.DELIVERED,
    title: '[TEST] Air Jordan 1 High OG · Chicago',
    price: 5500,
    category: 'SNEAKER',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: null,
    authFee: 0,
  },
  {
    status: OrderStatus.COMPLETED,
    title: '[TEST] Omega Speedmaster Professional Moonwatch',
    price: 32000,
    category: 'WATCH',
    delivery: DeliveryMethod.MEETUP_AUTH,
    payment: PaymentMethod.OFFLINE_CASH,
    authId: AUTH_MILAN,
    authFee: 2240,
    meetup: 'Milan Station 旺角店',
    verdict: 'PASSED',
    verdictNotes: 'Serial and movement verified. Genuine Omega Cal. 1861.',
  },
  {
    status: OrderStatus.DISPUTED,
    title: '[TEST] Bearbrick 1000% · KAWS Tension',
    price: 22000,
    category: 'DESIGNER_TOY',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_PROCHECK,
    authFee: 1540,
    verdict: 'PASSED',
    verdictNotes: 'Medicom markings verified authentic.',
  },
  {
    status: OrderStatus.REFUNDED,
    title: '[TEST] Dior Saddle Bag · Oblique Navy',
    price: 28000,
    category: 'HANDBAG',
    delivery: DeliveryMethod.SHIP,
    payment: PaymentMethod.ONLINE_ESCROW,
    authId: AUTH_MILAN,
    authFee: 1960,
    verdict: 'FAILED',
    verdictNotes: 'Oblique pattern misaligned. Not genuine Dior.',
  },
];

async function main() {
  // 1. Create or find a test seller (different from Demo Seller so orders are valid)
  let testSeller = await prisma.user.findFirst({ where: { email: 'test-seller-b@authentik.hk' } });
  if (!testSeller) {
    testSeller = await prisma.user.create({
      data: {
        email: 'test-seller-b@authentik.hk',
        passwordHash: '$2b$10$dummyhashforseeding000000000000000000000000000',
        displayName: 'Test Seller B',
        kycStatus: 'VERIFIED',
      },
    });
    console.log(`Created test seller: ${testSeller.id}`);
  }

  // 2. Clean up previous test orders
  const deleted = await prisma.order.deleteMany({
    where: { listing: { title: { startsWith: '[TEST]' } } },
  });
  console.log(`Deleted ${deleted.count} previous test orders`);

  const deletedListings = await prisma.listing.deleteMany({
    where: { title: { startsWith: '[TEST]' } },
  });
  console.log(`Deleted ${deletedListings.count} previous test listings`);

  // 3. Create listings + orders
  for (const cfg of ORDER_CONFIGS) {
    const listing = await prisma.listing.create({
      data: {
        sellerId: testSeller.id,
        category: cfg.category,
        title: cfg.title,
        description: `Test listing for order status: ${cfg.status}`,
        priceHKD: cfg.price,
        tier: cfg.price >= 10000 ? 3 : cfg.price >= 1000 ? 2 : 1,
        images: [],
        status: ListingStatus.RESERVED, // all have orders
        allowedDeliveryMethods: [cfg.delivery],
      },
    });

    const platformFee = Math.round(cfg.price * 0.015);
    const sellerNet = cfg.price - cfg.authFee - platformFee;

    const order = await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId: BUYER_ID,
        sellerId: testSeller.id,
        authenticatorId: cfg.authId,
        salePriceHKD: cfg.price,
        authFeeHKD: cfg.authFee,
        platformFeeHKD: platformFee,
        sellerNetHKD: sellerNet,
        status: cfg.status,
        deliveryMethod: cfg.delivery,
        paymentMethod: cfg.payment,
        meetupLocation: cfg.meetup ?? null,
        escrowHeld: cfg.payment === PaymentMethod.ONLINE_ESCROW,
        authVerdict: cfg.verdict ?? null,
        authNotes: cfg.verdictNotes ?? null,
        paidAt: [OrderStatus.AWAITING_PAYMENT].includes(cfg.status) ? null : new Date(),
      },
    });

    console.log(`✓ ${cfg.status.padEnd(28)} → ${cfg.title.slice(0, 40)} (order ${order.id.slice(0, 12)})`);
  }

  console.log(`\nDone! Created ${ORDER_CONFIGS.length} test orders for buyer Demo Seller.`);
  console.log('Login as seller@authentik.hk → /orders → "我買入" tab to see all statuses.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

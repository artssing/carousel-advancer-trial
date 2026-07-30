/**
 * Seed ONE ready-to-handover MEETUP_AUTH order so the QR drop-off flow can be
 * demoed end-to-end:
 *   1. Seller (tom@demo.hk) opens the order in the consumer portal → sees the
 *      SELLER_DROPOFF QR handover card → (UAT) copies the raw token.
 *   2. Authenticator (milan@authentik.hk) opens /scan → pastes the token →
 *      confirms handover (3 photos) → order moves PAID → CUSTODY → 鑑定.
 *
 * Idempotent — re-runnable. Prior seeded order (marker in authNotes) + its
 * qrTokens are wiped first. Run against whichever DB DATABASE_URL points at:
 *
 *   DATABASE_URL="postgresql://authentik:authentik_dev@localhost:5432/authentik_uat?schema=public" \
 *     npx tsx prisma/seed-qr-demo.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MARKER = '[SEED-QR-DEMO]';
const PLATFORM_FEE_RATE = 0.015;

async function main() {
  const seller = await prisma.user.findUnique({ where: { email: 'tom@demo.hk' } });
  const buyer = await prisma.user.findUnique({ where: { email: 'alice@demo.hk' } });
  const milanUser = await prisma.user.findUnique({ where: { email: 'milan@authentik.hk' } });
  if (!seller || !buyer || !milanUser) {
    throw new Error('缺 demo accounts — 先跑 seed.ts + seed-demo-accounts.ts');
  }
  const milan = await prisma.authenticator.findUnique({ where: { userId: milanUser.id } });
  if (!milan) throw new Error('milan Authenticator row 唔存在');

  // Tom's ACTIVE handbag listing that accepts MEETUP_AUTH (milan = 手袋師).
  const listing = await prisma.listing.findFirst({
    where: {
      sellerId: seller.id,
      status: 'ACTIVE',
      category: 'HANDBAG',
      allowedDeliveryMethods: { has: 'MEETUP_AUTH' },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!listing) throw new Error('搵唔到 tom 嘅 MEETUP_AUTH handbag listing');

  // ── Wipe prior seeded order (+ its QR tokens) so re-runs stay clean ──
  const stale = await prisma.order.findMany({
    where: { authNotes: { contains: MARKER } },
    select: { id: true },
  });
  if (stale.length) {
    const ids = stale.map((o) => o.id);
    await prisma.qrToken.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`✓ wiped ${ids.length} prior seeded order(s)`);
  }

  const sale = listing.priceHKD;
  const authFee = Math.round(Math.max(sale * milan.feeRatePct, milan.feeMinHKD));
  const platformFee = Math.round(sale * PLATFORM_FEE_RATE);
  const sellerNet = sale - authFee - platformFee;

  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      authenticatorId: milan.id,
      status: 'PAID',
      deliveryMethod: 'MEETUP_AUTH',
      paymentMethod: 'ONLINE_ESCROW',
      salePriceHKD: sale,
      authFeeHKD: authFee,
      platformFeeHKD: platformFee,
      sellerNetHKD: sellerNet,
      escrowHeld: true,
      custodyHeld: false,
      paidAt: new Date(),
      paymentDeadlineAt: null,
      meetupBranchSnapshot: {
        name: milan.storeName ?? milan.displayName,
        fullAddress: milan.locationAddress ?? '旺角西洋菜南街 1A 號好望角大廈 5 樓',
        districtKey: milan.district ?? '旺角',
        businessHours: milan.businessHours ?? '星期一至日 12:00–21:00',
      },
      authNotes: MARKER,
    },
  });

  console.log('\n🎉 QR demo order ready\n==================================================');
  console.log(`  Order ID     : ${order.id}`);
  console.log(`  貨品          : ${listing.title} (HK$${sale})`);
  console.log(`  賣家(出 QR)   : tom@demo.hk    → consumer /orders/${order.id}`);
  console.log(`  鑑定師(scan)  : milan@authentik.hk → authenticator /scan`);
  console.log(`  狀態          : PAID · MEETUP_AUTH · custodyHeld=false`);
  console.log(`  費用          : authFee HK$${authFee} · platform HK$${platformFee} · sellerNet HK$${sellerNet}`);
  console.log('==================================================');
  console.log('流程：tom 開訂單→複製 handover token→milan /scan 貼 token→影3相確認→CUSTODY→鑑定');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

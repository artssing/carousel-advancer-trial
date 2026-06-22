/**
 * Seed orders at every state of MEETUP_AUTH Phase A soft-dispute flow
 * for manual testing.
 *
 * Run:
 *   cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed-soft-dispute.ts
 *
 * Creates 5 orders for jenny (seller) × alice (buyer) × milan (authenticator):
 *
 *   SD-1  PAID                       → milan: 撳「賣家已到，準備接收」
 *   SD-2  HANDOVER_TO_AUTH           → milan: 影相 + 確認接收
 *   SD-3  SELLER_ACK_PENDING (有相)   → jenny: 3 個 buttons (確認 / 重拍 / 取消) ★核心
 *   SD-4  HANDOVER_TO_AUTH (重拍中)   → 示範 requestRePhoto 後嘅狀態（authNotes 有 [賣家要求重拍]）
 *   SD-5  REFUNDED (已取消)           → 示範 cancelHandover 結果（read-only audit）
 */
import { PrismaClient, OrderStatus, DeliveryMethod, PaymentMethod, ListingStatus } from '@prisma/client';

const prisma = new PrismaClient();

const PLACEHOLDER_PHOTO = 'https://picsum.photos/seed/handover/600/600';

async function main() {
  const [jenny, alice, milanUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'jenny@demo.hk' } }),
    prisma.user.findUnique({ where: { email: 'alice@demo.hk' } }),
    prisma.user.findUnique({ where: { email: 'milan@authentik.hk' } }),
  ]);
  if (!jenny || !alice || !milanUser) {
    throw new Error('Run ./seed-demo.sh first — demo accounts not found.');
  }
  const milan = await prisma.authenticator.findUnique({ where: { userId: milanUser.id } });
  if (!milan) throw new Error('Milan authenticator profile missing.');

  // Cleanup previous SD-* listings/orders
  const oldListings = await prisma.listing.findMany({
    where: { sellerId: jenny.id, title: { startsWith: '[SD-' } },
    select: { id: true },
  });
  if (oldListings.length) {
    const ids = oldListings.map((l) => l.id);
    await prisma.message.deleteMany({ where: { conversation: { listingId: { in: ids } } } });
    await prisma.conversation.deleteMany({ where: { listingId: { in: ids } } });
    await prisma.order.deleteMany({ where: { listingId: { in: ids } } });
    await prisma.listing.deleteMany({ where: { id: { in: ids } } });
  }

  const scenarios = [
    { code: 'SD-1', status: OrderStatus.PAID,                  desc: 'PAID — 等鑑定師啟動接收' },
    { code: 'SD-2', status: OrderStatus.HANDOVER_TO_AUTH,      desc: 'HANDOVER_TO_AUTH — 等鑑定師首次影相' },
    { code: 'SD-3', status: OrderStatus.SELLER_ACK_PENDING,    desc: 'SELLER_ACK_PENDING — ★賣家首次面對 3 buttons' },
    { code: 'SD-4', status: OrderStatus.HANDOVER_TO_AUTH,      desc: '已 requestRePhoto 1 次 — milan 重拍中（見原因 banner）' },
    { code: 'SD-5', status: OrderStatus.SELLER_ACK_PENDING,    desc: '★第 2 次相片 — 賣家見 timeline + 仍剩 1 次重拍' },
    { code: 'SD-6', status: OrderStatus.SELLER_ACK_PENDING,    desc: '★已用盡 2 次重拍 — 賣家只剩確認 / 取消' },
    { code: 'SD-7', status: OrderStatus.REFUNDED,              desc: '已 cancelHandover — 取消結果' },
  ];

  const created: { code: string; status: string; orderId: string }[] = [];
  for (const s of scenarios) {
    const price = 12000;          // Tier 3-ish 方便試
    const authFee = 600;          // 5%
    const platformFee = 180;      // 1.5%
    const sellerNet = price - authFee - platformFee;

    const listing = await prisma.listing.create({
      data: {
        sellerId: jenny.id,
        category: 'HANDBAG',
        title: `[${s.code}] Hermès 短夾 · ${s.desc}`,
        description: `Soft-dispute flow 測試 · ${s.desc}`,
        priceHKD: price, tier: 3,
        images: ['https://picsum.photos/seed/' + s.code + '/600/600'],
        status: s.code === 'SD-5' ? ListingStatus.ACTIVE : ListingStatus.RESERVED,
        allowedDeliveryMethods: ['MEETUP_AUTH'],
        sellerDistrict: '中環',
      },
    });

    const now = new Date();
    const baseData: any = {
      listingId: listing.id,
      buyerId: alice.id,
      sellerId: jenny.id,
      authenticatorId: milan.id,
      salePriceHKD: price,
      authFeeHKD: authFee,
      platformFeeHKD: platformFee,
      sellerNetHKD: sellerNet,
      deliveryMethod: DeliveryMethod.MEETUP_AUTH,
      paymentMethod: PaymentMethod.ONLINE_ESCROW,
      meetupLocation: '旺角 Milan Station',
      escrowHeld: s.status !== OrderStatus.REFUNDED,
      status: s.status,
      paidAt: now,
    };

    // Use distinct photo URLs per round so it's visually obvious that re-photo happened
    const photoSet = (tag: string, n: number) =>
      Array.from({ length: n }, (_, i) =>
        `https://picsum.photos/seed/${s.code}-${tag}-${i + 1}/600/600`);
    const earlier = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();

    // Per-state extras
    if (s.code === 'SD-3') {
      const photos = photoSet('r1', 3);
      baseData.handoverPhotos = photos;
      baseData.authReceiveAckAt = now;
      baseData.handoverHistory = [{
        round: 1, photos, uploadedAt: earlier(5),
      }];
    }
    if (s.code === 'SD-4') {
      // round 1 already rejected; awaiting round 2 photos
      const r1 = photoSet('r1', 3);
      baseData.handoverPhotos = [];
      baseData.authReceiveAckAt = null;
      baseData.rePhotoCount = 1;
      baseData.rePhotoRequestedAt = now;
      baseData.handoverHistory = [{
        round: 1,
        photos: r1,
        uploadedAt: earlier(40),
        rejectedAt: earlier(20),
        rejectionPresets: ['角度不足，睇唔到關鍵位置', '光線太暗 / 反光'],
        rejectionComment: '請對住底部刮痕同 hardware 影 close-up，第一張睇唔到 logo 細節。',
      }];
      baseData.authNotes = '\n\n[賣家要求重拍 #1] 角度不足，睇唔到關鍵位置 · 光線太暗 / 反光';
    }
    if (s.code === 'SD-5') {
      // round 1 rejected; round 2 just uploaded (still 1 chance left)
      const r1 = photoSet('r1', 3);
      const r2 = photoSet('r2', 4);
      baseData.handoverPhotos = r2;
      baseData.authReceiveAckAt = now;
      baseData.rePhotoCount = 1;
      baseData.rePhotoRequestedAt = earlier(30);
      baseData.handoverHistory = [
        {
          round: 1, photos: r1, uploadedAt: earlier(60),
          rejectedAt: earlier(30),
          rejectionPresets: ['漏拍商品瑕疵'],
          rejectionComment: '左邊角位嘅磨損冇拍到。',
        },
        { round: 2, photos: r2, uploadedAt: earlier(5) },
      ];
    }
    if (s.code === 'SD-6') {
      // round 1 & 2 both rejected; round 3 just uploaded (max reached — re-photo button hidden)
      const r1 = photoSet('r1', 3);
      const r2 = photoSet('r2', 3);
      const r3 = photoSet('r3', 4);
      baseData.handoverPhotos = r3;
      baseData.authReceiveAckAt = now;
      baseData.rePhotoCount = 2;
      baseData.rePhotoRequestedAt = earlier(15);
      baseData.handoverHistory = [
        {
          round: 1, photos: r1, uploadedAt: earlier(90),
          rejectedAt: earlier(75),
          rejectionPresets: ['相片唔夠清晰'],
        },
        {
          round: 2, photos: r2, uploadedAt: earlier(60),
          rejectedAt: earlier(15),
          rejectionPresets: ['漏拍配件 / 附件'],
          rejectionComment: '塵袋同保卡呢？',
        },
        { round: 3, photos: r3, uploadedAt: earlier(2) },
      ];
    }
    if (s.code === 'SD-7') {
      const r1 = photoSet('r1', 3);
      baseData.handoverPhotos = r1;
      baseData.authReceiveAckAt = earlier(60);
      baseData.autoCanceledAt = now;
      baseData.escrowHeld = false;
      baseData.custodyHeld = false;
      baseData.rePhotoCount = 1;
      baseData.handoverHistory = [{
        round: 1, photos: r1, uploadedAt: earlier(60),
        rejectedAt: earlier(30),
        rejectionPresets: ['漏拍商品瑕疵'],
        rejectionComment: '物品實際狀況同 listing 有出入，決定取消交易。',
      }];
      baseData.authNotes = '\n\n[賣家取消交易] 物品狀況同 listing 有出入';
    }

    const order = await prisma.order.create({ data: baseData });
    // Conversation row so seller can message buyer/auth from listing/order pages
    // (lesson #6: every order must have its conversation, otherwise IM dead-ends)
    await prisma.conversation.create({
      data: {
        orderId: order.id,
        listingId: listing.id,
        buyerId: alice.id,
        sellerId: jenny.id,
        messages: {
          create: [{
            senderRole: 'SYSTEM' as const,
            body: `訂單已建立：${listing.title}。三方對話開啟。`,
            readByBuyer: true, readBySeller: true, readByAuth: true,
          }],
        },
      },
    });
    created.push({ code: s.code, status: s.status, orderId: order.id });
    console.log(`✓ ${s.code} (${s.status}) → /orders/${order.id}`);
  }

  console.log('\n────────────────────────────────────────────────────────');
  console.log('Manual test playbook (Phase A soft-dispute)');
  console.log('────────────────────────────────────────────────────────');
  console.log('登入：');
  console.log('  賣家  jenny@demo.hk      / password123  → http://localhost:3008/orders');
  console.log('  買家  alice@demo.hk      / password123  → http://localhost:3008/orders');
  console.log('  鑑定  milan@authentik.hk / password123  → http://localhost:3001/inbox');
  console.log('');
  console.log('SD-3 — 首次：jenny 見 timeline (1 round) + 3 buttons + reject modal (preset+comment)');
  console.log('SD-4 — milan 重拍中：見紅色 banner + 賣家拒絕原因 (presets + comment)');
  console.log('SD-5 — 第 2 輪：jenny 見 timeline (round 1 rejected + round 2 pending) + 仍剩 1 次重拍');
  console.log('SD-6 — 上限觸發：jenny 見 timeline 3 rounds，重拍 button 消失，只剩確認 / 取消');
  console.log('SD-7 — 取消結果：read-only audit trail，listing 重新 ACTIVE');
  console.log('');
  console.log('Transparency check：');
  console.log('  - SD-5 / SD-6 milan portal 應該都見到完整 timeline + reject 原因');
  console.log('  - 任何 round 嘅相 click 開新 tab 大圖');
  console.log('  - IM drawer 應該有 SYSTEM message 對應每個 transition');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

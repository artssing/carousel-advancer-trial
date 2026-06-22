/**
 * Seed dummy IM data for cardlab@authentik.hk (authenticator) — for manual
 * testing of WhatsApp-style date dividers + sender grouping in ConversationDrawer.
 *
 * Run:
 *   cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed-im-demo.ts
 *
 * Or from root:
 *   ./start-all.sh first, then
 *   cd apps/api && npx tsx prisma/seed-im-demo.ts
 *
 * Spans messages across ~10 days so dividers show:
 *   今日 / 昨日 / 星期X / M月D日
 */
import { PrismaClient, MessageRole } from '@prisma/client';

const prisma = new PrismaClient();

const ONE_DAY = 24 * 60 * 60 * 1000;

async function main() {
  console.log('🎬 Seeding IM demo for cardlab@authentik.hk …');

  // 1. Find cardlab user + their authenticator profile
  const cardlab = await prisma.user.findUnique({
    where: { email: 'cardlab@authentik.hk' },
    include: { authenticator: true },
  });
  if (!cardlab || !cardlab.authenticator) {
    throw new Error('cardlab@authentik.hk 唔存在或未係 authenticator — 請先跑 seed.ts');
  }

  // 2. Pick (or create) an order where cardlab is the authenticator
  let order = await prisma.order.findFirst({
    where: { authenticatorId: cardlab.authenticator.id },
    include: { buyer: true, seller: true, listing: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!order) {
    console.log('   … 揾唔到 cardlab 嘅 order，建立一個 POKEMON_CARD 鑑定中 order');

    // Pick any POKEMON_CARD listing (cardlab 係 card 專長)，否則 fallback 任何 category
    const listing =
      (await prisma.listing.findFirst({ where: { category: 'POKEMON_CARD', status: 'ACTIVE' } }))
      ?? (await prisma.listing.findFirst({ where: { status: 'ACTIVE' } }));
    if (!listing) throw new Error('冇 ACTIVE listing —— 請先跑 seed.ts');

    // Buyer = 任何非 listing.seller 嘅 user
    const buyer = await prisma.user.findFirst({
      where: {
        id: { not: listing.sellerId },
        authenticator: null,        // 唔好用 authenticator 做 buyer 角色
        email: { not: cardlab.email },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!buyer) throw new Error('搵唔到合適嘅 buyer —— 請先跑 seed.ts');
    order = await prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        authenticatorId: cardlab.authenticator.id,
        status: 'AUTHENTICATING',
        salePriceHKD: listing.priceHKD,
        authFeeHKD: Math.round(listing.priceHKD * 0.05),
        platformFeeHKD: Math.round(listing.priceHKD * 0.015),
        sellerNetHKD: listing.priceHKD - Math.round(listing.priceHKD * 0.05) - Math.round(listing.priceHKD * 0.015),
        deliveryMethod: 'SHIP',
        paymentMethod: 'ONLINE_ESCROW',
        escrowHeld: true,
        paidAt: new Date(Date.now() - 7 * ONE_DAY),
        shippedToAuthAt: new Date(Date.now() - 6 * ONE_DAY),
        receivedByAuthAt: new Date(Date.now() - 4 * ONE_DAY),
      },
      include: { buyer: true, seller: true, listing: true },
    });
    console.log(`   ✓ 建立 order ${order.id.slice(0, 8)}…`);
  }

  console.log(`   📦 order: ${order.listing.title} (${order.id.slice(0, 8)})`);
  console.log(`      buyer: ${order.buyer.displayName} · seller: ${order.seller.displayName}`);

  // 3. Wipe existing conversation for clean test
  const existing = await prisma.conversation.findUnique({ where: { orderId: order.id } });
  if (existing) {
    await prisma.message.deleteMany({ where: { conversationId: existing.id } });
    await prisma.conversation.delete({ where: { id: existing.id } });
    console.log('   🧹 清咗舊 conversation + messages');
  }

  // 4. Create fresh conversation
  const conv = await prisma.conversation.create({
    data: { orderId: order.id },
  });

  // 5. Insert messages with backdated createdAt
  //    Layout 覆蓋：今日 / 昨日 / 3 日前（星期X）/ 同年舊日期 / 跨年
  const cardlabAuth = cardlab; // alias for clarity
  const now = Date.now();

  // Helper to build a Date at "today minus N days, at HH:MM"
  function daysAgoAt(days: number, hours: number, minutes: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  type SeedMsg = {
    when: Date;
    role: MessageRole;
    senderId: string | null;
    body: string;
  };

  const msgs: SeedMsg[] = [
    // ── 9 日前（跨星期）─ welcome system message ──
    {
      when: daysAgoAt(9, 10, 15),
      role: 'SYSTEM',
      senderId: null,
      body: '歡迎使用訂單對話。所有訊息均有記錄，用作爭議仲裁。請勿交換私人聯絡方式。',
    },
    {
      when: daysAgoAt(9, 10, 16),
      role: 'BUYER',
      senderId: order.buyerId,
      body: '你好 cardlab，我剛買咗呢張 Charizard，請問幾時可以開始鑑定？',
    },
    {
      when: daysAgoAt(9, 10, 17),
      role: 'BUYER',
      senderId: order.buyerId,
      body: '想 confirm 下流程',
    },
    {
      when: daysAgoAt(9, 11, 32),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '你好！收到件貨之後 48 小時內會完成。我會 update 進度。',
    },

    // ── 6 日前 ─ shipping update ──
    {
      when: daysAgoAt(6, 14, 5),
      role: 'SELLER',
      senderId: order.sellerId,
      body: '已經寄出咗，順豐單號 SF1234567890',
    },
    {
      when: daysAgoAt(6, 14, 12),
      role: 'BUYER',
      senderId: order.buyerId,
      body: '收到，thx',
    },

    // ── 4 日前 ─ received + start auth ──
    {
      when: daysAgoAt(4, 9, 45),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '收到件貨，今日會開始鑑定。',
    },
    {
      when: daysAgoAt(4, 9, 46),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '初步睇外觀印刷，反光紋路 OK',
    },
    {
      when: daysAgoAt(4, 9, 47),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '會再做 UV light + PSA 標籤驗證',
    },
    {
      when: daysAgoAt(4, 18, 20),
      role: 'BUYER',
      senderId: order.buyerId,
      body: '👍 麻煩晒',
    },

    // ── 2 日前 ─ 中間找問題 ──
    {
      when: daysAgoAt(2, 11, 5),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '想 confirm 下，呢張卡賣家有冇話過任何後加修補？',
    },
    {
      when: daysAgoAt(2, 11, 7),
      role: 'SELLER',
      senderId: order.sellerId,
      body: '冇，原裝 PSA 10，從未開過殼',
    },
    {
      when: daysAgoAt(2, 11, 10),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '收到 thanks。我再仔細睇下標籤封口位。',
    },

    // ── 昨日 ─ progress ──
    {
      when: daysAgoAt(1, 9, 30),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '已完成所有驗證項目，今晚整理報告。',
    },
    {
      when: daysAgoAt(1, 22, 15),
      role: 'BUYER',
      senderId: order.buyerId,
      body: '辛苦啦！等緊結果',
    },

    // ── 今日 ─ verdict + 完結 ──
    {
      when: daysAgoAt(0, 9, 5),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '報告完成，鑑定結果：通過 ✅',
    },
    {
      when: daysAgoAt(0, 9, 6),
      role: 'AUTHENTICATOR',
      senderId: cardlabAuth.id,
      body: '會即時寄返畀買家。',
    },
    {
      when: daysAgoAt(0, 9, 30),
      role: 'BUYER',
      senderId: order.buyerId,
      body: '太好啦！👏👏',
    },
    {
      when: daysAgoAt(0, 9, 31),
      role: 'BUYER',
      senderId: order.buyerId,
      body: '真係多謝你哋',
    },
    {
      when: daysAgoAt(0, 10, 5),
      role: 'SELLER',
      senderId: order.sellerId,
      body: '👍👍👍',
    },
    {
      when: daysAgoAt(0, 14, 50),
      role: 'SYSTEM',
      senderId: null,
      body: '鑑定通過，賣家可以寄貨畀買家。',
    },
  ];

  // Insert all messages in time order
  for (const m of msgs) {
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: m.senderId,
        senderRole: m.role,
        body: m.body,
        createdAt: m.when,
        // mark all as read so unread count stays clean for demo
        readByBuyer: true,
        readBySeller: true,
        readByAuth: true,
      },
    });
  }

  console.log(`   ✓ 插入 ${msgs.length} 條 dummy messages，跨度 ~9 日`);
  console.log('');
  console.log('🎉 Done！登入 cardlab@authentik.hk / password123');
  console.log('   → http://localhost:3001/messages → click 對話');
  console.log('   會見到 WhatsApp-style 日期 divider：');
  console.log('     今日 / 昨日 / 星期X / M月D日');
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

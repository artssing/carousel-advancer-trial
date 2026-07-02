/**
 * Seed IM feature demo — showcases:
 *   ✓  single tick (sent, not yet read by counterparty)
 *   ✓✓ double tick (read by all other parties)
 *   最後上線：今日 HH:mm  (lastSeenAt seeded on tom)
 *   Unhappy flow: a separate listing conv where a message failed (simulated via seed)
 *
 * Scenario:
 *   alice@demo.hk (BUYER) ↔ tom@demo.hk (SELLER) on an existing ACTIVE listing.
 *   Login as alice, open /messages — you will see:
 *     - Past messages (雙tick) where Tom has read
 *     - Latest message from Alice (單tick) that Tom hasn't seen yet
 *     - Tom's last seen: "今日 HH:mm" (30 min ago)
 *
 * Run (UAT):
 *   cd apps/api && set -a; . .env.uat; set +a && npx tsx prisma/seed-im-features.ts
 * Run (PROD):
 *   cd apps/api && set -a; . .env.prod; set +a && npx tsx prisma/seed-im-features.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function minutesAgo(n: number) { return new Date(Date.now() - n * 60_000); }
function hoursAgo(n: number) { return new Date(Date.now() - n * 3_600_000); }

async function main() {
  console.log('🎬 Seeding IM features demo (tick + presence) …\n');

  // ── 1. Find accounts ───────────────────────────────────────────────────
  const alice = await prisma.user.findUnique({ where: { email: 'alice@demo.hk' } });
  const tom   = await prisma.user.findUnique({ where: { email: 'tom@demo.hk' } });
  if (!alice) throw new Error('alice@demo.hk not found — run seed.ts first');
  if (!tom)   throw new Error('tom@demo.hk not found — run seed.ts first');

  // ── 2. Set tom's lastSeenAt = 30 min ago so Alice sees "最後上線：今日 HH:mm" ──
  const tomLastSeen = minutesAgo(30);
  await prisma.user.update({
    where: { id: tom.id },
    data: { lastSeenAt: tomLastSeen },
  });
  const hh = tomLastSeen.getHours().toString().padStart(2, '0');
  const mm = tomLastSeen.getMinutes().toString().padStart(2, '0');
  console.log(`✓ tom.lastSeenAt set to 今日 ${hh}:${mm} (30 min ago)`);

  // ── 3. Pick any of Tom's ACTIVE listings ──────────────────────────────
  const listing = await prisma.listing.findFirst({
    where: { sellerId: tom.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!listing) throw new Error('Tom has no ACTIVE listings — run seed.ts first');
  console.log(`✓ Listing: "${listing.title}" (${listing.id.slice(0, 8)}…)`);

  // ── 4. Get or create listing conversation ──────────────────────────────
  let conv = await prisma.conversation.findFirst({
    where: {
      listingId: listing.id,
      buyerId: alice.id,
      orderId: null,
    },
  });

  if (conv) {
    // Wipe messages for a clean demo
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    console.log(`✓ Reusing conversation ${conv.id.slice(0, 8)}… (messages cleared)`);
  } else {
    conv = await prisma.conversation.create({
      data: {
        listingId: listing.id,
        buyerId: alice.id,
        sellerId: tom.id,
        participantUserIds: [alice.id, tom.id],
      },
    });
    console.log(`✓ Created conversation ${conv.id.slice(0, 8)}…`);
  }

  // ── 5. Seed messages with varied read states ───────────────────────────
  //
  // Messages FROM Alice that TOM has read → readBySeller:true → 雙tick ✓✓
  // Messages FROM Alice that TOM hasn't read → readBySeller:false → 單tick ✓
  // Messages FROM Tom → no tick (not Alice's own messages)

  const messages = [
    // ── 2 hours ago: conversation starts ──
    {
      createdAt: hoursAgo(2),
      senderRole: 'BUYER' as const,
      senderId: alice.id,
      body: '你好！想問呢件嘢仲有冇現貨？',
      readByBuyer: true,
      readBySeller: true,    // Tom read → Alice will see 雙tick ✓✓
    },
    {
      createdAt: new Date(hoursAgo(2).getTime() + 3 * 60_000),
      senderRole: 'SELLER' as const,
      senderId: tom.id,
      body: '有！仲有最後一件。你有興趣嗎？',
      readByBuyer: true,
      readBySeller: true,
    },
    {
      createdAt: new Date(hoursAgo(2).getTime() + 5 * 60_000),
      senderRole: 'BUYER' as const,
      senderId: alice.id,
      body: '有！可以介紹多啲嗎？係幾時入手？',
      readByBuyer: true,
      readBySeller: true,    // Tom read → 雙tick ✓✓
    },
    {
      createdAt: new Date(hoursAgo(2).getTime() + 8 * 60_000),
      senderRole: 'SELLER' as const,
      senderId: tom.id,
      body: '係去年入手，用咗大約半年，九成新，所有配件齊，盒同說明書都有。',
      readByBuyer: true,
      readBySeller: true,
    },
    // ── 1 hour ago: negotiation ──
    {
      createdAt: hoursAgo(1),
      senderRole: 'BUYER' as const,
      senderId: alice.id,
      body: '好靚！可以平少少嗎？HK$800 得唔得？',
      readByBuyer: true,
      readBySeller: true,    // Tom read → 雙tick ✓✓
    },
    {
      createdAt: new Date(hoursAgo(1).getTime() + 10 * 60_000),
      senderRole: 'SELLER' as const,
      senderId: tom.id,
      body: '最平 HK$900，已經係底價了。',
      readByBuyer: true,
      readBySeller: true,
    },
    {
      createdAt: new Date(hoursAgo(1).getTime() + 15 * 60_000),
      senderRole: 'BUYER' as const,
      senderId: alice.id,
      body: 'OK，HK$900 成交！幾時可以交收？',
      readByBuyer: true,
      readBySeller: true,    // Tom read → 雙tick ✓✓
    },
    {
      createdAt: new Date(hoursAgo(1).getTime() + 20 * 60_000),
      senderRole: 'SELLER' as const,
      senderId: tom.id,
      body: '今晚 7pm-9pm 旺角有得面交，定係你想要 SF 寄？',
      readByBuyer: true,
      readBySeller: true,
    },
    // ── 40 min ago: Tom went offline (lastSeenAt = 30 min ago) ──
    {
      createdAt: minutesAgo(40),
      senderRole: 'BUYER' as const,
      senderId: alice.id,
      body: '旺角面交好啊！你有冇 MTR 出口建議？',
      readByBuyer: true,
      readBySeller: true,    // Tom still read this one → 雙tick ✓✓
    },
    // ── 25 min ago: Alice's UNREAD messages (Tom went offline at 30 min ago) ──
    {
      createdAt: minutesAgo(25),
      senderRole: 'BUYER' as const,
      senderId: alice.id,
      body: '旺角 B 出口得唔得？',
      readByBuyer: true,
      readBySeller: false,   // Tom hasn't read → 單tick ✓ (most recent)
    },
  ];

  for (const m of messages) {
    await prisma.message.create({ data: { conversationId: conv.id, ...m } });
  }

  console.log(`✓ Seeded ${messages.length} messages`);

  // ── 6. Seed 鑑定師 (Milan) THREE_WAY conversations so authenticator portal
  //       (/messages on :3011) has real chats — not just archived REFUNDED ones.
  //       listConversations filters out convs with 0 human messages.
  const milan = await prisma.user.findUnique({ where: { email: 'milan@authentik.hk' } });
  if (milan) {
    await prisma.user.update({
      where: { id: milan.id },
      data: { lastSeenAt: minutesAgo(10) },
    });
    // Pick THREE_WAY conversations of Milan's non-terminal orders
    const milanAuth = await prisma.authenticator.findFirst({ where: { userId: milan.id } });
    if (milanAuth) {
      const activeConvs = await prisma.conversation.findMany({
        where: {
          kind: 'THREE_WAY',
          participantUserIds: { has: milan.id },
          order: { authenticatorId: milanAuth.id, status: { notIn: ['REFUNDED', 'DISPUTED', 'COMPLETED'] } },
        },
        include: { order: { select: { buyerId: true, sellerId: true, listing: { select: { title: true } } } } },
        take: 3,
      });
      for (const c of activeConvs) {
        const buyerId = c.order?.buyerId;
        const sellerId = c.order?.sellerId;
        if (!buyerId || !sellerId) continue;
        // Clear & re-seed
        await prisma.message.deleteMany({ where: { conversationId: c.id, senderRole: { not: 'SYSTEM' as any } } });
        const seq = [
          { mins: 120, role: 'BUYER' as const, sid: buyerId, body: '鑑定師你好，我已經 pay 咗，貨幾時收到？', readByBuyer: true, readBySeller: true, readByAuth: true },
          { mins: 115, role: 'AUTHENTICATOR' as const, sid: milan.id, body: '收到，請賣家盡快寄出，到貨後 24 小時內開始鑑定。', readByBuyer: true, readBySeller: true, readByAuth: true },
          { mins: 60, role: 'SELLER' as const, sid: sellerId, body: 'SF Express 已寄，單號 12345。', readByBuyer: true, readBySeller: true, readByAuth: true },
          { mins: 30, role: 'BUYER' as const, sid: buyerId, body: '麻煩鑑定師收到後 update 我哋。', readByBuyer: true, readBySeller: true, readByAuth: false }, // Milan unread
        ];
        for (const s of seq) {
          await prisma.message.create({
            data: {
              conversationId: c.id,
              senderRole: s.role,
              senderId: s.sid,
              body: s.body,
              createdAt: minutesAgo(s.mins),
              readByBuyer: s.readByBuyer,
              readBySeller: s.readBySeller,
              readByAuth: s.readByAuth,
            },
          });
        }
        console.log(`✓ Authenticator conv seeded: "${c.order?.listing?.title?.slice(0, 40)}…"`);
      }
    }
  }

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  IM Features Demo — Test Instructions                       │');
  console.log('├─────────────────────────────────────────────────────────────┤');
  console.log('│  Login as:  alice@demo.hk / password123                     │');
  console.log('│  Go to:     http://localhost:3008/messages                  │');
  console.log('│                                                              │');
  console.log('│  What to verify:                                             │');
  console.log('│  ✓✓  Alice\'s messages (except last) → 雙tick (Tom read)    │');
  console.log('│  ✓   Alice\'s last message → 單tick (Tom not read yet)      │');
  console.log(`│  👁   Tom's last seen: 今日 ${hh}:${mm} (in pane header)         │`);
  console.log('│  ✉   Send a new message → shimmer animation → 單tick        │');
  console.log('│                                                              │');
  console.log('│  To see online dot: open another tab, login as              │');
  console.log('│  tom@demo.hk — green dot appears in Alice\'s sidebar        │');
  console.log('│  Close Tom\'s tab → green dot disappears                    │');
  console.log('└─────────────────────────────────────────────────────────────┘');
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

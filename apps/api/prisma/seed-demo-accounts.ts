/**
 * Demo accounts seed — clean, well-organized user set for manual testing.
 *
 * Run:
 *   cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed-demo-accounts.ts
 *
 * Or from root after start.sh:
 *   cd apps/api && npx tsx prisma/seed-demo-accounts.ts
 *
 * Idempotent — re-runnable. Existing accounts upserted, scenarios reset.
 */
import { ListingStatus, MessageRole, OfferStatus, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const HOUR = 60 * 60 * 1000;

// Single password for ALL demo accounts
const DEMO_PASSWORD = 'password123';

interface DemoUser {
  email: string;
  displayName: string;
  kycStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  note: string;
}

const DEMO_BUYERS: DemoUser[] = [
  { email: 'alice@demo.hk', displayName: 'Alice (買家)', kycStatus: 'VERIFIED', note: '主要買家 — 用嚟測試 checkout / 議價 / drawer IM' },
  { email: 'bob@demo.hk',   displayName: 'Bob (買家)',   kycStatus: 'VERIFIED', note: '次要買家 — 模擬「同時兩個買家爭一件貨」場景' },
  { email: 'carol@demo.hk', displayName: 'Carol (買家)', kycStatus: 'VERIFIED', note: '已有 PENDING offer 場景' },
  { email: 'dave@demo.hk',  displayName: 'Dave (新用戶)', kycStatus: 'PENDING',  note: '未通過 KYC，測試 KYC gating UI' },
];

const DEMO_SELLERS: DemoUser[] = [
  { email: 'tom@demo.hk',   displayName: 'Tom (賣家)',   kycStatus: 'VERIFIED', note: '主要賣家 — 持有多張 ACTIVE listings' },
  { email: 'jenny@demo.hk', displayName: 'Jenny (賣家)', kycStatus: 'VERIFIED', note: '次要賣家 — 持有 high-value Tier 3 商品' },
];

// Admin account for admin portal access
const DEMO_ADMIN = {
  email: 'admin@demo.hk',
  displayName: 'Admin Ops',
  note: '進 admin portal (port 3003) — roles: SUPER_ADMIN',
};

// 3 authenticators already exist from main seed: milan@ / procheck@ / cardlab@
// We just reset their seed but don't recreate them here

async function upsertUser(u: DemoUser) {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email: u.email },
    update: {
      displayName: u.displayName,
      kycStatus: u.kycStatus ?? 'VERIFIED',
    },
    create: {
      email: u.email,
      displayName: u.displayName,
      passwordHash: password,
      roles: ['BUYER', 'SELLER'], // Anyone can buy + sell
      kycStatus: u.kycStatus ?? 'VERIFIED',
    },
  });
}

async function main() {
  console.log('🎬 Seeding demo accounts...\n');

  // ── 1. Create users ─────────────────────────────────────────────────────
  const buyers = await Promise.all(DEMO_BUYERS.map(upsertUser));
  const sellers = await Promise.all(DEMO_SELLERS.map(upsertUser));

  // Admin account — upsert with SUPER_ADMIN role
  const adminPwd = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: DEMO_ADMIN.email },
    update: { roles: ['BUYER', 'SELLER', 'SUPER_ADMIN'], kycStatus: 'VERIFIED' },
    create: {
      email: DEMO_ADMIN.email,
      displayName: DEMO_ADMIN.displayName,
      passwordHash: adminPwd,
      roles: ['BUYER', 'SELLER', 'SUPER_ADMIN'],
      kycStatus: 'VERIFIED',
    },
  });
  const alice = buyers[0]!;
  const bob = buyers[1]!;
  const carol = buyers[2]!;
  const tom = sellers[0]!;
  const jenny = sellers[1]!;

  console.log(`✓ 4 buyers + 2 sellers upserted`);

  // ── 2. Clean up previous demo listings for these sellers ───────────────
  await prisma.offer.deleteMany({
    where: {
      OR: [
        { proposedByUserId: { in: [alice.id, bob.id, carol.id] } },
        { listing: { sellerId: { in: [tom.id, jenny.id] } } },
      ],
    },
  });
  await prisma.message.deleteMany({
    where: {
      conversation: {
        OR: [
          { buyerId: { in: buyers.map((b) => b.id) } },
          { sellerId: { in: sellers.map((s) => s.id) } },
        ],
      },
    },
  });
  await prisma.conversation.deleteMany({
    where: {
      OR: [
        { buyerId: { in: buyers.map((b) => b.id) } },
        { sellerId: { in: sellers.map((s) => s.id) } },
      ],
    },
  });
  await prisma.listing.deleteMany({
    where: { sellerId: { in: [tom.id, jenny.id] } },
  });

  // ── 3. Create test listings ────────────────────────────────────────────
  const listings = await prisma.$transaction([
    // A. Tom's plain Tier 2 — for plain checkout test
    prisma.listing.create({
      data: {
        sellerId: tom.id, category: 'HANDBAG', title: '[DEMO-A] Coach 銀包 · 棕色 · 9 成新',
        description: '購入兩個月，平日只用一次。輕微角位磨損，無原裝盒。',
        priceHKD: 2800, tier: 2,
        images: [],
        status: 'ACTIVE',
        allowedDeliveryMethods: ['SHIP', 'MEETUP_AUTH', 'MEETUP_DIRECT'],
        sellerDistrict: '旺角',
      },
    }),
    // B. Tom's Tier 1 — for plain low-value test
    prisma.listing.create({
      data: {
        sellerId: tom.id, category: 'POKEMON_CARD', title: '[DEMO-B] Pikachu 普卡 · 第一版',
        description: '輕微邊角磨損。',
        priceHKD: 450, tier: 1,
        images: [],
        status: 'ACTIVE',
        allowedDeliveryMethods: ['SHIP', 'MEETUP_DIRECT'],
        sellerDistrict: '旺角',
      },
    }),
    // C. Tom's Tier 2 — Carol will have a PENDING offer on this
    prisma.listing.create({
      data: {
        sellerId: tom.id, category: 'SNEAKER', title: '[DEMO-C] Nike Dunk Low Panda · US 9',
        description: '原價 HK$1,200，只穿過 3 次。原盒+鞋帶齊。',
        priceHKD: 1200, tier: 2,
        images: [],
        status: 'ACTIVE',
        allowedDeliveryMethods: ['SHIP', 'MEETUP_AUTH', 'MEETUP_3WAY'],
        sellerDistrict: '觀塘',
      },
    }),
    // D. Jenny's Tier 3 — high value, requires authentication
    prisma.listing.create({
      data: {
        sellerId: jenny.id, category: 'WATCH', title: '[DEMO-D] Rolex Submariner 116610LN',
        description: '2021 年購入。原裝錶帶 + 保卡 + 盒。輕微錶帶刮痕。',
        priceHKD: 65000, tier: 3,
        images: [],
        status: 'ACTIVE',
        allowedDeliveryMethods: ['SHIP', 'MEETUP_AUTH', 'MEETUP_3WAY'],
        sellerDistrict: '中環',
      },
    }),
    // E. Jenny's Tier 2 — for handbag negotiation test
    prisma.listing.create({
      data: {
        sellerId: jenny.id, category: 'HANDBAG', title: '[DEMO-E] LV Neverfull MM · 棋盤格',
        description: '購於 2022 年香港 LV 旗艦店。9 成新，輕微底部磨損。原盒+塵袋齊全。',
        priceHKD: 9500, tier: 2,
        images: [],
        status: 'ACTIVE',
        allowedDeliveryMethods: ['SHIP', 'MEETUP_AUTH'],
        sellerDistrict: '銅鑼灣',
      },
    }),
  ]);

  const [demoA, demoB, demoC, demoD, demoE] = listings;
  console.log(`✓ 5 demo listings created (A–E)`);

  // ── 4. Scenario: Carol has a PENDING offer on DEMO-C ────────────────────
  const conv = await prisma.conversation.create({
    data: {
      listingId: demoC!.id,
      buyerId: carol.id,
      sellerId: tom.id,
      messages: {
        create: [
          {
            senderRole: MessageRole.SYSTEM,
            body: '商品查詢：' + demoC!.title + '。所有訊息均有記錄。請勿交換私人聯絡方式。',
            readByBuyer: true, readBySeller: true, readByAuth: true,
          },
          {
            senderId: carol.id, senderRole: MessageRole.BUYER,
            body: '你好，DEMO-C 對 sneaker 仲有冇貨？',
            readByBuyer: true, readBySeller: true, readByAuth: false,
          },
          {
            senderId: tom.id, senderRole: MessageRole.SELLER,
            body: '有，可以面交或寄送。你想點交收？',
            readByBuyer: true, readBySeller: true, readByAuth: false,
          },
          {
            senderId: carol.id, senderRole: MessageRole.BUYER,
            body: '我諗住 HK$950 收，多謝。',
            readByBuyer: true, readBySeller: false, readByAuth: false,
          },
        ],
      },
    },
  });

  // Insert the actual Offer + sentinel message
  const offer = await prisma.offer.create({
    data: {
      conversationId: conv.id,
      listingId: demoC!.id,
      proposedByUserId: carol.id,
      proposedByRole: MessageRole.BUYER,
      priceHKD: 950,
      status: OfferStatus.PENDING,
      roundNumber: 1,
      expiresAt: new Date(Date.now() + 22 * HOUR), // 22h left
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      senderId: carol.id,
      senderRole: MessageRole.BUYER,
      body: `__OFFER__:${offer.id}`,
      readByBuyer: true, readBySeller: false, readByAuth: false,
    },
  });
  console.log(`✓ Scenario: Carol → Tom PENDING offer HK$950 on DEMO-C`);

  // ── 5. Scenario: Bob has an existing listing-conversation on DEMO-A (no offer) ──
  await prisma.conversation.create({
    data: {
      listingId: demoA!.id,
      buyerId: bob.id,
      sellerId: tom.id,
      messages: {
        create: [
          {
            senderRole: MessageRole.SYSTEM,
            body: '商品查詢：' + demoA!.title + '。所有訊息均有記錄。請勿交換私人聯絡方式。',
            readByBuyer: true, readBySeller: true, readByAuth: true,
          },
          {
            senderId: bob.id, senderRole: MessageRole.BUYER,
            body: 'Hi，呢個 Coach 銀包係咪原裝？',
            readByBuyer: true, readBySeller: false, readByAuth: false,
          },
        ],
      },
    },
  });
  console.log(`✓ Scenario: Bob → Tom open conversation on DEMO-A`);

  console.log('\n🎉 Done!\n');
  console.log('==================================================');
  console.log(' Demo accounts （password 全部係 password123）');
  console.log('==================================================');
  console.log('\n🛒 買家：');
  for (const u of DEMO_BUYERS) {
    console.log(`  ${u.email.padEnd(22)} · ${u.displayName.padEnd(14)} · ${u.note}`);
  }
  console.log('\n🏪 賣家：');
  for (const u of DEMO_SELLERS) {
    console.log(`  ${u.email.padEnd(22)} · ${u.displayName.padEnd(14)} · ${u.note}`);
  }
  console.log('\n🛡  Admin：');
  console.log(`  ${DEMO_ADMIN.email.padEnd(22)} · ${DEMO_ADMIN.displayName.padEnd(14)} · ${DEMO_ADMIN.note}`);
  console.log('\n🔍 鑑定師（之前已 seed）：');
  console.log('  milan@authentik.hk     · Milan Station 旺角   · 手袋專長');
  console.log('  procheck@authentik.hk  · 先達 ProCheck        · iPhone 專長');
  console.log('  cardlab@authentik.hk   · 信和 CardLab         · 卡牌專長');
  console.log('\n📋 場景：');
  console.log('  · DEMO-A (Coach 銀包 HK$2,800, Tier 2) — Bob 有開緊嘅對話，無 offer');
  console.log('  · DEMO-B (Pikachu 卡 HK$450, Tier 1)   — Tier 1 純撮合');
  console.log('  · DEMO-C (Nike Dunk HK$1,200, Tier 2)  — Carol 已 PENDING offer HK$950 等 Tom 回覆');
  console.log('  · DEMO-D (Rolex HK$65,000, Tier 3)     — 強制鑑定，可用嚟測試 authenticator 選擇');
  console.log('  · DEMO-E (LV Neverfull HK$9,500, T2)   — 大金額測試議價');
  console.log('==================================================');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

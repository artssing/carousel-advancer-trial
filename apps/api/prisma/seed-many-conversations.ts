/**
 * Generate 25+ demo conversations with real human messages for jenny so the
 * /messages sidebar is scrollable for UX testing.
 *
 * Each scenario:
 *  - Creates a brand-new ACTIVE listing for jenny
 *  - Creates a listing-stage Conversation (no order) with alice/bob/carol
 *  - Seeds 3–6 human messages (mix of buyer questions + jenny replies)
 *
 * Idempotent: removes prior [MSGS-*] listings + their convs before re-seeding.
 *
 * Run:
 *   cd apps/api && set -a; . ./.env; set +a && npx tsx prisma/seed-many-conversations.ts
 */
import { PrismaClient, MessageRole, ListingStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SCENARIOS = [
  { brand: 'CHANEL',   title: 'Chanel Classic Flap Caviar Black',  price: 38000, cat: 'HANDBAG', buyer: 'alice' },
  { brand: 'LV',       title: 'LV Speedy 30 Damier Azur',          price: 12500, cat: 'HANDBAG', buyer: 'bob'   },
  { brand: 'HERMES',   title: 'Hermès Birkin 25 Togo Etoupe',     price: 95000, cat: 'HANDBAG', buyer: 'carol' },
  { brand: 'GUCCI',    title: 'Gucci Marmont Mini Pink',           price: 8800,  cat: 'HANDBAG', buyer: 'alice' },
  { brand: 'PRADA',    title: 'Prada Re-Edition 2005 Saffiano',    price: 11500, cat: 'HANDBAG', buyer: 'bob'   },
  { brand: 'DIOR',     title: 'Dior Saddle Bag Oblique Navy',      price: 24000, cat: 'HANDBAG', buyer: 'carol' },
  { brand: 'CELINE',   title: 'Celine Triomphe Canvas Tan',        price: 16800, cat: 'HANDBAG', buyer: 'alice' },
  { brand: 'BOTTEGA',  title: 'Bottega Veneta Cassette Intrecciato', price: 21500, cat: 'HANDBAG', buyer: 'bob' },
  { brand: 'YSL',      title: 'YSL Loulou Medium Black',            price: 17800, cat: 'HANDBAG', buyer: 'carol' },
  { brand: 'GOYARD',   title: 'Goyard St Louis PM Black',           price: 13500, cat: 'HANDBAG', buyer: 'alice' },
  { brand: 'ROLEX',    title: 'Rolex Datejust 36mm Jubilee',        price: 68000, cat: 'WATCH',   buyer: 'bob'   },
  { brand: 'OMEGA',    title: 'Omega Speedmaster Moonwatch',        price: 42000, cat: 'WATCH',   buyer: 'carol' },
  { brand: 'CARTIER',  title: 'Cartier Tank Must SolarBeat',        price: 28000, cat: 'WATCH',   buyer: 'alice' },
  { brand: 'IWC',      title: 'IWC Portugieser Chronograph',        price: 58000, cat: 'WATCH',   buyer: 'bob'   },
  { brand: 'TUDOR',    title: 'Tudor Black Bay 58 Blue',            price: 32000, cat: 'WATCH',   buyer: 'carol' },
  { brand: 'NIKE',     title: 'Nike Dunk Low Panda US 9',           price: 1200,  cat: 'SNEAKER', buyer: 'alice' },
  { brand: 'JORDAN',   title: 'Air Jordan 1 High Chicago Lost',     price: 3500,  cat: 'SNEAKER', buyer: 'bob'   },
  { brand: 'YEEZY',    title: 'Yeezy 350 V2 Zebra US 10',           price: 2800,  cat: 'SNEAKER', buyer: 'carol' },
  { brand: 'NB',       title: 'New Balance 990v6 Made in USA',      price: 2200,  cat: 'SNEAKER', buyer: 'alice' },
  { brand: 'ASICS',    title: 'ASICS Gel-Kayano 14 White',          price: 1500,  cat: 'SNEAKER', buyer: 'bob'   },
  { brand: 'IPHONE_16_PRO', title: 'iPhone 16 Pro 256GB Titanium', price: 9500,  cat: 'IPHONE',  buyer: 'carol' },
  { brand: 'IPHONE_15',     title: 'iPhone 15 128GB Pink',          price: 6200,  cat: 'IPHONE',  buyer: 'alice' },
  { brand: 'POPMART',  title: 'POP MART Labubu 大隱藏款',           price: 1800,  cat: 'DESIGNER_TOY', buyer: 'bob' },
  { brand: 'BEARBRICK', title: 'BE@RBRICK 400% KAWS Companion',     price: 8500,  cat: 'DESIGNER_TOY', buyer: 'carol' },
  { brand: 'SCARLET_VIOLET', title: '寶可夢 SV 黑炎之支配者 開封BOX', price: 950, cat: 'POKEMON_CARD', buyer: 'alice' },
  { brand: 'PSA_GRADED', title: 'Pikachu PSA 10 第一彈 1996',       price: 18000, cat: 'POKEMON_CARD', buyer: 'bob' },
];

/** Pool of canned messages — mix buyer questions + seller replies for realism. */
const BUYER_PROBES = [
  '請問仲有冇貨？', '可以面交嗎？', '貨況點？有冇單據？', '可以議價嗎？', '原盒齊唔齊？',
  '幾時可以交收？', '係幾時購入？', '尺寸係 size 幾？', '想問下啲油邊個 colourway？', '係邊度買嘅？',
  '可以幫我影多兩張角位特寫嗎？', '可以面交銅鑼灣嗎？', '可以同你接洽鑑定師嗎？',
];
const SELLER_REPLIES = [
  '仲有貨，可以隨時 send 你睇 video。', '可以面交，要約時間。', '貨況 95 新，有原裝盒同單。',
  '價錢可商量少少，pls offer。', '原盒齊全，有少少黃。', '今個禮拜六日 OK。',
  '2022 年香港 LV 買，有單。', 'EU 42 / US 9。', '係 panda colourway。', '中環旗艦店買。',
  '冇問題，等我影完傳你。', 'OK，銅鑼灣時代廣場附近？', '可以，我可以揀番 Milan Station。',
];

const CLOSING = [
  '好，等你回覆～', 'Thanks！', '收到，再傾。', '可以呀，等你 confirm。',
  'OK，我研究下先。', '收到啦，多謝你。',
];

async function main() {
  const [jenny, alice, bob, carol] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'jenny@demo.hk' } }),
    prisma.user.findUnique({ where: { email: 'alice@demo.hk' } }),
    prisma.user.findUnique({ where: { email: 'bob@demo.hk' } }),
    prisma.user.findUnique({ where: { email: 'carol@demo.hk' } }),
  ]);
  if (!jenny || !alice || !bob || !carol) {
    throw new Error('Run ./seed-demo.sh first — demo accounts not found.');
  }

  const buyersByName: Record<string, { id: string; displayName: string }> = {
    alice: { id: alice.id, displayName: alice.displayName },
    bob:   { id: bob.id,   displayName: bob.displayName   },
    carol: { id: carol.id, displayName: carol.displayName },
  };

  // Cleanup previous [MSGS-*] listings + their derived data
  const old = await prisma.listing.findMany({
    where: { sellerId: jenny.id, title: { startsWith: '[MSGS-' } },
    select: { id: true },
  });
  if (old.length) {
    const ids = old.map((l) => l.id);
    await prisma.message.deleteMany({ where: { conversation: { listingId: { in: ids } } } });
    await prisma.conversation.deleteMany({ where: { listingId: { in: ids } } });
    await prisma.listing.deleteMany({ where: { id: { in: ids } } });
    console.log(`✓ Cleaned ${old.length} prior [MSGS-*] listings`);
  }

  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  let total = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i]!;
    const buyer = buyersByName[s.buyer]!;
    const listing = await prisma.listing.create({
      data: {
        sellerId: jenny.id,
        category: s.cat as any,
        brand: s.brand,
        title: `[MSGS-${String(i + 1).padStart(2, '0')}] ${s.title}`,
        description: `Demo scenario for messages sidebar scrolling test. Seller: jenny / Buyer: ${buyer.displayName}.`,
        priceHKD: s.price,
        tier: s.price >= 10000 ? 3 : s.price >= 1000 ? 2 : 1,
        images: [`https://picsum.photos/seed/msgs-${i}/600/600`],
        status: ListingStatus.ACTIVE,
        allowedDeliveryMethods: ['SHIP', 'MEETUP_AUTH', 'MEETUP_DIRECT'],
        sellerDistrict: pick(['中環', '銅鑼灣', '旺角', '尖沙咀']),
      },
    });

    // Listing-stage conversation between this buyer and jenny
    const conv = await prisma.conversation.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: jenny.id,
        kind: 'BUYER_SELLER' as any,                                    // pre-order chat
        participantUserIds: [buyer.id, jenny.id],
      },
    });

    // 4–6 alternating messages (realistic chat)
    const msgCount = 4 + Math.floor(Math.random() * 3);
    const startMinAgo = (SCENARIOS.length - i) * 60 + Math.floor(Math.random() * 30);
    const messages: any[] = [
      // SYSTEM bootstrap (won't trigger empty-frame filter because human messages follow)
      {
        conversationId: conv.id,
        senderRole: MessageRole.SYSTEM,
        body: `商品查詢：${listing.title}。所有訊息均有記錄。請勿交換私人聯絡方式。`,
        readByBuyer: true, readBySeller: true, readByAuth: true,
        createdAt: minutesAgo(startMinAgo),
      },
    ];
    for (let j = 0; j < msgCount; j++) {
      const fromBuyer = j % 2 === 0;
      const body = fromBuyer
        ? (j === 0 ? pick(BUYER_PROBES) : pick(BUYER_PROBES.concat(CLOSING)))
        : pick(SELLER_REPLIES.concat(CLOSING));
      messages.push({
        conversationId: conv.id,
        senderId: fromBuyer ? buyer.id : jenny.id,
        senderRole: fromBuyer ? MessageRole.BUYER : MessageRole.SELLER,
        body,
        readByBuyer: fromBuyer,        // sender side auto-read
        readBySeller: !fromBuyer,
        readByAuth: true,
        createdAt: minutesAgo(startMinAgo - (j + 1) * 3),
      });
    }
    await prisma.message.createMany({ data: messages });
    total += messages.length - 1;     // exclude SYSTEM from human count
    console.log(`✓ MSGS-${String(i + 1).padStart(2, '0')} ${s.title.slice(0, 40)} (${buyer.displayName}, ${msgCount} msgs)`);
  }

  console.log(`\n✅ ${SCENARIOS.length} conversations · ${total} human messages.`);
  console.log(`Login: jenny@demo.hk / password123 → http://localhost:3008/messages`);
  console.log(`Each buyer (alice/bob/carol) also sees their own conversation list grow.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

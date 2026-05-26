import { PrismaClient, Category, ListingStatus, AuthenticatorStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { tierForPrice } from '@authentik/utils';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding…');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1 seed seller
  const seller = await prisma.user.upsert({
    where: { email: 'seller@authentik.hk' },
    update: {},
    create: {
      email: 'seller@authentik.hk',
      displayName: 'Demo Seller',
      passwordHash,
    },
  });

  // 3 seed authenticator users + their Authenticator profiles
  const authData = [
    {
      email: 'milan@authentik.hk',
      displayName: 'Milan Station 旺角',
      storeName: 'Milan Station Mongkok',
      categories: [Category.HANDBAG],
      starRating: 5,
      completedCount: 1247,
      disputeRate: 0.008,
    },
    {
      email: 'procheck@authentik.hk',
      displayName: '先達 ProCheck',
      storeName: 'Sin Tat Plaza ProCheck',
      categories: [Category.IPHONE],
      starRating: 4,
      completedCount: 312,
      disputeRate: 0.015,
    },
    {
      email: 'cardlab@authentik.hk',
      displayName: '信和 CardLab',
      storeName: 'Sino Centre CardLab',
      categories: [Category.POKEMON_CARD],
      starRating: 5,
      completedCount: 892,
      disputeRate: 0.003,
    },
  ];

  for (const a of authData) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: {},
      create: { email: a.email, displayName: a.displayName, passwordHash },
    });
    await prisma.authenticator.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        displayName: a.displayName,
        storeName: a.storeName,
        categories: a.categories,
        starRating: a.starRating,
        completedCount: a.completedCount,
        disputeRate: a.disputeRate,
        status: AuthenticatorStatus.ACTIVE,
        eAndOInsuranceExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Sample listings
  const listings = [
    {
      category: Category.HANDBAG,
      title: 'Chanel Classic Flap Medium · Caviar Black',
      description: '購於 2023 香港尖沙咀 Chanel，9 成新，配件齊全。',
      priceHKD: 48000,
    },
    {
      category: Category.IPHONE,
      title: 'iPhone 15 Pro Max 256GB · 港行 · 99新',
      description: '購入 6 個月，原廠保養至 2026-11，配件齊全。',
      priceHKD: 8500,
    },
    {
      category: Category.POKEMON_CARD,
      title: 'Charizard PSA 10 · 1999 Base Set Holo',
      description: 'PSA Gem Mint 10, 1999 Base Set 全息卡。',
      priceHKD: 38000,
    },
  ];

  for (const l of listings) {
    const existing = await prisma.listing.findFirst({
      where: { title: l.title, sellerId: seller.id },
    });
    if (existing) continue;
    await prisma.listing.create({
      data: {
        sellerId: seller.id,
        category: l.category,
        title: l.title,
        description: l.description,
        priceHKD: l.priceHKD,
        tier: tierForPrice(l.priceHKD),
        status: ListingStatus.ACTIVE,
      },
    });
  }

  console.log('Seeding done.');
  console.log('Demo login: seller@authentik.hk / password123');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });

import {
  PrismaClient,
  Category,
  ListingStatus,
  AuthenticatorStatus,
  DeliveryMethod,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { tierForPrice } from '@authentik/utils';

const prisma = new PrismaClient();

// Deterministic placeholder photos so a fresh seed (UAT, or a reset PROD) shows
// real-looking images instead of the grey placeholder. picsum.photos returns a
// stable photo per seed string; ListingThumb falls back to its branded gradient
// onError, so this degrades gracefully offline. Browse cards read
// `coverUrl ?? images[0]`, so populating images[0] is enough.
function pics(baseIndex: number, count = 3): string[] {
  return Array.from(
    { length: count },
    (_, i) => `https://picsum.photos/seed/authentik-${baseIndex}-${i}/600/600`,
  );
}

// ─── Listing data ─────────────────────────────────────────────────────────────

const HANDBAGS: { title: string; price: number }[] = [
  // Chanel (18 items)
  { title: 'Chanel Classic Flap Medium · Caviar Black · 金扣', price: 48000 },
  { title: 'Chanel Classic Flap Small · Lambskin Beige · 銀扣', price: 42000 },
  { title: 'Chanel Classic Flap Jumbo · Caviar Navy · 金扣', price: 55000 },
  { title: 'Chanel Classic Flap Mini · Lambskin Pink · 金扣', price: 32000 },
  { title: 'Chanel Classic Flap Medium · Caviar White · 金扣', price: 50000 },
  { title: 'Chanel 19 Flap Large · Lambskin Black', price: 42000 },
  { title: 'Chanel 19 Flap Medium · Lambskin Black', price: 38000 },
  { title: 'Chanel Boy Bag Medium · Caviar Black · 銀扣', price: 44000 },
  { title: 'Chanel Boy Bag Small · Lambskin Burgundy · 金扣', price: 36000 },
  { title: 'Chanel Boy Bag Large · Calfskin Navy · 銀扣', price: 48000 },
  { title: 'Chanel Vanity Case · Caviar Black · 金扣', price: 28000 },
  { title: 'Chanel Wallet on Chain · Caviar Black', price: 22000 },
  { title: 'Chanel Mini Rectangular Flap · Lambskin Pink', price: 32000 },
  { title: 'Chanel Gabrielle Small Hobo · Calfskin Black', price: 29000 },
  { title: 'Chanel Coco Handle Small · Caviar Black · 金扣', price: 38000 },
  { title: 'Chanel Deauville Medium Tote · Canvas Black', price: 24000 },
  { title: 'Chanel Trendy CC · Grained Calfskin · 銀扣', price: 35000 },
  { title: 'Chanel Classic Flap Medium · Python Skin · 限量', price: 68000 },
  // Louis Vuitton (14 items)
  { title: 'LV Neverfull MM · Damier Ebene', price: 15000 },
  { title: 'LV Neverfull GM · Monogram Canvas', price: 18000 },
  { title: 'LV Neverfull MM · Monogram · Rose Ballerine', price: 16000 },
  { title: 'LV Speedy 25 Bandoulière · Monogram', price: 12000 },
  { title: 'LV Speedy 30 · Damier Azur', price: 11000 },
  { title: 'LV Capucines MM · Black Taurillon', price: 45000 },
  { title: 'LV Twist MM · Epi Electric Black', price: 32000 },
  { title: 'LV Pochette Métis · Monogram', price: 21000 },
  { title: 'LV Alma BB · Vernis Rose Ballerine', price: 14000 },
  { title: 'LV Multi Pochette Accessoires · Monogram', price: 16000 },
  { title: 'LV OnTheGo GM · Monogram Giant', price: 23000 },
  { title: 'LV Petite Malle · Monogram Canvas · 限量', price: 52000 },
  { title: 'LV Loop · Monogram · Chain Bag', price: 12800 },
  { title: 'LV Coussin PM · Lambskin · Lilac', price: 28000 },
  // Hermès (8 items)
  { title: 'Hermès Birkin 30 · Togo Black · PHW', price: 128000 },
  { title: 'Hermès Birkin 25 · Epsom Gold · GHW', price: 145000 },
  { title: 'Hermès Kelly 28 · Epsom Craie · GHW', price: 115000 },
  { title: 'Hermès Kelly 25 · Togo Blue Jean · PHW', price: 108000 },
  { title: 'Hermès Constance 24 · Chèvre Mysore Nata', price: 88000 },
  { title: 'Hermès Picotin Lock 18 · Clemence Vert Cyprès', price: 25000 },
  { title: 'Hermès Evelyne III GM · Clemence Etain', price: 32000 },
  { title: 'Hermès Garden Party 36 · Toile Canvas Beige', price: 22000 },
  // Gucci (8 items)
  { title: 'Gucci Dionysus GG Supreme Medium', price: 18000 },
  { title: 'Gucci Marmont Small Shoulder · Matelassé Black', price: 14000 },
  { title: 'Gucci Ophidia GG Medium Tote', price: 16000 },
  { title: 'Gucci Bamboo 1947 Small Top Handle · Leather Black', price: 24000 },
  { title: 'Gucci Jackie 1961 Small · Leather Nude', price: 19000 },
  { title: 'Gucci Horsebit 1955 Mini · Leather Brown', price: 17000 },
  { title: 'Gucci GG Marmont Matelassé Mini · Red', price: 12000 },
  { title: 'Gucci Aphrodite Small Shoulder · Off White', price: 15000 },
  // Others (12 items)
  { title: 'Prada Saffiano Lux Tote · Black', price: 17000 },
  { title: 'Prada Re-Edition 2005 Nylon · Black', price: 9800 },
  { title: 'Prada Galleria Small · Saffiano Black', price: 22000 },
  { title: 'Dior Lady Dior Medium · Cannage Black', price: 36000 },
  { title: 'Dior Saddle Bag · Oblique Jacquard', price: 28000 },
  { title: 'Dior 30 Montaigne · Grained Calfskin Black', price: 32000 },
  { title: 'Celine Classic Box · Smooth Calfskin Black', price: 29000 },
  { title: 'Celine Luggage Nano · Tricolor', price: 22000 },
  { title: 'Balenciaga City Small · Aged Calfskin Black', price: 15000 },
  { title: 'Bottega Veneta Pouch · Intrecciato Parakeet', price: 21000 },
  { title: 'Saint Laurent Loulou Medium · Matelassé Black', price: 18000 },
  { title: 'Loewe Puzzle Small · Classic Calfskin Tan', price: 24000 },
];

const IPHONES: { title: string; price: number }[] = [
  // iPhone 15 series
  { title: 'iPhone 15 Pro Max 256GB · 自然鈦 · 港行 · 99新', price: 9800 },
  { title: 'iPhone 15 Pro Max 512GB · 黑色鈦 · 港行', price: 10500 },
  { title: 'iPhone 15 Pro Max 1TB · 白色鈦 · 港行 · 全新', price: 11800 },
  { title: 'iPhone 15 Pro 256GB · 白色鈦 · 港行 · 全新未開', price: 8800 },
  { title: 'iPhone 15 Pro 128GB · 藍色鈦 · 港行 · 9成新', price: 7500 },
  { title: 'iPhone 15 Plus 256GB · 粉紅色 · 港行', price: 7200 },
  { title: 'iPhone 15 256GB · 粉紅色 · 港行 · 99新', price: 6200 },
  { title: 'iPhone 15 128GB · 黃色 · 港行 · 全新', price: 5800 },
  // iPhone 14 series
  { title: 'iPhone 14 Pro Max 256GB · 深紫色 · 港行', price: 7200 },
  { title: 'iPhone 14 Pro Max 512GB · 金色 · 港行 · 99新', price: 7800 },
  { title: 'iPhone 14 Pro Max 1TB · 深空黑 · 港行 · 99新', price: 8500 },
  { title: 'iPhone 14 Pro 256GB · 太空黑 · 港行', price: 6500 },
  { title: 'iPhone 14 Pro 128GB · 銀色 · 港行 · 9成新', price: 5800 },
  { title: 'iPhone 14 Plus 128GB · 藍色 · 港行', price: 4500 },
  { title: 'iPhone 14 256GB · 藍色 · 港行 · 99新', price: 4800 },
  // iPhone 13 series
  { title: 'iPhone 13 Pro Max 256GB · 遠峰藍 · 港行', price: 5500 },
  { title: 'iPhone 13 Pro Max 512GB · 金色 · 港行', price: 5800 },
  { title: 'iPhone 13 Pro 256GB · 松嶺綠 · 港行', price: 4800 },
  { title: 'iPhone 13 128GB · 粉紅色 · 港行 · 電池 98%', price: 3200 },
  { title: 'iPhone 13 Mini 256GB · 深空灰 · 港行', price: 2800 },
  // MacBook
  { title: 'MacBook Pro 14" M3 Pro · 太空黑 · 18GB · 512GB', price: 16800 },
  { title: 'MacBook Pro 14" M3 · 銀色 · 8GB · 1TB', price: 12800 },
  { title: 'MacBook Pro 16" M3 Max · 太空黑 · 48GB · 1TB', price: 26000 },
  { title: 'MacBook Pro 13" M2 · 深空灰 · 16GB · 256GB', price: 9800 },
  { title: 'MacBook Air 15" M2 · 星光色 · 8GB · 256GB', price: 8800 },
  { title: 'MacBook Air 13" M2 · 深空灰 · 16GB · 512GB', price: 9200 },
  { title: 'MacBook Air 13" M3 · 午夜色 · 16GB · 512GB · 全新', price: 10500 },
  // iPad
  { title: 'iPad Pro 12.9" M2 · Wi-Fi · 256GB · 太空灰', price: 8500 },
  { title: 'iPad Pro 11" M4 · Wi-Fi · 512GB · 銀色 · 全新', price: 9800 },
  { title: 'iPad Air 5 · Wi-Fi · 256GB · 藍色', price: 4200 },
  { title: 'iPad Mini 6 · Wi-Fi · 256GB · 紫色', price: 3800 },
  // Accessories
  { title: 'AirPods Pro 2 · USB-C · 港行 · 全新未開', price: 1480 },
  { title: 'AirPods Max · 深空灰 · 港行 · 99新', price: 3200 },
  { title: 'Apple Watch Ultra 2 · 鈦金屬 · 49mm · 港行', price: 6200 },
  { title: 'Apple Watch Series 9 · 45mm · 不鏽鋼 · 銀色', price: 3800 },
];

const POKEMON_CARDS: { title: string; price: number }[] = [
  // PSA graded singles
  { title: 'Charizard PSA 10 · 1999 Base Set Holo · 第一版', price: 38000 },
  { title: 'Pikachu Illustrator PSA 8 · 1998 · 超稀有', price: 88000 },
  { title: 'Blastoise PSA 9 · 1999 Base Set Holo', price: 28000 },
  { title: 'Venusaur PSA 8 · 1999 Base Set Holo', price: 18000 },
  { title: 'Mewtwo PSA 10 · 1999 Base Set Holo', price: 12000 },
  { title: 'Raichu PSA 10 · 1999 Base Set Shadowless', price: 15000 },
  { title: 'Charizard ex SAR · 151 Full Art · PSA 10', price: 8800 },
  { title: 'Mew ex SAR · 151 · PSA 10 · Japanese', price: 4200 },
  { title: 'Umbreon VMAX Alt Art · PSA 10 · Evolving Skies', price: 15000 },
  { title: 'Rayquaza VMAX Alt Art · PSA 10 · Evolving Skies', price: 12000 },
  { title: 'Charizard VSTAR Universe SAR · PSA 10 · Japanese', price: 9800 },
  { title: 'Pikachu VMAX Rainbow · PSA 10 · Vivid Voltage', price: 3800 },
  { title: 'Lugia V Alt Art · PSA 10 · Silver Tempest', price: 4500 },
  { title: 'Giratina VSTAR Alt Art · PSA 10 · Lost Origin', price: 3200 },
  { title: 'Espeon VMAX Alt Art · PSA 10 · Evolving Skies', price: 18000 },
  { title: 'Sylveon VMAX Alt Art · PSA 10 · Evolving Skies', price: 8500 },
  { title: 'Gengar VMAX Alt Art · PSA 10 · Fusion Strike', price: 5500 },
  { title: 'Mew VMAX Alt Art · PSA 10 · Fusion Strike', price: 6500 },
  // Booster boxes
  { title: 'Evolving Skies Booster Box · English · 未開', price: 6800 },
  { title: 'Celebrations Booster Box · English · 未開', price: 3500 },
  { title: 'Brilliant Stars Booster Box · English · 未開', price: 2800 },
  { title: '151 Booster Box · English · 未開', price: 2200 },
  { title: 'Pokemon GO Booster Box · Japanese · 未開', price: 3200 },
  { title: 'Shiny Treasure ex Booster Box · Japanese · 未開', price: 4800 },
  { title: 'Paradox Rift Booster Box · English · 未開', price: 2400 },
  { title: 'Paldean Fates Elite Trainer Box · 未開', price: 1800 },
];

const WATCHES: { title: string; price: number }[] = [
  // Rolex
  { title: 'Rolex Submariner 116610LN · 黑水鬼 · 港行 · 2021', price: 75000 },
  { title: 'Rolex Submariner 116613LB · 藍水鬼 · 金鋼 · 2020', price: 95000 },
  { title: 'Rolex GMT-Master II 116710BLNR · Batman · 港行', price: 85000 },
  { title: 'Rolex GMT-Master II 126710BLRO · Pepsi · 港行', price: 95000 },
  { title: 'Rolex Daytona 116500LN · 白面黑圈 · 2022', price: 128000 },
  { title: 'Rolex DateJust 36 · 126234 · 銀面 · 蠔式鋼', price: 52000 },
  { title: 'Rolex DateJust 41 · 126301 · 金鋼 · 咖啡面', price: 68000 },
  { title: 'Rolex Explorer I 124270 · 全新未戴', price: 48000 },
  { title: 'Rolex Sky-Dweller 336934 · 白面 · 金鋼', price: 138000 },
  // Omega / AP / Patek
  { title: 'Omega Speedmaster Professional Moonwatch · 310.30.42', price: 32000 },
  { title: 'Omega Seamaster Diver 300M · 210.30.42 · 藍面', price: 28000 },
  { title: 'Omega Constellation · 131.23.41 · 金鋼 · 白面', price: 35000 },
  { title: 'AP Royal Oak 37mm · 15551ST · 藍面 · 鋼款', price: 155000 },
  { title: 'AP Royal Oak Offshore 44mm · 26400SO · 橙色', price: 128000 },
  { title: 'Patek Philippe Nautilus 5711 · 橄欖綠面 · 2021', price: 450000 },
  { title: 'Patek Philippe Calatrava 5196P · 鉑金 · 白面', price: 185000 },
];

const SNEAKERS: { title: string; price: number }[] = [
  { title: 'Nike Air Jordan 1 Retro High OG · Chicago · US10', price: 4500 },
  { title: 'Nike Air Jordan 1 Retro High · Bred · US11 · DS', price: 3800 },
  { title: 'Nike Air Jordan 1 Retro High · Royal Blue · US9', price: 5500 },
  { title: 'Nike Air Jordan 4 Retro · Military Blue · US10 · DS', price: 3200 },
  { title: 'Nike Air Jordan 11 Retro · Concord · US9.5', price: 2800 },
  { title: 'Adidas Yeezy Boost 350 V2 · Zebra · UK9 · DS', price: 2200 },
  { title: 'Adidas Yeezy Boost 700 · Wave Runner · US10', price: 2800 },
  { title: 'Nike Dunk Low · Panda · US9.5 · 全新未著', price: 1600 },
  { title: 'Nike Dunk Low · University Blue · US10 · DS', price: 2200 },
  { title: 'New Balance 2002R · Protection Pack · 全新 · US10', price: 1200 },
  { title: 'New Balance 550 · White Green · US9 · DS', price: 980 },
  { title: 'Nike Air Max 1 · Anniversary Red · US10 · 全新', price: 1800 },
];

const DESIGNER_TOYS: { title: string; price: number }[] = [
  { title: 'KAWS BFF · Vinyl Figure · Open Edition · Pink', price: 3800 },
  { title: 'KAWS Companion · Passing Through · Black · 全新', price: 4800 },
  { title: 'KAWS Holiday Space · 限量版 · 全新未開', price: 8800 },
  { title: 'Bearbrick 1000% Medicom · 骷髏熊 · 全新未開盒', price: 8500 },
  { title: 'Bearbrick 400% + 100% Snoopy · 全新', price: 2200 },
  { title: 'Bearbrick 1000% Jean-Michel Basquiat · 全新', price: 18000 },
  { title: 'Pop Mart Molly 周年紀念版 · 全套 12 隻 · 未開', price: 2800 },
  { title: 'Pop Mart Labubu 野生系列 · 全套 · 未開', price: 1800 },
  { title: 'Medicom VCD Darth Vader · Star Wars · 全新', price: 2400 },
  { title: 'Takashi Murakami × Complexcon 限量公仔 · 全新', price: 5500 },
];

async function main() {
  console.log('Seeding…');

  const passwordHash = await bcrypt.hash('password123', 10);

  const seller = await prisma.user.upsert({
    where: { email: 'seller@authentik.hk' },
    update: {},
    create: { email: 'seller@authentik.hk', displayName: 'Demo Seller', passwordHash },
  });

  const authData = [
    {
      email: 'milan@authentik.hk',
      displayName: 'Milan Station 旺角',
      storeName: 'Milan Station Mongkok',
      categories: [Category.HANDBAG, Category.WATCH],
      starRating: 5,
      completedCount: 1247,
      disputeRate: 0.008,
      feeRatePct: 0.07,
      feeMinHKD: 250,
      bio: '專營二手名牌手袋及名錶十五年，旺角 / 銅鑼灣 / 沙田設店，每年鑑定逾 5,000 件。Hermès / Chanel / LV 專家，提供全程錄影鑑定報告。',
      yearsExperience: 15,
      locationAddress: '旺角西洋菜南街 1A 號好望角大廈 5 樓',
      district: '旺角',
      businessHours: '星期一至日 12:00–21:00',
      acceptsMeetup: true,
      reviews: [
        { buyerName: '陳先生', rating: 5, comment: '鑑定好專業，錄影報告好詳細，買 Chanel 好放心。' },
        { buyerName: 'Ms. Wong', rating: 5, comment: '旺角面交方便，當場驗貨即時放心成交。' },
        { buyerName: 'Kevin L.', rating: 4, comment: '鑑定準，等候時間稍長但值得。' },
      ],
    },
    {
      email: 'procheck@authentik.hk',
      displayName: '先達 ProCheck',
      storeName: 'Sin Tat Plaza ProCheck',
      categories: [Category.IPHONE],
      starRating: 4,
      completedCount: 312,
      disputeRate: 0.015,
      feeRatePct: 0.035,
      feeMinHKD: 80,
      bio: '先達廣場數碼產品鑑定專門店，專驗 iPhone / iPad / MacBook 真偽、翻新機、改裝機。提供電池健康及序號核實。',
      yearsExperience: 8,
      locationAddress: '旺角彌敦道 580 號先達廣場 3 樓',
      district: '旺角',
      businessHours: '星期一至日 13:00–22:00',
      acceptsMeetup: true,
      reviews: [
        { buyerName: 'Alex', rating: 4, comment: '驗機快，揭發到一部翻新機，幫我省咗錢。' },
        { buyerName: '阿明', rating: 5, comment: '序號同電池都幫手核實，good。' },
      ],
    },
    {
      email: 'cardlab@authentik.hk',
      displayName: '信和 CardLab',
      storeName: 'Sino Centre CardLab',
      categories: [Category.POKEMON_CARD],
      starRating: 5,
      completedCount: 892,
      disputeRate: 0.003,
      feeRatePct: 0.06,
      feeMinHKD: 120,
      bio: '信和中心卡牌鑑定中心，專營 Pokemon / PSA / 寶可夢卡牌真偽鑑定及評級核實，配備專業放大及紫外線設備。',
      yearsExperience: 6,
      locationAddress: '旺角彌敦道 580 號信和中心 2 樓',
      district: '旺角',
      businessHours: '星期一至日 12:30–21:30',
      acceptsMeetup: false,
      reviews: [
        { buyerName: 'TCG_Hunter', rating: 5, comment: 'PSA 卡核實好仔細，假卡逃唔過佢隻眼。' },
        { buyerName: '小強', rating: 5, comment: '專業，紫外線同放大都用齊，信得過。' },
      ],
    },
  ];

  for (const a of authData) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: {},
      create: { email: a.email, displayName: a.displayName, passwordHash },
    });
    const auth = await prisma.authenticator.upsert({
      where: { userId: user.id },
      update: {
        categories: a.categories,
        feeRatePct: a.feeRatePct,
        feeMinHKD: a.feeMinHKD,
        bio: a.bio,
        yearsExperience: a.yearsExperience,
        locationAddress: a.locationAddress,
        district: a.district,
        businessHours: a.businessHours,
        acceptsMeetup: a.acceptsMeetup,
      },
      create: {
        userId: user.id,
        displayName: a.displayName,
        storeName: a.storeName,
        categories: a.categories,
        starRating: a.starRating,
        completedCount: a.completedCount,
        disputeRate: a.disputeRate,
        feeRatePct: a.feeRatePct,
        feeMinHKD: a.feeMinHKD,
        bio: a.bio,
        yearsExperience: a.yearsExperience,
        locationAddress: a.locationAddress,
        district: a.district,
        businessHours: a.businessHours,
        acceptsMeetup: a.acceptsMeetup,
        status: AuthenticatorStatus.ACTIVE,
        eAndOInsuranceExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    // Seed sample public reviews (idempotent via deterministic orderId)
    for (let i = 0; i < a.reviews.length; i++) {
      const r = a.reviews[i];
      const orderId = `seed-review-${auth.id}-${i}`;
      await prisma.authenticatorReview.upsert({
        where: { orderId },
        update: {},
        create: {
          authenticatorId: auth.id,
          orderId,
          buyerId: `seed-buyer-${i}`,
          buyerName: r.buyerName,
          rating: r.rating,
          comment: r.comment,
        },
      });
    }
  }

  let index = 10; // start offset so existing orders' listing IDs don't collide with new seeds

  const seed = async (
    items: { title: string; price: number }[],
    cat: Category,
    imgCount = 3,
    allowedDeliveryMethods: DeliveryMethod[] = [DeliveryMethod.SHIP],
  ) => {
    for (const item of items) {
      const existing = await prisma.listing.findFirst({
        where: { title: item.title, sellerId: seller.id },
      });
      if (!existing) {
        await prisma.listing.create({
          data: {
            sellerId: seller.id,
            category: cat,
            title: item.title,
            description: `港行正品，成色靚，配件齊全。有意請 inbox 查詢，可議價。`,
            priceHKD: item.price,
            tier: tierForPrice(item.price),
            status: ListingStatus.ACTIVE,
            images: pics(index, imgCount),
            allowedDeliveryMethods,
            sellerDistrict: '旺角',
          },
        });
      }
      index++;
    }
  };

  const SHIP = DeliveryMethod.SHIP;
  const M_AUTH = DeliveryMethod.MEETUP_AUTH;
  const M_3WAY = DeliveryMethod.MEETUP_3WAY;
  const M_DIRECT = DeliveryMethod.MEETUP_DIRECT;

  await seed(HANDBAGS, Category.HANDBAG, 4, [SHIP, M_AUTH, M_3WAY]);
  await seed(IPHONES, Category.IPHONE, 3, [SHIP, M_AUTH, M_3WAY, M_DIRECT]);
  await seed(POKEMON_CARDS, Category.POKEMON_CARD, 3, [SHIP, M_3WAY, M_DIRECT]);
  await seed(WATCHES, Category.WATCH, 4, [SHIP, M_AUTH]);
  await seed(SNEAKERS, Category.SNEAKER, 3, [SHIP, M_DIRECT]);
  await seed(DESIGNER_TOYS, Category.DESIGNER_TOY, 3, [SHIP, M_DIRECT]);

  const total = await prisma.listing.count({ where: { sellerId: seller.id } });
  console.log(`✓ ${total} listings seeded`);
  console.log('Demo login: seller@authentik.hk / password123');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });

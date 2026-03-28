import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("test123", 10);
  const adminPassword = await bcrypt.hash("admin123", 10);

  // ─── Users ───────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@pulse.local" },
    update: {},
    create: {
      email: "admin@pulse.local",
      passwordHash: adminPassword,
      displayName: "Администратор",
      fomoId: "admin_fomo",
      role: "ADMIN",
      status: "APPROVED",
      rating: 10,
      city: "Москва",
      workplace: "FOMO Platform",
      exchangeExperience: "15 лет",
      specializations: ["trader", "analyst"],
      bio: "Главный администратор платформы FOMO",
    },
  });

  const trader1 = await prisma.user.upsert({
    where: { email: "trader1@pulse.local" },
    update: {},
    create: {
      email: "trader1@pulse.local",
      passwordHash: password,
      displayName: "Алексей Трейдер",
      fomoId: "alex_trader",
      role: "USER",
      status: "APPROVED",
      rating: 7.5,
      firstName: "Алексей",
      lastName: "Смирнов",
      city: "Санкт-Петербург",
      workplace: "Tinkoff Investments",
      exchangeExperience: "5 лет",
      specializations: ["trader", "scalper"],
      bio: "Профессиональный трейдер. Специализация — фьючерсы MOEX и крипто.",
      subscriptionPrice: 500,
      paymentCard: "2200 1234 5678 9012",
      dmEnabled: true,
      socialLinks: { telegram: "@alex_trades", twitter: "@alextrader" },
    },
  });

  const analyst = await prisma.user.upsert({
    where: { email: "analyst@pulse.local" },
    update: {},
    create: {
      email: "analyst@pulse.local",
      passwordHash: password,
      displayName: "Мария Аналитик",
      fomoId: "maria_research",
      role: "USER",
      status: "APPROVED",
      rating: 8.2,
      firstName: "Мария",
      lastName: "Козлова",
      city: "Москва",
      workplace: "БКС Мир Инвестиций",
      exchangeExperience: "8 лет",
      specializations: ["analyst", "investor"],
      bio: "Аналитик фондового рынка. Фокус: российские акции и облигации.",
      subscriptionPrice: 1000,
      paymentCard: "4100 9876 5432 1098",
      dmEnabled: true,
      socialLinks: { telegram: "@maria_analyst", youtube: "https://youtube.com/@maria_research" },
    },
  });

  const newbie = await prisma.user.upsert({
    where: { email: "newbie@pulse.local" },
    update: {},
    create: {
      email: "newbie@pulse.local",
      passwordHash: password,
      displayName: "Новичок",
      fomoId: "newbie_2026",
      role: "USER",
      status: "PENDING",
      rating: 1,
      bio: "Начинающий трейдер, изучаю рынок",
    },
  });

  const ivan = await prisma.user.upsert({
    where: { email: "ivan@pulse.local" },
    update: {},
    create: {
      email: "ivan@pulse.local",
      passwordHash: password,
      displayName: "Иван Скальпер",
      fomoId: "ivan_scalp",
      role: "USER",
      status: "APPROVED",
      rating: 6.3,
      firstName: "Иван",
      lastName: "Петров",
      city: "Казань",
      workplace: "Частный трейдер",
      exchangeExperience: "3 года",
      specializations: ["scalper", "algotrader"],
      bio: "Скальпинг на MOEX. Алготрейдинг на Python.",
      dmEnabled: true,
    },
  });

  // ─── 10 NEW TEST USERS ───────────────────────────────────────────────

  // === 5 users WITH paid channels ===
  const channelUser1 = await prisma.user.upsert({
    where: { email: "crypto_king@pulse.local" },
    update: {},
    create: {
      email: "crypto_king@pulse.local",
      passwordHash: password,
      displayName: "Дмитрий Крипто",
      fomoId: "crypto_king777",
      role: "USER",
      status: "APPROVED",
      rating: 9.1,
      firstName: "Дмитрий",
      lastName: "Волков",
      city: "Москва",
      workplace: "CryptoFund Capital",
      exchangeExperience: "7 лет",
      specializations: ["trader", "analyst"],
      bio: "Профессиональный крипто-трейдер. Управляю фондом на $2M. BTC, ETH, DeFi.",
      paymentCard: "2200 5555 1234 0001",
      donationCard: "2200 5555 1234 0001",
      dmEnabled: true,
      socialLinks: { telegram: "@crypto_king777", youtube: "https://youtube.com/@cryptoking" },
    },
  });

  const channelUser2 = await prisma.user.upsert({
    where: { email: "moex_pro@pulse.local" },
    update: {},
    create: {
      email: "moex_pro@pulse.local",
      passwordHash: password,
      displayName: "Елена Фондовая",
      fomoId: "elena_moex_pro",
      role: "USER",
      status: "APPROVED",
      rating: 8.7,
      firstName: "Елена",
      lastName: "Соколова",
      city: "Санкт-Петербург",
      workplace: "Финам",
      exchangeExperience: "12 лет",
      specializations: ["analyst", "investor"],
      bio: "Аналитик фондового рынка. 12 лет на MOEX. Специализация — акции и облигации.",
      paymentCard: "4100 6666 7777 0002",
      donationCard: "4100 6666 7777 0002",
      dmEnabled: true,
      socialLinks: { telegram: "@elena_moex", vk: "https://vk.com/elena_moex" },
    },
  });

  const channelUser3 = await prisma.user.upsert({
    where: { email: "forex_guru@pulse.local" },
    update: {},
    create: {
      email: "forex_guru@pulse.local",
      passwordHash: password,
      displayName: "Артём Форекс",
      fomoId: "artem_fx_guru",
      role: "USER",
      status: "APPROVED",
      rating: 7.9,
      firstName: "Артём",
      lastName: "Новиков",
      city: "Екатеринбург",
      workplace: "Независимый трейдер",
      exchangeExperience: "6 лет",
      specializations: ["trader", "scalper"],
      bio: "Форекс-трейдер. Торгую EUR/USD, GBP/USD. Авторская стратегия Smart Money.",
      paymentCard: "5100 8888 9999 0003",
      donationCard: "5100 8888 9999 0003",
      dmEnabled: true,
      socialLinks: { telegram: "@artem_fx", whatsapp: "+79001234567" },
    },
  });

  const channelUser4 = await prisma.user.upsert({
    where: { email: "oil_baron@pulse.local" },
    update: {},
    create: {
      email: "oil_baron@pulse.local",
      passwordHash: password,
      displayName: "Сергей Сырьевик",
      fomoId: "sergey_oil_baron",
      role: "USER",
      status: "APPROVED",
      rating: 8.3,
      firstName: "Сергей",
      lastName: "Кузнецов",
      city: "Тюмень",
      workplace: "Газпромнефть",
      exchangeExperience: "10 лет",
      specializations: ["analyst", "trader"],
      bio: "Эксперт по сырьевым рынкам. Нефть, газ, золото. Инсайды из отрасли.",
      paymentCard: "2200 4444 3333 0004",
      donationCard: "2200 4444 3333 0004",
      dmEnabled: true,
      socialLinks: { telegram: "@sergey_oil" },
    },
  });

  const channelUser5 = await prisma.user.upsert({
    where: { email: "algo_master@pulse.local" },
    update: {},
    create: {
      email: "algo_master@pulse.local",
      passwordHash: password,
      displayName: "Никита Алгоритм",
      fomoId: "nikita_algo_master",
      role: "USER",
      status: "APPROVED",
      rating: 7.6,
      firstName: "Никита",
      lastName: "Морозов",
      city: "Новосибирск",
      workplace: "Quantitative Strategies LLC",
      exchangeExperience: "5 лет",
      specializations: ["algotrader", "scalper"],
      bio: "Разработчик торговых роботов. Python, C++. Алго на MOEX и Bybit.",
      paymentCard: "5500 1111 2222 0005",
      donationCard: "5500 1111 2222 0005",
      dmEnabled: true,
      socialLinks: { telegram: "@nikita_algo", website: "https://algo-master.ru" },
    },
  });

  // === 5 users WITHOUT channels, WITH ideas ===
  const ideaUser1 = await prisma.user.upsert({
    where: { email: "bond_girl@pulse.local" },
    update: {},
    create: {
      email: "bond_girl@pulse.local",
      passwordHash: password,
      displayName: "Ольга Облигации",
      fomoId: "olga_bonds_queen",
      role: "USER",
      status: "APPROVED",
      rating: 6.8,
      firstName: "Ольга",
      lastName: "Белова",
      city: "Москва",
      workplace: "Сбер CIB",
      exchangeExperience: "9 лет",
      specializations: ["analyst", "investor"],
      bio: "Специалист по облигациям и долговому рынку. ОФЗ, корпоративные бонды, еврооблигации.",
      donationCard: "2200 7777 8888 0006",
      dmEnabled: true,
      socialLinks: { telegram: "@olga_bonds" },
    },
  });

  const ideaUser2 = await prisma.user.upsert({
    where: { email: "defi_ninja@pulse.local" },
    update: {},
    create: {
      email: "defi_ninja@pulse.local",
      passwordHash: password,
      displayName: "Павел DeFi",
      fomoId: "pavel_defi_ninja",
      role: "USER",
      status: "APPROVED",
      rating: 5.9,
      firstName: "Павел",
      lastName: "Лебедев",
      city: "Краснодар",
      workplace: "Freelance Web3 Dev",
      exchangeExperience: "4 года",
      specializations: ["trader", "algotrader"],
      bio: "DeFi-энтузиаст. Фарминг, стейкинг, DEX арбитраж. Собираю альфу в крипте.",
      donationCard: "4100 9999 0000 0007",
      dmEnabled: true,
      socialLinks: { telegram: "@defi_pavel", website: "https://defi-ninja.xyz" },
    },
  });

  const ideaUser3 = await prisma.user.upsert({
    where: { email: "dividend_hunter@pulse.local" },
    update: {},
    create: {
      email: "dividend_hunter@pulse.local",
      passwordHash: password,
      displayName: "Андрей Дивиденды",
      fomoId: "andrey_dividends",
      role: "USER",
      status: "APPROVED",
      rating: 7.2,
      firstName: "Андрей",
      lastName: "Тихонов",
      city: "Казань",
      workplace: "Частный инвестор",
      exchangeExperience: "8 лет",
      specializations: ["investor"],
      bio: "Дивидендный инвестор. Портфель из голубых фишек MOEX. Пассивный доход > 15%.",
      donationCard: "2200 3333 4444 0008",
      dmEnabled: true,
      socialLinks: { telegram: "@andrey_div", youtube: "https://youtube.com/@dividend_hunter" },
    },
  });

  const ideaUser4 = await prisma.user.upsert({
    where: { email: "macro_view@pulse.local" },
    update: {},
    create: {
      email: "macro_view@pulse.local",
      passwordHash: password,
      displayName: "Татьяна Макро",
      fomoId: "tatyana_macro_view",
      role: "USER",
      status: "APPROVED",
      rating: 6.4,
      firstName: "Татьяна",
      lastName: "Фёдорова",
      city: "Нижний Новгород",
      workplace: "ВТБ Капитал",
      exchangeExperience: "6 лет",
      specializations: ["analyst"],
      bio: "Макроаналитик. Ставки ЦБ, инфляция, валюты. Глобальные тренды.",
      donationCard: "5100 2222 1111 0009",
      dmEnabled: true,
      socialLinks: { telegram: "@tatyana_macro" },
    },
  });

  const ideaUser5 = await prisma.user.upsert({
    where: { email: "scalp_machine@pulse.local" },
    update: {},
    create: {
      email: "scalp_machine@pulse.local",
      passwordHash: password,
      displayName: "Максим Скальпер",
      fomoId: "max_scalp_machine",
      role: "USER",
      status: "APPROVED",
      rating: 5.5,
      firstName: "Максим",
      lastName: "Григорьев",
      city: "Ростов-на-Дону",
      workplace: "Частный трейдер",
      exchangeExperience: "3 года",
      specializations: ["scalper", "trader"],
      bio: "Скальпер на срочном рынке MOEX. Si, BR, GOLD. Торгую по стакану и ленте.",
      donationCard: "2200 6666 5555 0010",
      dmEnabled: true,
      socialLinks: { telegram: "@max_scalp" },
    },
  });

  console.log("10 new test users created");

  console.log("Users created:", admin.id, trader1.id, analyst.id, newbie.id, ivan.id);

  // ─── Tariffs for 5 channel users ────────────────────────────────────
  const tariffData = [
    {
      authorId: channelUser1.id,
      tariffs: [
        { name: "Крипто Базовый", description: "Ежедневные сигналы по BTC и ETH. 2-3 идеи в неделю.", price: 990, durationDays: 30 },
        { name: "Крипто Премиум", description: "Все альткоины + DeFi стратегии + приватный чат. До 10 идей в неделю.", price: 2490, durationDays: 30 },
      ],
    },
    {
      authorId: channelUser2.id,
      tariffs: [
        { name: "MOEX Аналитика", description: "Фундаментальный анализ российских акций. 3-5 идей в неделю.", price: 1490, durationDays: 30 },
        { name: "MOEX Годовой", description: "Полный доступ на год со скидкой 30%. Все обзоры и портфель.", price: 12500, durationDays: 365 },
      ],
    },
    {
      authorId: channelUser3.id,
      tariffs: [
        { name: "Валютные Сигналы", description: "Точки входа по валютным фьючерсам Si, Eu с уровнями. 5-7 сигналов в неделю.", price: 790, durationDays: 30 },
      ],
    },
    {
      authorId: channelUser4.id,
      tariffs: [
        { name: "Сырьё Инсайд", description: "Нефть, газ, золото. Инсайды из отрасли + технический анализ.", price: 1990, durationDays: 30 },
        { name: "Сырьё Квартальный", description: "3 месяца доступа со скидкой 20%.", price: 4770, durationDays: 90 },
      ],
    },
    {
      authorId: channelUser5.id,
      tariffs: [
        { name: "Алго Стратегии", description: "Торговые роботы, код стратегий, бэктесты. 2-3 идеи в неделю.", price: 2990, durationDays: 30 },
      ],
    },
  ];

  for (const { authorId, tariffs } of tariffData) {
    for (const t of tariffs) {
      const existing = await prisma.subscriptionTariff.findFirst({
        where: { authorId, name: t.name },
      });
      if (!existing) {
        await prisma.subscriptionTariff.create({
          data: {
            authorId,
            name: t.name,
            description: t.description,
            price: t.price,
            durationDays: t.durationDays,
            isActive: true,
            paymentMethods: ["card"],
            cardNumber: (await prisma.user.findUnique({ where: { id: authorId }, select: { paymentCard: true } }))?.paymentCard || null,
          },
        });
      }
    }
  }
  console.log("Tariffs created for 5 channel users");

  // ─── Chat rooms: General + Thematic ──────────────────────────────────
  const thematicRooms = [
    { id: "general", name: "Общий чат", isGeneral: true },
    { id: "chat-ru-stocks", name: "РФ Акции", isGeneral: false },
    { id: "chat-us-stocks", name: "США Акции", isGeneral: false },
    { id: "chat-commodities", name: "Сырьё", isGeneral: false },
    { id: "chat-metals", name: "Металлы", isGeneral: false },
    { id: "chat-indices", name: "Индексы", isGeneral: false },
    { id: "chat-currencies", name: "Валюты", isGeneral: false },
    { id: "chat-crypto", name: "Крипта", isGeneral: false },
  ];

  for (const room of thematicRooms) {
    await prisma.chatRoom.upsert({
      where: { id: room.id },
      update: { name: room.name },
      create: room,
    });
  }

  // ─── Rating config ───────────────────────────────────────────────────
  await prisma.ratingConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });


  // ─── Delete Forex category and instruments ──────────────────────────
  const forexCat = await prisma.instrumentCategory.findUnique({ where: { slug: "forex" } });
  if (forexCat) {
    const forexInstruments = await prisma.instrument.findMany({ where: { categoryId: forexCat.id }, select: { id: true } });
    const forexIds = forexInstruments.map(i => i.id);
    if (forexIds.length > 0) {
      await prisma.ideaInstrument.deleteMany({ where: { instrumentId: { in: forexIds } } });
      const forexRooms = await prisma.chatRoom.findMany({ where: { instrumentId: { in: forexIds } }, select: { id: true } });
      if (forexRooms.length > 0) {
        await prisma.chatMessage.deleteMany({ where: { roomId: { in: forexRooms.map(r => r.id) } } });
        await prisma.chatRoom.deleteMany({ where: { id: { in: forexRooms.map(r => r.id) } } });
      }
      await prisma.instrument.deleteMany({ where: { id: { in: forexIds } } });
    }
    await prisma.instrumentCategory.delete({ where: { id: forexCat.id } });
    console.log("Forex category and instruments deleted");
  }

  // ─── Delete bonds category ──────────────────────────────────────────
  for (const delSlug of ["bonds"]) {
    const delCat = await prisma.instrumentCategory.findUnique({ where: { slug: delSlug } });
    if (delCat) {
      const delInstruments = await prisma.instrument.findMany({ where: { categoryId: delCat.id }, select: { id: true } });
      const delIds = delInstruments.map(i => i.id);
      if (delIds.length > 0) {
        await prisma.ideaInstrument.deleteMany({ where: { instrumentId: { in: delIds } } });
        const delRooms = await prisma.chatRoom.findMany({ where: { instrumentId: { in: delIds } }, select: { id: true } });
        if (delRooms.length > 0) {
          await prisma.chatMessage.deleteMany({ where: { roomId: { in: delRooms.map(r => r.id) } } });
          await prisma.chatRoom.deleteMany({ where: { id: { in: delRooms.map(r => r.id) } } });
        }
        await prisma.instrument.deleteMany({ where: { id: { in: delIds } } });
      }
      await prisma.instrumentCategory.delete({ where: { id: delCat.id } });
      console.log(`Category '${delSlug}' deleted`);
    }
  }

  // ─── Delete old categories ──────
  const validSlugs = ["ru-stocks", "us-stocks", "indices", "currencies", "crypto", "commodities", "metals"];
  const oldCats = await prisma.instrumentCategory.findMany({ where: { slug: { notIn: validSlugs } } });
  for (const oldCat of oldCats) {
    await prisma.instrument.updateMany({ where: { categoryId: oldCat.id }, data: { categoryId: null } });
    const assetCount = await prisma.asset.count({ where: { categoryId: oldCat.id } });
    if (assetCount === 0) {
      await prisma.instrumentCategory.delete({ where: { id: oldCat.id } });
      console.log(`Old category '${oldCat.slug}' deleted`);
    }
  }

  // ─── Exchanges ─────────────────────────────────────────────────────
  const exchangeData = [
    { name: "Московская биржа", slug: "moex", shortName: "MOEX", country: "RU", sortOrder: 1 },
    { name: "CME Group / NYMEX", slug: "cme", shortName: "CME", country: "US", sortOrder: 2 },
    { name: "NYSE / NASDAQ", slug: "nyse", shortName: "NYSE", country: "US", sortOrder: 3 },
    { name: "Hong Kong Exchange", slug: "hkex", shortName: "HKEX", country: "CN", sortOrder: 4 },
    { name: "London Stock Exchange / ICE", slug: "lse", shortName: "LSE", country: "GB", sortOrder: 5 },
    { name: "Спот (справочные)", slug: "spot", shortName: "SPOT", country: "SPOT", sortOrder: 6 },
    { name: "Bybit", slug: "bybit", shortName: "Bybit", country: "CRYPTO", sortOrder: 7 },
  ];

  const exchanges: Record<string, string> = {};
  for (const ex of exchangeData) {
    const created = await prisma.exchange.upsert({
      where: { slug: ex.slug },
      update: { name: ex.name, shortName: ex.shortName, country: ex.country, sortOrder: ex.sortOrder },
      create: ex,
    });
    exchanges[ex.slug] = created.id;
  }
  console.log(`${exchangeData.length} exchanges created`);

  // ─── Categories ──────────────────────────────────────────────────────
  const catData = [
    { name: "Акции РФ", slug: "ru-stocks", sortOrder: 1 },
    { name: "Акции США", slug: "us-stocks", sortOrder: 2 },
    { name: "Мировые индексы", slug: "indices", sortOrder: 3 },
    { name: "Валюта", slug: "currencies", sortOrder: 4 },
    { name: "Криптовалюты", slug: "crypto", sortOrder: 5 },
    { name: "Сырьевые товары", slug: "commodities", sortOrder: 6 },
    { name: "Металлы", slug: "metals", sortOrder: 7 },
  ];

  const cats: Record<string, string> = {};
  for (const cat of catData) {
    const c = await prisma.instrumentCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: cat,
    });
    cats[cat.slug] = c.id;
  }

  // ─── Assets ──────────────────────────────────────────────────────────
  const assetData = [
    // Сырьевые товары
    { name: "Нефть", slug: "oil", categorySlug: "commodities", sortOrder: 1, description: "Сырая нефть — главный энергоресурс. Brent и WTI — два основных бенчмарка" },
    { name: "Газ", slug: "gas", categorySlug: "commodities", sortOrder: 2, description: "Природный газ Henry Hub — основной бенчмарк в США и мире" },
    { name: "Европейский газ", slug: "euro-gas", categorySlug: "commodities", sortOrder: 3, description: "TTF (Title Transfer Facility) — европейский бенчмарк природного газа" },
    { name: "Какао", slug: "cocoa", categorySlug: "commodities", sortOrder: 4, description: "Какао-бобы — сырьё для шоколадной промышленности. Торгуется на ICE и MOEX" },
    { name: "Пшеница", slug: "wheat", categorySlug: "commodities", sortOrder: 5, description: "Пшеница — ключевой зерновой товар. CBOT — мировой бенчмарк" },
    { name: "Сахар", slug: "sugar", categorySlug: "commodities", sortOrder: 6, description: "Сахар-сырец — торгуется на ICE (Sugar No. 11) и MOEX" },
    { name: "Кукуруза", slug: "corn", categorySlug: "commodities", sortOrder: 7, description: "Кукуруза — зерновая культура. Основные торги на CBOT (CME Group)" },
    { name: "Соя", slug: "soy", categorySlug: "commodities", sortOrder: 8, description: "Соевые бобы — масличная культура. Торгуется на CBOT" },
    { name: "Кофе", slug: "coffee", categorySlug: "commodities", sortOrder: 9, description: "Кофе арабика — торгуется на ICE. Робуста — на London ICE" },
    { name: "Бензин", slug: "gasoline", categorySlug: "commodities", sortOrder: 10, description: "Бензин RBOB — торгуется на NYMEX (CME Group)" },
    { name: "Апельсиновый сок", slug: "orange-juice", categorySlug: "commodities", sortOrder: 11, description: "Замороженный концентрат апельсинового сока (FCOJ) — торгуется на ICE" },

    // Металлы
    { name: "Золото", slug: "gold", categorySlug: "metals", sortOrder: 1, description: "Золото — главный защитный актив. COMEX (CME) — основная площадка" },
    { name: "Серебро", slug: "silver", categorySlug: "metals", sortOrder: 2, description: "Серебро — драгоценный и промышленный металл. COMEX и MOEX" },
    { name: "Платина", slug: "platinum", categorySlug: "metals", sortOrder: 3, description: "Платина — драгоценный металл. Используется в автокатализаторах" },
    { name: "Палладий", slug: "palladium", categorySlug: "metals", sortOrder: 4, description: "Палладий — дефицитный металл для автопрома. MOEX и NYMEX" },
    { name: "Медь", slug: "copper", categorySlug: "metals", sortOrder: 5, description: "Медь — промышленный металл, барометр мировой экономики. COMEX и LME" },

    // Акции РФ
    { name: "Сбербанк", slug: "sberbank", categorySlug: "ru-stocks", sortOrder: 1 },
    { name: "Газпром", slug: "gazprom", categorySlug: "ru-stocks", sortOrder: 2 },
    { name: "ЛУКОЙЛ", slug: "lukoil", categorySlug: "ru-stocks", sortOrder: 3 },
    { name: "Яндекс", slug: "yandex", categorySlug: "ru-stocks", sortOrder: 4 },
    { name: "Роснефть", slug: "rosneft", categorySlug: "ru-stocks", sortOrder: 5 },
    { name: "Норникель", slug: "norilsk-nickel", categorySlug: "ru-stocks", sortOrder: 6 },
    { name: "Новатэк", slug: "novatek", categorySlug: "ru-stocks", sortOrder: 7 },
    { name: "Полюс", slug: "polyus", categorySlug: "ru-stocks", sortOrder: 8 },
    { name: "Магнит", slug: "magnit", categorySlug: "ru-stocks", sortOrder: 9 },
    { name: "ВТБ", slug: "vtb", categorySlug: "ru-stocks", sortOrder: 10 },
    { name: "Тинькофф", slug: "tinkoff", categorySlug: "ru-stocks", sortOrder: 11 },
    { name: "МТС", slug: "mts", categorySlug: "ru-stocks", sortOrder: 12 },
    { name: "Аэрофлот", slug: "aeroflot", categorySlug: "ru-stocks", sortOrder: 13 },
    { name: "Алроса", slug: "alrosa", categorySlug: "ru-stocks", sortOrder: 14 },
    { name: "НЛМК", slug: "nlmk", categorySlug: "ru-stocks", sortOrder: 15 },

    // Акции США / Мировые
    // Акции США (NYSE/NASDAQ)
    { name: "Apple", slug: "apple", categorySlug: "us-stocks", sortOrder: 1 },
    { name: "Tesla", slug: "tesla", categorySlug: "us-stocks", sortOrder: 2 },
    { name: "Microsoft", slug: "microsoft", categorySlug: "us-stocks", sortOrder: 3 },
    { name: "Amazon", slug: "amazon", categorySlug: "us-stocks", sortOrder: 4 },
    { name: "Google", slug: "google", categorySlug: "us-stocks", sortOrder: 5 },
    { name: "Nvidia", slug: "nvidia", categorySlug: "us-stocks", sortOrder: 6 },
    { name: "Meta", slug: "meta", categorySlug: "us-stocks", sortOrder: 7 },
    { name: "Netflix", slug: "netflix", categorySlug: "us-stocks", sortOrder: 8 },
    { name: "AMD", slug: "amd", categorySlug: "us-stocks", sortOrder: 9 },
    { name: "Intel", slug: "intel", categorySlug: "us-stocks", sortOrder: 10 },
    { name: "JPMorgan", slug: "jpmorgan", categorySlug: "us-stocks", sortOrder: 11 },
    { name: "Berkshire Hathaway", slug: "berkshire", categorySlug: "us-stocks", sortOrder: 12 },
    { name: "Visa", slug: "visa", categorySlug: "us-stocks", sortOrder: 13 },
    { name: "Coca-Cola", slug: "coca-cola", categorySlug: "us-stocks", sortOrder: 14 },
    { name: "Disney", slug: "disney", categorySlug: "us-stocks", sortOrder: 15 },

    // Мировые индексы
    { name: "Индекс MOEX", slug: "moex-index", categorySlug: "indices", sortOrder: 1 },
    { name: "РТС", slug: "rts-index", categorySlug: "indices", sortOrder: 2 },
    { name: "S&P 500", slug: "sp500", categorySlug: "indices", sortOrder: 3 },
    { name: "Nasdaq 100", slug: "nasdaq100", categorySlug: "indices", sortOrder: 4 },
    { name: "Dow Jones", slug: "dow-jones", categorySlug: "indices", sortOrder: 5 },
    { name: "Russell 2000", slug: "russell2000", categorySlug: "indices", sortOrder: 6 },
    { name: "Hang Seng", slug: "hang-seng", categorySlug: "indices", sortOrder: 7 },
    { name: "HSCEI", slug: "hscei", categorySlug: "indices", sortOrder: 8 },
    { name: "DAX 40", slug: "dax40", categorySlug: "indices", sortOrder: 9 },
    { name: "FTSE 100", slug: "ftse100", categorySlug: "indices", sortOrder: 10 },
    { name: "Nikkei 225", slug: "nikkei225", categorySlug: "indices", sortOrder: 11 },

    // Валюта
    { name: "Рубль/Доллар", slug: "usd-rub", categorySlug: "currencies", sortOrder: 1 },
    { name: "Рубль/Юань", slug: "cny-rub", categorySlug: "currencies", sortOrder: 2 },
    { name: "Евро/Доллар", slug: "eur-usd", categorySlug: "currencies", sortOrder: 3 },

    // Криптовалюты
    { name: "Bitcoin", slug: "bitcoin", categorySlug: "crypto", sortOrder: 1 },
    { name: "Ethereum", slug: "ethereum", categorySlug: "crypto", sortOrder: 2 },
    { name: "Solana", slug: "solana", categorySlug: "crypto", sortOrder: 3 },
    { name: "XRP", slug: "xrp", categorySlug: "crypto", sortOrder: 4 },
    { name: "BNB", slug: "bnb", categorySlug: "crypto", sortOrder: 5 },
    { name: "Dogecoin", slug: "dogecoin", categorySlug: "crypto", sortOrder: 6 },
    { name: "Cardano", slug: "cardano", categorySlug: "crypto", sortOrder: 7 },
    { name: "Avalanche", slug: "avalanche", categorySlug: "crypto", sortOrder: 8 },
    { name: "Polkadot", slug: "polkadot", categorySlug: "crypto", sortOrder: 9 },
    { name: "Chainlink", slug: "chainlink", categorySlug: "crypto", sortOrder: 10 },
    { name: "Litecoin", slug: "litecoin", categorySlug: "crypto", sortOrder: 11 },
    { name: "Polygon", slug: "polygon", categorySlug: "crypto", sortOrder: 12 },
    { name: "Toncoin", slug: "toncoin", categorySlug: "crypto", sortOrder: 13 },
    { name: "Sui", slug: "sui-crypto", categorySlug: "crypto", sortOrder: 14 },
    { name: "Pepe", slug: "pepe", categorySlug: "crypto", sortOrder: 15 },
  ];

  const assets: Record<string, string> = {};
  for (const a of assetData) {
    const created = await prisma.asset.upsert({
      where: { slug: a.slug },
      update: { name: a.name, categoryId: cats[a.categorySlug], sortOrder: a.sortOrder, description: (a as any).description || null },
      create: { name: a.name, slug: a.slug, categoryId: cats[a.categorySlug], sortOrder: a.sortOrder, description: (a as any).description || null },
    });
    assets[a.slug] = created.id;

    // Create chat room for each asset
    await prisma.chatRoom.upsert({
      where: { assetId: created.id },
      update: { name: a.name },
      create: { name: a.name, assetId: created.id, categoryLabel: catData.find(c => c.slug === a.categorySlug)?.name },
    });
  }
  console.log(`${assetData.length} assets created with chat rooms`);

  // ─── Instruments ─────────────────────────────────────────────────────
  const instrumentData = [
    // ══════ КРИПТОВАЛЮТЫ (MOEX) ══════
    { assetSlug: "bitcoin", name: "Биткоин (фьючерс MOEX)", slug: "btcf", ticker: "BTCF", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=BA", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=BA", tradingViewSymbol: "MOEX:BTCF", dataSource: "moex", dataTicker: "BTCF", description: "Фьючерс на биткоин MOEX", categorySlug: "crypto", instrumentType: "crypto" },

    // ══════ КРИПТОВАЛЮТЫ (Bybit) ══════
    { assetSlug: "bitcoin", name: "Bitcoin", slug: "btcusdt", ticker: "BTCUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/BTCUSDT", externalUrl: "https://www.bybit.com/trade/usdt/BTCUSDT", tradingViewSymbol: "BYBIT:BTCUSDT", dataSource: "bybit", dataTicker: "BTCUSDT", description: "Bitcoin / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "ethereum", name: "Ethereum", slug: "ethusdt", ticker: "ETHUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/ETHUSDT", externalUrl: "https://www.bybit.com/trade/usdt/ETHUSDT", tradingViewSymbol: "BYBIT:ETHUSDT", dataSource: "bybit", dataTicker: "ETHUSDT", description: "Ethereum / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "solana", name: "Solana", slug: "solusdt", ticker: "SOLUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/SOLUSDT", externalUrl: "https://www.bybit.com/trade/usdt/SOLUSDT", tradingViewSymbol: "BYBIT:SOLUSDT", dataSource: "bybit", dataTicker: "SOLUSDT", description: "Solana / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "xrp", name: "XRP", slug: "xrpusdt", ticker: "XRPUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/XRPUSDT", externalUrl: "https://www.bybit.com/trade/usdt/XRPUSDT", tradingViewSymbol: "BYBIT:XRPUSDT", dataSource: "bybit", dataTicker: "XRPUSDT", description: "XRP / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "bnb", name: "BNB", slug: "bnbusdt", ticker: "BNBUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/BNBUSDT", externalUrl: "https://www.bybit.com/trade/usdt/BNBUSDT", tradingViewSymbol: "BYBIT:BNBUSDT", dataSource: "bybit", dataTicker: "BNBUSDT", description: "BNB / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "dogecoin", name: "Dogecoin", slug: "dogeusdt", ticker: "DOGEUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/DOGEUSDT", externalUrl: "https://www.bybit.com/trade/usdt/DOGEUSDT", tradingViewSymbol: "BYBIT:DOGEUSDT", dataSource: "bybit", dataTicker: "DOGEUSDT", description: "Dogecoin / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "cardano", name: "Cardano", slug: "adausdt", ticker: "ADAUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/ADAUSDT", externalUrl: "https://www.bybit.com/trade/usdt/ADAUSDT", tradingViewSymbol: "BYBIT:ADAUSDT", dataSource: "bybit", dataTicker: "ADAUSDT", description: "Cardano / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "avalanche", name: "Avalanche", slug: "avaxusdt", ticker: "AVAXUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/AVAXUSDT", externalUrl: "https://www.bybit.com/trade/usdt/AVAXUSDT", tradingViewSymbol: "BYBIT:AVAXUSDT", dataSource: "bybit", dataTicker: "AVAXUSDT", description: "Avalanche / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "polkadot", name: "Polkadot", slug: "dotusdt", ticker: "DOTUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/DOTUSDT", externalUrl: "https://www.bybit.com/trade/usdt/DOTUSDT", tradingViewSymbol: "BYBIT:DOTUSDT", dataSource: "bybit", dataTicker: "DOTUSDT", description: "Polkadot / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "chainlink", name: "Chainlink", slug: "linkusdt", ticker: "LINKUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/LINKUSDT", externalUrl: "https://www.bybit.com/trade/usdt/LINKUSDT", tradingViewSymbol: "BYBIT:LINKUSDT", dataSource: "bybit", dataTicker: "LINKUSDT", description: "Chainlink / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "litecoin", name: "Litecoin", slug: "ltcusdt", ticker: "LTCUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/LTCUSDT", externalUrl: "https://www.bybit.com/trade/usdt/LTCUSDT", tradingViewSymbol: "BYBIT:LTCUSDT", dataSource: "bybit", dataTicker: "LTCUSDT", description: "Litecoin / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "polygon", name: "Polygon", slug: "maticusdt", ticker: "MATICUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/MATICUSDT", externalUrl: "https://www.bybit.com/trade/usdt/MATICUSDT", tradingViewSymbol: "BYBIT:MATICUSDT", dataSource: "bybit", dataTicker: "MATICUSDT", description: "Polygon / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "toncoin", name: "Toncoin", slug: "tonusdt", ticker: "TONUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/TONUSDT", externalUrl: "https://www.bybit.com/trade/usdt/TONUSDT", tradingViewSymbol: "BYBIT:TONUSDT", dataSource: "bybit", dataTicker: "TONUSDT", description: "Toncoin / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "sui-crypto", name: "Sui", slug: "suiusdt", ticker: "SUIUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/SUIUSDT", externalUrl: "https://www.bybit.com/trade/usdt/SUIUSDT", tradingViewSymbol: "BYBIT:SUIUSDT", dataSource: "bybit", dataTicker: "SUIUSDT", description: "Sui / USDT", categorySlug: "crypto", instrumentType: "crypto" },
    { assetSlug: "pepe", name: "Pepe", slug: "pepeusdt", ticker: "PEPEUSDT", exchange: "Bybit", exchangeSlug: "bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/PEPEUSDT", externalUrl: "https://www.bybit.com/trade/usdt/PEPEUSDT", tradingViewSymbol: "BYBIT:PEPEUSDT", dataSource: "bybit", dataTicker: "PEPEUSDT", description: "Pepe / USDT", categorySlug: "crypto", instrumentType: "crypto" },

    // ══════ АКЦИИ РФ (MOEX, TQBR) ══════
    { assetSlug: "sberbank", name: "Сбербанк", slug: "sber", ticker: "SBER", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=SBER", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=SBER", tradingViewSymbol: "MOEX:SBER", dataSource: "moex", dataTicker: "SBER", description: "ПАО Сбербанк — крупнейший банк РФ", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "gazprom", name: "Газпром", slug: "gazp", ticker: "GAZP", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=GAZP", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=GAZP", tradingViewSymbol: "MOEX:GAZP", dataSource: "moex", dataTicker: "GAZP", description: "ПАО Газпром — газовая монополия", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "lukoil", name: "ЛУКОЙЛ", slug: "lkoh", ticker: "LKOH", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=LKOH", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=LKOH", tradingViewSymbol: "MOEX:LKOH", dataSource: "moex", dataTicker: "LKOH", description: "ПАО ЛУКОЙЛ — нефтяная компания", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "yandex", name: "Яндекс", slug: "ydex", ticker: "YDEX", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=YDEX", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=YDEX", tradingViewSymbol: "MOEX:YDEX", dataSource: "moex", dataTicker: "YDEX", description: "Яндекс — IT-гигант России", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "rosneft", name: "Роснефть", slug: "rosn", ticker: "ROSN", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=ROSN", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=ROSN", tradingViewSymbol: "MOEX:ROSN", dataSource: "moex", dataTicker: "ROSN", description: "ПАО Роснефть — нефтяная компания", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "norilsk-nickel", name: "Норникель", slug: "gmkn", ticker: "GMKN", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=GMKN", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=GMKN", tradingViewSymbol: "MOEX:GMKN", dataSource: "moex", dataTicker: "GMKN", description: "ПАО ГМК Норильский никель", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "novatek", name: "Новатэк", slug: "nvtk", ticker: "NVTK", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=NVTK", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=NVTK", tradingViewSymbol: "MOEX:NVTK", dataSource: "moex", dataTicker: "NVTK", description: "ПАО Новатэк — газовая компания", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "polyus", name: "Полюс", slug: "plzl", ticker: "PLZL", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=PLZL", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=PLZL", tradingViewSymbol: "MOEX:PLZL", dataSource: "moex", dataTicker: "PLZL", description: "ПАО Полюс — золотодобывающая компания", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "magnit", name: "Магнит", slug: "mgnt", ticker: "MGNT", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=MGNT", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=MGNT", tradingViewSymbol: "MOEX:MGNT", dataSource: "moex", dataTicker: "MGNT", description: "ПАО Магнит — розничная сеть", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "vtb", name: "ВТБ", slug: "vtbr", ticker: "VTBR", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=VTBR", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=VTBR", tradingViewSymbol: "MOEX:VTBR", dataSource: "moex", dataTicker: "VTBR", description: "ПАО Банк ВТБ", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "tinkoff", name: "Тинькофф", slug: "tcsg", ticker: "TCSG", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=TCSG", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=TCSG", tradingViewSymbol: "MOEX:TCSG", dataSource: "moex", dataTicker: "TCSG", description: "ТКС Холдинг (Тинькофф)", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "mts", name: "МТС", slug: "mtss", ticker: "MTSS", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=MTSS", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=MTSS", tradingViewSymbol: "MOEX:MTSS", dataSource: "moex", dataTicker: "MTSS", description: "ПАО МТС — телекоммуникации", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "aeroflot", name: "Аэрофлот", slug: "aflt", ticker: "AFLT", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=AFLT", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=AFLT", tradingViewSymbol: "MOEX:AFLT", dataSource: "moex", dataTicker: "AFLT", description: "ПАО Аэрофлот — авиакомпания", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "alrosa", name: "Алроса", slug: "alrs", ticker: "ALRS", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=ALRS", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=ALRS", tradingViewSymbol: "MOEX:ALRS", dataSource: "moex", dataTicker: "ALRS", description: "ПАО Алроса — алмазодобывающая компания", categorySlug: "ru-stocks", instrumentType: "stock" },
    { assetSlug: "nlmk", name: "НЛМК", slug: "nlmk", ticker: "NLMK", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=NLMK", externalUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=NLMK", tradingViewSymbol: "MOEX:NLMK", dataSource: "moex", dataTicker: "NLMK", description: "ПАО НЛМК — металлургия", categorySlug: "ru-stocks", instrumentType: "stock" },

    // ══════ МЕТАЛЛЫ (MOEX FORTS) ══════
    { assetSlug: "gold", name: "Золото (MOEX)", slug: "gold", ticker: "GOLD", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=GOLD", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=GOLD", tradingViewSymbol: "MOEX:GOLD1!", dataSource: "moex", dataTicker: "GOLD", description: "Фьючерс на золото", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "silver", name: "Серебро (MOEX)", slug: "silv", ticker: "SILV", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=SILV", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=SILV", tradingViewSymbol: "MOEX:SILV1!", dataSource: "moex", dataTicker: "SILV", description: "Фьючерс на серебро", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "platinum", name: "Платина (MOEX)", slug: "plt", ticker: "PLT", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=PT", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=PT", tradingViewSymbol: "MOEX:PLT1!", dataSource: "moex", dataTicker: "PLT", description: "Фьючерс на платину", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "palladium", name: "Палладий (MOEX)", slug: "pld", ticker: "PLD", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=PD", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=PD", tradingViewSymbol: "MOEX:PLD1!", dataSource: "moex", dataTicker: "PLD", description: "Фьючерс на палладий", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "copper", name: "Медь (MOEX)", slug: "cu", ticker: "CU", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=CU", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=CU", tradingViewSymbol: "MOEX:CU1!", dataSource: "moex", dataTicker: "CU", description: "Фьючерс на медь", categorySlug: "metals", instrumentType: "futures" },

    // ══════ СЫРЬЁ (MOEX FORTS) ══════
    { assetSlug: "oil", name: "Нефть Brent (MOEX)", slug: "br", ticker: "BR", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=BR", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=BR", tradingViewSymbol: "MOEX:BR1!", dataSource: "moex", dataTicker: "BR", description: "Фьючерс на нефть Brent", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "gas", name: "Природный газ (MOEX)", slug: "ng", ticker: "NG", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=NG", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=NG", tradingViewSymbol: "MOEX:NG1!", dataSource: "moex", dataTicker: "NG", description: "Фьючерс на природный газ", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "wheat", name: "Пшеница (MOEX)", slug: "wheat", ticker: "WHEAT", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=W4", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=W4", tradingViewSymbol: "MOEX:W41!", dataSource: "moex", dataTicker: "WHEAT", description: "Фьючерс на пшеницу", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "sugar", name: "Сахар (MOEX)", slug: "sugar", ticker: "SUGAR", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=SA", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=SA", tradingViewSymbol: "MOEX:SA1!", dataSource: "moex", dataTicker: "SUGAR", description: "Фьючерс на сахар", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "cocoa", name: "Какао (MOEX)", slug: "cocoa", ticker: "COCOA", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=CC", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=CC", tradingViewSymbol: "MOEX:CC1!", dataSource: "moex", dataTicker: "COCOA", description: "Фьючерс на какао", categorySlug: "commodities", instrumentType: "futures" },

    // ══════ ВАЛЮТА (MOEX) ══════
    { assetSlug: "usd-rub", name: "Доллар/Рубль (Si)", slug: "si", ticker: "Si", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=Si", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=Si", tradingViewSymbol: "MOEX:SI1!", dataSource: "moex", dataTicker: "Si", description: "Фьючерс на доллар/рубль", categorySlug: "currencies", instrumentType: "currency" },
    { assetSlug: "eur-usd", name: "Евро/Рубль (Eu)", slug: "eu", ticker: "Eu", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=Eu", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=Eu", tradingViewSymbol: "MOEX:EU1!", dataSource: "moex", dataTicker: "Eu", description: "Фьючерс на евро/рубль", categorySlug: "currencies", instrumentType: "currency" },
    { assetSlug: "cny-rub", name: "Юань/Рубль (CR)", slug: "cny", ticker: "CR", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=CR", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=CR", tradingViewSymbol: "MOEX:CR1!", dataSource: "moex", dataTicker: "CR", description: "Фьючерс на юань/рубль", categorySlug: "currencies", instrumentType: "currency" },

    // ══════ ИНДЕКСЫ (MOEX) ══════
    { assetSlug: "moex-index", name: "Индекс МосБиржи (MIX)", slug: "imoex", ticker: "MIX", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=MX", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=MX", tradingViewSymbol: "MOEX:MX1!", dataSource: "moex", dataTicker: "MIX", description: "Вечный фьючерс на индекс МосБиржи", categorySlug: "indices", instrumentType: "futures" },
    { assetSlug: "rts-index", name: "Индекс РТС (RTS)", slug: "rts", ticker: "RTS", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=RI", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=RI", tradingViewSymbol: "MOEX:RI1!", dataSource: "moex", dataTicker: "RTS", description: "Фьючерс на индекс РТС", categorySlug: "indices", instrumentType: "futures" },
    { assetSlug: "nasdaq100", name: "NASDAQ 100 (MOEX)", slug: "nasd", ticker: "NASD", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=NA", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=NA", tradingViewSymbol: "MOEX:NA1!", dataSource: "moex", dataTicker: "NASD", description: "Фьючерс на NASDAQ 100", categorySlug: "indices", instrumentType: "futures" },
    { assetSlug: "sp500", name: "S&P 500 (MOEX)", slug: "spx", ticker: "SPYF", exchange: "MOEX", exchangeSlug: "moex", exchangeUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=SF", externalUrl: "https://www.moex.com/ru/derivatives/contracts.aspx?search=SF", tradingViewSymbol: "MOEX:SF1!", dataSource: "moex", dataTicker: "SPYF", description: "Фьючерс на S&P 500", categorySlug: "indices", instrumentType: "futures" },

    // ══════ CME / NYMEX — COMMODITY FUTURES ══════
    { assetSlug: "oil", name: "WTI Crude Oil (CME)", slug: "cme-cl", ticker: "CL", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.html", externalUrl: "https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.html", tradingViewSymbol: "CME:CL1!", dataSource: null, dataTicker: null, description: "WTI Crude Oil Futures (NYMEX)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "gas", name: "Natural Gas (CME)", slug: "cme-ng", ticker: "NG", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/energy/natural-gas/natural-gas.html", externalUrl: "https://www.cmegroup.com/markets/energy/natural-gas/natural-gas.html", tradingViewSymbol: "CME:NG1!", dataSource: null, dataTicker: null, description: "Henry Hub Natural Gas Futures (NYMEX)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "gold", name: "Gold (COMEX)", slug: "cme-gc", ticker: "GC", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/precious/gold.html", externalUrl: "https://www.cmegroup.com/markets/metals/precious/gold.html", tradingViewSymbol: "CME:GC1!", dataSource: null, dataTicker: null, description: "Gold Futures (COMEX)", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "silver", name: "Silver (COMEX)", slug: "cme-si", ticker: "SI", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/precious/silver.html", externalUrl: "https://www.cmegroup.com/markets/metals/precious/silver.html", tradingViewSymbol: "CME:SI1!", dataSource: null, dataTicker: null, description: "Silver Futures (COMEX)", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "copper", name: "Copper (COMEX)", slug: "cme-hg", ticker: "HG", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/base/copper.html", externalUrl: "https://www.cmegroup.com/markets/metals/base/copper.html", tradingViewSymbol: "CME:HG1!", dataSource: null, dataTicker: null, description: "Copper Futures (COMEX)", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "platinum", name: "Platinum (NYMEX)", slug: "cme-pl", ticker: "PL", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/precious/platinum.html", externalUrl: "https://www.cmegroup.com/markets/metals/precious/platinum.html", tradingViewSymbol: "CME:PL1!", dataSource: null, dataTicker: null, description: "Platinum Futures (NYMEX)", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "corn", name: "Corn (CBOT)", slug: "cme-zc", ticker: "ZC", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/agriculture/grains/corn.html", externalUrl: "https://www.cmegroup.com/markets/agriculture/grains/corn.html", tradingViewSymbol: "CME:ZC1!", dataSource: null, dataTicker: null, description: "Corn Futures (CBOT)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "wheat", name: "Wheat (CBOT)", slug: "cme-zw", ticker: "ZW", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/agriculture/grains/wheat.html", externalUrl: "https://www.cmegroup.com/markets/agriculture/grains/wheat.html", tradingViewSymbol: "CME:ZW1!", dataSource: null, dataTicker: null, description: "Wheat Futures (CBOT)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "soy", name: "Soybean (CBOT)", slug: "cme-zs", ticker: "ZS", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/agriculture/oilseeds/soybean.html", externalUrl: "https://www.cmegroup.com/markets/agriculture/oilseeds/soybean.html", tradingViewSymbol: "CME:ZS1!", dataSource: null, dataTicker: null, description: "Soybean Futures (CBOT)", categorySlug: "commodities", instrumentType: "futures" },

    // ══════ CME — INDEX FUTURES ══════
    { assetSlug: "sp500", name: "E-mini S&P 500", slug: "cme-es", ticker: "ES", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html", externalUrl: "https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html", tradingViewSymbol: "CME:ES1!", dataSource: null, dataTicker: null, description: "E-mini S&P 500 Futures", categorySlug: "indices", instrumentType: "futures" },
    { assetSlug: "nasdaq100", name: "E-mini Nasdaq 100", slug: "cme-nq", ticker: "NQ", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.html", externalUrl: "https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.html", tradingViewSymbol: "CME:NQ1!", dataSource: null, dataTicker: null, description: "E-mini Nasdaq 100 Futures", categorySlug: "indices", instrumentType: "futures" },
    { assetSlug: "dow-jones", name: "E-mini Dow Jones", slug: "cme-ym", ticker: "YM", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/equities/dow-jones/e-mini-dow.html", externalUrl: "https://www.cmegroup.com/markets/equities/dow-jones/e-mini-dow.html", tradingViewSymbol: "CME:YM1!", dataSource: null, dataTicker: null, description: "E-mini Dow Jones Futures (CBOT)", categorySlug: "indices", instrumentType: "futures" },
    { assetSlug: "russell2000", name: "E-mini Russell 2000", slug: "cme-rty", ticker: "RTY", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/equities/russell/e-mini-russell-2000.html", externalUrl: "https://www.cmegroup.com/markets/equities/russell/e-mini-russell-2000.html", tradingViewSymbol: "CME:RTY1!", dataSource: null, dataTicker: null, description: "E-mini Russell 2000 Futures", categorySlug: "indices", instrumentType: "futures" },

    // ══════ CME — CURRENCY FUTURES ══════
    { assetSlug: "eur-usd", name: "Euro FX Futures", slug: "cme-6e", ticker: "6E", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/fx/g10/euro-fx.html", externalUrl: "https://www.cmegroup.com/markets/fx/g10/euro-fx.html", tradingViewSymbol: "CME:6E1!", dataSource: null, dataTicker: null, description: "Euro FX Futures (CME)", categorySlug: "currencies", instrumentType: "currency" },
    { assetSlug: null, name: "Japanese Yen Futures", slug: "cme-6j", ticker: "6J", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/fx/g10/japanese-yen.html", externalUrl: "https://www.cmegroup.com/markets/fx/g10/japanese-yen.html", tradingViewSymbol: "CME:6J1!", dataSource: null, dataTicker: null, description: "Japanese Yen Futures (CME)", categorySlug: "currencies", instrumentType: "currency" },
    { assetSlug: "usd-rub", name: "US Dollar Index", slug: "cme-dx", ticker: "DX", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/fx/us-dollar/us-dollar-index.html", externalUrl: "https://www.cmegroup.com/markets/fx/us-dollar/us-dollar-index.html", tradingViewSymbol: "ICEUS:DX1!", dataSource: null, dataTicker: null, description: "US Dollar Index Futures (ICE)", categorySlug: "currencies", instrumentType: "currency" },

    // ══════ АКЦИИ США (NYSE/NASDAQ) ══════
    { assetSlug: "apple", name: "Apple Inc", slug: "aapl", ticker: "AAPL", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:AAPL", dataSource: null, dataTicker: null, description: "Apple Inc — технологическая компания", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "tesla", name: "Tesla Inc", slug: "tsla", ticker: "TSLA", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:TSLA", dataSource: null, dataTicker: null, description: "Tesla Inc — электромобили и энергетика", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "microsoft", name: "Microsoft Corp", slug: "msft", ticker: "MSFT", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:MSFT", dataSource: null, dataTicker: null, description: "Microsoft Corporation", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "amazon", name: "Amazon.com Inc", slug: "amzn", ticker: "AMZN", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:AMZN", dataSource: null, dataTicker: null, description: "Amazon.com Inc", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "google", name: "Alphabet Inc", slug: "googl", ticker: "GOOGL", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:GOOGL", dataSource: null, dataTicker: null, description: "Alphabet Inc (Google)", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "nvidia", name: "NVIDIA Corp", slug: "nvda", ticker: "NVDA", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:NVDA", dataSource: null, dataTicker: null, description: "NVIDIA Corporation — GPU и AI", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "meta", name: "Meta Platforms", slug: "meta", ticker: "META", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:META", dataSource: null, dataTicker: null, description: "Meta Platforms (Facebook)", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "netflix", name: "Netflix Inc", slug: "nflx", ticker: "NFLX", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:NFLX", dataSource: null, dataTicker: null, description: "Netflix Inc — стриминг", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "amd", name: "AMD", slug: "amd", ticker: "AMD", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:AMD", dataSource: null, dataTicker: null, description: "Advanced Micro Devices", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "intel", name: "Intel Corp", slug: "intc", ticker: "INTC", exchange: "NASDAQ", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:INTC", dataSource: null, dataTicker: null, description: "Intel Corporation", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "jpmorgan", name: "JPMorgan Chase", slug: "jpm", ticker: "JPM", exchange: "NYSE", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NYSE:JPM", dataSource: null, dataTicker: null, description: "JPMorgan Chase & Co", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "berkshire", name: "Berkshire Hathaway", slug: "brk-b", ticker: "BRK.B", exchange: "NYSE", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NYSE:BRK.B", dataSource: null, dataTicker: null, description: "Berkshire Hathaway (Warren Buffett)", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "visa", name: "Visa Inc", slug: "v", ticker: "V", exchange: "NYSE", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NYSE:V", dataSource: null, dataTicker: null, description: "Visa Inc — платёжная система", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "coca-cola", name: "Coca-Cola Co", slug: "ko", ticker: "KO", exchange: "NYSE", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NYSE:KO", dataSource: null, dataTicker: null, description: "The Coca-Cola Company", categorySlug: "us-stocks", instrumentType: "stock" },
    { assetSlug: "disney", name: "Walt Disney Co", slug: "dis", ticker: "DIS", exchange: "NYSE", exchangeSlug: "nyse", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NYSE:DIS", dataSource: null, dataTicker: null, description: "The Walt Disney Company", categorySlug: "us-stocks", instrumentType: "stock" },

    // ══════ HKEX — INDEX FUTURES (keep for indices) ══════
    { assetSlug: "hang-seng", name: "Hang Seng Index Futures", slug: "hsi-fut", ticker: "HSI", exchange: "HKEX", exchangeSlug: "hkex", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "HKEX:HSI1!", dataSource: null, dataTicker: null, description: "Hang Seng Index Futures", categorySlug: "indices", instrumentType: "futures" },
    { assetSlug: "hscei", name: "HS China Enterprises Futures", slug: "hscei-fut", ticker: "HSCEI", exchange: "HKEX", exchangeSlug: "hkex", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "HKEX:HSCEI1!", dataSource: null, dataTicker: null, description: "Hang Seng China Enterprises Index Futures", categorySlug: "indices", instrumentType: "futures" },

    // ══════ ICE — COMMODITY FUTURES ══════
    { assetSlug: "oil", name: "Brent Crude (ICE)", slug: "ice-brn", ticker: "BRN", exchange: "ICE", exchangeSlug: "lse", exchangeUrl: "https://www.theice.com/products/219/Brent-Crude-Futures", externalUrl: "https://www.theice.com/products/219/Brent-Crude-Futures", tradingViewSymbol: "ICE:BRN1!", dataSource: null, dataTicker: null, description: "ICE Brent Crude Futures", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "euro-gas", name: "ICE Gasoil", slug: "ice-gasoil", ticker: "GASOIL", exchange: "ICE", exchangeSlug: "lse", exchangeUrl: "https://www.theice.com/products/34361119/Low-Sulphur-Gasoil-Futures", externalUrl: "https://www.theice.com/products/34361119/Low-Sulphur-Gasoil-Futures", tradingViewSymbol: "ICE:GASOIL1!", dataSource: null, dataTicker: null, description: "ICE Low Sulphur Gasoil Futures", categorySlug: "commodities", instrumentType: "futures" },

    // ══════ СПОТ ИНДЕКСЫ ══════
    { assetSlug: "sp500", name: "S&P 500 (спот)", slug: "spx-spot", ticker: "SPX", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "SP:SPX", dataSource: null, dataTicker: null, description: "Индекс S&P 500 — спотовое значение", categorySlug: "indices", instrumentType: "spot" },
    { assetSlug: "nasdaq100", name: "Nasdaq 100 (спот)", slug: "ndx-spot", ticker: "NDX", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "NASDAQ:NDX", dataSource: null, dataTicker: null, description: "Индекс Nasdaq 100 — спотовое значение", categorySlug: "indices", instrumentType: "spot" },
    { assetSlug: "moex-index", name: "IMOEX (спот)", slug: "imoex-spot", ticker: "IMOEX", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: "https://www.moex.com/ru/index/IMOEX", tradingViewSymbol: "MOEX:IMOEX", dataSource: null, dataTicker: null, description: "Индекс МосБиржи — спотовое значение", categorySlug: "indices", instrumentType: "spot" },
    { assetSlug: "hang-seng", name: "Hang Seng (спот)", slug: "hsi-spot", ticker: "HSI", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "HSI:HSI", dataSource: null, dataTicker: null, description: "Hang Seng Index — спотовое значение", categorySlug: "indices", instrumentType: "spot" },
    { assetSlug: "ftse100", name: "FTSE 100 (спот)", slug: "ftse100-spot", ticker: "FTSE", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "FTSE:UKX", dataSource: null, dataTicker: null, description: "FTSE 100 Index — спотовое значение", categorySlug: "indices", instrumentType: "spot" },
    { assetSlug: "dax40", name: "DAX 40 (спот)", slug: "dax-spot", ticker: "DAX", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "XETR:DAX", dataSource: null, dataTicker: null, description: "DAX 40 Index — спотовое значение", categorySlug: "indices", instrumentType: "spot" },
    { assetSlug: "nikkei225", name: "Nikkei 225 (спот)", slug: "nikkei-spot", ticker: "NI225", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:NI225", dataSource: null, dataTicker: null, description: "Nikkei 225 Index — спотовое значение", categorySlug: "indices", instrumentType: "spot" },

    // ══════ СПОТ СЫРЬЁ ══════
    { assetSlug: "oil", name: "Brent (спот)", slug: "brent-spot", ticker: "BRENT", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:UKOIL", dataSource: null, dataTicker: null, description: "Нефть Brent — спотовая цена", categorySlug: "commodities", instrumentType: "spot" },
    { assetSlug: "oil", name: "WTI (спот)", slug: "wti-spot", ticker: "WTI", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:USOIL", dataSource: null, dataTicker: null, description: "Нефть WTI — спотовая цена", categorySlug: "commodities", instrumentType: "spot" },
    { assetSlug: "gold", name: "Золото (спот)", slug: "gold-spot", ticker: "XAUUSD", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:GOLD", dataSource: null, dataTicker: null, description: "Золото — спотовая цена (XAU/USD)", categorySlug: "metals", instrumentType: "spot" },
    { assetSlug: "silver", name: "Серебро (спот)", slug: "silver-spot", ticker: "XAGUSD", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:SILVER", dataSource: null, dataTicker: null, description: "Серебро — спотовая цена (XAG/USD)", categorySlug: "metals", instrumentType: "spot" },
    { assetSlug: "gas", name: "Природный газ (спот)", slug: "natgas-spot", ticker: "NATGAS", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:NATGAS", dataSource: null, dataTicker: null, description: "Природный газ — спотовая цена", categorySlug: "commodities", instrumentType: "spot" },

    // Споты металлов (недостающие)
    { assetSlug: "platinum", name: "Платина (спот)", slug: "platinum-spot", ticker: "XPTUSD", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:PLATINUM", dataSource: null, dataTicker: null, description: "Платина — спотовая цена", categorySlug: "metals", instrumentType: "spot" },
    { assetSlug: "palladium", name: "Палладий (спот)", slug: "palladium-spot", ticker: "XPDUSD", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:PALLADIUM", dataSource: null, dataTicker: null, description: "Палладий — спотовая цена", categorySlug: "metals", instrumentType: "spot" },
    { assetSlug: "copper", name: "Медь (спот)", slug: "copper-spot", ticker: "XCUUSD", exchange: "SPOT", exchangeSlug: "spot", exchangeUrl: null, externalUrl: null, tradingViewSymbol: "TVC:COPPER", dataSource: null, dataTicker: null, description: "Медь — спотовая цена", categorySlug: "metals", instrumentType: "spot" },

    // CME/ICE тикеры для недостающих сырьевых
    { assetSlug: "coffee", name: "Coffee C (ICE)", slug: "ice-kc", ticker: "KC", exchange: "ICE", exchangeSlug: "lse", exchangeUrl: "https://www.theice.com/products/15/Coffee-C-Futures", externalUrl: "https://www.theice.com/products/15/Coffee-C-Futures", tradingViewSymbol: "ICE:KC1!", dataSource: null, dataTicker: null, description: "Coffee C Futures (ICE)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "gasoline", name: "RBOB Gasoline (NYMEX)", slug: "cme-rb", ticker: "RB", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/energy/refined-products/rbob-gasoline.html", externalUrl: "https://www.cmegroup.com/markets/energy/refined-products/rbob-gasoline.html", tradingViewSymbol: "CME:RB1!", dataSource: null, dataTicker: null, description: "RBOB Gasoline Futures (NYMEX)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "orange-juice", name: "Orange Juice (ICE)", slug: "ice-oj", ticker: "OJ", exchange: "ICE", exchangeSlug: "lse", exchangeUrl: "https://www.theice.com/products/30/FCOJ-A-Futures", externalUrl: "https://www.theice.com/products/30/FCOJ-A-Futures", tradingViewSymbol: "ICE:OJ1!", dataSource: null, dataTicker: null, description: "Frozen Concentrated Orange Juice (ICE)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "sugar", name: "Sugar No.11 (ICE)", slug: "ice-sb", ticker: "SB", exchange: "ICE", exchangeSlug: "lse", exchangeUrl: "https://www.theice.com/products/23/Sugar-No-11-Futures", externalUrl: "https://www.theice.com/products/23/Sugar-No-11-Futures", tradingViewSymbol: "ICE:SB1!", dataSource: null, dataTicker: null, description: "Sugar No.11 Futures (ICE)", categorySlug: "commodities", instrumentType: "futures" },
    { assetSlug: "cocoa", name: "Cocoa (ICE)", slug: "ice-cc", ticker: "CC", exchange: "ICE", exchangeSlug: "lse", exchangeUrl: "https://www.theice.com/products/7/Cocoa-Futures", externalUrl: "https://www.theice.com/products/7/Cocoa-Futures", tradingViewSymbol: "ICE:CC1!", dataSource: null, dataTicker: null, description: "Cocoa Futures (ICE)", categorySlug: "commodities", instrumentType: "futures" },

    // CME металлы (недостающие)
    { assetSlug: "silver", name: "Silver (COMEX)", slug: "cme-si", ticker: "SI", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/precious/silver.html", externalUrl: "https://www.cmegroup.com/markets/metals/precious/silver.html", tradingViewSymbol: "CME:SI1!", dataSource: null, dataTicker: null, description: "Silver Futures (COMEX)", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "platinum", name: "Platinum (NYMEX)", slug: "cme-pl", ticker: "PL", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/precious/platinum.html", externalUrl: "https://www.cmegroup.com/markets/metals/precious/platinum.html", tradingViewSymbol: "CME:PL1!", dataSource: null, dataTicker: null, description: "Platinum Futures (NYMEX)", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "palladium", name: "Palladium (NYMEX)", slug: "cme-pa", ticker: "PA", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/precious/palladium.html", externalUrl: "https://www.cmegroup.com/markets/metals/precious/palladium.html", tradingViewSymbol: "CME:PA1!", dataSource: null, dataTicker: null, description: "Palladium Futures (NYMEX)", categorySlug: "metals", instrumentType: "futures" },
    { assetSlug: "copper", name: "Copper (COMEX)", slug: "cme-hg", ticker: "HG", exchange: "CME", exchangeSlug: "cme", exchangeUrl: "https://www.cmegroup.com/markets/metals/base/copper.html", externalUrl: "https://www.cmegroup.com/markets/metals/base/copper.html", tradingViewSymbol: "CME:HG1!", dataSource: null, dataTicker: null, description: "Copper Futures (COMEX)", categorySlug: "metals", instrumentType: "futures" },
  ];

  const instruments: Record<string, string> = {};
  for (const inst of instrumentData) {
    const created = await prisma.instrument.upsert({
      where: { slug: inst.slug },
      update: {
        name: inst.name,
        ticker: inst.ticker,
        exchange: inst.exchange,
        exchangeUrl: inst.exchangeUrl,
        tradingViewSymbol: inst.tradingViewSymbol,
        dataSource: inst.dataSource,
        dataTicker: inst.dataTicker,
        description: inst.description,
        categoryId: cats[inst.categorySlug],
        exchangeId: exchanges[inst.exchangeSlug] || null,
        externalUrl: inst.externalUrl || inst.exchangeUrl || null,
        instrumentType: inst.instrumentType || null,
        assetId: inst.assetSlug ? (assets[inst.assetSlug] || null) : null,
      },
      create: {
        name: inst.name,
        slug: inst.slug,
        categoryId: cats[inst.categorySlug],
        exchangeId: exchanges[inst.exchangeSlug] || null,
        ticker: inst.ticker,
        exchange: inst.exchange,
        exchangeUrl: inst.exchangeUrl,
        tradingViewSymbol: inst.tradingViewSymbol,
        dataSource: inst.dataSource,
        dataTicker: inst.dataTicker,
        externalUrl: inst.externalUrl || inst.exchangeUrl || null,
        instrumentType: inst.instrumentType || null,
        description: inst.description,
        assetId: inst.assetSlug ? (assets[inst.assetSlug] || null) : null,
      },
    });
    instruments[inst.slug] = created.id;

    // Create chat room for each instrument (backward compat)
    await prisma.chatRoom.upsert({
      where: { instrumentId: created.id },
      update: {},
      create: {
        name: inst.name,
        instrumentId: created.id,
      },
    });
  }

  console.log(`${instrumentData.length} instruments created with chat rooms`);


  // ─── Related Instruments (bidirectional) ─────────────────────────────
  const relations = [
    // Oil: BR (MOEX) ↔ CL (CME) ↔ BRN (ICE) ↔ Brent spot
    ["br", "cme-cl"], ["br", "ice-brn"], ["br", "brent-spot"],
    ["cme-cl", "ice-brn"], ["cme-cl", "brent-spot"], ["ice-brn", "brent-spot"],
    // Gold: GOLD (MOEX) ↔ GC (CME) ↔ Gold spot
    ["gold", "cme-gc"], ["gold", "gold-spot"], ["cme-gc", "gold-spot"],
    // Silver: SILV (MOEX) ↔ SI (CME) ↔ Silver spot
    ["silv", "cme-si"], ["silv", "silver-spot"], ["cme-si", "silver-spot"],
    // Natural Gas: NG (MOEX) ↔ NG (CME) ↔ NG spot
    ["ng", "cme-ng"], ["ng", "natgas-spot"], ["cme-ng", "natgas-spot"],
    // Dollar/Ruble: Si (MOEX) ↔ DX (CME)
    ["si", "cme-dx"],
    // Index: MIX (MOEX) ↔ IMOEX spot, RTS ↔ IMOEX
    ["imoex", "imoex-spot"], ["rts", "imoex-spot"],
    // S&P: SPYF (MOEX) ↔ ES (CME) ↔ SPX spot
    ["spx", "cme-es"], ["spx", "spx-spot"], ["cme-es", "spx-spot"],
    // Nasdaq: NASD (MOEX) ↔ NQ (CME) ↔ NDX spot
    ["nasd", "cme-nq"], ["nasd", "ndx-spot"], ["cme-nq", "ndx-spot"],
    // Wheat: WHEAT (MOEX) ↔ ZW (CME)
    ["wheat", "cme-zw"],
    // Platinum: PLT (MOEX) ↔ PL (CME)
    ["plt", "cme-pl"],
    // Copper: CU (MOEX) ↔ HG (CME)
    ["cu", "cme-hg"],
  ];

  let relCount = 0;
  for (const [slugA, slugB] of relations) {
    const idA = instruments[slugA];
    const idB = instruments[slugB];
    if (idA && idB) {
      await prisma.instrumentRelation.createMany({
        data: [
          { instrumentId: idA, relatedId: idB },
          { instrumentId: idB, relatedId: idA },
        ],
        skipDuplicates: true,
      });
      relCount++;
    }
  }
  console.log(`${relCount} instrument relations created`);


  // ─── Test Ideas ──────────────────────────────────────────────────────
  const ideaData = [
    {
      author: trader1.id,
      title: "BTC: пробой 100K неминуем",
      preview: "Биткоин формирует бычий флаг на дневном графике. Объёмы растут, RSI не перекуплен.",
      content: "Детальный анализ:\n\n1. На дневном графике BTC/USDT формируется бычий флаг после импульса с 85K до 98K.\n2. Объёмы на пробое выше средних значений на 40%.\n3. RSI(14) = 62, есть запас для роста.\n4. Уровень сопротивления 100,000 тестировался 3 раза.\n\nЦель: 108,000-112,000\nСтоп: 92,500\nСоотношение R:R = 1:3",
      isPaid: false,
      instruments: ["btc"],
    },
    {
      author: trader1.id,
      title: "ETH/BTC: ротация в альты начинается",
      preview: "Пара ETH/BTC отскакивает от многолетней поддержки. Доминация BTC снижается.",
      content: "Наблюдаю разворот пары ETH/BTC от уровня 0.032.\n\nДоминация BTC снизилась с 58% до 54% за последние 2 недели. Это классический сигнал начала альт-сезона.\n\nПокупаю ETH с целью 0.045 по паре к BTC.\n\nДополнительно слежу за SOL и XRP — они обычно растут следом.",
      isPaid: true,
      price: 200,
      instruments: ["eth", "btc", "sol"],
    },
    {
      author: analyst.id,
      title: "Сбербанк: дивидендный гэп закрыт, покупка",
      preview: "SBER закрыл дивидендный гэп за 2 месяца. Фундаментальные показатели сильные.",
      content: "Фундаментальный анализ Сбербанка:\n\n- P/E = 4.2 (историческая средняя 6.5)\n- ROE > 25%\n- Дивидендная доходность ~12% годовых\n- Прибыль за 2025 рекордная\n\nТехнически: цена вернулась к pre-gap уровню 320 руб. Консолидация выше 315 — сигнал к продолжению роста.\n\nЦель: 360 руб (+12%)\nГоризонт: 3-6 месяцев",
      isPaid: false,
      instruments: ["sber"],
    },
    {
      author: analyst.id,
      title: "Газпром: ждём отчёт, риски сохраняются",
      preview: "GAZP торгуется на минимумах. Отчёт за 2025 может стать катализатором.",
      content: "Газпром остаётся спорной историей.\n\nПозитив:\n- Восстановление экспорта в Азию\n- Дисконт к NAV > 60%\n- Потенциальные дивиденды\n\nНегатив:\n- Долговая нагрузка растёт\n- Инвестиционная программа непрозрачна\n- Политические риски\n\nРекомендация: ДЕРЖАТЬ. Не покупать до отчёта.",
      isPaid: false,
      instruments: ["gazp"],
    },
    {
      author: ivan.id,
      title: "Si: шорт от 95000",
      preview: "Фьючерс Si перекуплен, ожидаю откат к 92000. Внутридневная идея.",
      content: "Скальперская идея на фьючерс Si (доллар/рубль).\n\nОткрываю шорт от 95000:\n- ЦБ РФ удерживает ставку, рубль крепнет\n- Нефть выше $80 поддерживает бюджет\n- Объёмы на покупку снижаются в стакане\n\nЦель: 92000\nСтоп: 95800\nR:R = 1:3.75",
      isPaid: true,
      price: 100,
      instruments: ["si"],
    },
    {
      author: trader1.id,
      title: "Нефть Brent: лонг на откате",
      preview: "BR корректируется после роста. Уровень $78 — зона покупки.",
      content: "Нефть Brent (BR) скорректировалась от $84 до $79.\n\nПочему покупаю на $78:\n1. OPEC+ сохраняет ограничения\n2. Летний спрос на топливо\n3. Уровень $78 = 50% коррекции + скользящая MA200\n4. Сентимент рынка умеренно-бычий\n\nПозиция: лонг BR от 78\nТейк: 85\nСтоп: 76",
      isPaid: false,
      instruments: ["br"],
    },
    {
      author: analyst.id,
      title: "EUR/USD: ожидаю укрепление евро",
      preview: "ЕЦБ готовит паузу в снижении ставок. Доллар слабеет.",
      content: "Макроанализ пары EUR/USD:\n\n1. ЕЦБ сигнализирует паузу в цикле снижения ставок\n2. ФРС, напротив, может снизить ставку в Q2\n3. Дифференциал ставок сужается — позитив для EUR\n\nТехнически: пара формирует двойное дно на 1.0720.\n\nЦель: 1.1050\nГоризонт: 1-2 месяца",
      isPaid: false,
      instruments: ["si"],
    },
    {
      author: ivan.id,
      title: "SOL: пробой треугольника",
      preview: "Solana сжимается в симметричном треугольнике. Пробой вверх высоковероятен.",
      content: "Solana (SOL/USDT) 4h график:\n\nФормация: симметричный треугольник последние 2 недели\nОбъёмы: снижаются (классика перед пробоем)\nRSI: нейтральный, 50\n\nПокупаю пробой выше $180 с подтверждением объёмом.\nЦель 1: $210\nЦель 2: $240\nСтоп: $168",
      isPaid: true,
      price: 150,
      instruments: ["sol"],
    },
    {
      author: analyst.id,
      title: "Золото: защитный актив в портфель",
      preview: "Золото продолжает ралли на фоне геополитики и инфляции.",
      content: "Золото (GOLD) обновляет исторические максимумы.\n\nДрайверы:\n- Центральные банки продолжают скупать золото\n- Геополитическая неопределённость\n- Инфляция остаётся выше целевых уровней\n\nРекомендация: выделить 10-15% портфеля на золото.\nФормат: фьючерс GOLD на MOEX или ETF GLDRUB.\n\nЦелевой диапазон: $2500-2700/oz к концу 2026.",
      isPaid: false,
      instruments: ["gold"],
    },
    {
      author: trader1.id,
      title: "YDEX: покупка после просадки",
      preview: "Яндекс упал на 8% за неделю без фундаментальных причин. Покупаю.",
      content: "Яндекс (YDEX) скорректировался на 8% без негативных новостей.\n\nФакторы:\n- Техническая коррекция после роста +40% за 3 месяца\n- Бизнес растёт: GMV Яндекс.Маркета +50% г/г\n- Рекламный бизнес стабилен\n- Оценка: EV/EBITDA = 8x (дёшево для IT)\n\nПокупаю на уровне 4200 руб.\nЦель: 5000 руб.\nСтоп: 3900 руб.",
      isPaid: false,
      instruments: ["ydex"],
    },
  ];

  for (const idea of ideaData) {
    const existing = await prisma.idea.findFirst({
      where: { title: idea.title, authorId: idea.author },
    });
    if (!existing) {
      const created = await prisma.idea.create({
        data: {
          authorId: idea.author,
          title: idea.title,
          preview: idea.preview,
          content: idea.content,
          isPaid: idea.isPaid,
          price: idea.price || null,
        },
      });
      for (const slug of idea.instruments) {
        if (instruments[slug]) {
          await prisma.ideaInstrument.create({
            data: { ideaId: created.id, instrumentId: instruments[slug] },
          });
        }
      }
    }
  }

  console.log("10 test ideas created");

  // ─── 25 Ideas for 5 new idea users (5 each, 2-3 paid) ─────────────
  const newIdeaData = [
    // ideaUser1 — Ольга Облигации (3 free + 2 paid)
    { author: ideaUser1.id, title: "ОФЗ 26238: лучшая длинная облигация 2026", preview: "Доходность ОФЗ 26238 на историческом максимуме. Покупка для фиксации ставки на 15 лет.", content: "ОФЗ 26238 — 15-летняя облигация с фиксированным купоном.\n\nТекущая доходность к погашению: 14.2% годовых.\nКупон: 7.1% (2 раза в год)\n\nПочему покупаю:\n1. ЦБ близок к началу цикла снижения ставки\n2. При снижении ставки до 10% цена вырастет на 25-30%\n3. Длинная дюрация = максимальный эффект от снижения ставок\n\nРиски: ставка может остаться высокой дольше ожиданий.\nГоризонт: 1-2 года.", isPaid: false, acceptDonations: true, instruments: ["ofz26238"] },
    { author: ideaUser1.id, title: "Корпоративные облигации: топ-5 для портфеля", preview: "Подборка надёжных корпоративных бондов с доходностью 15-17% годовых.", content: "Топ-5 корпоративных облигаций:\n\n1. Газпром Капитал БО-003 — 15.8% YTM, рейтинг AAA\n2. РЖД БО-13 — 15.2% YTM, рейтинг AAA\n3. МТС БО-05 — 16.1% YTM, рейтинг AA+\n4. Сегежа БО-02 — 17.5% YTM, рейтинг A+ (повышенный риск)\n5. Система БО-07 — 16.8% YTM, рейтинг AA-\n\nВсе облигации с фиксированным купоном, полугодовые выплаты.\nОптимальная стратегия: лесенка погашений через 1, 2, 3 года.", isPaid: true, price: 300, instruments: ["corp-bonds"] },
    { author: ideaUser1.id, title: "ОФЗ 26243 vs 26240: какую выбрать?", preview: "Сравнение двух популярных ОФЗ для разных стратегий.", content: "Сравнительный анализ:\n\nОФЗ 26243 (12 лет):\n- Доходность: 13.8%\n- Дюрация: 7.2\n- Для: агрессивных инвесторов\n\nОФЗ 26240 (7 лет):\n- Доходность: 13.2%\n- Дюрация: 4.8\n- Для: консервативных инвесторов\n\nМоя рекомендация: 60% в 26240, 40% в 26243.\nБаланс между доходностью и риском переоценки.", isPaid: false, acceptDonations: true, instruments: ["ofz26243", "ofz26240"] },
    { author: ideaUser1.id, title: "Еврооблигации: замещающие бонды РФ", preview: "Обзор замещающих еврооблигаций — валютная доходность внутри РФ.", content: "Замещающие еврооблигации — уникальная возможность:\n\n1. Номинал в USD, расчёты в рублях по курсу ЦБ\n2. Доходность 8-10% в валюте\n3. Защита от девальвации рубля\n4. Нет санкционных рисков\n\nТоп-пики:\n- Газпром замещ. 2027 — 9.2% USD\n- ЛУКОЙЛ замещ. 2030 — 8.8% USD\n- Норникель замещ. 2028 — 8.5% USD\n\nИдеально для валютной диверсификации портфеля.", isPaid: true, price: 500, instruments: ["eurobonds"] },
    { author: ideaUser1.id, title: "Стратегия: облигационная лесенка на 2026", preview: "Построение портфеля облигаций с ежемесячным доходом.", content: "Стратегия 'лесенка' — получаем купоны каждый месяц.\n\nПортфель на 1 млн рублей:\n- 200к: ОФЗ 26240 (купон март/сентябрь)\n- 200к: ОФЗ 26238 (купон май/ноябрь)\n- 200к: Газпром КО (купон январь/июль)\n- 200к: МТС БО (купон февраль/август)\n- 200к: РЖД БО (купон апрель/октябрь)\n\nИтого: ~14% годовых, купоны каждый месяц.\nРеинвестируем купоны = сложный процент.", isPaid: false, acceptDonations: true, instruments: ["ofz26238", "ofz26240", "corp-bonds"] },

    // ideaUser2 — Павел DeFi (2 free + 3 paid)
    { author: ideaUser2.id, title: "SOL: DeFi экосистема растёт экспоненциально", preview: "TVL на Solana утроился за квартал. Ключевые протоколы для заработка.", content: "Solana DeFi бум 2026:\n\nTVL вырос с $5B до $15B за Q1 2026.\n\nТоп протоколы:\n1. Marinade Finance — стейкинг SOL, APY 7.5%\n2. Raydium — AMM DEX, пулы ликвидности 20-50% APY\n3. Jupiter — агрегатор DEX, лучшие цены\n4. Kamino Finance — автостратегии, 15-25% APY\n\nМоя стратегия: 50% стейкинг + 50% LP в стабильных пулах.\nОжидаемая доходность: 15-20% годовых в SOL.", isPaid: true, price: 250, instruments: ["sol"] },
    { author: ideaUser2.id, title: "ETH: стейкинг через Lido — разбор рисков", preview: "Liquid staking на Ethereum через Lido. Доходность, риски, альтернативы.", content: "Lido — крупнейший протокол ликвидного стейкинга.\n\nТекущая доходность: 4.1% APY в ETH\n\nПлюсы:\n- Ликвидность stETH (можно продать в любой момент)\n- Автокомпаундинг\n- Нет минимальной суммы\n\nМинусы:\n- Smart contract risk\n- Depeg risk (stETH/ETH)\n- Комиссия 10% от наград\n\nАльтернативы: Rocket Pool (децентрализованнее), Coinbase cbETH (проще).\n\nМоя позиция: 60% Lido, 40% Rocket Pool.", isPaid: false, acceptDonations: true, instruments: ["eth"] },
    { author: ideaUser2.id, title: "BTC + ETH: оптимальное соотношение в крипто-портфеле", preview: "Как правильно распределить капитал между BTC и ETH в 2026.", content: "Анализ корреляции BTC/ETH за 5 лет:\n\nКорреляция: 0.85 (высокая, но не полная)\n\nОптимальный портфель по Марковицу:\n- Бычий рынок: 40% BTC / 60% ETH (ETH растёт быстрее)\n- Медвежий рынок: 70% BTC / 30% ETH (BTC падает меньше)\n- Нейтральный: 55% BTC / 45% ETH\n\nСейчас мы в начале бычьего цикла → рекомендую 40/60.\n\nРебалансировка: раз в месяц.", isPaid: true, price: 200, instruments: ["btc", "eth"] },
    { author: ideaUser2.id, title: "XRP: Ripple выиграет SEC — последствия для цены", preview: "Юридическая победа Ripple может отправить XRP к $5. Разбор сценариев.", content: "Ripple vs SEC: финальное решение ожидается в Q2 2026.\n\nСценарий 1 (победа, 60%): XRP → $4-5 (+100-150%)\nСценарий 2 (мировое, 30%): XRP → $3-3.5 (+50-75%)\nСценарий 3 (проигрыш, 10%): XRP → $1.2-1.5 (-40%)\n\nМатожидание положительное.\n\nМоя позиция: 5% портфеля в XRP.\nТочка входа: $2.0-2.2\nСтоп: $1.5\nТейк: $4.5", isPaid: true, price: 150, instruments: ["xrp"] },
    { author: ideaUser2.id, title: "BNB: токен Binance — недооценён рынком", preview: "BNB отстаёт от рынка. Фундаментальные причины для роста.", content: "BNB торгуется с дисконтом к историческим мультипликаторам.\n\nФакторы роста:\n1. Binance сжигает BNB каждый квартал\n2. Растущая экосистема BNB Chain\n3. Launchpool — пассивный доход 5-15% APY\n4. Binance Pay — рост транзакций\n\nТехнически: цена в зоне накопления $580-620.\n\nЦель: $800 (+35%)\nГоризонт: 3-6 месяцев\nРиск: регуляторное давление на Binance.", isPaid: false, acceptDonations: true, instruments: ["bnb"] },

    // ideaUser3 — Андрей Дивиденды (3 free + 2 paid)
    { author: ideaUser3.id, title: "Сбербанк: дивиденды 2026 — прогноз и стратегия", preview: "Прогноз дивидендов Сбера за 2025 год. Когда покупать для максимальной доходности.", content: "Прогноз дивидендов Сбербанка:\n\nПрибыль 2025: ~1.7 трлн руб (рекорд)\nPayout 50%: ~850 млрд руб\nДивиденд на акцию: ~38 руб\nДоходность: ~11.5% при цене 330 руб\n\nОптимальная стратегия:\n1. Покупать за 2-3 месяца до отсечки\n2. Исторически гэп закрывается за 1-2 месяца\n3. Держать через отсечку + продать после закрытия гэпа\n\nОжидаемая отсечка: июль 2026\nТочка входа: ниже 320 руб.", isPaid: false, acceptDonations: true, instruments: ["sber"] },
    { author: ideaUser3.id, title: "Дивидендный портфель MOEX: топ-10 акций", preview: "Портфель голубых фишек с дивдоходностью 12-15% годовых.", content: "Мой дивидендный портфель на 2026:\n\n1. Сбербанк (SBER) — 11.5% div yield\n2. ЛУКОЙЛ (LKOH) — 13.2% div yield\n3. Роснефть (ROSN) — 10.8% div yield\n4. Газпром нефть — 14.1% div yield\n5. МТС — 12.5% div yield\n6. Транснефть преф — 11.0% div yield\n7. Банк СПб — 15.2% div yield\n8. Северсталь — 13.8% div yield\n9. НЛМК — 12.0% div yield\n10. Фосагро — 11.5% div yield\n\nСредняя доходность портфеля: 12.6%\nРебалансировка: раз в квартал.", isPaid: true, price: 400, instruments: ["sber", "lkoh", "rosn"] },
    { author: ideaUser3.id, title: "ЛУКОЙЛ: лучшая нефтяная дивидендная история", preview: "ЛУКОЙЛ платит 100% FCF дивидендами. Разбор и прогноз.", content: "ЛУКОЙЛ — эталон дивидендной политики:\n\n- Дивидендная политика: 100% скорр. FCF\n- Дивиденды 2025: ~1100 руб/акцию\n- Доходность: 13.2%\n\nПочему ЛУКОЙЛ лучше Роснефти:\n1. Прозрачная дивполитика\n2. Ниже долговая нагрузка\n3. Buyback программа\n4. Эффективный менеджмент\n\nЦелевая цена: 9500 руб (без учёта дивидендов)\nДивиденд 2026e: ~1200 руб/акцию", isPaid: false, acceptDonations: true, instruments: ["lkoh"] },
    { author: ideaUser3.id, title: "Роснефть vs ЛУКОЙЛ: кого выбрать инвестору", preview: "Детальное сравнение двух нефтяных гигантов по всем метрикам.", content: "Сравнение Роснефть vs ЛУКОЙЛ:\n\nФинансы:\n- Выручка: ROSN > LKOH (больше добыча)\n- Маржинальность: LKOH > ROSN\n- Долг/EBITDA: LKOH 0.3x vs ROSN 1.1x\n\nДивиденды:\n- LKOH: 100% FCF, стабильно\n- ROSN: 50% прибыли, менее предсказуемо\n\nУправление:\n- LKOH: ориентация на акционеров\n- ROSN: государственные интересы\n\nВердикт: LKOH для дивидендов, ROSN для роста (Восток Ойл).", isPaid: true, price: 350, instruments: ["rosn", "lkoh"] },
    { author: ideaUser3.id, title: "Яндекс: рост + дивиденды = идеальная комбинация", preview: "YDEX начал платить дивиденды при росте бизнеса 30%+ в год.", content: "Яндекс — редкая комбинация роста и дохода:\n\nРост:\n- Выручка +32% г/г\n- EBITDA +45% г/г\n- Новые сегменты (Маркет, Доставка, Финтех)\n\nДивиденды:\n- Первые дивиденды в 2026\n- Ожидаемая доходность: 3-4%\n- Рост дивиденда с ростом прибыли\n\nОценка: EV/EBITDA = 8x (дёшево для IT)\n\nЦель: 5500 руб (+25%)\nПлюс дивиденды ~150 руб/акцию", isPaid: false, acceptDonations: true, instruments: ["ydex"] },

    // ideaUser4 — Татьяна Макро (2 free + 3 paid)
    { author: ideaUser4.id, title: "Ставка ЦБ: прогноз на 2026", preview: "Анализ траектории ключевой ставки ЦБ РФ и её влияния на рынки.", content: "Прогноз ставки ЦБ РФ:\n\nТекущая: 21%\nМой прогноз:\n- Q1 2026: 21% (без изменений)\n- Q2 2026: 19-20% (начало снижения)\n- Q3 2026: 17-18%\n- Q4 2026: 15-16%\n\nОснования:\n1. Инфляция замедляется (с 9.5% до 7% к концу года)\n2. Экономика охлаждается\n3. Кредитование замедлилось\n\nСтратегия: покупать длинные ОФЗ сейчас.\nМаксимальный эффект: ОФЗ 26238 (+25-30% при снижении до 15%).", isPaid: true, price: 500, instruments: ["ofz26238", "ofz26243"] },
    { author: ideaUser4.id, title: "USD/RUB: рубль укрепится к лету", preview: "Сезонные факторы и цена нефти поддержат рубль в Q2 2026.", content: "Прогноз курса доллар/рубль:\n\nФакторы укрепления рубля:\n1. Налоговый период (март-апрель) — экспортёры продают валюту\n2. Нефть выше $80 — сильный торговый баланс\n3. Высокая ставка ЦБ — carry trade в рубль\n4. Сезонно низкий импорт\n\nФакторы ослабления:\n1. Бюджетные расходы\n2. Геополитика\n\nПрогноз: 88-92 руб/$ к июню (сейчас 95)\nТорговая идея: шорт Si от 95000.", isPaid: false, acceptDonations: true, instruments: ["si"] },
    { author: ideaUser4.id, title: "EUR/USD: ЕЦБ vs ФРС — кто снизит первым", preview: "Дивергенция монетарных политик ЕЦБ и ФРС. Торговая идея.", content: "Макроанализ EUR/USD:\n\nЕЦБ:\n- Текущая ставка: 3.75%\n- Инфляция: 2.3% (близка к цели)\n- Настрой: dovish, пауза в снижении\n\nФРС:\n- Текущая ставка: 4.75%\n- Инфляция: 3.1% (выше цели)\n- Настрой: hawkish, но рынок закладывает 2 снижения\n\nДифференциал ставок сужается → EUR укрепляется.\n\nТорговая идея: лонг EUR/USD от 1.075\nЦель: 1.12\nСтоп: 1.055", isPaid: true, price: 250, instruments: ["eurusd"] },
    { author: ideaUser4.id, title: "Инфляция в России: что ждать инвестору", preview: "Детальный разбор инфляционных трендов и их влияния на активы.", content: "Инфляция РФ — текущая картина:\n\nОфициальная (Росстат): 8.5% г/г\nНаблюдаемая (опросы): 15%+\nЦель ЦБ: 4%\n\nЧто дорожает сильнее всего:\n- Продукты: +12%\n- Услуги: +10%\n- Непродовольственные товары: +6%\n\nЗащита от инфляции:\n1. Флоатеры (ОФЗ-ПК) — купон = RUONIA + спред\n2. Акции экспортёров — выручка в валюте\n3. Золото — классический хедж\n4. Короткие облигации — быстрая переоценка\n\nИзбегать: длинные фиксированные депозиты, кэш.", isPaid: false, acceptDonations: true, instruments: ["gold", "ofz26240"] },
    { author: ideaUser4.id, title: "Нефть Brent: макроанализ Q2 2026", preview: "Глобальный спрос, OPEC+, геополитика — что определит цену нефти.", content: "Нефть Brent — макрокартина:\n\nСпрос:\n- Китай восстанавливается (+0.5 мб/д)\n- Индия растёт (+0.3 мб/д)\n- Европа стагнирует\n\nПредложение:\n- OPEC+ сохраняет ограничения\n- США: рост добычи замедлился\n- Иран: санкции ограничивают экспорт\n\nБаланс: дефицит ~0.5 мб/д в Q2\n\nПрогноз: $80-90 за баррель\nТорговая идея: лонг BR от $78, стоп $74, тейк $88\n\nРиски: рецессия в США, OPEC+ разногласия.", isPaid: true, price: 300, instruments: ["br"] },

    // ideaUser5 — Максим Скальпер (3 free + 2 paid)
    { author: ideaUser5.id, title: "Si: скальпинг от уровней — дневной план", preview: "Уровни поддержки/сопротивления для фьючерса Si на сегодня.", content: "Дневной план по Si:\n\nКлючевые уровни:\n- Сопротивление: 95200, 95800, 96500\n- Поддержка: 94300, 93800, 93000\n\nСценарий 1 (бычий):\n- Покупка от 94300 при отскоке\n- Стоп: 94000\n- Тейк: 95200\n\nСценарий 2 (медвежий):\n- Продажа от 95200 при отбое\n- Стоп: 95500\n- Тейк: 94300\n\nОбъём позиции: 5 контрактов\nМаксимальный риск на день: 3000 руб.", isPaid: false, acceptDonations: true, instruments: ["si"] },
    { author: ideaUser5.id, title: "BR: нефть в стакане — точки входа", preview: "Анализ стакана заявок на фьючерс BR. Крупные лимитные ордера.", content: "Анализ стакана BR (Brent):\n\nВижу крупные лимитки:\n- Покупка: 6450 (150 контрактов), 6420 (200 контрактов)\n- Продажа: 6520 (180 контрактов), 6580 (250 контрактов)\n\nПлан:\n1. Покупка от 6450 при подтверждении (если не проедят)\n2. Стоп: 6420 (если проедят уровень)\n3. Тейк 1: 6500\n4. Тейк 2: 6520\n\nОбъём: 10 контрактов\nВремя торговли: 10:00-14:00 МСК", isPaid: true, price: 150, instruments: ["br"] },
    { author: ideaUser5.id, title: "GOLD: скальпинг на золоте — паттерны", preview: "Типичные скальперские паттерны на фьючерсе GOLD. Разбор с примерами.", content: "Скальпинг GOLD на MOEX:\n\nПаттерн 1: 'Ложный пробой'\n- Цена пробивает уровень на 10-20 пунктов\n- Не удерживается, возвращается\n- Вход: в сторону возврата\n- Стоп: за экстремум пробоя\n\nПаттерн 2: 'Отбой от круглого уровня'\n- GOLD любит отбиваться от круглых (2400, 2450, 2500)\n- Вход: при касании с подтверждением\n- Стоп: 20 пунктов за уровнем\n\nСтатистика моих сделок:\n- Винрейт: 62%\n- Средний профит: 1.8R\n- Sharpe: 2.1", isPaid: false, acceptDonations: true, instruments: ["gold"] },
    { author: ideaUser5.id, title: "Скальпинг Si: стратегия 'Импульс открытия'", preview: "Авторская стратегия торговли первых 30 минут после открытия MOEX.", content: "Стратегия 'Импульс открытия' для Si:\n\nПравила:\n1. Ждём первые 5 минут — определяем диапазон\n2. Если пробой вверх с объёмом > 2x среднего → лонг\n3. Если пробой вниз → шорт\n4. Стоп: противоположная граница диапазона\n5. Тейк: 1.5x от размера диапазона\n\nСтатистика за 6 месяцев:\n- 127 сделок\n- Винрейт: 58%\n- Средний P/L: +1.2R\n- Макс. просадка: -5.3%\n- Профит фактор: 1.65\n\nРаботает лучше всего в дни с новостями.", isPaid: true, price: 200, instruments: ["si"] },
    { author: ideaUser5.id, title: "Газпром: уровни для внутридневной торговли", preview: "Технические уровни GAZP для скальпинга. Где покупать и продавать.", content: "GAZP — дневной план скальпера:\n\nТехнические уровни:\n- Сопротивление: 158.5, 161.0, 164.2\n- Поддержка: 155.0, 152.8, 150.0\n\nОбъёмный профиль:\n- POC (точка контроля): 156.8\n- Value Area High: 160.5\n- Value Area Low: 153.2\n\nТорговый план:\n- Покупка от 155.0 (стоп 153.5, тейк 158.5)\n- Продажа от 161.0 (стоп 162.5, тейк 158.5)\n\nОбъём: 100 акций на вход\nВремя: основная сессия 10:00-18:00", isPaid: false, acceptDonations: true, instruments: ["gazp"] },
  ];

  for (const idea of newIdeaData) {
    const existing = await prisma.idea.findFirst({
      where: { title: idea.title, authorId: idea.author },
    });
    if (!existing) {
      const created = await prisma.idea.create({
        data: {
          authorId: idea.author,
          title: idea.title,
          preview: idea.preview,
          content: idea.content,
          isPaid: idea.isPaid,
          price: idea.price || null,
          acceptDonations: idea.acceptDonations || false,
        },
      });
      for (const slug of idea.instruments) {
        if (instruments[slug]) {
          await prisma.ideaInstrument.create({
            data: { ideaId: created.id, instrumentId: instruments[slug] },
          });
        }
      }
    }
  }
  console.log("25 new ideas created for 5 idea users");

  // ─── Test Chat Messages (General) ───────────────────────────────────
  const chatMessages = [
    { userId: trader1.id, text: "Всем привет! Как рынок сегодня?" },
    { userId: analyst.id, text: "Привет! Сбер обновил максимумы, неплохо." },
    { userId: ivan.id, text: "Si бурлит, шортану чуть-чуть." },
    { userId: trader1.id, text: "BTC пробил 97к, смотрю на 100к." },
    { userId: analyst.id, text: "На MOEX объёмы выше средних сегодня. Хороший знак." },
    { userId: ivan.id, text: "Кто торгует фьючерсы, обратите внимание на ГО — подняли." },
    { userId: trader1.id, text: "Золото опять на хаях. Кто в лонге?" },
    { userId: analyst.id, text: "Я докупила золото в портфель. Считаю, что тренд продолжится." },
    { userId: ivan.id, text: "Нефть тоже неплохо идёт. BR выше 80." },
    { userId: trader1.id, text: "Кстати, кто следит за ОФЗ? Ставка ЦБ влияет сильно." },
  ];

  const existingGeneral = await prisma.chatMessage.findFirst({
    where: { roomId: "general" },
  });
  if (!existingGeneral) {
    for (let i = 0; i < chatMessages.length; i++) {
      await prisma.chatMessage.create({
        data: {
          roomId: "general",
          userId: chatMessages[i].userId,
          text: chatMessages[i].text,
          createdAt: new Date(Date.now() - (chatMessages.length - i) * 60000 * 5),
        },
      });
    }
    console.log("10 general chat messages created");
  }

  // ─── Chat messages for instrument rooms ─────────────────────────────
  const btcRoom = await prisma.chatRoom.findFirst({ where: { instrumentId: instruments["btc"] } });
  if (btcRoom) {
    const existing = await prisma.chatMessage.findFirst({ where: { roomId: btcRoom.id } });
    if (!existing) {
      const btcChats = [
        { userId: trader1.id, text: "BTC пробивает консолидацию, похоже 100к на горизонте." },
        { userId: ivan.id, text: "Объёмы на Bybit выросли в 2 раза. Кто-то крупный заходит." },
        { userId: trader1.id, text: "Фандинг ещё не перегрет, есть запас." },
        { userId: analyst.id, text: "С фундаментальной точки зрения — ETF продолжают набирать." },
        { userId: ivan.id, text: "Шортисты ликвидируются пачками. Будьте осторожны с шортами." },
      ];
      for (let i = 0; i < btcChats.length; i++) {
        await prisma.chatMessage.create({
          data: {
            roomId: btcRoom.id,
            userId: btcChats[i].userId,
            text: btcChats[i].text,
            createdAt: new Date(Date.now() - (btcChats.length - i) * 60000 * 3),
          },
        });
      }
    }
  }

  const sberRoom = await prisma.chatRoom.findFirst({ where: { instrumentId: instruments["sber"] } });
  if (sberRoom) {
    const existing = await prisma.chatMessage.findFirst({ where: { roomId: sberRoom.id } });
    if (!existing) {
      const sberChats = [
        { userId: analyst.id, text: "Сбер закрыл гэп, как я и прогнозировала. Теперь 360 на горизонте." },
        { userId: trader1.id, text: "Дивдоходность 12% — лучше любого вклада." },
        { userId: ivan.id, text: "Скальпил Сбер на открытии, +0.5% за утро." },
        { userId: analyst.id, text: "Отчёт за Q4 2025 выходит на следующей неделе. Ожидаю рекорд." },
      ];
      for (let i = 0; i < sberChats.length; i++) {
        await prisma.chatMessage.create({
          data: {
            roomId: sberRoom.id,
            userId: sberChats[i].userId,
            text: sberChats[i].text,
            createdAt: new Date(Date.now() - (sberChats.length - i) * 60000 * 4),
          },
        });
      }
    }
  }

  console.log("Instrument chat messages created");

  // ─── Test DM Conversations ──────────────────────────────────────────
  // Conversation 1: trader1 <-> analyst
  const existingConv1 = await prisma.directConversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: trader1.id } } },
        { participants: { some: { userId: analyst.id } } },
      ],
    },
  });
  if (!existingConv1) {
    const conv1 = await prisma.directConversation.create({
      data: {
        participants: {
          create: [{ userId: trader1.id }, { userId: analyst.id }],
        },
      },
    });
    const dm1 = [
      { senderId: trader1.id, text: "Привет, Мария! Отличный анализ по Сберу." },
      { senderId: analyst.id, text: "Спасибо, Алексей! Стараюсь давать качественную аналитику." },
      { senderId: trader1.id, text: "Что думаешь по поводу Газпрома? Стоит ли входить сейчас?" },
      { senderId: analyst.id, text: "Пока воздержалась бы. Жду отчёт за 2025. Слишком много неизвестных." },
      { senderId: trader1.id, text: "Согласен. Подожду отчёта. А по нефти какой прогноз?" },
      { senderId: analyst.id, text: "Brent вижу в диапазоне 78-86 на ближайшие месяцы. OPEC+ держит рынок." },
      { senderId: trader1.id, text: "Ясно. Буду следить за твоими идеями! Подписался." },
    ];
    for (let i = 0; i < dm1.length; i++) {
      await prisma.directMessage.create({
        data: {
          conversationId: conv1.id,
          senderId: dm1[i].senderId,
          text: dm1[i].text,
          createdAt: new Date(Date.now() - (dm1.length - i) * 60000 * 10),
        },
      });
    }
    console.log("DM conversation 1 created (trader1 <-> analyst)");
  }

  // Conversation 2: trader1 <-> ivan
  const existingConv2 = await prisma.directConversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: trader1.id } } },
        { participants: { some: { userId: ivan.id } } },
      ],
    },
  });
  if (!existingConv2) {
    const conv2 = await prisma.directConversation.create({
      data: {
        participants: {
          create: [{ userId: trader1.id }, { userId: ivan.id }],
        },
      },
    });
    const dm2 = [
      { senderId: ivan.id, text: "Привет! Видел твою идею по BTC. Согласен с анализом." },
      { senderId: trader1.id, text: "Привет, Иван! Да, BTC выглядит сильно. А ты что торгуешь сейчас?" },
      { senderId: ivan.id, text: "В основном Si и BR на MOEX. Скальпинг внутри дня." },
      { senderId: trader1.id, text: "Какой средний профит на скальпинге? Давно хочу попробовать." },
      { senderId: ivan.id, text: "1-2% на капитал в день, если рынок волатильный. Но нужна дисциплина." },
      { senderId: trader1.id, text: "Звучит неплохо. Может поделишься стратегией?" },
    ];
    for (let i = 0; i < dm2.length; i++) {
      await prisma.directMessage.create({
        data: {
          conversationId: conv2.id,
          senderId: dm2[i].senderId,
          text: dm2[i].text,
          createdAt: new Date(Date.now() - (dm2.length - i) * 60000 * 15),
        },
      });
    }
    console.log("DM conversation 2 created (trader1 <-> ivan)");
  }

  // Conversation 3: analyst <-> ivan
  const existingConv3 = await prisma.directConversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: analyst.id } } },
        { participants: { some: { userId: ivan.id } } },
      ],
    },
  });
  if (!existingConv3) {
    const conv3 = await prisma.directConversation.create({
      data: {
        participants: {
          create: [{ userId: analyst.id }, { userId: ivan.id }],
        },
      },
    });
    const dm3 = [
      { senderId: analyst.id, text: "Иван, привет! Видела твои скальперские идеи, интересно." },
      { senderId: ivan.id, text: "Привет, Мария! Спасибо. Твой фундаментальный анализ тоже полезен." },
      { senderId: analyst.id, text: "Давай скомбинируем — мой фундамент + твой теханализ?" },
      { senderId: ivan.id, text: "Отличная идея! Можем делать совместные обзоры по MOEX." },
      { senderId: analyst.id, text: "Договорились! Начнём со Сбера на следующей неделе?" },
    ];
    for (let i = 0; i < dm3.length; i++) {
      await prisma.directMessage.create({
        data: {
          conversationId: conv3.id,
          senderId: dm3[i].senderId,
          text: dm3[i].text,
          createdAt: new Date(Date.now() - (dm3.length - i) * 60000 * 20),
        },
      });
    }
    console.log("DM conversation 3 created (analyst <-> ivan)");
  }

  // Conversation 4: admin <-> trader1
  const existingConv4 = await prisma.directConversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: admin.id } } },
        { participants: { some: { userId: trader1.id } } },
      ],
    },
  });
  if (!existingConv4) {
    const conv4 = await prisma.directConversation.create({
      data: {
        participants: {
          create: [{ userId: admin.id }, { userId: trader1.id }],
        },
      },
    });
    const dm4 = [
      { senderId: admin.id, text: "Алексей, привет! Видел твои идеи по крипто. Отличная работа!" },
      { senderId: trader1.id, text: "Спасибо! Стараюсь давать качественный контент для платформы." },
      { senderId: admin.id, text: "Хотим сделать тебя топ-автором. Что думаешь?" },
      { senderId: trader1.id, text: "С удовольствием! Какие условия?" },
      { senderId: admin.id, text: "Верифицированный бейдж, приоритет в ленте, сниженная комиссия 10% вместо 20%." },
      { senderId: trader1.id, text: "Звучит отлично! Когда запускаем?" },
      { senderId: admin.id, text: "На следующей неделе обновим платформу. Подготовь пару эксклюзивных идей к запуску." },
      { senderId: trader1.id, text: "Договорились! Уже есть пара интересных сетапов по ETH и SOL." },
    ];
    for (let i = 0; i < dm4.length; i++) {
      await prisma.directMessage.create({
        data: {
          conversationId: conv4.id,
          senderId: dm4[i].senderId,
          text: dm4[i].text,
          createdAt: new Date(Date.now() - (dm4.length - i) * 60000 * 8),
        },
      });
    }
    console.log("DM conversation 4 created (admin <-> trader1)");
  }

  // ─── Follows ────────────────────────────────────────────────────────
  const followPairs = [
    [ivan.id, trader1.id],
    [ivan.id, analyst.id],
    [trader1.id, analyst.id],
    [analyst.id, trader1.id],
  ];
  for (const [followerId, authorId] of followPairs) {
    await prisma.follow.upsert({
      where: { followerId_authorId: { followerId, authorId } },
      update: {},
      create: { followerId, authorId },
    });
  }

  // ─── Languages ──────────────────────────────────────────────────────
  const languages = [
    { code: "ru", name: "Русский", enabled: true, sortOrder: 1 },
    { code: "en", name: "English", enabled: true, sortOrder: 2 },
    { code: "cn", name: "中文", enabled: true, sortOrder: 3 },
  ];
  for (const lang of languages) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: {},
      create: lang,
    });
  }

  console.log("\n=== Seed completed ===");
  console.log("Users: admin, trader1, analyst, newbie, ivan + 10 new users");
  console.log("30 instruments (5 per category) with chat rooms");
  console.log("10 + 25 = 35 ideas with instrument links");
  console.log("8 tariffs for 5 channel users");
  console.log("Chat messages: general(10) + btc(5) + sber(4)");
  console.log("4 DM conversations with messages");
  console.log("4 follow relationships");
  console.log("3 languages (ru, en, cn)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

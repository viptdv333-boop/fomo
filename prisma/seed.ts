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

  console.log("Users created:", admin.id, trader1.id, analyst.id, newbie.id, ivan.id);

  // ─── General chat room ───────────────────────────────────────────────
  await prisma.chatRoom.upsert({
    where: { id: "general" },
    update: {},
    create: { id: "general", name: "Общий чат", isGeneral: true },
  });

  // ─── Rating config ───────────────────────────────────────────────────
  await prisma.ratingConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // ─── Categories ──────────────────────────────────────────────────────
  const catData = [
    { name: "Криптовалюты", slug: "crypto", sortOrder: 1 },
    { name: "Акции РФ", slug: "stocks-ru", sortOrder: 2 },
    { name: "Акции США", slug: "stocks-us", sortOrder: 3 },
    { name: "Форекс", slug: "forex", sortOrder: 4 },
    { name: "Сырьё", slug: "commodities", sortOrder: 5 },
    { name: "Облигации", slug: "bonds", sortOrder: 6 },
  ];

  const cats: Record<string, string> = {};
  for (const cat of catData) {
    const c = await prisma.instrumentCategory.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    cats[cat.slug] = c.id;
  }

  // ─── 30 Instruments (5 per category) ────────────────────────────────
  const instrumentData = [
    // Crypto (Bybit)
    { name: "Bitcoin", slug: "btc", ticker: "BTC", exchange: "Bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/BTCUSDT", tradingViewSymbol: "BYBIT:BTCUSDT", description: "Биткоин — первая и крупнейшая криптовалюта", categorySlug: "crypto" },
    { name: "Ethereum", slug: "eth", ticker: "ETH", exchange: "Bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/ETHUSDT", tradingViewSymbol: "BYBIT:ETHUSDT", description: "Эфириум — платформа смарт-контрактов", categorySlug: "crypto" },
    { name: "Solana", slug: "sol", ticker: "SOL", exchange: "Bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/SOLUSDT", tradingViewSymbol: "BYBIT:SOLUSDT", description: "Solana — высокопроизводительный блокчейн", categorySlug: "crypto" },
    { name: "BNB", slug: "bnb", ticker: "BNB", exchange: "Bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/BNBUSDT", tradingViewSymbol: "BYBIT:BNBUSDT", description: "Binance Coin — токен экосистемы Binance", categorySlug: "crypto" },
    { name: "XRP", slug: "xrp", ticker: "XRP", exchange: "Bybit", exchangeUrl: "https://www.bybit.com/trade/usdt/XRPUSDT", tradingViewSymbol: "BYBIT:XRPUSDT", description: "Ripple — платёжная криптовалюта", categorySlug: "crypto" },

    // Russian stocks (MOEX)
    { name: "Сбербанк", slug: "sber", ticker: "SBER", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=SBER", tradingViewSymbol: "MOEX:SBER", description: "ПАО Сбербанк — крупнейший банк РФ", categorySlug: "stocks-ru" },
    { name: "Газпром", slug: "gazp", ticker: "GAZP", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=GAZP", tradingViewSymbol: "MOEX:GAZP", description: "ПАО Газпром — газовая монополия", categorySlug: "stocks-ru" },
    { name: "ЛУКОЙЛ", slug: "lkoh", ticker: "LKOH", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=LKOH", tradingViewSymbol: "MOEX:LKOH", description: "ПАО ЛУКОЙЛ — нефтяная компания", categorySlug: "stocks-ru" },
    { name: "Яндекс", slug: "ydex", ticker: "YDEX", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=YDEX", tradingViewSymbol: "MOEX:YDEX", description: "Яндекс — IT-гигант России", categorySlug: "stocks-ru" },
    { name: "Роснефть", slug: "rosn", ticker: "ROSN", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQBR&code=ROSN", tradingViewSymbol: "MOEX:ROSN", description: "ПАО Роснефть — нефтяная компания", categorySlug: "stocks-ru" },

    // US stocks / futures (MOEX)
    { name: "Доллар/Рубль (Si)", slug: "si", ticker: "Si", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=Si", tradingViewSymbol: "MOEX:SI1!", description: "Фьючерс на доллар/рубль", categorySlug: "stocks-us" },
    { name: "NASDAQ 100 (NASD)", slug: "nasd", ticker: "NASD", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=NASD", tradingViewSymbol: "MOEX:NASD", description: "Фьючерс на индекс NASDAQ 100", categorySlug: "stocks-us" },
    { name: "S&P 500 (SPX)", slug: "spx", ticker: "SPYF", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=SPYF", tradingViewSymbol: "MOEX:SPYF", description: "Фьючерс на индекс S&P 500", categorySlug: "stocks-us" },
    { name: "Евро/Рубль (Eu)", slug: "eu", ticker: "Eu", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=Eu", tradingViewSymbol: "MOEX:EU1!", description: "Фьючерс на евро/рубль", categorySlug: "stocks-us" },
    { name: "Юань/Рубль (CNY)", slug: "cny", ticker: "CR", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=CR", tradingViewSymbol: "MOEX:CR1!", description: "Фьючерс на юань/рубль", categorySlug: "stocks-us" },

    // Forex
    { name: "EUR/USD", slug: "eurusd", ticker: "EURUSD", exchange: "Forex", exchangeUrl: null, tradingViewSymbol: "FX:EURUSD", description: "Евро к доллару США", categorySlug: "forex" },
    { name: "GBP/USD", slug: "gbpusd", ticker: "GBPUSD", exchange: "Forex", exchangeUrl: null, tradingViewSymbol: "FX:GBPUSD", description: "Фунт стерлингов к доллару", categorySlug: "forex" },
    { name: "USD/JPY", slug: "usdjpy", ticker: "USDJPY", exchange: "Forex", exchangeUrl: null, tradingViewSymbol: "FX:USDJPY", description: "Доллар к японской иене", categorySlug: "forex" },
    { name: "USD/RUB", slug: "usdrub", ticker: "USDRUB", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=CETS&code=USD000UTSTOM", tradingViewSymbol: "MOEX:USDRUB_TOM", description: "Доллар к российскому рублю", categorySlug: "forex" },
    { name: "EUR/GBP", slug: "eurgbp", ticker: "EURGBP", exchange: "Forex", exchangeUrl: null, tradingViewSymbol: "FX:EURGBP", description: "Евро к фунту стерлингов", categorySlug: "forex" },

    // Commodities (MOEX futures)
    { name: "Нефть Brent (BR)", slug: "br", ticker: "BR", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=BR", tradingViewSymbol: "MOEX:BR1!", description: "Фьючерс на нефть Brent", categorySlug: "commodities" },
    { name: "Золото (GOLD)", slug: "gold", ticker: "GOLD", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=GOLD", tradingViewSymbol: "MOEX:GOLD1!", description: "Фьючерс на золото", categorySlug: "commodities" },
    { name: "Серебро (SILV)", slug: "silv", ticker: "SILV", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=SILV", tradingViewSymbol: "MOEX:SILV1!", description: "Фьючерс на серебро", categorySlug: "commodities" },
    { name: "Природный газ (NG)", slug: "ng", ticker: "NG", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=NG", tradingViewSymbol: "MOEX:NG1!", description: "Фьючерс на природный газ", categorySlug: "commodities" },
    { name: "Пшеница (WHEAT)", slug: "wheat", ticker: "WHEAT", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/contract.aspx?code=WH", tradingViewSymbol: "CBOT:ZW1!", description: "Фьючерс на пшеницу", categorySlug: "commodities" },

    // Bonds
    { name: "ОФЗ 26238", slug: "ofz26238", ticker: "SU26238RMFS4", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQOB&code=SU26238RMFS4", tradingViewSymbol: "MOEX:SU26238RMFS4", description: "ОФЗ-ПД 26238 (15 лет)", categorySlug: "bonds" },
    { name: "ОФЗ 26243", slug: "ofz26243", ticker: "SU26243RMFS4", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQOB&code=SU26243RMFS4", tradingViewSymbol: "MOEX:SU26243RMFS4", description: "ОФЗ-ПД 26243 (12 лет)", categorySlug: "bonds" },
    { name: "ОФЗ 26240", slug: "ofz26240", ticker: "SU26240RMFS0", exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/issue.aspx?board=TQOB&code=SU26240RMFS0", tradingViewSymbol: "MOEX:SU26240RMFS0", description: "ОФЗ-ПД 26240 (7 лет)", categorySlug: "bonds" },
    { name: "Корпоративные облигации", slug: "corp-bonds", ticker: null, exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/listing/corp-bond.aspx", tradingViewSymbol: null, description: "Корпоративные облигации на MOEX", categorySlug: "bonds" },
    { name: "Еврооблигации", slug: "eurobonds", ticker: null, exchange: "MOEX", exchangeUrl: "https://www.moex.com/ru/listing/euro-bond.aspx", tradingViewSymbol: null, description: "Еврооблигации на MOEX", categorySlug: "bonds" },
  ];

  const instruments: Record<string, string> = {};
  for (const inst of instrumentData) {
    const created = await prisma.instrument.upsert({
      where: { slug: inst.slug },
      update: {
        ticker: inst.ticker,
        exchange: inst.exchange,
        exchangeUrl: inst.exchangeUrl,
        tradingViewSymbol: inst.tradingViewSymbol,
        description: inst.description,
      },
      create: {
        name: inst.name,
        slug: inst.slug,
        categoryId: cats[inst.categorySlug],
        ticker: inst.ticker,
        exchange: inst.exchange,
        exchangeUrl: inst.exchangeUrl,
        tradingViewSymbol: inst.tradingViewSymbol,
        description: inst.description,
      },
    });
    instruments[inst.slug] = created.id;

    // Create chat room for each instrument
    await prisma.chatRoom.upsert({
      where: { instrumentId: created.id },
      update: {},
      create: {
        name: inst.name,
        instrumentId: created.id,
      },
    });
  }

  console.log("30 instruments created with chat rooms");

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
      instruments: ["eurusd"],
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
  console.log("Users: admin, trader1, analyst, newbie, ivan");
  console.log("30 instruments (5 per category) with chat rooms");
  console.log("10 test ideas with instrument links");
  console.log("Chat messages: general(10) + btc(5) + sber(4)");
  console.log("3 DM conversations with messages");
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

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("test123", 10);

  // Get categories
  const crypto = await prisma.instrumentCategory.findUnique({ where: { slug: "crypto" } });
  const stocksRu = await prisma.instrumentCategory.findUnique({ where: { slug: "stocks-ru" } });

  const traderProfile = {
    firstName: "Алексей",
    lastName: "Иванов",
    bio: "Торгую криптой и акциями с 2018 года",
    city: "Москва",
    workplace: "Частный трейдер",
    exchangeExperience: "6 лет",
    specializations: ["trader"],
    birthDate: new Date("1992-05-15"),
  };

  const trader = await prisma.user.upsert({
    where: { email: "trader1@pulse.local" },
    update: traderProfile,
    create: {
      email: "trader1@pulse.local",
      passwordHash: hash,
      displayName: "Алексей Трейдер",
      ...traderProfile,
      role: "USER",
      status: "APPROVED",
      rating: 5.5,
      subscriptionPrice: 500,
    },
  });

  const analystProfile = {
    firstName: "Мария",
    lastName: "Петрова",
    bio: "Фундаментальный анализ, макроэкономика",
    city: "Санкт-Петербург",
    workplace: "БКС Брокер",
    exchangeExperience: "10+ лет",
    specializations: ["analyst", "investor"],
    birthDate: new Date("1988-11-20"),
  };

  const analyst = await prisma.user.upsert({
    where: { email: "analyst@pulse.local" },
    update: analystProfile,
    create: {
      email: "analyst@pulse.local",
      passwordHash: hash,
      displayName: "Мария Аналитик",
      ...analystProfile,
      role: "USER",
      status: "APPROVED",
      rating: 7.2,
      subscriptionPrice: 990,
    },
  });

  const newbieProfile = {
    firstName: "Иван",
    lastName: "Сидоров",
    bio: "Только начинаю разбираться в рынках",
    city: "Казань",
    specializations: ["investor"],
  };

  const newbie = await prisma.user.upsert({
    where: { email: "newbie@pulse.local" },
    update: newbieProfile,
    create: {
      email: "newbie@pulse.local",
      passwordHash: hash,
      displayName: "Иван Новичок",
      ...newbieProfile,
      role: "USER",
      status: "PENDING",
      rating: 1.0,
    },
  });

  // Add education for analyst
  await prisma.education.deleteMany({ where: { userId: analyst.id } });
  await prisma.education.createMany({
    data: [
      {
        userId: analyst.id,
        university: "НИУ ВШЭ",
        faculty: "Факультет экономических наук",
        specialty: "Финансы и кредит",
        yearEnd: 2015,
      },
      {
        userId: analyst.id,
        university: "РЭШ",
        faculty: "Магистратура",
        specialty: "Финансовая экономика",
        yearEnd: 2017,
      },
    ],
  });

  console.log("Created:", trader.displayName, analyst.displayName, newbie.displayName);

  // Create instruments with categories
  const btc = await prisma.instrument.upsert({
    where: { slug: "bitcoin" },
    update: { categoryId: crypto?.id },
    create: {
      name: "Bitcoin",
      slug: "bitcoin",
      categoryId: crypto?.id,
      chatRoom: { create: { name: "Bitcoin" } },
    },
  });

  const eth = await prisma.instrument.upsert({
    where: { slug: "ethereum" },
    update: { categoryId: crypto?.id },
    create: {
      name: "Ethereum",
      slug: "ethereum",
      categoryId: crypto?.id,
      chatRoom: { create: { name: "Ethereum" } },
    },
  });

  const sber = await prisma.instrument.upsert({
    where: { slug: "sber" },
    update: { categoryId: stocksRu?.id },
    create: {
      name: "Сбербанк",
      slug: "sber",
      categoryId: stocksRu?.id,
      chatRoom: { create: { name: "Сбербанк" } },
    },
  });

  console.log("Instruments:", btc.name, eth.name, sber.name);

  // Create test ideas
  await prisma.idea.create({
    data: {
      title: "Bitcoin к $150k до конца года",
      preview: "Фундаментальные факторы указывают на сильный рост BTC в ближайшие месяцы. Халвинг уже позади, институционалы заходят через ETF.",
      content: "Детальный анализ: 1) ETF приток $500M+ в неделю, 2) Майнеры не продают, 3) Макро: ФРС снижает ставку...",
      isPaid: true,
      price: 299,
      authorId: analyst.id,
      instruments: { create: [{ instrumentId: btc.id }] },
    },
  });

  await prisma.idea.create({
    data: {
      title: "Ethereum — покупка на откате к $3200",
      preview: "ETH показывает сильную поддержку на уровне $3200. Сетевая активность растёт, L2 экосистема расширяется.",
      content: "Точки входа: $3200-3250. Стоп: $2950. Цель: $4500. Соотношение риск/прибыль 1:4.",
      isPaid: false,
      authorId: trader.id,
      instruments: { create: [{ instrumentId: eth.id }] },
    },
  });

  await prisma.idea.create({
    data: {
      title: "Сбербанк: дивиденды и рост",
      preview: "Сбербанк остаётся фундаментально сильным. Ожидаемая дивидендная доходность 12%+.",
      content: "",
      isPaid: false,
      authorId: trader.id,
      instruments: { create: [{ instrumentId: sber.id }] },
    },
  });

  await prisma.idea.create({
    data: {
      title: "Крипторынок: медвежий сценарий на Q2",
      preview: "Рассматриваю вероятность коррекции на 30-40% в течение апреля-мая. Исторически Q2 часто бывает слабым.",
      content: "Полный разбор: сезонность, объёмы, деривативы, funding rate. Мой план действий при падении...",
      isPaid: true,
      price: 499,
      authorId: analyst.id,
      instruments: {
        create: [{ instrumentId: btc.id }, { instrumentId: eth.id }],
      },
    },
  });

  console.log("Ideas created: 4");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

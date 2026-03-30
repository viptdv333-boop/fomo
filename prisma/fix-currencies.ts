import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Detach MOEX Eu from eur-usd asset (it's EUR/RUB, not EUR/USD)
  const euInstrument = await prisma.instrument.findUnique({ where: { slug: "eu" } });
  if (euInstrument) {
    await prisma.instrument.update({
      where: { slug: "eu" },
      data: { assetId: null },
    });
    console.log("Detached MOEX Eu from eur-usd asset");
  }

  // 2. Find eur-usd asset
  const eurUsdAsset = await prisma.asset.findUnique({ where: { slug: "eur-usd" } });
  if (!eurUsdAsset) {
    console.log("Asset eur-usd not found, skipping");
    return;
  }

  // 3. Find or create the FOREX exchange
  let forexExchange = await prisma.exchange.findUnique({ where: { slug: "spot" } });

  // 4. Create EUR/USD spot instrument
  const existing = await prisma.instrument.findUnique({ where: { slug: "eurusd-spot" } });
  if (!existing) {
    await prisma.instrument.create({
      data: {
        name: "EUR/USD (спот)",
        slug: "eurusd-spot",
        ticker: "EURUSD",
        exchange: "FOREX",
        exchangeId: forexExchange?.id || null,
        assetId: eurUsdAsset.id,
        tradingViewSymbol: "FX:EURUSD",
        dataSource: "fmp",
        dataTicker: "EURUSD",
        instrumentType: "spot",
        description: "Евро к доллару — основная валютная пара",
        categoryId: eurUsdAsset.categoryId,
      },
    });
    console.log("Created EUR/USD spot instrument → fmp:EURUSD");
  } else {
    await prisma.instrument.update({
      where: { slug: "eurusd-spot" },
      data: { dataSource: "fmp", dataTicker: "EURUSD", assetId: eurUsdAsset.id },
    });
    console.log("Updated EUR/USD spot instrument");
  }

  // 5. Also fix USD/RUB — add spot FX instrument
  const usdRubAsset = await prisma.asset.findUnique({ where: { slug: "usd-rub" } });
  if (usdRubAsset) {
    const usdRubSpot = await prisma.instrument.findUnique({ where: { slug: "usdrub-spot" } });
    if (!usdRubSpot) {
      await prisma.instrument.create({
        data: {
          name: "USD/RUB (спот)",
          slug: "usdrub-spot",
          ticker: "USDRUB",
          exchange: "FOREX",
          exchangeId: forexExchange?.id || null,
          assetId: usdRubAsset.id,
          tradingViewSymbol: "FX:USDRUB",
          dataSource: "fmp",
          dataTicker: "USDRUB",
          instrumentType: "spot",
          description: "Доллар к рублю — спотовый курс",
          categoryId: usdRubAsset.categoryId,
        },
      });
      console.log("Created USD/RUB spot instrument → fmp:USDRUB");
    }
  }

  // 6. CNY/RUB spot
  const cnyRubAsset = await prisma.asset.findUnique({ where: { slug: "cny-rub" } });
  if (cnyRubAsset) {
    const cnySpot = await prisma.instrument.findUnique({ where: { slug: "cnyrub-spot" } });
    if (!cnySpot) {
      await prisma.instrument.create({
        data: {
          name: "CNY/RUB (спот)",
          slug: "cnyrub-spot",
          ticker: "CNYRUB",
          exchange: "FOREX",
          exchangeId: forexExchange?.id || null,
          assetId: cnyRubAsset.id,
          tradingViewSymbol: "FX:CNYRUB",
          dataSource: "fmp",
          dataTicker: "CNYRUB",
          instrumentType: "spot",
          description: "Юань к рублю — спотовый курс",
          categoryId: cnyRubAsset.categoryId,
        },
      });
      console.log("Created CNY/RUB spot instrument → fmp:CNYRUB");
    }
  }

  console.log("\nDone! Currency instruments fixed.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

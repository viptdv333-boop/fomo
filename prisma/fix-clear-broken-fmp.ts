import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// These FMP tickers DON'T work on Starter — clear so TradingView fallback works
const broken = [
  "NGUSD", "CLUSD", "HGUSD", "PLUSD", "PAUSD",
  "ZCUSD", "ZWUSD", "ZSUSD", "RBUSD",
  "KCUSD", "SBUSD", "CCUSD", "OJUSD",
  "XPTUSD", "XPDUSD", "XCUUSD",
  "WTIOIL", "PTUSD", "PLATINUM",
  "NATGAS",
];

async function main() {
  // Find all instruments with broken FMP tickers
  const instruments = await prisma.instrument.findMany({
    where: { dataSource: "fmp", dataTicker: { in: broken } },
    select: { id: true, slug: true, dataTicker: true },
  });

  for (const inst of instruments) {
    await prisma.instrument.update({
      where: { id: inst.id },
      data: { dataSource: null, dataTicker: null },
    });
    console.log(`Cleared: ${inst.slug} (was fmp:${inst.dataTicker})`);
  }

  // Also clear any NGUSD specifically (gas spot)
  const gasResults = await prisma.instrument.updateMany({
    where: { dataTicker: { in: broken } },
    data: { dataSource: null, dataTicker: null },
  });

  console.log(`\nTotal cleared: ${gasResults.count} instruments → TradingView fallback`);
  console.log("\nWorking on FMP Starter: AAPL-type stocks, GCUSD, SIUSD, XAUUSD, XAGUSD, BZUSD, EURUSD, USDRUB, indices");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

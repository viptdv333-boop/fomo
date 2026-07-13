import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// These FMP tickers are PREMIUM-only on trial plan — remove dataSource
const premiumTickers = [
  "cme-cl",    // CLUSD — premium
  "cme-ng",    // NGUSD — premium
  "cme-hg",    // HGUSD — premium
  "cme-pl",    // PLUSD — premium
  "cme-pa",    // PAUSD — premium
  "cme-zc",    // ZCUSD — premium
  "cme-zw",    // ZWUSD — premium
  "cme-zs",    // ZSUSD — premium
  "cme-rb",    // RBUSD — premium
  "ice-brn",   // BRTUSD — premium
  "ice-gasoil",// BRTUSD — premium
  "ice-kc",    // KCUSD — premium
  "ice-sb",    // SBUSD — premium
  "ice-cc",    // CCUSD — premium
  "ice-oj",    // OJUSD — premium
  "brent-spot",// BRTUSD — premium
  "wti-spot",  // WTIUSD — premium
  "natgas-spot",// NGUSD — premium
  "copper-spot",// XCUUSD — premium
  "platinum-spot",// XPTUSD — premium
  "palladium-spot",// XPDUSD — premium
];

// These work on trial — fix tickers
const workingUpdates = [
  { slug: "gold-spot", dataSource: "fmp", dataTicker: "GCUSD" },
  { slug: "silver-spot", dataSource: "fmp", dataTicker: "SIUSD" },
  { slug: "cme-gc", dataSource: "fmp", dataTicker: "GCUSD" },
  { slug: "cme-si", dataSource: "fmp", dataTicker: "SIUSD" },
];

async function main() {
  // Remove dataSource from premium tickers
  for (const slug of premiumTickers) {
    const result = await prisma.instrument.updateMany({
      where: { slug },
      data: { dataSource: null, dataTicker: null },
    });
    if (result.count > 0) console.log(`${slug}: removed dataSource (premium-only)`);
  }

  // Fix working tickers
  for (const u of workingUpdates) {
    const result = await prisma.instrument.updateMany({
      where: { slug: u.slug },
      data: { dataSource: u.dataSource, dataTicker: u.dataTicker },
    });
    if (result.count > 0) console.log(`${u.slug}: ✓ → ${u.dataSource}:${u.dataTicker}`);
  }

  console.log("\nDone! Premium-only tickers cleared, working tickers fixed.");
  console.log("Working on trial: stocks, forex (EURUSD), gold (GCUSD), silver (SIUSD)");
  console.log("Premium-only: oil, gas, copper, platinum, palladium, agri commodities");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

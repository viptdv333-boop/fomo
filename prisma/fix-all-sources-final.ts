import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// === WORKING on Starter plan ===
const working = [
  // US Stocks
  { slug: "aapl", dataSource: "fmp", dataTicker: "AAPL" },
  { slug: "tsla", dataSource: "fmp", dataTicker: "TSLA" },
  { slug: "msft", dataSource: "fmp", dataTicker: "MSFT" },
  { slug: "amzn", dataSource: "fmp", dataTicker: "AMZN" },
  { slug: "googl", dataSource: "fmp", dataTicker: "GOOGL" },
  { slug: "nvda", dataSource: "fmp", dataTicker: "NVDA" },
  { slug: "meta", dataSource: "fmp", dataTicker: "META" },
  { slug: "nflx", dataSource: "fmp", dataTicker: "NFLX" },
  { slug: "amd", dataSource: "fmp", dataTicker: "AMD" },
  { slug: "intc", dataSource: "fmp", dataTicker: "INTC" },
  { slug: "jpm", dataSource: "fmp", dataTicker: "JPM" },
  { slug: "brk-b", dataSource: "fmp", dataTicker: "BRK-B" },
  { slug: "v", dataSource: "fmp", dataTicker: "V" },
  { slug: "ko", dataSource: "fmp", dataTicker: "KO" },
  { slug: "dis", dataSource: "fmp", dataTicker: "DIS" },

  // HK Stocks
  { slug: "0700-hk", dataSource: "fmp", dataTicker: "0700.HK" },
  { slug: "9988-hk", dataSource: "fmp", dataTicker: "9988.HK" },
  { slug: "9618-hk", dataSource: "fmp", dataTicker: "9618.HK" },
  { slug: "3690-hk", dataSource: "fmp", dataTicker: "3690.HK" },
  { slug: "1810-hk", dataSource: "fmp", dataTicker: "1810.HK" },

  // UK Stocks
  { slug: "shel-l", dataSource: "fmp", dataTicker: "SHEL.L" },
  { slug: "bp-l", dataSource: "fmp", dataTicker: "BP.L" },
  { slug: "rio-l", dataSource: "fmp", dataTicker: "RIO.L" },
  { slug: "hsba-l", dataSource: "fmp", dataTicker: "HSBA.L" },

  // Metals — working on Starter
  { slug: "gold-spot", dataSource: "fmp", dataTicker: "XAUUSD" },
  { slug: "silver-spot", dataSource: "fmp", dataTicker: "XAGUSD" },
  { slug: "cme-gc", dataSource: "fmp", dataTicker: "GCUSD" },
  { slug: "cme-si", dataSource: "fmp", dataTicker: "SIUSD" },

  // Oil
  { slug: "brent-spot", dataSource: "fmp", dataTicker: "BZUSD" },
  { slug: "ice-brn", dataSource: "fmp", dataTicker: "BZUSD" },

  // Forex
  { slug: "eurusd-spot", dataSource: "fmp", dataTicker: "EURUSD" },
  { slug: "cme-6e", dataSource: "fmp", dataTicker: "EURUSD" },
  { slug: "cme-6j", dataSource: "fmp", dataTicker: "JPYUSD" },
  { slug: "cme-dx", dataSource: "fmp", dataTicker: "DXUSD" },
  { slug: "usdrub-spot", dataSource: "fmp", dataTicker: "USDRUB" },
  { slug: "cnyrub-spot", dataSource: "fmp", dataTicker: "CNYRUB" },

  // Indices
  { slug: "spx-spot", dataSource: "fmp", dataTicker: "^GSPC" },
  { slug: "ndx-spot", dataSource: "fmp", dataTicker: "^NDX" },
  { slug: "cme-es", dataSource: "fmp", dataTicker: "^GSPC" },
  { slug: "cme-nq", dataSource: "fmp", dataTicker: "^NDX" },
  { slug: "cme-ym", dataSource: "fmp", dataTicker: "^DJI" },
  { slug: "cme-rty", dataSource: "fmp", dataTicker: "^RUT" },
  { slug: "dax-spot", dataSource: "fmp", dataTicker: "^GDAXI" },
  { slug: "ftse100-spot", dataSource: "fmp", dataTicker: "^FTSE" },
  { slug: "nikkei-spot", dataSource: "fmp", dataTicker: "^N225" },
  { slug: "hsi-spot", dataSource: "fmp", dataTicker: "^HSI" },
  { slug: "hsi-fut", dataSource: "fmp", dataTicker: "^HSI" },
  { slug: "hscei-fut", dataSource: "fmp", dataTicker: "^HSCE" },

  // MOEX indices
  { slug: "imoex-spot", dataSource: "moex", dataTicker: "IMOEX" },
];

// === NOT WORKING on Starter — clear dataSource, fall back to TradingView ===
const clearSlugs = [
  "cme-cl",       // WTI oil — premium
  "cme-ng",       // natgas — premium
  "cme-hg",       // copper — premium
  "cme-pl",       // platinum — premium
  "cme-pa",       // palladium — premium
  "cme-zc",       // corn — premium
  "cme-zw",       // wheat — premium
  "cme-zs",       // soy — premium
  "cme-rb",       // gasoline — premium
  "ice-gasoil",   // gasoil — premium
  "ice-kc",       // coffee — premium
  "ice-sb",       // sugar — SBUSD is wrong (Snowbank crypto)
  "ice-cc",       // cocoa — premium
  "ice-oj",       // orange juice — premium
  "wti-spot",     // WTI spot — premium
  "natgas-spot",  // natgas spot — premium
  "platinum-spot",// platinum — empty
  "palladium-spot",// palladium — empty
  "copper-spot",  // copper — empty
];

async function main() {
  console.log("=== Setting working FMP tickers ===");
  for (const u of working) {
    const r = await prisma.instrument.updateMany({
      where: { slug: u.slug },
      data: { dataSource: u.dataSource, dataTicker: u.dataTicker },
    });
    if (r.count > 0) console.log(`✓ ${u.slug} → ${u.dataSource}:${u.dataTicker}`);
  }

  console.log("\n=== Clearing premium-only tickers ===");
  for (const slug of clearSlugs) {
    const r = await prisma.instrument.updateMany({
      where: { slug },
      data: { dataSource: null, dataTicker: null },
    });
    if (r.count > 0) console.log(`✗ ${slug} → cleared (premium/unavailable)`);
  }

  console.log("\nDone!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

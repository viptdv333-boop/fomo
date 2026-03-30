import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Category slug → data source mapping
const CATEGORY_SOURCE: Record<string, string> = {
  "us-stocks": "fmp",
  "metals": "fmp",
  "commodities": "fmp",
  "currencies": "fmp",
  "indices": "fmp",
};

// FMP ticker overrides (when ticker in DB doesn't match FMP format)
const FMP_TICKER_MAP: Record<string, string> = {
  // Metals spot
  "XAUUSD": "XAUUSD",  // gold
  "XAGUSD": "XAGUSD",  // silver
  "GC": "GCUSD",        // gold futures → FMP commodity
  "SI": "SIUSD",        // silver futures → FMP commodity (not the crypto!)
  // Oil
  "BRENT": "BZUSD",
  "BRN": "BZUSD",
  "WTI": "BZUSD",       // use brent as proxy on starter
  "CL": "BZUSD",        // WTI futures → brent proxy
  // Indices
  "SPX": "^GSPC",
  "NDX": "^NDX",
  "ES": "^GSPC",
  "NQ": "^NDX",
  "YM": "^DJI",
  "RTY": "^RUT",
  "DAX": "^GDAXI",
  "FTSE": "^FTSE",
  "NI225": "^N225",
  "HSI": "^HSI",
  "HSCEI": "^HSCE",
  "DX": "DXUSD",
  // Forex
  "EURUSD": "EURUSD",
  "USDRUB": "USDRUB",
  "CNYRUB": "CNYRUB",
  "6E": "EURUSD",
  "6J": "JPYUSD",
  // HK stocks need .HK suffix
  "0700": "0700.HK",
  "9988": "9988.HK",
  "9618": "9618.HK",
  "3690": "3690.HK",
  "1810": "1810.HK",
  // UK stocks need .L suffix
  "SHEL": "SHEL.L",
  "BP": "BP.L",
  "RIO": "RIO.L",
  "HSBA": "HSBA.L",
  // BRK.B special
  "BRK.B": "BRK-B",
};

// Skip these — they need Premium or don't work on FMP
const SKIP_TICKERS = new Set([
  "NG", "NATGAS", "HG", "PL", "PA", "XPTUSD", "XPDUSD", "XCUUSD",
  "ZC", "ZW", "ZS", "RB", "KC", "SB", "CC", "OJ",
  "GASOIL", "SUGAR", "WHEAT", "COCOA", "GOLD", "SILV", "PLT", "PLD", "CU",
  "BR", // MOEX oil — keep on moex
  "Si", "Eu", "CR", // MOEX currencies — keep on moex
  "MIX", "RTS", "NASD", "SPYF", // MOEX indices — keep on moex
  "IMOEX", // MOEX index
]);

async function main() {
  // Get all instruments with their category
  const instruments = await prisma.instrument.findMany({
    include: { category: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const inst of instruments) {
    // Skip if already has dataSource
    if (inst.dataSource) continue;

    const catSlug = inst.category?.slug || "";
    const ticker = inst.ticker || "";

    // Skip MOEX instruments and known premium-only
    if (SKIP_TICKERS.has(ticker)) {
      skipped++;
      continue;
    }

    // Determine source from category
    const source = CATEGORY_SOURCE[catSlug];
    if (!source) {
      skipped++;
      continue;
    }

    // Determine FMP ticker
    const fmpTicker = FMP_TICKER_MAP[ticker] || ticker;

    await prisma.instrument.update({
      where: { id: inst.id },
      data: { dataSource: source, dataTicker: fmpTicker },
    });
    console.log(`✓ ${inst.slug} (${ticker}) → ${source}:${fmpTicker}`);
    updated++;
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

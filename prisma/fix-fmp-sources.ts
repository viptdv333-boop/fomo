import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// FMP ticker mappings for instruments that currently have no dataSource
const fmpUpdates = [
  // ══════ АКЦИИ США ══════
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

  // ══════ СПОТ СЫРЬЁ (FMP commodity tickers) ══════
  { slug: "brent-spot", dataSource: "fmp", dataTicker: "BRTUSD" },
  { slug: "wti-spot", dataSource: "fmp", dataTicker: "WTIUSD" },
  { slug: "natgas-spot", dataSource: "fmp", dataTicker: "NGUSD" },

  // ══════ СПОТ МЕТАЛЛЫ ══════
  { slug: "gold-spot", dataSource: "fmp", dataTicker: "XAUUSD" },
  { slug: "silver-spot", dataSource: "fmp", dataTicker: "XAGUSD" },
  { slug: "platinum-spot", dataSource: "fmp", dataTicker: "XPTUSD" },
  { slug: "palladium-spot", dataSource: "fmp", dataTicker: "XPDUSD" },
  { slug: "copper-spot", dataSource: "fmp", dataTicker: "XCUUSD" },

  // ══════ СПОТ ИНДЕКСЫ ══════
  { slug: "spx-spot", dataSource: "fmp", dataTicker: "^GSPC" },
  { slug: "ndx-spot", dataSource: "fmp", dataTicker: "^NDX" },
  { slug: "dax-spot", dataSource: "fmp", dataTicker: "^GDAXI" },
  { slug: "ftse100-spot", dataSource: "fmp", dataTicker: "^FTSE" },
  { slug: "nikkei-spot", dataSource: "fmp", dataTicker: "^N225" },

  // ══════ СПОТ ВАЛЮТЫ (FMP forex) ══════
  { slug: "cme-6e", dataSource: "fmp", dataTicker: "EURUSD" },
  { slug: "cme-dx", dataSource: "fmp", dataTicker: "DXUSD" },
];

async function main() {
  for (const fix of fmpUpdates) {
    const result = await prisma.instrument.updateMany({
      where: { slug: fix.slug },
      data: { dataSource: fix.dataSource, dataTicker: fix.dataTicker },
    });
    console.log(`${fix.slug}: updated ${result.count} row(s) → ${fix.dataSource}:${fix.dataTicker}`);
  }
  console.log("\nDone! US stocks, spot commodities, metals, indices now use FMP.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const updates = [
  // CME Commodities — FMP uses same tickers for futures
  { slug: "cme-cl", dataSource: "fmp", dataTicker: "CLUSD" },
  { slug: "cme-ng", dataSource: "fmp", dataTicker: "NGUSD" },
  { slug: "cme-gc", dataSource: "fmp", dataTicker: "GCUSD" },
  { slug: "cme-si", dataSource: "fmp", dataTicker: "SIUSD" },
  { slug: "cme-hg", dataSource: "fmp", dataTicker: "HGUSD" },
  { slug: "cme-pl", dataSource: "fmp", dataTicker: "PLUSD" },
  { slug: "cme-pa", dataSource: "fmp", dataTicker: "PAUSD" },
  { slug: "cme-zc", dataSource: "fmp", dataTicker: "ZCUSD" },
  { slug: "cme-zw", dataSource: "fmp", dataTicker: "ZWUSD" },
  { slug: "cme-zs", dataSource: "fmp", dataTicker: "ZSUSD" },
  { slug: "cme-rb", dataSource: "fmp", dataTicker: "RBUSD" },

  // CME Index Futures
  { slug: "cme-es", dataSource: "fmp", dataTicker: "^GSPC" },
  { slug: "cme-nq", dataSource: "fmp", dataTicker: "^NDX" },
  { slug: "cme-ym", dataSource: "fmp", dataTicker: "^DJI" },
  { slug: "cme-rty", dataSource: "fmp", dataTicker: "^RUT" },

  // ICE Commodities
  { slug: "ice-brn", dataSource: "fmp", dataTicker: "BRTUSD" },
  { slug: "ice-gasoil", dataSource: "fmp", dataTicker: "BRTUSD" }, // closest proxy
  { slug: "ice-kc", dataSource: "fmp", dataTicker: "KCUSD" },
  { slug: "ice-sb", dataSource: "fmp", dataTicker: "SBUSD" },
  { slug: "ice-cc", dataSource: "fmp", dataTicker: "CCUSD" },
  { slug: "ice-oj", dataSource: "fmp", dataTicker: "OJUSD" },

  // CME Currency
  { slug: "cme-6j", dataSource: "fmp", dataTicker: "JPYUSD" },

  // HKEX stocks — FMP uses .HK suffix
  { slug: "0700-hk", dataSource: "fmp", dataTicker: "0700.HK" },
  { slug: "9988-hk", dataSource: "fmp", dataTicker: "9988.HK" },
  { slug: "9618-hk", dataSource: "fmp", dataTicker: "9618.HK" },
  { slug: "3690-hk", dataSource: "fmp", dataTicker: "3690.HK" },
  { slug: "1810-hk", dataSource: "fmp", dataTicker: "1810.HK" },

  // LSE stocks — FMP uses .L suffix
  { slug: "shel-l", dataSource: "fmp", dataTicker: "SHEL.L" },
  { slug: "bp-l", dataSource: "fmp", dataTicker: "BP.L" },
  { slug: "rio-l", dataSource: "fmp", dataTicker: "RIO.L" },
  { slug: "hsba-l", dataSource: "fmp", dataTicker: "HSBA.L" },

  // Spot indices missing
  { slug: "imoex-spot", dataSource: "moex", dataTicker: "IMOEX" },
  { slug: "hsi-spot", dataSource: "fmp", dataTicker: "^HSI" },
  { slug: "hsi-fut", dataSource: "fmp", dataTicker: "^HSI" },
  { slug: "hscei-fut", dataSource: "fmp", dataTicker: "^HSCE" },
];

async function main() {
  for (const u of updates) {
    const result = await prisma.instrument.updateMany({
      where: { slug: u.slug },
      data: { dataSource: u.dataSource, dataTicker: u.dataTicker },
    });
    console.log(`${u.slug}: ${result.count > 0 ? "✓" : "✗"} → ${u.dataSource}:${u.dataTicker}`);
  }
  console.log("\nDone! All remaining instruments now have data sources.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

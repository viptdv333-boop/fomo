import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const cryptoFixes = [
  { slug: "ethusdt", dataTicker: "ETHUSDT" },
  { slug: "solusdt", dataTicker: "SOLUSDT" },
  { slug: "xrpusdt", dataTicker: "XRPUSDT" },
  { slug: "bnbusdt", dataTicker: "BNBUSDT" },
  { slug: "dogeusdt", dataTicker: "DOGEUSDT" },
  { slug: "adausdt", dataTicker: "ADAUSDT" },
  { slug: "avaxusdt", dataTicker: "AVAXUSDT" },
  { slug: "dotusdt", dataTicker: "DOTUSDT" },
  { slug: "linkusdt", dataTicker: "LINKUSDT" },
  { slug: "ltcusdt", dataTicker: "LTCUSDT" },
  { slug: "maticusdt", dataTicker: "MATICUSDT" },
  { slug: "tonusdt", dataTicker: "TONUSDT" },
  { slug: "suiusdt", dataTicker: "SUIUSDT" },
  { slug: "pepeusdt", dataTicker: "PEPEUSDT" },
];

async function main() {
  for (const fix of cryptoFixes) {
    const result = await prisma.instrument.updateMany({
      where: { slug: fix.slug },
      data: { dataSource: "bybit", dataTicker: fix.dataTicker },
    });
    console.log(`${fix.slug}: updated ${result.count} row(s) → bybit:${fix.dataTicker}`);
  }
  console.log("\nDone! All crypto instruments now use Bybit for realtime data.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

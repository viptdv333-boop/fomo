/**
 * Expands the instrument catalogue:
 *   - every share traded on the MOEX main board (TQBR)
 *   - top-20 cryptocurrencies on Bybit
 *   - top-20 US stocks by market cap
 *
 * Existing instruments are matched by ticker and left alone, so this is safe to
 * re-run. Ordinary and preferred shares of the same issuer are attached to one
 * Asset, matching how the catalogue groups everything else (one "Нефть", not
 * one per contract).
 *
 * Usage on the VPS:
 *   DRY_RUN=1 npx tsx prisma/expand-instrument-catalog.ts   # preview
 *   DRY_RUN=0 npx tsx prisma/expand-instrument-catalog.ts   # apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== "0";

// SECTYPE on the shares board: 1 ordinary, 2 preferred, D depositary receipt.
// Everything else (9/A/B/J) is a fund or ETF and does not belong here.
const SHARE_SECTYPES = new Set(["1", "2", "D"]);

const MOEX_URL =
  "https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json" +
  "?iss.meta=off&securities.columns=SECID,SHORTNAME,SECNAME,SECTYPE";

/** "iАРТГЕН ао" -> "АРТГЕН", "Система ао" -> "Система", "Башнефт ап" -> "Башнефт" */
function issuerName(shortName: string): string {
  return shortName
    .replace(/^i/, "")
    .replace(/\s+(ао|ап)(-[^\s]+)?$/i, "")
    .replace(/-п$/i, "")
    .trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

interface MoexRow {
  secid: string;
  shortName: string;
  secName: string;
  secType: string;
}

async function fetchMoexShares(): Promise<MoexRow[]> {
  const res = await fetch(MOEX_URL);
  if (!res.ok) throw new Error(`MOEX ISS returned ${res.status}`);
  const json = (await res.json()) as {
    securities: { columns: string[]; data: unknown[][] };
  };
  const cols = json.securities.columns;
  const idx = (n: string) => cols.indexOf(n);
  return json.securities.data
    .map((r) => ({
      secid: String(r[idx("SECID")]),
      shortName: String(r[idx("SHORTNAME")] ?? ""),
      secName: String(r[idx("SECNAME")] ?? ""),
      secType: String(r[idx("SECTYPE")] ?? ""),
    }))
    .filter((r) => SHARE_SECTYPES.has(r.secType));
}

// Top-20 crypto by market cap that the catalogue was still missing.
const CRYPTO = [
  { coin: "TRON", slug: "tron", ticker: "TRXUSDT", note: "Блокчейн для стейблкоинов и переводов USDT" },
  { coin: "Bitcoin Cash", slug: "bitcoin-cash", ticker: "BCHUSDT", note: "Форк Bitcoin с увеличенным размером блока" },
  { coin: "Stellar", slug: "stellar", ticker: "XLMUSDT", note: "Сеть для дешёвых трансграничных платежей" },
  { coin: "Shiba Inu", slug: "shiba-inu", ticker: "SHIBUSDT", note: "Мем-токен на Ethereum" },
  { coin: "NEAR Protocol", slug: "near", ticker: "NEARUSDT", note: "Шардированный L1 с низкими комиссиями" },
  { coin: "Hedera", slug: "hedera", ticker: "HBARUSDT", note: "Корпоративный DLT на хешграфе" },
  { coin: "Uniswap", slug: "uniswap", ticker: "UNIUSDT", note: "Крупнейшая децентрализованная биржа" },
];

// Top-20 US stocks by market cap that the catalogue was still missing.
// `live` marks the tickers the FMP plan actually serves quotes for; the rest
// are catalogued for tagging and TradingView charts without a live feed.
const US_STOCKS = [
  { company: "Broadcom", slug: "broadcom", ticker: "AVGO", live: false, note: "Полупроводники и инфраструктурное ПО. Ключевой поставщик AI-чипов" },
  { company: "Eli Lilly", slug: "eli-lilly", ticker: "LLY", live: false, note: "Фармацевтика. Препараты от диабета и ожирения" },
  { company: "Walmart", slug: "walmart", ticker: "WMT", live: true, note: "Крупнейшая розничная сеть мира по выручке" },
  { company: "Exxon Mobil", slug: "exxon-mobil", ticker: "XOM", live: true, note: "Крупнейшая нефтегазовая компания США" },
  { company: "Oracle", slug: "oracle", ticker: "ORCL", live: false, note: "Корпоративные СУБД и облачная инфраструктура" },
  { company: "Mastercard", slug: "mastercard", ticker: "MA", live: false, note: "Вторая платёжная система мира после Visa" },
  { company: "UnitedHealth", slug: "unitedhealth", ticker: "UNH", live: true, note: "Крупнейшая медицинская страховая компания США" },
  { company: "Costco", slug: "costco", ticker: "COST", live: true, note: "Сеть оптовых магазинов клубного формата по подписке" },
  { company: "Procter & Gamble", slug: "procter-gamble", ticker: "PG", live: false, note: "Товары повседневного спроса. Дивидендный аристократ" },
  { company: "Johnson & Johnson", slug: "johnson-johnson", ticker: "JNJ", live: true, note: "Фармацевтика и медицинские изделия" },
  { company: "Home Depot", slug: "home-depot", ticker: "HD", live: false, note: "Крупнейшая сеть товаров для дома и ремонта" },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}\n`);

  const cats = Object.fromEntries(
    (await prisma.instrumentCategory.findMany({ select: { id: true, slug: true } })).map(
      (c) => [c.slug, c.id]
    )
  );
  const exchanges = Object.fromEntries(
    (await prisma.exchange.findMany({ select: { id: true, slug: true } })).map((e) => [
      e.slug,
      e.id,
    ])
  );

  const existingInstruments = await prisma.instrument.findMany({
    select: { id: true, ticker: true, slug: true, assetId: true },
  });
  const byTicker = new Map(
    existingInstruments.filter((i) => i.ticker).map((i) => [i.ticker!, i])
  );
  const takenInstrumentSlugs = new Set(existingInstruments.map((i) => i.slug));

  const existingAssets = await prisma.asset.findMany({ select: { id: true, slug: true } });
  const takenAssetSlugs = new Set(existingAssets.map((a) => a.slug));

  function freeSlug(base: string, taken: Set<string>): string {
    let s = base || "instrument";
    let n = 2;
    while (taken.has(s)) s = `${base}-${n++}`;
    taken.add(s);
    return s;
  }

  async function ensureAsset(
    name: string,
    slugBase: string,
    categorySlug: string,
    description: string
  ): Promise<string | null> {
    const existing = await prisma.asset.findFirst({ where: { slug: slugBase } });
    if (existing) return existing.id;
    const slug = freeSlug(slugBase, takenAssetSlugs);
    if (DRY_RUN) return null;
    const asset = await prisma.asset.create({
      data: { name, slug, categoryId: cats[categorySlug], description },
    });
    await prisma.chatRoom.create({
      data: { name, assetId: asset.id },
    });
    return asset.id;
  }

  let created = 0;
  let skipped = 0;

  // ── MOEX shares ────────────────────────────────────────────────────
  const moex = await fetchMoexShares();
  const ordinary = new Set(moex.filter((r) => r.secType === "1").map((r) => r.secid));
  // Preferred shares reuse the issuer's asset: SBERP joins SBER, not its own.
  const assetIdByBaseTicker = new Map<string, string>();

  console.log(`MOEX TQBR: ${moex.length} shares\n`);

  for (const row of moex) {
    if (byTicker.has(row.secid)) {
      skipped++;
      continue;
    }

    const isPreferred = row.secType === "2";
    const base =
      isPreferred && ordinary.has(row.secid.replace(/P$/, ""))
        ? row.secid.replace(/P$/, "")
        : row.secid;

    let assetId = assetIdByBaseTicker.get(base) ?? null;
    if (!assetId) {
      const existingBase = byTicker.get(base);
      if (existingBase?.assetId) {
        assetId = existingBase.assetId;
      } else {
        const name = issuerName(row.shortName) || row.secid;
        assetId = await ensureAsset(
          name,
          slugify(base.toLowerCase()),
          "ru-stocks",
          row.secName
        );
      }
      if (assetId) assetIdByBaseTicker.set(base, assetId);
    }

    const slug = freeSlug(row.secid.toLowerCase(), takenInstrumentSlugs);
    const label = isPreferred
      ? `${issuerName(row.shortName)} (прив.)`
      : issuerName(row.shortName) || row.secid;
    const url = `https://www.moex.com/ru/issue.aspx?board=TQBR&code=${row.secid}`;

    created++;
    if (!DRY_RUN) {
      await prisma.instrument.create({
        data: {
          name: label,
          slug,
          ticker: row.secid,
          categoryId: cats["ru-stocks"],
          exchangeId: exchanges["moex"],
          assetId,
          exchange: "MOEX",
          exchangeUrl: url,
          externalUrl: url,
          tradingViewSymbol: `MOEX:${row.secid}`,
          dataSource: "moex",
          dataTicker: row.secid,
          instrumentType: "stock",
          description: row.secName,
        },
      });
    }
  }
  console.log(`Акции РФ: +${created}, уже были ${skipped}\n`);

  // ── Crypto (Bybit) ─────────────────────────────────────────────────
  let cryptoAdded = 0;
  for (const c of CRYPTO) {
    if (byTicker.has(c.ticker)) continue;
    const assetId = await ensureAsset(c.coin, c.slug, "crypto", c.note);
    const url = `https://www.bybit.com/trade/usdt/${c.ticker}`;
    cryptoAdded++;
    if (!DRY_RUN) {
      await prisma.instrument.create({
        data: {
          name: c.coin,
          slug: freeSlug(c.ticker.toLowerCase(), takenInstrumentSlugs),
          ticker: c.ticker,
          categoryId: cats["crypto"],
          exchangeId: exchanges["bybit"],
          assetId,
          exchange: "Bybit",
          exchangeUrl: url,
          externalUrl: url,
          tradingViewSymbol: `BYBIT:${c.ticker}`,
          dataSource: "bybit",
          dataTicker: c.ticker,
          instrumentType: "crypto",
          description: `${c.coin} / USDT — ${c.note}`,
        },
      });
    }
  }
  console.log(`Криптовалюты: +${cryptoAdded}\n`);

  // ── US stocks ──────────────────────────────────────────────────────
  let usAdded = 0;
  let usNoFeed = 0;
  for (const s of US_STOCKS) {
    if (byTicker.has(s.ticker)) continue;
    const assetId = await ensureAsset(s.company, s.slug, "us-stocks", s.note);
    const url = `https://www.nasdaq.com/market-activity/stocks/${s.ticker.toLowerCase()}`;
    usAdded++;
    if (!s.live) usNoFeed++;
    if (!DRY_RUN) {
      await prisma.instrument.create({
        data: {
          name: s.company,
          slug: freeSlug(s.ticker.toLowerCase(), takenInstrumentSlugs),
          ticker: s.ticker,
          categoryId: cats["us-stocks"],
          exchangeId: exchanges["nyse"],
          assetId,
          exchange: "NYSE/NASDAQ",
          exchangeUrl: url,
          externalUrl: url,
          tradingViewSymbol: `NASDAQ:${s.ticker}`,
          // Quotes only where the FMP plan actually serves the symbol; the rest
          // still chart through TradingView.
          dataSource: s.live ? "fmp" : null,
          dataTicker: s.live ? s.ticker : null,
          instrumentType: "stock",
          description: s.note,
        },
      });
    }
  }
  console.log(`Акции США: +${usAdded} (без живых котировок: ${usNoFeed})\n`);

  console.log(`Итого новых инструментов: ${created + cryptoAdded + usAdded}`);
  if (DRY_RUN) console.log("DRY RUN — ничего не записано. Запустите с DRY_RUN=0.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

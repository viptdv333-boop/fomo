// Live MOEX futures specs for the risk calculator — pulled straight from
// ISS (public, unauthenticated), not derived or cached in the DB. One
// request fetches the whole RFUD board (securities + marketdata blocks in a
// single call), which is enough for every ticker below, so it's cached
// module-wide instead of per-ticker.
//
// Base tickers match the Terminal page's TERMINAL_DATA `dataTicker` for
// futures, so the calculator and the terminal always name the same
// instrument the same way.

export interface FuturesInstrument {
  ticker: string;
  name: string;
  /** Same icon set as the Terminal page's TERMINAL_DATA, for a consistent look. */
  icon: string;
}

export const FUTURES_LIST: FuturesInstrument[] = [
  { ticker: "Si", name: "Доллар/Рубль", icon: "/icons/instruments/usd-rub.svg" },
  { ticker: "CR", name: "Юань/Рубль", icon: "/icons/instruments/cny-rub.svg" },
  { ticker: "RTS", name: "Фьючерс РТС", icon: "/icons/instruments/rts-index.svg" },
  { ticker: "MIX", name: "Фьючерс ММВБ", icon: "/icons/instruments/moex-index.svg" },
  { ticker: "BR", name: "Нефть Brent", icon: "/icons/instruments/oil.svg" },
  { ticker: "NG", name: "Газ", icon: "/icons/instruments/gas.svg" },
  { ticker: "GOLD", name: "Золото", icon: "/icons/instruments/gold.svg" },
  { ticker: "SILV", name: "Серебро", icon: "/icons/instruments/silver.svg" },
  { ticker: "PLT", name: "Платина", icon: "/icons/instruments/platinum.svg" },
  { ticker: "PLD", name: "Палладий", icon: "/icons/instruments/palladium.svg" },
  { ticker: "CU", name: "Медь", icon: "/icons/instruments/copper.svg" },
  { ticker: "COCOA", name: "Какао", icon: "/icons/instruments/cocoa.svg" },
  { ticker: "KC", name: "Кофе", icon: "/icons/instruments/coffee.svg" },
  { ticker: "SUGAR", name: "Сахар", icon: "/icons/instruments/sugar.svg" },
  { ticker: "WHEAT", name: "Пшеница", icon: "/icons/instruments/wheat.svg" },
  { ticker: "SPYF", name: "Фьючерс S&P 500", icon: "/icons/instruments/sp500.svg" },
  { ticker: "NASD", name: "Фьючерс NASDAQ", icon: "/icons/instruments/nasdaq100.svg" },
];

// SECID prefix on the RFUD board for each base ticker (verified against a
// live ISS pull — MOEX's own ASSETCODE differs from ours for two of these:
// "COFFEE"→KC and "COPPER"→CU).
const SECID_PREFIX: Record<string, string> = {
  Si: "Si", CR: "CR", RTS: "RI", MIX: "MX",
  BR: "BR", NG: "NG",
  GOLD: "GD", SILV: "SV", PLT: "PT", PLD: "PD", CU: "CE",
  COCOA: "CC", KC: "KC", SUGAR: "Su", WHEAT: "W4",
  SPYF: "SF", NASD: "NA",
};

export interface FuturesSpec {
  ticker: string;
  secid: string;
  shortname: string;
  expiry: string;
  /** Минимальный шаг цены (в пунктах котировки контракта). */
  minStep: number;
  /** Стоимость этого шага в рублях. */
  stepPrice: number;
  /** Гарантийное обеспечение на один контракт, ₽. */
  initialMargin: number;
  last: number | null;
  bid: number | null;
  offer: number | null;
  fetchedAt: number;
}

const ISS_URL =
  "https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json" +
  "?iss.meta=off" +
  "&securities.columns=SECID,SHORTNAME,LASTTRADEDATE,MINSTEP,STEPPRICE,INITIALMARGIN" +
  "&marketdata.columns=SECID,LAST,BID,OFFER";

interface Board {
  securities: unknown[][];
  marketdata: unknown[][];
  at: number;
}

const BOARD_CACHE_MS = 60_000;
let boardCache: Board | null = null;
let boardInflight: Promise<Board> | null = null;

async function loadBoard(): Promise<Board> {
  if (boardCache && Date.now() - boardCache.at < BOARD_CACHE_MS) return boardCache;
  if (boardInflight) return boardInflight;
  boardInflight = (async () => {
    const res = await fetch(ISS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`MOEX ISS ${res.status}`);
    const data = await res.json();
    const board: Board = {
      securities: data.securities?.data ?? [],
      marketdata: data.marketdata?.data ?? [],
      at: Date.now(),
    };
    boardCache = board;
    return board;
  })();
  try {
    return await boardInflight;
  } finally {
    boardInflight = null;
  }
}

export function isKnownFuturesTicker(ticker: string): boolean {
  return ticker in SECID_PREFIX;
}

export async function getFuturesSpec(baseTicker: string): Promise<FuturesSpec | null> {
  const prefix = SECID_PREFIX[baseTicker];
  if (!prefix) return null;

  const board = await loadBoard();
  const today = new Date().toISOString().slice(0, 10);

  // The nearest contract that hasn't expired yet — sorting by expiry (rather
  // than trusting list order) also protects against an unrelated SECID that
  // happens to share the prefix (e.g. "CRWDF" alongside "CR" for CNY/RUB):
  // its LASTTRADEDATE is nowhere near today, so it never sorts first.
  const candidates = board.securities
    .filter((r) => {
      const secid = r[0] as string;
      const expiry = r[2] as string;
      return secid.startsWith(prefix) && expiry && expiry >= today;
    })
    .sort((a, b) => (a[2] as string).localeCompare(b[2] as string));

  const row = candidates[0];
  if (!row) return null;
  const [secid, shortname, expiry, minStep, stepPrice, initialMargin] = row as [
    string, string, string, number, number, number
  ];

  const mdRow = board.marketdata.find((m) => m[0] === secid) as
    | [string, number | null, number | null, number | null]
    | undefined;

  return {
    ticker: baseTicker,
    secid,
    shortname,
    expiry,
    minStep: Number(minStep) || 0,
    stepPrice: Number(stepPrice) || 0,
    initialMargin: Number(initialMargin) || 0,
    last: mdRow?.[1] ?? null,
    bid: mdRow?.[2] ?? null,
    offer: mdRow?.[3] ?? null,
    fetchedAt: board.at,
  };
}

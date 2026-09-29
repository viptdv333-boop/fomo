/* Terminal instrument list (hardcoded, not from DB) and helpers shared by the terminal page and the chart shell. */

export type ChartSource = "moex" | "fmp" | "bybit" | "none";

export interface TerminalInstrument {
  ticker: string;
  name: string;
  source: ChartSource;
  dataTicker: string;
  /** Icon path (kept under its historical field name). Empty for ad-hoc symbols. */
  emoji: string;
}

export interface TerminalCategory {
  name: string;
  emoji: string;
  color: string;
  instruments: TerminalInstrument[];
}

export const CATEGORY_I18N: Record<string, string> = {
  "Акции ММВБ": "terminal.stocksRu",
  "Сырьё": "terminal.commodities",
  "Металлы": "terminal.metals",
  "Валюта": "terminal.currencies",
  "Индексы": "terminal.indices",
  "Криптовалюты": "terminal.crypto",
};

export const CATEGORY_ICONS: Record<string, string> = {
  "Акции ММВБ": "/icons/categories/stocks-ru.svg",
  "Сырьё": "/icons/categories/commodities.svg",
  "Металлы": "/icons/categories/metals.svg",
  "Валюта": "/icons/categories/currencies.svg",
  "Индексы": "/icons/categories/indices.svg",
  "Криптовалюты": "/icons/categories/crypto.svg",
};

/** Category -> news feed category understood by /api/news (see RuNews). */
export const CATEGORY_NEWS: Record<string, string> = {
  "Акции ММВБ": "stocks_ru",
  "Сырьё": "commodities",
  "Металлы": "commodities",
  "Валюта": "general",
  "Индексы": "general",
  "Криптовалюты": "crypto",
};

// Crypto pairs have no translation key and keep their own name.
export function instName(inst: TerminalInstrument, t: (key: string) => string): string {
  const key = `instname.${inst.dataTicker}`;
  const v = t(key);
  return v === key ? inst.name : v;
}

export const TERMINAL_DATA: TerminalCategory[] = [
  {
    name: "Акции ММВБ", emoji: "", color: "#3b82f6",
    instruments: [
      { ticker: "SBER", name: "Сбербанк", source: "moex", dataTicker: "SBER", emoji: "/icons/instruments/sberbank.svg" },
      { ticker: "GAZP", name: "Газпром", source: "moex", dataTicker: "GAZP", emoji: "/icons/instruments/gazprom.svg" },
      { ticker: "LKOH", name: "ЛУКОЙЛ", source: "moex", dataTicker: "LKOH", emoji: "/icons/instruments/lukoil.svg" },
      { ticker: "YDEX", name: "Яндекс", source: "moex", dataTicker: "YDEX", emoji: "/icons/instruments/yandex.svg" },
      { ticker: "ROSN", name: "Роснефть", source: "moex", dataTicker: "ROSN", emoji: "/icons/instruments/rosneft.svg" },
      { ticker: "GMKN", name: "Норникель", source: "moex", dataTicker: "GMKN", emoji: "/icons/instruments/norilsk-nickel.svg" },
      { ticker: "NVTK", name: "Новатэк", source: "moex", dataTicker: "NVTK", emoji: "/icons/instruments/novatek.svg" },
      { ticker: "VTBR", name: "ВТБ", source: "moex", dataTicker: "VTBR", emoji: "/icons/instruments/vtb.svg" },
      { ticker: "TCSG", name: "Тинькофф", source: "moex", dataTicker: "TCSG", emoji: "/icons/instruments/tinkoff.svg" },
      { ticker: "MGNT", name: "Магнит", source: "moex", dataTicker: "MGNT", emoji: "/icons/instruments/magnit.svg" },
    ],
  },
  {
    name: "Сырьё", emoji: "", color: "#f59e0b",
    instruments: [
      { ticker: "BR", name: "Нефть Brent", source: "moex", dataTicker: "BR", emoji: "/icons/instruments/oil.svg" },
      { ticker: "NG", name: "Газ", source: "moex", dataTicker: "NG", emoji: "/icons/instruments/gas.svg" },
      { ticker: "COCOA", name: "Какао", source: "moex", dataTicker: "COCOA", emoji: "/icons/instruments/cocoa.svg" },
      { ticker: "KC", name: "Кофе", source: "moex", dataTicker: "KC", emoji: "/icons/instruments/coffee.svg" },
      { ticker: "SUGAR", name: "Сахар", source: "moex", dataTicker: "SUGAR", emoji: "/icons/instruments/sugar.svg" },
      { ticker: "WHEAT", name: "Пшеница", source: "moex", dataTicker: "WHEAT", emoji: "/icons/instruments/wheat.svg" },
    ],
  },
  {
    name: "Металлы", emoji: "", color: "#eab308",
    instruments: [
      { ticker: "GOLD", name: "Золото", source: "moex", dataTicker: "GOLD", emoji: "/icons/instruments/gold.svg" },
      { ticker: "SILV", name: "Серебро", source: "moex", dataTicker: "SILV", emoji: "/icons/instruments/silver.svg" },
      { ticker: "PLT", name: "Платина", source: "moex", dataTicker: "PLT", emoji: "/icons/instruments/platinum.svg" },
      { ticker: "PLD", name: "Палладий", source: "moex", dataTicker: "PLD", emoji: "/icons/instruments/palladium.svg" },
      { ticker: "CU", name: "Медь", source: "moex", dataTicker: "CU", emoji: "/icons/instruments/copper.svg" },
    ],
  },
  {
    name: "Валюта", emoji: "", color: "#10b981",
    instruments: [
      { ticker: "Si", name: "Доллар/Рубль", source: "moex", dataTicker: "Si", emoji: "/icons/instruments/usd-rub.svg" },
      { ticker: "CR", name: "Юань/Рубль", source: "moex", dataTicker: "CR", emoji: "/icons/instruments/cny-rub.svg" },
    ],
  },
  {
    name: "Индексы", emoji: "", color: "#8b5cf6",
    instruments: [
      { ticker: "MIX", name: "Фьючерс ММВБ", source: "moex", dataTicker: "MIX", emoji: "/icons/instruments/moex-index.svg" },
      { ticker: "RTS", name: "Фьючерс РТС", source: "moex", dataTicker: "RTS", emoji: "/icons/instruments/rts-index.svg" },
      { ticker: "SPYF", name: "Фьючерс S&P 500", source: "moex", dataTicker: "SPYF", emoji: "/icons/instruments/sp500.svg" },
      { ticker: "NASD", name: "Фьючерс NASDAQ", source: "moex", dataTicker: "NASD", emoji: "/icons/instruments/nasdaq100.svg" },
    ],
  },
  {
    name: "Криптовалюты", emoji: "", color: "#f97316",
    instruments: [
      { ticker: "BTCUSDT", name: "Bitcoin", source: "bybit", dataTicker: "BTCUSDT", emoji: "/icons/instruments/bitcoin.svg" },
      { ticker: "ETHUSDT", name: "Ethereum", source: "bybit", dataTicker: "ETHUSDT", emoji: "/icons/instruments/ethereum.svg" },
      { ticker: "SOLUSDT", name: "Solana", source: "bybit", dataTicker: "SOLUSDT", emoji: "/icons/instruments/solana.svg" },
      { ticker: "XRPUSDT", name: "XRP", source: "bybit", dataTicker: "XRPUSDT", emoji: "/icons/instruments/xrp.svg" },
      { ticker: "BNBUSDT", name: "BNB", source: "bybit", dataTicker: "BNBUSDT", emoji: "/icons/instruments/bnb.svg" },
      { ticker: "DOGEUSDT", name: "Dogecoin", source: "bybit", dataTicker: "DOGEUSDT", emoji: "/icons/instruments/dogecoin.svg" },
      { ticker: "ADAUSDT", name: "Cardano", source: "bybit", dataTicker: "ADAUSDT", emoji: "/icons/instruments/cardano.svg" },
      { ticker: "AVAXUSDT", name: "Avalanche", source: "bybit", dataTicker: "AVAXUSDT", emoji: "/icons/instruments/avalanche.svg" },
      { ticker: "TONUSDT", name: "Toncoin", source: "bybit", dataTicker: "TONUSDT", emoji: "/icons/instruments/toncoin.svg" },
      { ticker: "SUIUSDT", name: "Sui", source: "bybit", dataTicker: "SUIUSDT", emoji: "/icons/instruments/sui-crypto.svg" },
    ],
  },
];

export const ALL_INSTRUMENTS: TerminalInstrument[] = TERMINAL_DATA.flatMap((c) => c.instruments);

export function findInstrument(source: string, ticker: string): TerminalInstrument | undefined {
  return ALL_INSTRUMENTS.find((i) => i.source === source && i.dataTicker.toLowerCase() === ticker.toLowerCase());
}

export function categoryOf(inst: { source: string; dataTicker: string }): TerminalCategory | undefined {
  return TERMINAL_DATA.find((c) => c.instruments.some((i) => i.source === inst.source && i.dataTicker === inst.dataTicker));
}

/** An instrument that is not in the curated list (opened from a link or typed into the search). */
export function adHocInstrument(source: ChartSource, ticker: string): TerminalInstrument {
  return { ticker, name: ticker, source, dataTicker: ticker, emoji: "" };
}

export function exchangeLabel(source: string): string {
  return source === "moex" ? "MOEX" : source === "bybit" ? "Bybit" : source === "fmp" ? "FMP" : "";
}

/* ── price formatting shared by the watchlist and the info card ── */

const LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", cn: "zh-CN" };
const nfCache = new Map<string, Intl.NumberFormat>();

export function fmtPrice(p: number, locale: string): string {
  if (!isFinite(p)) return "-";
  const abs = Math.abs(p);
  const digits = abs >= 10 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 7;
  const loc = LOCALES[locale] ?? "ru-RU";
  const key = `${loc}|${digits}`;
  let nf = nfCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nfCache.set(key, nf);
  }
  return nf.format(p);
}

export function fmtSigned(v: number, digits: number, locale: string): string {
  const loc = LOCALES[locale] ?? "ru-RU";
  const s = new Intl.NumberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v));
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${s}`;
}

export function fmtCompact(v: number, locale: string): string {
  const loc = LOCALES[locale] ?? "ru-RU";
  const abs = Math.abs(v);
  const f = (n: number, d: number) => new Intl.NumberFormat(loc, { maximumFractionDigits: d }).format(n);
  if (abs >= 1e9) return `${f(v / 1e9, 2)}B`;
  if (abs >= 1e6) return `${f(v / 1e6, 2)}M`;
  if (abs >= 1e3) return `${f(v / 1e3, 1)}K`;
  return f(v, 2);
}

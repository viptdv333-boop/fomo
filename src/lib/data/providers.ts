/**
 * The market-data providers a user can connect with his own key (Settings -> Data providers). Plain data, shared by the page and the API.
 * MOEX: T-Invest (a read-only token of a T-Bank brokerage account) or ALGOPACK; crypto: Binance (public data, no key); the US market: Databento;
 * the rest of the world: Twelve Data.
 */

export type DataMarket = "moex" | "crypto" | "us" | "world";

export interface DataProvider {
  id: "algopack" | "tinvest" | "binance" | "databento" | "twelvedata";
  market: DataMarket;
  name: string;
  /** a key (token) is pasted by the user; false: the data is public */
  needsKey: boolean;
  /** where a person gets the key */
  keyUrl?: string;
  /** i18n keys of what the provider gives */
  gives: string[];
}

export const DATA_PROVIDERS: DataProvider[] = [
  { id: "tinvest", market: "moex", name: "T-Invest (Т-Банк)", needsKey: true, keyUrl: "https://www.tbank.ru/invest/settings/api/", gives: ["dp.g.live", "dp.g.trades", "dp.g.depth", "dp.g.seconds"] },
  { id: "algopack", market: "moex", name: "MOEX ALGOPACK", needsKey: true, keyUrl: "https://data.moex.com/products/algopack", gives: ["dp.g.live", "dp.g.trades", "dp.g.depth", "dp.g.futoi"] },
  { id: "binance", market: "crypto", name: "Binance", needsKey: false, gives: ["dp.g.live", "dp.g.trades", "dp.g.depth", "dp.g.oi"] },
  { id: "databento", market: "us", name: "Databento", needsKey: true, keyUrl: "https://databento.com/signup", gives: ["dp.g.live", "dp.g.trades", "dp.g.depth", "dp.g.futures"] },
  { id: "twelvedata", market: "world", name: "Twelve Data", needsKey: true, keyUrl: "https://twelvedata.com/register", gives: ["dp.g.live", "dp.g.world"] },
];

export const KEY_PROVIDERS = DATA_PROVIDERS.filter((p) => p.needsKey).map((p) => p.id);

export function providerById(id: unknown): DataProvider | undefined {
  return DATA_PROVIDERS.find((p) => p.id === id);
}

/** Pasted key: trimmed, one token (no spaces / control characters), sane length. */
export function cleanKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim();
  // eslint-disable-next-line no-control-regex
  return k.length >= 8 && k.length <= 512 && !/[\s\u0000-\u001f\u007f]/.test(k) ? k : null;
}

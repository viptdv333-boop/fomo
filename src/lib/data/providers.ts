/**
 * The market-data providers a user can connect with his own key (Settings -> Data providers). Plain data, shared by the page and the API.
 * One provider per market: MOEX -> ALGOPACK, crypto -> Binance (public data, no key), the US market -> Databento.
 */

export type DataMarket = "moex" | "crypto" | "us";

export interface DataProvider {
  id: "algopack" | "binance" | "databento";
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
  { id: "algopack", market: "moex", name: "MOEX ALGOPACK", needsKey: true, keyUrl: "https://data.moex.com/products/algopack", gives: ["dp.g.live", "dp.g.trades", "dp.g.depth", "dp.g.futoi"] },
  { id: "binance", market: "crypto", name: "Binance", needsKey: false, gives: ["dp.g.live", "dp.g.trades", "dp.g.depth", "dp.g.oi"] },
  { id: "databento", market: "us", name: "Databento", needsKey: true, keyUrl: "https://databento.com/signup", gives: ["dp.g.live", "dp.g.trades", "dp.g.depth", "dp.g.futures"] },
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

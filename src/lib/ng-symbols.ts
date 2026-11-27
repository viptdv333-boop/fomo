import type { ContractInfo, MarketItem } from "./market-types";

export function ngChainContracts(lang = "ru"): ContractInfo[] {
  return [1, 2].map((rank) => ({
    secid: `NG${rank}!`, ticker: `NG${rank}!`, shortname: lang === "ru" ? `Газ · склейка ${rank}` : `Natural gas · continuous ${rank}`,
    kind: "continuous", expiry: null, order: 0, daysLeft: null,
    badge: lang === "ru" ? "склейка" : "continuous",
    label: lang === "ru" ? `NG${rank}! · ${rank === 1 ? "ближайший" : "второй"} контракт · переход по экспирации` : `NG${rank}! · ${rank === 1 ? "front" : "second"} contract · expiry roll`,
  }));
}
export function ngChainItems(): MarketItem[] {
  return ngChainContracts().map((c) => ({ secid: c.ticker, ticker: c.ticker, name: c.shortname, nameEn: `Natural gas continuous ${c.ticker}`, group: "future", source: "moex", exchange: "MOEX", country: "RU", fgroup: "gas", asset: "NG", kind: "continuous", expiry: null }));
}

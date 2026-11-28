import type { ContractInfo, MarketItem } from "./market-types";

/** Synthetic continuous (склейка) contracts of any FORTS family: {ASSET}1! / {ASSET}2!.
 *  `name` is the family's display name (Газ, Золото, Нефть…). Dated contracts are listed separately by the picker. */
export function chainContracts(asset: string, name: string, lang = "ru"): ContractInfo[] {
  return [1, 2].map((rank) => ({
    secid: `${asset}${rank}!`, ticker: `${asset}${rank}!`,
    shortname: name,
    kind: "continuous", expiry: null, order: 0, daysLeft: null,
    badge: "",
    label: lang === "ru" ? `${asset}${rank}! · ${rank === 1 ? "ближайший" : "второй"} контракт · переход по экспирации` : `${asset}${rank}! · ${rank === 1 ? "front" : "second"} contract · expiry roll`,
  }));
}

/** @deprecated use chainContracts("NG", …) */
export function ngChainContracts(lang = "ru"): ContractInfo[] {
  return chainContracts("NG", lang === "ru" ? "Газ" : "Natural gas", lang);
}

/** @deprecated continuous contracts are now chosen inside the family's contract picker, not as separate search items. */
export function ngChainItems(): MarketItem[] {
  return [];
}

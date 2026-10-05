/* Recently picked rows of the instrument search dialog (this browser only; every access guarded: private mode / blocked storage just means no recents). */

import type { GroupTab, MarketItem } from "./market-types";

const KEY = "fomo-terminal-recent-symbols-v1";
const MAX = 8;

const isItem = (x: unknown): x is MarketItem => {
  const i = x as MarketItem | null;
  return !!i && typeof i.secid === "string" && typeof i.ticker === "string" && typeof i.name === "string" && typeof i.group === "string" && typeof i.source === "string";
};

export function getRecent(): MarketItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(isItem).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** The recents that belong on a chip («Все» takes every group). */
export function recentFor(tab: GroupTab, list: MarketItem[]): MarketItem[] {
  return tab === "all" ? list : list.filter((i) => i.group === tab);
}

/** Remembers a pick (newest first, one entry per instrument). An exact contract is remembered as the contract. */
export function pushRecent(item: MarketItem): void {
  try {
    const rest = getRecent().filter((i) => !(i.source === item.source && i.secid === item.secid));
    localStorage.setItem(KEY, JSON.stringify([item, ...rest].slice(0, MAX)));
  } catch {
    /* no storage */
  }
}

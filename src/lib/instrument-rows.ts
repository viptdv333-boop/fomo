/**
 * What the list of the instrument search dialog shows: the rows of a page with their headers.
 *  - «Фьючерсы»: under the asset headers (Нефть, Газ, Золото ...; none when one asset chip is chosen), inside an asset the rows of every country behind a country header (РФ, then США)
 *  - «Все» with nothing typed: the mix of every group under the group headers
 *  - anything else: a flat list
 * Pure (no React / network imports): the dialog renders it, scripts/check-instrument-search.ts checks it.
 */

import type { FutAsset, GroupTab, MarketGroup, MarketItem } from "./market-types";

export type DisplayRow =
  | { kind: "recent-head"; key: string }
  | { kind: "group-head"; key: string; group: MarketGroup }
  | { kind: "asset-head"; key: string; asset: FutAsset }
  | { kind: "country-head"; key: string; country: string }
  | { kind: "item"; key: string; item: MarketItem; recent?: boolean };

export const itemKey = (i: Pick<MarketItem, "source" | "secid">): string => `${i.source}:${i.secid}`;

export interface RowsContext {
  tab: GroupTab;
  /** the futures asset chip ("" = every asset, the list is grouped under asset headers) */
  asset: FutAsset | "";
  /** nothing typed and no filter: «Все» shows a mix of the groups, each under its header */
  mix: boolean;
  /** the recently picked rows, shown first (empty: none) */
  recent?: MarketItem[];
}

export function buildDisplayRows(items: MarketItem[], ctx: RowsContext): DisplayRow[] {
  const out: DisplayRow[] = [];
  if (ctx.recent?.length) {
    out.push({ kind: "recent-head", key: "h:recent" });
    for (const item of ctx.recent) out.push({ kind: "item", key: `r:${itemKey(item)}`, item, recent: true });
  }
  let prev: MarketItem | undefined;
  for (const item of items) {
    if (ctx.tab === "future") {
      const assetChanged = !prev || prev.fgroup !== item.fgroup;
      if (!ctx.asset && assetChanged) out.push({ kind: "asset-head", key: `h:a:${item.fgroup ?? "other"}`, asset: item.fgroup ?? "other" });
      if (item.country && (assetChanged || prev?.country !== item.country)) out.push({ kind: "country-head", key: `h:c:${item.fgroup ?? "other"}:${item.country}`, country: item.country });
    } else if (ctx.mix && ctx.tab === "all" && (!prev || prev.group !== item.group)) {
      out.push({ kind: "group-head", key: `h:g:${item.group}`, group: item.group });
    }
    out.push({ kind: "item", key: itemKey(item), item });
    prev = item;
  }
  return out;
}

/** The rows a keyboard / click can act on, in order. */
export function selectableRows(rows: DisplayRow[]): Extract<DisplayRow, { kind: "item" }>[] {
  return rows.filter((r): r is Extract<DisplayRow, { kind: "item" }> => r.kind === "item");
}

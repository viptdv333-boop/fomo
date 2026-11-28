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
  if (ctx.tab === "future") {
    // Search ranking can interleave different asset classes and countries. Render each section
    // once while preserving the rank order within that section.
    const assets = new Map<string, MarketItem[]>();
    for (const item of items) {
      const key = item.fgroup ?? "other";
      const rows = assets.get(key) ?? [];
      rows.push(item);
      assets.set(key, rows);
    }
    for (const [assetKey, assetItems] of assets) {
      const asset = assetKey as FutAsset;
      if (!ctx.asset) out.push({ kind: "asset-head", key: `h:a:${asset}`, asset });
      const countries = new Map<string, MarketItem[]>();
      for (const item of assetItems) {
        const key = item.country ?? "";
        const rows = countries.get(key) ?? [];
        rows.push(item);
        countries.set(key, rows);
      }
      for (const [country, countryItems] of countries) {
        if (country) out.push({ kind: "country-head", key: `h:c:${asset}:${country}`, country });
        for (const item of countryItems) out.push({ kind: "item", key: itemKey(item), item });
      }
    }
    return out;
  }
  if (ctx.mix && ctx.tab === "all") {
    // A ranked all-market result may interleave groups; bucket it so a section title is never repeated.
    const groups = new Map<MarketGroup, MarketItem[]>();
    for (const item of items) {
      const rows = groups.get(item.group) ?? [];
      rows.push(item);
      groups.set(item.group, rows);
    }
    for (const [group, groupItems] of groups) {
      out.push({ kind: "group-head", key: `h:g:${group}`, group });
      for (const item of groupItems) out.push({ kind: "item", key: itemKey(item), item });
    }
    return out;
  }
  for (const item of items) out.push({ kind: "item", key: itemKey(item), item });
  return out;
}

/** The rows a keyboard / click can act on, in order. */
export function selectableRows(rows: DisplayRow[]): Extract<DisplayRow, { kind: "item" }>[] {
  return rows.filter((r): r is Extract<DisplayRow, { kind: "item" }> => r.kind === "item");
}

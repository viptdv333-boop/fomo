import catalogue from "./instaforex-catalog.generated.json";
import logos from "./instaforex-logos.generated.json";
import type { FutAsset, GroupTab, MarketItem } from "./market-types";
import { parseFxSymbol } from "./forex-meta";

export interface InstaInstrument {
  id: string;
  symbol: string;
  alternatives?: string[];
  name: string;
  group: "stock" | "forex" | "future";
  digits: number;
  kind?: "spot" | "monthly";
  asset?: string;
  fgroup?: FutAsset;
}
export const INSTA_INSTRUMENTS = catalogue as InstaInstrument[];
const BY_ID = new Map(INSTA_INSTRUMENTS.map((r) => [r.id.toUpperCase(), r]));
export function instaInstrument(id: string): InstaInstrument | undefined {
  return BY_ID.get(id.replace(/^#/, "").toUpperCase());
}
export function instaItem(row: InstaInstrument): MarketItem {
  return { secid: row.id, ticker: row.id, name: row.name, group: row.group, source: "instaforex", exchange: "InstaForex", country: row.group === "stock" ? "US" : undefined,
    kind: row.kind, asset: row.asset, fgroup: row.fgroup, board: row.group === "stock" ? "InstaForex" : undefined,
    sub: row.group === "forex" ? parseFxSymbol(row.id)?.kind ?? "cross" : undefined };
}
const normalized = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[\s/#_-]/g, "");
export function instaItems(group: GroupTab, query = ""): MarketItem[] {
  const q = normalized(query);
  return INSTA_INSTRUMENTS.filter((r) => group === "all" || (group === "spot" ? r.kind === "spot" : group === r.group))
    .map((row, index) => ({ row, index, score: !q ? 1 : normalized(row.id) === q ? 100 : normalized(row.id).startsWith(q) ? 80 : normalized(row.name).includes(q) || normalized(row.symbol).includes(q) || normalized(row.asset ?? "").includes(q) || normalized(row.fgroup ?? "").includes(q) ? 50 : 0 }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map((r) => instaItem(r.row));
}
export function instaBrandIcon(id: string): string {
  return (logos as Record<string, string>)[id.replace(/^#/, "").toUpperCase()] ?? "";
}

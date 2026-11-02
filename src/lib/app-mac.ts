// Pure helpers of the phone version of the "macOS" look (design "FOMO Terminal Mobile"): the screen's bottom bar, the colours of the watchlist
// icons, sparklines, the filter. No React, no DOM: scripts/check-app-ui.ts runs them.

/** [outline path, fill path] of a design glyph, light colour (the translucent fill), stroke colour (the line and the glow). */
export interface MacGlyphDef {
  d: string;
  fl: string;
  light: string;
  stroke: string;
}

export type MacTabId = "term" | "list" | "tools" | "alerts" | "profile";

export interface MacTabDef extends MacGlyphDef {
  id: MacTabId;
  /** i18n key of the label */
  key: string;
}

/** The five tabs of the design's bottom bar (the glyphs and colours are the design's `tabDefs`). */
export const MAC_TABS: readonly MacTabDef[] = [
  { id: "term", key: "mac.m.tabTerm", d: "M8 3v3M8 14v4M6 6h4v8H6zM16 7v3M16 17v3M14 10h4v7h-4z", fl: "M6 6h4v8H6zM14 10h4v7h-4z", light: "#7DB0D6", stroke: "#5B8FC0" },
  { id: "list", key: "mac.m.tabList", d: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01", fl: "M8 6h12M8 12h12M8 18h12", light: "#7CC29B", stroke: "#4F9A74" },
  { id: "tools", key: "mac.m.tabTools", d: "M4 20l1-5L16 4l4 4L9 19zM13 7l4 4", fl: "M4 20l1-5L16 4l4 4L9 19z", light: "#A78BC9", stroke: "#8A6DB0" },
  { id: "alerts", key: "mac.m.tabAlerts", d: "M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4", fl: "M6 16V11a6 6 0 0112 0v5l2 2H4z", light: "#E6B877", stroke: "#CC9446" },
  { id: "profile", key: "mac.m.tabProfile", d: "M16 8a4 4 0 10-8 0 4 4 0 008 0zM4 21c1-4 4-6 8-6s7 2 8 6", fl: "M16 8a4 4 0 10-8 0 4 4 0 008 0z", light: "#DE96A0", stroke: "#C46A78" },
];

/** The four quick actions under the chart (design `quick`). `win` is shown only where the chart can have windows, else `set` takes its place. */
export const MAC_QUICK: Record<"compare" | "indicators" | "window" | "alerts" | "settings", MacGlyphDef & { key: string }> = {
  compare: { key: "mac.lbl.compare", d: "M4 7h6l4 10h6M4 17h6l4-10h6", fl: "M4 7h6l4 10h6M4 17h6l4-10h6", light: "#7DB0D6", stroke: "#5B8FC0" },
  indicators: { key: "mac.lbl.indicators", d: "M3 17l6-6 4 4 8-9", fl: "M3 17l6-6 4 4 8-9", light: "#A78BC9", stroke: "#8A6DB0" },
  window: { key: "mac.lbl.window", d: "M12 5v14M5 12h14", fl: "", light: "#7CC29B", stroke: "#4F9A74" },
  alerts: { key: "mac.lbl.alerts", d: "M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4", fl: "M6 16V11a6 6 0 0112 0v5l2 2H4z", light: "#E6B877", stroke: "#CC9446" },
  settings: { key: "mac.lbl.settings", d: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4", fl: "", light: "#E6B877", stroke: "#CC9446" },
};

/** Indicator dots of the chips row: the design's palette, used when an indicator reports no colour of its own. */
export const MAC_CHIP_COLORS = ["#D9A24F", "#5B82C4", "#C8607C", "#4FA3A8", "#3F6BB0", "#3F9A82"] as const;

interface RowIcon {
  /** gradient of the 44px circle */
  c1: string;
  c2: string;
  /** outline path, fill path of the white glyph */
  d: string;
  fl: string;
}

const DIAMOND = "M6 4h12l4 6-10 11L2 10zM2 10h20M9 4l-2 6 5 11 5-11-2-6";
const FLAME = "M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z";

/** The watchlist glyphs of the design (`IC` / `raw`), by ticker. Anything else gets a gradient by name and the instrument's own artwork or letters. */
export const MAC_ROW_ICONS: Record<string, RowIcon> = {
  BR: { c1: "#2C2C30", c2: "#0E0E10", d: "M12 3c3 4 6 7 6 11a6 6 0 01-12 0c0-4 3-7 6-11z", fl: "M12 3c3 4 6 7 6 11a6 6 0 01-12 0c0-4 3-7 6-11z" },
  NG: { c1: "#6A8FD0", c2: "#5577B8", d: FLAME, fl: FLAME },
  PLT: { c1: "#9AA0AE", c2: "#747B8C", d: DIAMOND, fl: "M6 4h12l4 6H2z" },
  PLD: { c1: "#6BB3B8", c2: "#4F9AA0", d: DIAMOND, fl: "M12 21L2 10h20z" },
  USDRUBF: { c1: "#6BB38C", c2: "#4F9A74", d: "M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.8 4 3.2 4 1.5 4 3.2-1.8 3-4 3-4-1.3-4-3", fl: "" },
  CNYRUBF: { c1: "#D98A94", c2: "#C46A78", d: "M6 4l6 8 6-8M12 12v9M7 14h10M7 18h10", fl: "" },
  COCOA: { c1: "#B59878", c2: "#957556", d: "M12 3c5 0 8 4 8 9s-3 9-8 9-8-4-8-9 3-9 8-9zM12 3c-2 4-2 14 0 18", fl: "M12 3c5 0 8 4 8 9s-3 9-8 9c2-4 2-14 0-18z" },
  IMOEXF: { c1: "#8A8FD0", c2: "#6E73B8", d: "M3 17l5-6 4 4 9-10M16 5h5v5", fl: "" },
  GOLD: { c1: "#E0B06A", c2: "#CC9446", d: "M2 19l3-7h8l3 7zM9 12l3-7h8l3 7z", fl: "M2 19l3-7h8l3 7z" },
};

/** Futures contract code: month letter + year digit(s) (BRX6, NGZ26). */
const CONTRACT_SUFFIX = /[FGHJKMNQUVXZ]\d{1,2}$/;

/** Key into MAC_ROW_ICONS for a ticker (BRX6 -> BR), or null when the design has no glyph for it. */
export function macIconKey(ticker: string): string | null {
  const t = (ticker || "").toUpperCase();
  if (MAC_ROW_ICONS[t]) return t;
  const root = t.replace(CONTRACT_SUFFIX, "");
  return root !== t && MAC_ROW_ICONS[root] ? root : null;
}

/** Pairs of the design's circle gradients, for tickers it has no glyph for: stable per ticker. */
export const MAC_GRADS: readonly (readonly [string, string])[] = [
  ["#6A8FD0", "#5577B8"],
  ["#6BB38C", "#4F9A74"],
  ["#D98A94", "#C46A78"],
  ["#8A8FD0", "#6E73B8"],
  ["#E0B06A", "#CC9446"],
  ["#6BB3B8", "#4F9AA0"],
  ["#A78BC9", "#8A6DB0"],
];

export function macGradFor(ticker: string): readonly [string, string] {
  let h = 0;
  for (const ch of ticker || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MAC_GRADS[h % MAC_GRADS.length];
}

/** Sparkline path in a 60x24 box (the design's `spark`): y = 22 - normalised * 20. Fewer than 2 finite points -> "". */
export function sparkPath(values: readonly number[] | undefined, w = 60, h = 24): string {
  const v = (values ?? []).filter((x) => Number.isFinite(x));
  if (v.length < 2) return "";
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const n = v.length - 1;
  return v.map((q, k) => `${k ? "L" : "M"}${((k / n) * w).toFixed(1)} ${(h - 2 - ((q - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join("");
}

/** Colours of the change pill and the sparkline (design: green >= 0, red below, neutral when unknown). */
export function macTone(tone: "up" | "down" | null): { bg: string; fg: string; line: string } {
  if (tone === "down") return { bg: "rgba(201,90,80,.14)", fg: "#B8473F", line: "#D9685F" };
  if (tone === "up") return { bg: "rgba(79,167,123,.16)", fg: "#2E7D55", line: "#4FA77B" };
  return { bg: "rgba(128,128,136,.14)", fg: "#6e6e73", line: "#9a9aa2" };
}

/** The filter of the list screen: case-insensitive substring of the ticker, the data ticker or the shown name. Empty query keeps everything. */
export function filterWatch<T extends { ticker: string; dataTicker: string }>(items: readonly T[], query: string, nameOf: (i: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((i) => i.ticker.toLowerCase().includes(q) || i.dataTicker.toLowerCase().includes(q) || nameOf(i).toLowerCase().includes(q));
}

/** Where a tab of the design's bar leads: the screens of the terminal itself, or an action of the chart / an app section. */
export type MacTabAction = "screen:term" | "screen:list" | "sheet:tools" | "alerts" | "profile";

export function macTabAction(id: MacTabId): MacTabAction {
  return id === "term" ? "screen:term" : id === "list" ? "screen:list" : id === "tools" ? "sheet:tools" : id === "alerts" ? "alerts" : "profile";
}

/** Which tab is lit: the list tab while the list screen is open, the tools tab while the sheet is, otherwise the terminal. */
export function macActiveTab(screen: "term" | "list", sheetOpen: boolean): MacTabId {
  return sheetOpen ? "tools" : screen === "list" ? "list" : "term";
}

/** The title of the header: «BR · Нефть Brent»; a name that already starts with the ticker stands alone, a trailing « · TICKER» of the name is dropped («BR Dec-26 · BRZ6» -> «BRZ6 · BR Dec-26»). */
export function macTitle(ticker: string, name: string): string {
  let n = (name || "").trim();
  const tail = ` · ${ticker}`.toLowerCase();
  if (ticker && n.toLowerCase().endsWith(tail)) n = n.slice(0, n.length - tail.length).trim();
  if (!n) return ticker;
  return n.toLowerCase().startsWith((ticker || "").toLowerCase()) ? n : `${ticker} · ${n}`;
}

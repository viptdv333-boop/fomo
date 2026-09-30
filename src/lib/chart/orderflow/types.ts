/* Order flow model shared by the footprint chart, the volume profile / VWAP / CVD / delta indicators and the drawing tools.
   Volumes are split by the AGGRESSOR: bid = volume of market sells that hit the bid, ask = volume of market buys that lifted
   the ask. delta = ask - bid. */

/** One bar of order flow. `lv` is flat [price, bid, ask, price, bid, ask, ...] with ascending price. */
export interface FlowBar {
  /** Chart time of the bar start. */
  t: number;
  lv: number[];
  bid: number;
  ask: number;
  /** Highest / lowest running delta inside the bar (minute resolution), relative to the bar start. */
  dh: number;
  dl: number;
  /** true = from executed trades; false = spread over the candle (approximation). */
  real: boolean;
}

export type FootprintMode = "bidask" | "delta" | "volume" | "deltavol";

export interface FootprintColors {
  /** Buy (ask) side. Empty = the chart's up colour. */
  buy: string;
  /** Sell (bid) side. Empty = the chart's down colour. */
  sell: string;
  poc: string;
  /** Imbalance highlight; empty = buy / sell colour. */
  imbBuy: string;
  imbSell: string;
  stacked: string;
  valueArea: string;
  text: string;
}

export interface FootprintSettings {
  mode: FootprintMode;
  /** 0 = pick the price step from the zoom; n > 0 = a cell is n instrument ticks tall. */
  stepTicks: number;
  poc: boolean;
  imbalance: boolean;
  /** Imbalance threshold as a ratio (3 = 300 %). */
  imbalanceRatio: number;
  /** Ignore imbalances whose larger side is below this volume. */
  imbalanceMinVol: number;
  /** Compare ask with the bid one level below (classic diagonal imbalance); false = same level. */
  diagonal: boolean;
  stacked: boolean;
  stackedCount: number;
  unfinished: boolean;
  totals: boolean;
  valueArea: boolean;
  valueAreaPct: number;
  candleBody: boolean;
  colors: FootprintColors;
}

export const DEFAULT_FOOTPRINT: FootprintSettings = {
  mode: "bidask",
  stepTicks: 0,
  poc: true,
  imbalance: true,
  imbalanceRatio: 3,
  imbalanceMinVol: 0,
  diagonal: true,
  stacked: true,
  stackedCount: 3,
  unfinished: true,
  totals: true,
  valueArea: true,
  valueAreaPct: 70,
  candleBody: true,
  colors: { buy: "", sell: "", poc: "#f5b800", imbBuy: "", imbSell: "", stacked: "#b56cf5", valueArea: "#2962ff", text: "" },
};

const clamp = (v: unknown, lo: number, hi: number, def: number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const colorOk = (v: unknown, def: string) => (typeof v === "string" && (v === "" || /^#[0-9a-f]{6}$/i.test(v)) ? v : def);

/** Coerces stored / foreign data to valid settings. */
export function sanitizeFootprint(raw: unknown): FootprintSettings {
  const d = DEFAULT_FOOTPRINT;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (r.colors && typeof r.colors === "object" ? r.colors : {}) as Record<string, unknown>;
  const b = (k: keyof FootprintSettings) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (d[k] as boolean));
  const mode = r.mode === "bidask" || r.mode === "delta" || r.mode === "volume" || r.mode === "deltavol" ? r.mode : d.mode;
  return {
    mode,
    stepTicks: Math.round(clamp(r.stepTicks, 0, 100000, d.stepTicks)),
    poc: b("poc"),
    imbalance: b("imbalance"),
    imbalanceRatio: clamp(r.imbalanceRatio, 1.1, 100, d.imbalanceRatio),
    imbalanceMinVol: clamp(r.imbalanceMinVol, 0, 1e12, d.imbalanceMinVol),
    diagonal: b("diagonal"),
    stacked: b("stacked"),
    stackedCount: Math.round(clamp(r.stackedCount, 2, 12, d.stackedCount)),
    unfinished: b("unfinished"),
    totals: b("totals"),
    valueArea: b("valueArea"),
    valueAreaPct: clamp(r.valueAreaPct, 10, 100, d.valueAreaPct),
    candleBody: b("candleBody"),
    colors: {
      buy: colorOk(c.buy, d.colors.buy),
      sell: colorOk(c.sell, d.colors.sell),
      poc: colorOk(c.poc, d.colors.poc),
      imbBuy: colorOk(c.imbBuy, d.colors.imbBuy),
      imbSell: colorOk(c.imbSell, d.colors.imbSell),
      stacked: colorOk(c.stacked, d.colors.stacked),
      valueArea: colorOk(c.valueArea, d.colors.valueArea),
      text: colorOk(c.text, d.colors.text),
    },
  };
}

/** Indicator ids that read order flow data (the chart then fetches it even when the footprint is not the chart type). */
export const FLOW_INDICATOR_IDS = ["vprofile", "vp_session", "vwap", "avwap", "cvd", "delta"];
/** Drawing tools that use it. */
export const FLOW_DRAWING_TOOLS = ["fixed_volume_profile", "anchored_volume_profile", "anchored_vwap"];

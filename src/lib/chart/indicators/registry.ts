import type { Candle, SeriesContext } from "../types";
import type { ParamValue } from "../contracts";
import * as M from "./math";
import type { F64 } from "./math";
import { drawVolumeProfile } from "./volprofile";

/* Indicator definitions: parameter schema + compute(). Names and descriptions live in the i18n dictionary
   under `ind.<id>.name` / `ind.<id>.desc`; parameter labels under `ind.p.<key>`. */

export type Params = Record<string, ParamValue>;
export type Category = "trend" | "momentum" | "volatility" | "volume" | "ma" | "sr" | "other";
export type PlotShape = "line" | "step" | "area" | "histogram" | "columns" | "circles";
export type LineStyleName = "solid" | "dashed" | "dotted";
export type NumFmt = "price" | "osc" | "vol";

export interface NumberParam { key: string; type: "number"; min: number; max: number; step: number; default: number }
export interface SelectOption { value: string; /** i18n key (starts with "ind.") or a literal label. */ label: string }
export interface SelectParam { key: string; type: "select"; options: SelectOption[]; default: string }
export interface BooleanParam { key: string; type: "boolean"; default: boolean }
export interface ColorParam { key: string; type: "color"; default: string }
export type ParamDef = NumberParam | SelectParam | BooleanParam | ColorParam;

export interface PlotSpec {
  key: string;
  data: ArrayLike<number>;
  kind: "line" | "hist" | "dots";
  /** Solid color used for the line, the legend and the axis flag. */
  color: string;
  width?: number;
  dashed?: boolean;
  /** Bars the plot is shifted by when drawn (positive = to the right, into the future). */
  offset?: number;
  /** Per-bar colors (solid), for histograms and dots. */
  colors?: string[];
  /** Global alpha for histograms. */
  alpha?: number;
  /** Draw on the built-in volume band of the main pane, in that band's own scale. */
  volBand?: boolean;
  /** Show a flag on the price axis (default: true for lines and dots). */
  flag?: boolean;
  /** Contribute to the pane's auto-scale (default true, except volBand). */
  scale?: boolean;
  /** Show the value in the legend (default true). */
  legend?: boolean;
  fmt?: NumFmt;
  /** Drawing type; when omitted: line -> "line", hist -> "columns", dots -> "circles". */
  shape?: PlotShape;
  lineStyle?: LineStyleName;
  /** Not drawn, not in the legend, not in the scale (set by the Style tab). */
  hidden?: boolean;
  /** Horizontal line at the last value. */
  priceLine?: boolean;
  /** Join the points across NaN gaps (ZigZag). */
  connect?: boolean;
  /** Colour params that feed the per-bar `colors` (the Style tab edits those instead of a single colour). */
  colorParams?: string[];
}

export interface LevelSpec {
  value: number;
  color: string;
  dashed?: boolean;
  lineStyle?: LineStyleName;
  width?: number;
  hidden?: boolean;
  /** Name in the Style tab: an i18n key ("ind2.lvl.upper") or a literal. */
  name?: string;
  label?: string;
  /** Start bar; the line runs from there to the right edge. Full width when omitted. */
  fromIndex?: number;
  flag?: boolean;
  scale?: boolean;
}

export interface FillSpec {
  a: ArrayLike<number>;
  b: ArrayLike<number>;
  /** rgba() fill color. */
  color: string;
  /** Only where a >= b ("above") or a < b ("below"). */
  when?: "above" | "below";
  offset?: number;
  /** Name in the Style tab. */
  name?: string;
  hidden?: boolean;
}

/** Background between two levels. `loLevel` / `hiLevel` point into `levels` so that editing a level moves the band. */
export interface BandSpec { lo: number; hi: number; color: string; loLevel?: number; hiLevel?: number; hidden?: boolean }

export interface IndResult {
  plots: PlotSpec[];
  fills?: FillSpec[];
  levels?: LevelSpec[];
  bands?: BandSpec[];
  /** Fixed scale for the pane (RSI 0..100). */
  range?: [number, number];
}

export interface IndicatorDef {
  id: string;
  category: Category;
  pane: "overlay" | "own";
  /** Share of the plot height for an own pane. */
  paneRatio?: number;
  fmt: NumFmt;
  params: ParamDef[];
  title(p: Params): string;
  compute(candles: Candle[], p: Params): IndResult;
  /** Extra search words (latin), besides the localized name. */
  keywords?: string;
  /** Colour params edited on the Style tab as plain colour rows (used by drawExtra, which has no plots to hang colours on). */
  styleParams?: string[];
  /** Param keys that the Inputs tab must not list (they are edited on the Style tab, e.g. RSI bands). */
  hiddenParams?: string[];
  /** Can not be moved to another pane (draws on the price scale or in the volume band). */
  fixedPane?: boolean;
  /** Custom painter for things that are not plots (volume profile). Runs every frame with the visible range. */
  drawExtra?(sc: SeriesContext, p: Params): void;
}

/* ───────────── helpers ───────────── */

interface Cols {
  n: number;
  t: F64;
  o: F64;
  h: F64;
  l: F64;
  c: F64;
  v: F64;
}

function toCols(cs: Candle[]): Cols {
  const n = cs.length;
  const t = new Float64Array(n);
  const o = new Float64Array(n);
  const h = new Float64Array(n);
  const l = new Float64Array(n);
  const c = new Float64Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = cs[i];
    t[i] = k.t;
    o[i] = k.o;
    h[i] = k.h;
    l[i] = k.l;
    c[i] = k.c;
    v[i] = k.v;
  }
  return { n, t, o, h, l, c, v };
}

function pick(cols: Cols, key: string): F64 {
  switch (key) {
    case "open": return cols.o;
    case "high": return cols.h;
    case "low": return cols.l;
    case "hl2":
    case "hlc3":
    case "ohlc4": {
      const out = new Float64Array(cols.n);
      for (let i = 0; i < cols.n; i++) {
        out[i] =
          key === "hl2" ? (cols.h[i] + cols.l[i]) / 2
          : key === "hlc3" ? (cols.h[i] + cols.l[i] + cols.c[i]) / 3
          : (cols.o[i] + cols.h[i] + cols.l[i] + cols.c[i]) / 4;
      }
      return out;
    }
    default: return cols.c;
  }
}

export function hexToRgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;

const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

const SRC_OPTIONS: SelectOption[] = [
  { value: "close", label: "ind.o.close" },
  { value: "open", label: "ind.o.open" },
  { value: "high", label: "ind.o.high" },
  { value: "low", label: "ind.o.low" },
  { value: "hl2", label: "HL2" },
  { value: "hlc3", label: "HLC3" },
  { value: "ohlc4", label: "OHLC4" },
];
const MA_OPTIONS: SelectOption[] = [
  { value: "sma", label: "SMA" },
  { value: "ema", label: "EMA" },
  { value: "wma", label: "WMA" },
  { value: "rma", label: "RMA" },
  { value: "hma", label: "HMA" },
  { value: "vwma", label: "VWMA" },
];
const src = (def = "close") => sel("source", def, SRC_OPTIONS);

const GRAY_LINE = "rgba(120,123,134,0.7)";
const BLUE = "#2962ff";
const ORANGE = "#ff9800";
const PURPLE = "#9c27b0";
const VIOLET = "#7e57c2";
const GREEN = "#26a69a";
const RED = "#ef5350";
const YELLOW = "#fbc02d";
const CYAN = "#00acc1";
const PINK = "#e91e63";
const RIBBON = ["#f23645", "#ff9800", "#fbc02d", "#26a69a", "#2962ff", "#7e57c2", "#e91e63", "#00acc1"];

function line(key: string, data: ArrayLike<number>, color: string, extra?: Partial<PlotSpec>): PlotSpec {
  return { key, data, kind: "line", color, width: 1.6, ...extra };
}

/** Standard overbought/oversold decoration: dashed levels and a soft band between them. */
function oscLevels(upper: number, lower: number, color: string, mid?: number) {
  const levels: LevelSpec[] = [
    { value: upper, color: GRAY_LINE, dashed: true, name: "ind2.lvl.upper" },
    { value: lower, color: GRAY_LINE, dashed: true, name: "ind2.lvl.lower" },
  ];
  if (mid !== undefined) levels.push({ value: mid, color: "rgba(120,123,134,0.35)", dashed: true, name: "ind2.lvl.middle" });
  return { levels, bands: [{ lo: lower, hi: upper, color: hexToRgba(color, 0.08), loLevel: 1, hiLevel: 0 }] as BandSpec[] };
}

function zeroLevel(): LevelSpec[] {
  return [{ value: 0, color: "rgba(120,123,134,0.5)", dashed: true, name: "ind2.lvl.zero" }];
}

function movingAverage(id: string, short: string, defLen: number, defColor: string, fn: (s: F64, n: number, c: Cols) => F64, kw = ""): IndicatorDef {
  return {
    id,
    category: "ma",
    pane: "overlay",
    fmt: "price",
    keywords: `${short} moving average ${kw}`,
    params: [num("length", defLen, 1, 1000), src(), col("color", defColor)],
    title: (p) => `${short} ${N(p, "length")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line(short, fn(pick(cols, S(p, "source")), N(p, "length"), cols), S(p, "color"))] };
    },
  };
}

function periodOf(cols: Cols, sel: string): "day" | "week" | "month" {
  if (sel === "day" || sel === "week" || sel === "month") return sel;
  // auto: judge by the typical bar length
  const n = cols.n;
  if (n < 2) return "day";
  const from = Math.max(1, n - 20);
  const diffs: number[] = [];
  for (let i = from; i < n; i++) diffs.push(cols.t[i] - cols.t[i - 1]);
  diffs.sort((a, b) => a - b);
  const dt = diffs[Math.floor(diffs.length / 2)];
  if (dt < 20 * 3_600_000) return "day";
  if (dt < 4 * 86_400_000) return "week";
  return "month";
}

/* ───────────── definitions ───────────── */

const defs: IndicatorDef[] = [
  /* ── trend: moving averages ── */
  movingAverage("sma", "SMA", 20, BLUE, (s, n) => M.sma(s, n)),
  movingAverage("ema", "EMA", 20, ORANGE, (s, n) => M.ema(s, n)),
  movingAverage("wma", "WMA", 20, PURPLE, (s, n) => M.wma(s, n)),
  movingAverage("hma", "HMA", 21, PINK, (s, n) => M.hma(s, n), "hull"),
  movingAverage("vwma", "VWMA", 20, CYAN, (s, n, c) => M.vwma(s, c.v, n)),
  {
    id: "alma",
    category: "ma",
    pane: "overlay",
    fmt: "price",
    keywords: "ALMA arnaud legoux moving average",
    params: [num("length", 9, 1, 500), num("offset", 0.85, 0, 1, 0.01), num("sigma", 6, 0.5, 50, 0.5), src(), col("color", "#ff5722")],
    title: (p) => `ALMA ${N(p, "length")} ${N(p, "offset")} ${N(p, "sigma")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("ALMA", M.alma(pick(cols, S(p, "source")), N(p, "length"), N(p, "offset"), N(p, "sigma")), S(p, "color"))] };
    },
  },
  {
    id: "alma_multi",
    category: "ma",
    pane: "overlay",
    fmt: "price",
    keywords: "ALMA multi arnaud legoux 20 50 200 three",
    params: [
      num("length1", 20, 1, 1000),
      num("length2", 50, 1, 1000),
      num("length3", 200, 1, 1000),
      num("offset", 0.85, 0, 1, 0.01),
      num("sigma", 6, 0.5, 50, 0.5),
      src(),
      col("color1", "#ff9800"),
      col("color2", "#2962ff"),
      col("color3", "#e91e63"),
    ],
    title: (p) => `ALMA ${N(p, "length1")}/${N(p, "length2")}/${N(p, "length3")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const s = pick(cols, S(p, "source"));
      const o = N(p, "offset");
      const sg = N(p, "sigma");
      return {
        plots: [1, 2, 3].map((k) => line(`ALMA ${N(p, "length" + k)}`, M.alma(s, N(p, "length" + k), o, sg), S(p, "color" + k))),
      };
    },
  },

  /* ── trend: channels, bands ── */
  {
    id: "bb",
    category: "volatility",
    pane: "overlay",
    fmt: "price",
    keywords: "bollinger bands BB",
    params: [num("length", 20, 1, 500), num("mult", 2, 0.1, 10, 0.1), sel("maType", "sma", MA_OPTIONS), src(), col("color", BLUE), col("colorBasis", ORANGE)],
    title: (p) => `BB ${N(p, "length")} ${N(p, "mult")} ${S(p, "maType").toUpperCase()} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const s = pick(cols, S(p, "source"));
      const n = N(p, "length");
      const basis = M.maByType(S(p, "maType"), s, n, cols.v);
      const sd = M.stdev(s, n);
      const k = N(p, "mult");
      const up = new Float64Array(cols.n);
      const lo = new Float64Array(cols.n);
      for (let i = 0; i < cols.n; i++) {
        up[i] = basis[i] + k * sd[i];
        lo[i] = basis[i] - k * sd[i];
      }
      const c = S(p, "color");
      return {
        plots: [line("Upper", up, c, { width: 1.4 }), line("Basis", basis, S(p, "colorBasis"), { width: 1.4 }), line("Lower", lo, c, { width: 1.4 })],
        fills: [{ a: up, b: lo, color: hexToRgba(c, 0.07), name: "Upper / Lower" }],
      };
    },
  },
  {
    id: "keltner",
    category: "volatility",
    pane: "overlay",
    fmt: "price",
    keywords: "keltner channels KC",
    params: [num("length", 20, 1, 500), num("mult", 2, 0.1, 10, 0.1), num("atrLength", 10, 1, 500), sel("maType", "ema", MA_OPTIONS), src(), col("color", BLUE)],
    title: (p) => `KC ${N(p, "length")} ${N(p, "mult")} ${N(p, "atrLength")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const basis = M.maByType(S(p, "maType"), pick(cols, S(p, "source")), N(p, "length"), cols.v);
      const a = M.atr(cols.h, cols.l, cols.c, N(p, "atrLength"));
      const k = N(p, "mult");
      const up = new Float64Array(cols.n);
      const lo = new Float64Array(cols.n);
      for (let i = 0; i < cols.n; i++) {
        up[i] = basis[i] + k * a[i];
        lo[i] = basis[i] - k * a[i];
      }
      const c = S(p, "color");
      return {
        plots: [line("Upper", up, c, { width: 1.4 }), line("Basis", basis, c, { width: 1.4, dashed: true }), line("Lower", lo, c, { width: 1.4 })],
        fills: [{ a: up, b: lo, color: hexToRgba(c, 0.06), name: "Upper / Lower" }],
      };
    },
  },
  {
    id: "donchian",
    category: "volatility",
    pane: "overlay",
    fmt: "price",
    keywords: "donchian channels DC",
    params: [num("length", 20, 1, 500), col("color", BLUE), col("colorBasis", ORANGE)],
    title: (p) => `DC ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const up = M.highest(cols.h, N(p, "length"));
      const lo = M.lowest(cols.l, N(p, "length"));
      const mid = new Float64Array(cols.n);
      for (let i = 0; i < cols.n; i++) mid[i] = (up[i] + lo[i]) / 2;
      const c = S(p, "color");
      return {
        plots: [line("Upper", up, c, { width: 1.4 }), line("Basis", mid, S(p, "colorBasis"), { width: 1.4 }), line("Lower", lo, c, { width: 1.4 })],
        fills: [{ a: up, b: lo, color: hexToRgba(c, 0.06), name: "Upper / Lower" }],
      };
    },
  },
  {
    id: "vwap",
    category: "volume",
    pane: "overlay",
    fmt: "price",
    keywords: "vwap volume weighted average price session anchored",
    params: [
      sel("anchor", "day", [
        { value: "day", label: "ind.o.day" },
        { value: "week", label: "ind.o.week" },
        { value: "month", label: "ind.o.month" },
      ]),
      bool("bands", false),
      num("mult", 1, 0.1, 10, 0.1),
      col("color", "#1e88e5"),
      col("colorBands", "#43a047"),
    ],
    title: (p) => `VWAP ${S(p, "anchor")}${B(p, "bands") ? " ±" + N(p, "mult") : ""}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const { vwap, sd } = M.vwapAnchored(cols.t, cols.h, cols.l, cols.c, cols.v, S(p, "anchor") as "day" | "week" | "month");
      const plots = [line("VWAP", vwap, S(p, "color"), { width: 1.8 })];
      const fills: FillSpec[] = [];
      if (B(p, "bands")) {
        const k = N(p, "mult");
        const up = new Float64Array(cols.n);
        const lo = new Float64Array(cols.n);
        for (let i = 0; i < cols.n; i++) {
          up[i] = vwap[i] + k * sd[i];
          lo[i] = vwap[i] - k * sd[i];
        }
        const bc = S(p, "colorBands");
        plots.push(line("Upper", up, bc, { width: 1.2 }), line("Lower", lo, bc, { width: 1.2 }));
        fills.push({ a: up, b: lo, color: hexToRgba(bc, 0.06), name: "Upper / Lower" });
      }
      return { plots, fills };
    },
  },
  {
    id: "supertrend",
    category: "trend",
    pane: "overlay",
    fmt: "price",
    keywords: "supertrend atr trend",
    params: [num("period", 10, 1, 200), num("mult", 3, 0.1, 30, 0.1), col("colorUp", "#26a69a"), col("colorDown", "#ef5350")],
    title: (p) => `Supertrend ${N(p, "period")} ${N(p, "mult")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const st = M.supertrend(cols.h, cols.l, cols.c, N(p, "period"), N(p, "mult"));
      return {
        plots: [line("Up", st.up, S(p, "colorUp"), { width: 2 }), line("Down", st.down, S(p, "colorDown"), { width: 2 })],
      };
    },
  },
  {
    id: "psar",
    category: "trend",
    pane: "overlay",
    fmt: "price",
    keywords: "parabolic sar stop and reverse",
    params: [num("start", 0.02, 0.001, 1, 0.001), num("increment", 0.02, 0.001, 1, 0.001), num("maximum", 0.2, 0.01, 1, 0.01), col("colorUp", "#26a69a"), col("colorDown", "#ef5350")],
    title: (p) => `SAR ${N(p, "start")} ${N(p, "increment")} ${N(p, "maximum")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.parabolicSar(cols.h, cols.l, cols.c, N(p, "start"), N(p, "increment"), N(p, "maximum"));
      const up = S(p, "colorUp");
      const dn = S(p, "colorDown");
      const colors = new Array<string>(cols.n);
      for (let i = 0; i < cols.n; i++) colors[i] = r.dir[i] >= 0 ? up : dn;
      return { plots: [{ key: "SAR", data: r.sar, kind: "dots", color: up, colors, colorParams: ["colorUp", "colorDown"] }] };
    },
  },
  {
    id: "ichimoku",
    category: "trend",
    pane: "overlay",
    fmt: "price",
    keywords: "ichimoku kinko hyo cloud",
    params: [
      num("conversion", 9, 1, 200),
      num("base", 26, 1, 400),
      num("spanB", 52, 1, 800),
      num("displacement", 26, 1, 200),
      col("colorTenkan", "#2962ff"),
      col("colorKijun", "#b71c1c"),
      col("colorChikou", "#43a047"),
      col("colorSpanA", "#26a69a"),
      col("colorSpanB", "#ef5350"),
    ],
    title: (p) => `Ichimoku ${N(p, "conversion")} ${N(p, "base")} ${N(p, "spanB")} ${N(p, "displacement")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const mid = (n: number) => {
        const hh = M.highest(cols.h, n);
        const ll = M.lowest(cols.l, n);
        const out = new Float64Array(cols.n);
        for (let i = 0; i < cols.n; i++) out[i] = (hh[i] + ll[i]) / 2;
        return out;
      };
      const tenkan = mid(N(p, "conversion"));
      const kijun = mid(N(p, "base"));
      const spanB = mid(N(p, "spanB"));
      const spanA = new Float64Array(cols.n);
      for (let i = 0; i < cols.n; i++) spanA[i] = (tenkan[i] + kijun[i]) / 2;
      const off = N(p, "displacement") - 1;
      const cA = S(p, "colorSpanA");
      const cB = S(p, "colorSpanB");
      return {
        plots: [
          line("Tenkan", tenkan, S(p, "colorTenkan"), { width: 1.4 }),
          line("Kijun", kijun, S(p, "colorKijun"), { width: 1.4 }),
          line("Chikou", cols.c, S(p, "colorChikou"), { width: 1.2, offset: -off }),
          line("Span A", spanA, cA, { width: 1, offset: off }),
          line("Span B", spanB, cB, { width: 1, offset: off }),
        ],
        fills: [
          { a: spanA, b: spanB, color: hexToRgba(cA, 0.16), when: "above", offset: off, name: "ind2.fill.cloudUp" },
          { a: spanA, b: spanB, color: hexToRgba(cB, 0.16), when: "below", offset: off, name: "ind2.fill.cloudDown" },
        ],
      };
    },
  },
  {
    id: "volume_ma",
    fixedPane: true,
    category: "volume",
    pane: "overlay",
    fmt: "vol",
    keywords: "volume moving average",
    params: [num("length", 20, 1, 500), sel("maType", "sma", MA_OPTIONS.slice(0, 3)), col("color", ORANGE)],
    title: (p) => `Vol MA ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const ma = M.maByType(S(p, "maType"), cols.v, N(p, "length"));
      return { plots: [line("MA", ma, S(p, "color"), { volBand: true, scale: false, flag: false, fmt: "vol" })] };
    },
  },
  {
    id: "pivots",
    category: "sr",
    pane: "overlay",
    fmt: "price",
    keywords: "pivot points classic support resistance",
    params: [
      sel("pivotPeriod", "auto", [
        { value: "auto", label: "ind.o.auto" },
        { value: "day", label: "ind.o.day" },
        { value: "week", label: "ind.o.week" },
        { value: "month", label: "ind.o.month" },
      ]),
      col("colorPivot", "#fbc02d"),
      col("colorRes", "#ef5350"),
      col("colorSup", "#26a69a"),
    ],
    title: (p) => `Pivots ${S(p, "pivotPeriod")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const n = cols.n;
      if (n < 2) return { plots: [] };
      const period = periodOf(cols, S(p, "pivotPeriod"));
      const lastKey = M.periodKey(cols.t[n - 1], period);
      let start = n - 1;
      while (start > 0 && M.periodKey(cols.t[start - 1], period) === lastKey) start--;
      if (start === 0) return { plots: [] };
      // previous period's high / low / close
      const prevKey = M.periodKey(cols.t[start - 1], period);
      let hi = -Infinity;
      let lo = Infinity;
      for (let i = start - 1; i >= 0 && M.periodKey(cols.t[i], period) === prevKey; i--) {
        if (cols.h[i] > hi) hi = cols.h[i];
        if (cols.l[i] < lo) lo = cols.l[i];
      }
      const lv = M.classicPivots(hi, lo, cols.c[start - 1]);
      const cP = S(p, "colorPivot");
      const cR = S(p, "colorRes");
      const cS = S(p, "colorSup");
      const mk = (label: string, value: number, color: string): LevelSpec => ({ value, color, label, name: label, fromIndex: start, flag: true, scale: false });
      return {
        plots: [],
        levels: [
          mk("R3", lv.R3, cR),
          mk("R2", lv.R2, cR),
          mk("R1", lv.R1, cR),
          mk("P", lv.P, cP),
          mk("S1", lv.S1, cS),
          mk("S2", lv.S2, cS),
          mk("S3", lv.S3, cS),
        ],
      };
    },
  },

  /* ── momentum ── */
  {
    id: "rsi",
    hiddenParams: ["upper", "lower"],
    category: "momentum",
    pane: "own",
    paneRatio: 0.2,
    fmt: "osc",
    keywords: "rsi relative strength index",
    params: [num("length", 14, 1, 500), src(), num("upper", 70, 1, 99), num("lower", 30, 1, 99), col("color", VIOLET)],
    title: (p) => `RSI ${N(p, "length")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.rsi(pick(cols, S(p, "source")), N(p, "length"));
      const c = S(p, "color");
      return { plots: [line("RSI", r, c)], ...oscLevels(N(p, "upper"), N(p, "lower"), c, 50), range: [0, 100] };
    },
  },
  {
    id: "macd",
    category: "momentum",
    pane: "own",
    paneRatio: 0.2,
    fmt: "osc",
    keywords: "macd moving average convergence divergence",
    params: [
      num("fast", 12, 1, 200),
      num("slow", 26, 1, 400),
      num("signal", 9, 1, 200),
      src(),
      sel("signalMa", "ema", [
        { value: "ema", label: "EMA" },
        { value: "sma", label: "SMA" },
      ]),
      col("colorMacd", BLUE),
      col("colorSignal", ORANGE),
      col("colorUp", GREEN),
      col("colorDown", RED),
    ],
    title: (p) => `MACD ${N(p, "fast")} ${N(p, "slow")} ${N(p, "signal")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.macd(pick(cols, S(p, "source")), N(p, "fast"), N(p, "slow"), N(p, "signal"), S(p, "signalMa"));
      const up = S(p, "colorUp");
      const dn = S(p, "colorDown");
      const colors = new Array<string>(cols.n);
      for (let i = 0; i < cols.n; i++) colors[i] = r.hist[i] >= 0 ? up : dn;
      return {
        plots: [
          { key: "Hist", data: r.hist, kind: "hist", color: up, colors, alpha: 0.75, flag: false, colorParams: ["colorUp", "colorDown"] },
          line("MACD", r.macd, S(p, "colorMacd")),
          line("Signal", r.signal, S(p, "colorSignal")),
        ],
        levels: zeroLevel(),
      };
    },
  },
  {
    id: "stoch",
    hiddenParams: ["upper", "lower"],
    category: "momentum",
    pane: "own",
    paneRatio: 0.2,
    fmt: "osc",
    keywords: "stochastic oscillator",
    params: [num("kLength", 14, 1, 500), num("kSmooth", 1, 1, 100), num("dLength", 3, 1, 100), num("upper", 80, 1, 99), num("lower", 20, 1, 99), col("colorK", BLUE), col("colorD", ORANGE)],
    title: (p) => `Stoch ${N(p, "kLength")} ${N(p, "kSmooth")} ${N(p, "dLength")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.stochastic(cols.h, cols.l, cols.c, N(p, "kLength"), N(p, "kSmooth"), N(p, "dLength"));
      return {
        plots: [line("%K", r.k, S(p, "colorK")), line("%D", r.d, S(p, "colorD"))],
        ...oscLevels(N(p, "upper"), N(p, "lower"), S(p, "colorK"), 50),
        range: [0, 100],
      };
    },
  },
  {
    id: "stochrsi",
    hiddenParams: ["upper", "lower"],
    category: "momentum",
    pane: "own",
    paneRatio: 0.2,
    fmt: "osc",
    keywords: "stochastic rsi",
    params: [
      num("rsiLength", 14, 1, 500),
      num("stochLength", 14, 1, 500),
      num("kSmooth", 3, 1, 100),
      num("dLength", 3, 1, 100),
      src(),
      num("upper", 80, 1, 99),
      num("lower", 20, 1, 99),
      col("colorK", BLUE),
      col("colorD", ORANGE),
    ],
    title: (p) => `Stoch RSI ${N(p, "rsiLength")} ${N(p, "stochLength")} ${N(p, "kSmooth")} ${N(p, "dLength")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.stochasticRsi(pick(cols, S(p, "source")), N(p, "rsiLength"), N(p, "stochLength"), N(p, "kSmooth"), N(p, "dLength"));
      return {
        plots: [line("%K", r.k, S(p, "colorK")), line("%D", r.d, S(p, "colorD"))],
        ...oscLevels(N(p, "upper"), N(p, "lower"), S(p, "colorK"), 50),
        range: [0, 100],
      };
    },
  },
  {
    id: "cci",
    hiddenParams: ["upper", "lower"],
    category: "momentum",
    pane: "own",
    paneRatio: 0.2,
    fmt: "osc",
    keywords: "cci commodity channel index",
    params: [num("length", 20, 1, 500), src("hlc3"), num("upper", 100, 1, 1000), num("lower", -100, -1000, -1, 1), col("color", "#1e88e5")],
    title: (p) => `CCI ${N(p, "length")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.cci(pick(cols, S(p, "source")), N(p, "length"));
      const c = S(p, "color");
      return { plots: [line("CCI", r, c)], ...oscLevels(N(p, "upper"), N(p, "lower"), c, 0) };
    },
  },
  {
    id: "willr",
    category: "momentum",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "williams percent r %R",
    params: [num("length", 14, 1, 500), col("color", VIOLET)],
    title: (p) => `%R ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const c = S(p, "color");
      return { plots: [line("%R", M.williamsR(cols.h, cols.l, cols.c, N(p, "length")), c)], ...oscLevels(-20, -80, c, -50), range: [-100, 0] };
    },
  },
  {
    id: "mfi",
    hiddenParams: ["upper", "lower"],
    category: "momentum",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "mfi money flow index",
    params: [num("length", 14, 1, 500), num("upper", 80, 1, 99), num("lower", 20, 1, 99), col("color", GREEN)],
    title: (p) => `MFI ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const tp = pick(cols, "hlc3");
      const c = S(p, "color");
      return { plots: [line("MFI", M.mfi(tp, cols.v, N(p, "length")), c)], ...oscLevels(N(p, "upper"), N(p, "lower"), c, 50), range: [0, 100] };
    },
  },
  {
    id: "roc",
    category: "momentum",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "roc rate of change",
    params: [num("length", 9, 1, 500), src(), col("color", BLUE)],
    title: (p) => `ROC ${N(p, "length")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("ROC", M.roc(pick(cols, S(p, "source")), N(p, "length")), S(p, "color"))], levels: zeroLevel() };
    },
  },
  {
    id: "mom",
    category: "momentum",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "momentum",
    params: [num("length", 10, 1, 500), src(), col("color", BLUE)],
    title: (p) => `Mom ${N(p, "length")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("Mom", M.momentum(pick(cols, S(p, "source")), N(p, "length")), S(p, "color"))], levels: zeroLevel() };
    },
  },

  /* ── volatility / trend strength ── */
  {
    id: "atr",
    category: "volatility",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "atr average true range",
    params: [
      num("length", 14, 1, 500),
      sel("smoothing", "rma", [
        { value: "rma", label: "RMA" },
        { value: "sma", label: "SMA" },
        { value: "ema", label: "EMA" },
        { value: "wma", label: "WMA" },
      ]),
      col("color", "#b71c1c"),
    ],
    title: (p) => `ATR ${N(p, "length")} ${S(p, "smoothing").toUpperCase()}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const tr = M.trueRange(cols.h, cols.l, cols.c);
      return { plots: [line("ATR", M.maByType(S(p, "smoothing"), tr, N(p, "length")), S(p, "color"))] };
    },
  },
  {
    id: "adx",
    category: "trend",
    pane: "own",
    paneRatio: 0.2,
    fmt: "osc",
    keywords: "adx dmi directional movement",
    params: [num("diLength", 14, 1, 200), num("adxSmoothing", 14, 1, 200), col("colorAdx", BLUE), col("colorPlus", GREEN), col("colorMinus", RED)],
    title: (p) => `ADX ${N(p, "adxSmoothing")} ${N(p, "diLength")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.adx(cols.h, cols.l, cols.c, N(p, "diLength"), N(p, "adxSmoothing"));
      return {
        plots: [line("ADX", r.adx, S(p, "colorAdx"), { width: 1.8 }), line("+DI", r.plus, S(p, "colorPlus"), { width: 1.3 }), line("-DI", r.minus, S(p, "colorMinus"), { width: 1.3 })],
        levels: [{ value: 25, color: GRAY_LINE, dashed: true, name: "ind2.lvl.level" }],
      };
    },
  },

  /* ── volume ── */
  {
    id: "volume",
    category: "volume",
    pane: "own",
    paneRatio: 0.16,
    fmt: "vol",
    keywords: "volume",
    params: [bool("showMa", true), num("maLength", 20, 1, 500), col("colorUp", "#26a69a"), col("colorDown", "#ef5350"), col("colorMa", ORANGE)],
    title: (p) => (B(p, "showMa") ? `Volume ${N(p, "maLength")}` : "Volume"),
    compute(cs, p) {
      const cols = toCols(cs);
      const up = S(p, "colorUp");
      const dn = S(p, "colorDown");
      const colors = new Array<string>(cols.n);
      for (let i = 0; i < cols.n; i++) colors[i] = cols.c[i] >= cols.o[i] ? up : dn;
      const plots: PlotSpec[] = [{ key: "Vol", data: cols.v, kind: "hist", color: up, colors, alpha: 0.7, flag: true, colorParams: ["colorUp", "colorDown"] }];
      if (B(p, "showMa")) plots.push(line("MA", M.sma(cols.v, N(p, "maLength")), S(p, "colorMa"), { width: 1.4 }));
      return { plots };
    },
  },
  {
    id: "obv",
    category: "volume",
    pane: "own",
    paneRatio: 0.18,
    fmt: "vol",
    keywords: "obv on balance volume",
    params: [col("color", BLUE)],
    title: () => "OBV",
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("OBV", M.obv(cols.c, cols.v), S(p, "color"))] };
    },
  },
  {
    id: "cvd",
    category: "volume",
    pane: "own",
    paneRatio: 0.18,
    fmt: "vol",
    keywords: "cvd cumulative volume delta approximate",
    params: [col("color", CYAN)],
    title: () => "CVD≈",
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("CVD≈", M.cvdApprox(cols.o, cols.h, cols.l, cols.c, cols.v), S(p, "color"))], levels: zeroLevel() };
    },
  },

  /* ── moving averages: ribbon ── */
  {
    id: "ma_ribbon",
    category: "ma",
    pane: "overlay",
    fmt: "price",
    keywords: "ma ribbon moving average ribbon several lines",
    params: [
      sel("maType", "ema", MA_OPTIONS),
      num("count", 6, 2, 8),
      num("startLength", 20, 1, 500),
      num("step", 10, 1, 200),
      src(),
    ],
    title: (p) => `Ribbon ${S(p, "maType").toUpperCase()} ${N(p, "startLength")}+${N(p, "step")}×${N(p, "count")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const s = pick(cols, S(p, "source"));
      const plots: PlotSpec[] = [];
      for (let k = 0; k < N(p, "count"); k++) {
        const len = N(p, "startLength") + k * N(p, "step");
        plots.push(line(`MA ${len}`, M.maByType(S(p, "maType"), s, len, cols.v), RIBBON[k % RIBBON.length], { width: 1.3 }));
      }
      return { plots };
    },
  },

  /* ── trend ── */
  {
    id: "aroon",
    category: "trend",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "aroon up down trend strength",
    params: [num("length", 14, 1, 500), col("colorUp", "#fb8c00"), col("colorDown", BLUE)],
    title: (p) => `Aroon ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.aroon(cols.h, cols.l, N(p, "length"));
      return {
        plots: [line("Up", r.up, S(p, "colorUp")), line("Down", r.down, S(p, "colorDown"))],
        levels: [
          { value: 70, color: GRAY_LINE, dashed: true, name: "ind2.lvl.upper" },
          { value: 30, color: GRAY_LINE, dashed: true, name: "ind2.lvl.lower" },
        ],
        range: [0, 100],
      };
    },
  },
  {
    id: "linreg",
    category: "trend",
    pane: "overlay",
    fmt: "price",
    keywords: "linear regression channel trend line",
    params: [num("length", 100, 2, 5000), num("mult", 2, 0.1, 10, 0.1), src(), col("color", BLUE), col("colorBasis", ORANGE)],
    title: (p) => `LR ${N(p, "length")} ${N(p, "mult")} ${S(p, "source")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.linregChannel(pick(cols, S(p, "source")), N(p, "length"), N(p, "mult"));
      const c = S(p, "color");
      return {
        plots: [line("Upper", r.upper, c, { width: 1.4 }), line("Basis", r.base, S(p, "colorBasis"), { width: 1.4, lineStyle: "dashed" }), line("Lower", r.lower, c, { width: 1.4 })],
        fills: [{ a: r.upper, b: r.lower, color: hexToRgba(c, 0.07), name: "Upper / Lower" }],
      };
    },
  },
  {
    id: "zigzag",
    category: "sr",
    pane: "overlay",
    fmt: "price",
    keywords: "zigzag zig zag swing pivots",
    params: [num("deviation", 5, 0.1, 50, 0.1), col("color", "#2962ff")],
    title: (p) => `ZigZag ${N(p, "deviation")}%`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("ZigZag", M.zigzag(cols.h, cols.l, N(p, "deviation")), S(p, "color"), { width: 1.8, connect: true, flag: false })] };
    },
  },
  {
    id: "fractals",
    category: "sr",
    pane: "overlay",
    fmt: "price",
    keywords: "williams fractals bill",
    params: [num("periods", 2, 1, 10), col("colorUp", "#ef5350"), col("colorDown", "#26a69a")],
    title: (p) => `Fractals ${N(p, "periods")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const r = M.fractals(cols.h, cols.l, N(p, "periods"));
      return {
        plots: [
          { key: "Up", data: r.up, kind: "dots", color: S(p, "colorUp"), flag: false, legend: false },
          { key: "Down", data: r.down, kind: "dots", color: S(p, "colorDown"), flag: false, legend: false },
        ],
      };
    },
  },

  /* ── momentum ── */
  {
    id: "ao",
    category: "momentum",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "awesome oscillator bill williams AO",
    params: [num("aoFast", 5, 1, 200), num("aoSlow", 34, 2, 500), col("colorUp", GREEN), col("colorDown", RED)],
    title: (p) => `AO ${N(p, "aoFast")} ${N(p, "aoSlow")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      const mid = pick(cols, "hl2");
      const fast = M.sma(mid, N(p, "aoFast"));
      const slow = M.sma(mid, N(p, "aoSlow"));
      const ao = new Float64Array(cols.n).fill(NaN);
      const colors = new Array<string>(cols.n);
      const up = S(p, "colorUp");
      const dn = S(p, "colorDown");
      for (let i = 0; i < cols.n; i++) {
        ao[i] = fast[i] - slow[i];
        colors[i] = i > 0 && ao[i] < ao[i - 1] ? dn : up;
      }
      return { plots: [{ key: "AO", data: ao, kind: "hist", color: up, colors, alpha: 0.85, flag: false, colorParams: ["colorUp", "colorDown"] }], levels: zeroLevel() };
    },
  },
  {
    id: "trix",
    category: "momentum",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "trix triple exponential average",
    params: [num("length", 18, 1, 300), col("color", "#f23645")],
    title: (p) => `TRIX ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("TRIX", M.trix(cols.c, N(p, "length")), S(p, "color"))], levels: zeroLevel() };
    },
  },

  /* ── volume ── */
  {
    id: "cmf",
    category: "volume",
    pane: "own",
    paneRatio: 0.18,
    fmt: "osc",
    keywords: "chaikin money flow CMF",
    params: [num("length", 20, 1, 500), col("color", "#43a047")],
    title: (p) => `CMF ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("CMF", M.cmf(cols.h, cols.l, cols.c, cols.v, N(p, "length")), S(p, "color"))], levels: zeroLevel() };
    },
  },
  {
    id: "efi",
    category: "volume",
    pane: "own",
    paneRatio: 0.18,
    fmt: "vol",
    keywords: "elder force index EFI",
    params: [num("length", 13, 1, 500), col("color", "#ef5350")],
    title: (p) => `EFI ${N(p, "length")}`,
    compute(cs, p) {
      const cols = toCols(cs);
      return { plots: [line("EFI", M.forceIndex(cols.c, cols.v, N(p, "length")), S(p, "color"))], levels: zeroLevel() };
    },
  },
  {
    id: "vprofile",
    fixedPane: true,
    category: "volume",
    pane: "overlay",
    fmt: "vol",
    keywords: "volume profile visible range VRVP POC value area",
    params: [
      num("rows", 24, 4, 200),
      num("widthPct", 30, 5, 90),
      sel("placement", "left", [
        { value: "left", label: "ind2.o.left" },
        { value: "right", label: "ind2.o.right" },
      ]),
      num("valueArea", 70, 10, 100),
      bool("showVaLines", false),
      col("colorUp", "#2962ff"),
      col("colorDown", "#ff9800"),
      col("colorPoc", "#f23645"),
    ],
    styleParams: ["colorUp", "colorDown", "colorPoc"],
    title: (p) => `VP ${N(p, "rows")} ${N(p, "valueArea")}%`,
    compute() {
      return { plots: [] };
    },
    drawExtra(sc, p) {
      drawVolumeProfile(sc, p);
    },
  },
];

export const INDICATOR_DEFS: readonly IndicatorDef[] = defs;

const byId = new Map<string, IndicatorDef>();
for (const d of defs) byId.set(d.id, d);

export function getIndicatorDef(id: string): IndicatorDef | undefined {
  return byId.get(id);
}

export const CATEGORIES: readonly Category[] = ["trend", "momentum", "volatility", "volume", "sr", "ma", "other"];

export function defaultParams(def: IndicatorDef): Params {
  const out: Params = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}

/** Fills missing keys with defaults and coerces / clamps everything else to the schema. */
export function sanitizeParams(def: IndicatorDef, raw: Record<string, ParamValue> | undefined): Params {
  const out: Params = {};
  for (const p of def.params) {
    const v = raw?.[p.key];
    switch (p.type) {
      case "number": {
        let n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
        if (!isFinite(n)) n = p.default;
        n = Math.min(p.max, Math.max(p.min, n));
        if (Number.isInteger(p.step)) n = Math.round(n);
        else n = Math.round(n * 1e6) / 1e6;
        out[p.key] = n;
        break;
      }
      case "select":
        out[p.key] = typeof v === "string" && p.options.some((o) => o.value === v) ? v : p.default;
        break;
      case "boolean":
        out[p.key] = typeof v === "boolean" ? v : p.default;
        break;
      case "color":
        out[p.key] = typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : p.default;
        break;
    }
  }
  return out;
}

export function computeIndicator(def: IndicatorDef, candles: Candle[], params: Params): IndResult {
  if (candles.length === 0) return { plots: [] };
  return def.compute(candles, params);
}

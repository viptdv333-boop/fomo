import type { FootprintSettings } from "./orderflow/types";
import type { OrderFlowStore } from "./orderflow/store";

export interface Candle {
  /** Bar start, ms. For MOEX this is Moscow wall time stored as if it were UTC (see timeShiftMs). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** Extra flag of transformed bars: Kagi 1 = thick (yang) line, Point & Figure 1 = X column, 0 = O column. */
  k?: number;
}

export type ChartType =
  | "candles"
  | "hollow"
  | "bars"
  | "line"
  | "area"
  | "heikin"
  | "columns"
  | "highlow"
  | "linemarkers"
  | "step"
  | "baseline"
  | "volcandles"
  | "renko"
  | "kagi"
  | "linebreak"
  | "range"
  | "pnf"
  | "footprint";

/** Chart types whose bars are built from the OHLC data (not one per source candle, not uniform in time). */
export const TRANSFORMED_TYPES: ChartType[] = ["renko", "kagi", "linebreak", "range", "pnf"];
export const isTransformedType = (t: ChartType) => TRANSFORMED_TYPES.includes(t);

export type ScaleMode = "regular" | "percent" | "indexed" | "log";
export type PriceSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";
export type LineStyleId = "solid" | "dashed" | "dotted";

/** Candle colours; an empty string means "the theme's up/down colour". */
export interface CandleStyle {
  upBody: string;
  downBody: string;
  upBorder: string;
  downBorder: string;
  upWick: string;
  downWick: string;
  bodyOn: boolean;
  borderOn: boolean;
  wickOn: boolean;
  /** Colour by the previous close instead of by close vs open. */
  byPrevClose: boolean;
}

export const DEFAULT_CANDLE_STYLE: CandleStyle = {
  upBody: "",
  downBody: "",
  upBorder: "",
  downBorder: "",
  upWick: "",
  downWick: "",
  bodyOn: true,
  borderOn: false,
  wickOn: true,
  byPrevClose: false,
};

/** How Renko / Kagi / line break / range / Point & Figure bars are built. */
export interface TransformParams {
  /** "atr": box = ATR(period) of the source candles; "fixed": box = `box` (price units); "percent": box = percent of the price. */
  method: "atr" | "fixed" | "percent";
  atrPeriod: number;
  box: number;
  percent: number;
  /** Kagi / Point & Figure reversal, in boxes. */
  reversal: number;
  /** Line break: number of lines. */
  breakLines: number;
}

export const DEFAULT_TRANSFORM: TransformParams = {
  method: "atr",
  atrPeriod: 14,
  box: 1,
  percent: 1,
  reversal: 3,
  breakLines: 3,
};

export interface StatusLineOptions {
  symbol: boolean;
  ohlc: boolean;
  change: boolean;
  barChange: boolean;
  volume: boolean;
  indTitles: boolean;
  indValues: boolean;
}

export interface CrosshairOptions {
  width: number;
  style: LineStyleId;
  priceLabel: boolean;
  timeLabel: boolean;
}

export interface ChartTheme {
  bg: string;
  text: string;
  textMuted: string;
  grid: string;
  axisBorder: string;
  up: string;
  down: string;
  volUp: string;
  volDown: string;
  crosshair: string;
  labelBg: string;
  labelText: string;
  line: string;
  areaTop: string;
  areaBottom: string;
  watermark: string;
  paneBorder: string;
  /** Vertical background gradient (top / bottom); when both are set they replace `bg`. */
  bgTop?: string;
  bgBottom?: string;
}

/* Terminal v3 palette (design/SPEC.md): white canvas inside the card, soft grid, candles #1E9E4A / #E5322D, dark tags. */
export const LIGHT_THEME: ChartTheme = {
  bg: "#ffffff",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  grid: "#f0f0f4",
  axisBorder: "#e5e5ea",
  up: "#1e9e4a",
  down: "#e5322d",
  volUp: "rgba(30,158,74,0.35)",
  volDown: "rgba(229,50,45,0.35)",
  crosshair: "#8e8e93",
  labelBg: "#1c1c1e",
  labelText: "#ffffff",
  line: "#0a84ff",
  areaTop: "rgba(10,132,255,0.26)",
  areaBottom: "rgba(10,132,255,0.02)",
  watermark: "rgba(28,28,30,0.04)",
  paneBorder: "#e5e5ea",
};

/* dark: the card colour of the terminal (#1c1c1e) as the canvas, same accents */
export const DARK_THEME: ChartTheme = {
  bg: "#1c1c1e",
  text: "#f2f2f7",
  textMuted: "#8e8e93",
  grid: "rgba(255,255,255,0.06)",
  axisBorder: "#2c2c2e",
  up: "#30c15c",
  down: "#ff453a",
  volUp: "rgba(48,193,92,0.38)",
  volDown: "rgba(255,69,58,0.38)",
  crosshair: "#8e8e93",
  labelBg: "#48484a",
  labelText: "#ffffff",
  line: "#0a84ff",
  areaTop: "rgba(10,132,255,0.30)",
  areaBottom: "rgba(10,132,255,0.02)",
  watermark: "rgba(255,255,255,0.05)",
  paneBorder: "#2c2c2e",
};

export interface EngineOptions {
  chartType: ChartType;
  logScale: boolean;
  showVolume: boolean;
  showGrid: boolean;
  showWatermark: boolean;
  /** Fit the price range to the visible bars. Dragging the chart vertically or the price axis turns it off. */
  autoScale: boolean;
  locale: string;
  /** Added to Candle.t before formatting with UTC getters, so labels show the exchange's wall clock. */
  timeShiftMs: number;
  /** Fixed number of price decimals; inferred from the data when undefined. */
  pricePrecision?: number;
  theme: ChartTheme;
  symbolLabel: string;
  intervalLabel: string;
  /** Nominal bar length in ms (used to extrapolate labels past the last bar). */
  intervalMs: number;
  fontFamily: string;

  /* ── chart settings (see lib/chart/settings.ts); the defaults keep the previous look ── */
  candleStyle: CandleStyle;
  /** Price used by line / area / step / baseline charts. */
  priceSource: PriceSource;
  lineWidth: number;
  scaleMode: ScaleMode;
  invertScale: boolean;
  /** Freeze the price range: no auto-scale, no dragging of the price scale. */
  lockScale: boolean;
  scaleSide: "right" | "left";
  showSymbolLabel: boolean;
  showLastPriceLabel: boolean;
  showPriceLine: boolean;
  showPrevCloseLine: boolean;
  showCountdown: boolean;
  showHighLow: boolean;
  /** Axis font size, px. */
  scaleFontSize: number;
  /** Space above / below the price range, % of the pane height. */
  marginTop: number;
  marginBottom: number;
  /** Empty bars to the right of the last bar. */
  rightOffset: number;
  gridV: boolean;
  gridH: boolean;
  crosshair: CrosshairOptions;
  status: StatusLineOptions;
  sessionBreaks: boolean;
  /** Baseline chart: where the base level sits, % of the pane height from the bottom. */
  baselinePercent: number;
  transform: TransformParams;
  /** IANA zone of the time axis; undefined = use timeShiftMs as is. */
  timeZone?: string;
  /** chart time = real UTC ms + clockOffsetMs (needed to translate "now" into chart time and to find zone offsets). */
  clockOffsetMs: number;
  /** Symbol name shown in the label on the price scale (defaults to symbolLabel). */
  scaleSymbol?: string;
  /** Footprint chart type settings (see lib/chart/orderflow); defaults apply when missing. */
  footprint?: FootprintSettings;
}

export const DEFAULT_OPTIONS: EngineOptions = {
  chartType: "candles",
  logScale: false,
  showVolume: true,
  showGrid: true,
  showWatermark: true,
  autoScale: true,
  locale: "ru-RU",
  timeShiftMs: 0,
  theme: LIGHT_THEME,
  symbolLabel: "",
  intervalLabel: "",
  intervalMs: 86_400_000,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Inter, Arial, sans-serif",
  candleStyle: DEFAULT_CANDLE_STYLE,
  priceSource: "close",
  lineWidth: 2,
  scaleMode: "regular",
  invertScale: false,
  lockScale: false,
  scaleSide: "right",
  showSymbolLabel: false,
  showLastPriceLabel: true,
  showPriceLine: true,
  showPrevCloseLine: false,
  showCountdown: false,
  showHighLow: false,
  scaleFontSize: 12,
  marginTop: 8,
  marginBottom: 8,
  rightOffset: 8,
  gridV: true,
  gridH: true,
  crosshair: { width: 1, style: "dashed", priceLabel: true, timeLabel: true },
  status: { symbol: true, ohlc: true, change: true, barChange: true, volume: true, indTitles: true, indValues: true },
  sessionBreaks: false,
  baselinePercent: 50,
  transform: DEFAULT_TRANSFORM,
  clockOffsetMs: 0,
};

/** What a series needs to draw itself into a pane. All coordinates are CSS pixels inside the pane. */
export interface SeriesContext {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  candles: Candle[];
  /** First and last visible bar index (inclusive, clamped to the data). */
  from: number;
  to: number;
  /** Center x of bar i. */
  x: (i: number) => number;
  /** Pane y of a price. */
  y: (price: number) => number;
  barSpacing: number;
  paneWidth: number;
  paneHeight: number;
  theme: ChartTheme;
  options: EngineOptions;
  /** Order flow of the chart (real trades where fetched, approximations elsewhere); see lib/chart/orderflow. */
  flow?: OrderFlowStore;
}

export interface LegendItem {
  text: string;
  color: string;
}

/** A value flag drawn on a pane's price axis (like the last-price label), e.g. an indicator's latest value. */
export interface AxisLabel {
  price: number;
  text: string;
  color: string;
  textColor?: string;
}

export type PointerRegion = "plot" | "priceAxis" | "timeAxis" | "separator" | "none";

export interface PointerInfo {
  /** CSS pixels inside the chart canvas. */
  x: number;
  y: number;
  paneId: string | null;
  region: PointerRegion;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  button: number;
  pointerType: string;
}

/**
 * Something painted on top of the chart that can also take pointer input (drawing tools, order lines, ...).
 * Layers are asked first; returning true from pointerDown captures the gesture, so the chart does not pan.
 */
export interface OverlayLayer {
  /** Drawn inside the plot area, above candles and below the crosshair. */
  draw?(ctx: CanvasRenderingContext2D, engine: import("./engine").ChartEngine): void;
  pointerDown?(p: PointerInfo): boolean;
  /** While captured: the drag. Otherwise: hover; returning true means the layer handles hover and the crosshair is hidden. */
  pointerMove?(p: PointerInfo): boolean;
  pointerUp?(p: PointerInfo): void;
  /** The pointer left the chart canvas (hover state of the layer should be cleared). */
  pointerLeave?(): void;
  /** CSS cursor for the pointer position, or null to use the default. */
  cursor?(p: PointerInfo): string | null;
}

export interface Series {
  id: string;
  /** Flags on the price axis of the pane the series belongs to, for the bar at `index` (usually the last bar). */
  axisLabels?(candles: Candle[], index: number): AxisLabel[];
  /** Price range this series needs for auto-scaling over bars [from, to], or null when it must not affect the scale. */
  range?(candles: Candle[], from: number, to: number): [number, number] | null;
  draw(sc: SeriesContext): void;
  /** Text shown in the pane legend for the bar under the crosshair (or the last bar). */
  legend?(candles: Candle[], index: number): LegendItem[];
}

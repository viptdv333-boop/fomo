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
  | "pnf";

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

export const LIGHT_THEME: ChartTheme = {
  bg: "#ffffff",
  text: "#1f2937",
  textMuted: "#6b7280",
  grid: "rgba(17,24,39,0.06)",
  axisBorder: "rgba(17,24,39,0.12)",
  up: "#16a34a",
  down: "#ef4444",
  volUp: "rgba(22,163,74,0.35)",
  volDown: "rgba(239,68,68,0.35)",
  crosshair: "rgba(17,24,39,0.45)",
  labelBg: "#374151",
  labelText: "#ffffff",
  line: "#2563eb",
  areaTop: "rgba(37,99,235,0.28)",
  areaBottom: "rgba(37,99,235,0.02)",
  watermark: "rgba(17,24,39,0.05)",
  paneBorder: "rgba(17,24,39,0.14)",
};

export const DARK_THEME: ChartTheme = {
  bg: "#111827",
  text: "#e5e7eb",
  textMuted: "#9ca3af",
  grid: "rgba(255,255,255,0.06)",
  axisBorder: "rgba(255,255,255,0.14)",
  up: "#22c55e",
  down: "#f05252",
  volUp: "rgba(34,197,94,0.35)",
  volDown: "rgba(240,82,82,0.35)",
  crosshair: "rgba(229,231,235,0.5)",
  labelBg: "#4b5563",
  labelText: "#ffffff",
  line: "#60a5fa",
  areaTop: "rgba(96,165,250,0.30)",
  areaBottom: "rgba(96,165,250,0.02)",
  watermark: "rgba(255,255,255,0.05)",
  paneBorder: "rgba(255,255,255,0.16)",
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
  fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
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
  scaleFontSize: 11,
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

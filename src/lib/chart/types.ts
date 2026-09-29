export interface Candle {
  /** Bar start, ms. For MOEX this is Moscow wall time stored as if it were UTC (see timeShiftMs). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type ChartType = "candles" | "hollow" | "bars" | "line" | "area" | "heikin";

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

export interface Series {
  id: string;
  /** Price range this series needs for auto-scaling over bars [from, to], or null when it must not affect the scale. */
  range?(candles: Candle[], from: number, to: number): [number, number] | null;
  draw(sc: SeriesContext): void;
  /** Text shown in the pane legend for the bar under the crosshair (or the last bar). */
  legend?(candles: Candle[], index: number): LegendItem[];
}

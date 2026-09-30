import {
  DARK_THEME,
  DEFAULT_CANDLE_STYLE,
  DEFAULT_TRANSFORM,
  LIGHT_THEME,
  type CandleStyle,
  type ChartTheme,
  type CrosshairOptions,
  type EngineOptions,
  type PriceSource,
  type ScaleMode,
  type StatusLineOptions,
  type TransformParams,
} from "./types";
import { DEFAULT_FAVORITE_INTERVALS } from "./intervals";
import { DEFAULT_FOOTPRINT, sanitizeFootprint, type FootprintSettings } from "./orderflow/types";

/* User-facing chart settings (the gear dialog). Saved locally and on the account (userdata 'chart_settings' / 'default'),
   turned into engine options by settingsToEngine(). */

export type ThemePreset = "classic" | "tvdark" | "tvlight";

/** Colours the user can override on top of the preset. */
export interface ColorOverrides {
  bg?: string;
  gradTop?: string;
  gradBottom?: string;
  text?: string;
  textMuted?: string;
  grid?: string;
  axisBorder?: string;
  crosshair?: string;
  watermark?: string;
  line?: string;
  paneBorder?: string;
  labelBg?: string;
}

export interface ScaleSettings {
  mode: ScaleMode;
  invert: boolean;
  lock: boolean;
  side: "right" | "left";
  symbolLabel: boolean;
  lastPriceLabel: boolean;
  priceLine: boolean;
  prevCloseLine: boolean;
  countdown: boolean;
  highLow: boolean;
  fontSize: number;
  marginTop: number;
  marginBottom: number;
  rightOffset: number;
}

export interface ChartSettings {
  v: 1;
  /** Saved-at timestamp, used to pick the newer of the local and the account copy. */
  at: number;
  preset: ThemePreset;
  colors: ColorOverrides;
  bgType: "solid" | "gradient";
  candle: CandleStyle;
  /** "auto" or a fixed number of decimals. */
  precision: "auto" | number;
  priceSource: PriceSource;
  lineWidth: number;
  /** "auto" | "exchange" | "local" | "UTC" | an IANA zone. */
  tz: string;
  status: StatusLineOptions;
  scale: ScaleSettings;
  gridV: boolean;
  gridH: boolean;
  crosshair: CrosshairOptions;
  navButtons: "always" | "hover" | "never";
  sessionBreaks: boolean;
  baselinePercent: number;
  transform: TransformParams;
  /** Footprint chart type: display mode, imbalances, colours. */
  footprint: FootprintSettings;
  /** Not touched by presets / reset. */
  ui: { favIntervals: string[] };
}

export const DEFAULT_SETTINGS: ChartSettings = {
  v: 1,
  at: 0,
  preset: "classic",
  colors: {},
  bgType: "solid",
  candle: DEFAULT_CANDLE_STYLE,
  precision: "auto",
  priceSource: "close",
  lineWidth: 2,
  tz: "auto",
  status: { symbol: true, ohlc: true, change: true, barChange: true, volume: true, indTitles: true, indValues: true },
  scale: {
    mode: "regular",
    invert: false,
    lock: false,
    side: "right",
    symbolLabel: false,
    lastPriceLabel: true,
    priceLine: true,
    prevCloseLine: false,
    countdown: false,
    highLow: false,
    fontSize: 11,
    marginTop: 8,
    marginBottom: 8,
    rightOffset: 8,
  },
  gridV: true,
  gridH: true,
  crosshair: { width: 1, style: "dashed", priceLabel: true, timeLabel: true },
  navButtons: "hover",
  sessionBreaks: false,
  baselinePercent: 50,
  transform: DEFAULT_TRANSFORM,
  footprint: DEFAULT_FOOTPRINT,
  ui: { favIntervals: DEFAULT_FAVORITE_INTERVALS },
};

/* ───────────── presets ───────────── */

export const TV_DARK: ChartTheme = {
  bg: "#131722",
  text: "#d1d4dc",
  textMuted: "#787b86",
  grid: "rgba(42,46,57,0.75)",
  axisBorder: "#2a2e39",
  up: "#089981",
  down: "#f23645",
  volUp: "rgba(8,153,129,0.5)",
  volDown: "rgba(242,54,69,0.5)",
  crosshair: "#758696",
  labelBg: "#363a45",
  labelText: "#ffffff",
  line: "#2962ff",
  areaTop: "rgba(41,98,255,0.28)",
  areaBottom: "rgba(41,98,255,0.04)",
  watermark: "rgba(255,255,255,0.06)",
  paneBorder: "#2a2e39",
};

export const TV_LIGHT: ChartTheme = {
  bg: "#ffffff",
  text: "#131722",
  textMuted: "#5d606b",
  grid: "#f0f3fa",
  axisBorder: "#e0e3eb",
  up: "#089981",
  down: "#f23645",
  volUp: "rgba(8,153,129,0.5)",
  volDown: "rgba(242,54,69,0.5)",
  crosshair: "#9598a1",
  labelBg: "#131722",
  labelText: "#ffffff",
  line: "#2962ff",
  areaTop: "rgba(41,98,255,0.28)",
  areaBottom: "rgba(41,98,255,0.04)",
  watermark: "rgba(19,23,34,0.06)",
  paneBorder: "#e0e3eb",
};

export function baseTheme(preset: ThemePreset, siteDark: boolean): ChartTheme {
  if (preset === "tvdark") return TV_DARK;
  if (preset === "tvlight") return TV_LIGHT;
  return siteDark ? DARK_THEME : LIGHT_THEME;
}

/** Applies a preset: theme, candle colours and canvas colours go back to the preset, everything else stays. */
export function applyPreset(s: ChartSettings, preset: ThemePreset): ChartSettings {
  return { ...s, preset, colors: {}, bgType: "solid", candle: { ...s.candle, upBody: "", downBody: "", upBorder: "", downBorder: "", upWick: "", downWick: "" } };
}

/** Everything back to defaults except the interval favourites. */
export function resetSettings(s: ChartSettings): ChartSettings {
  return { ...DEFAULT_SETTINGS, ui: s.ui, at: Date.now() };
}

/* ───────────── colour helpers ───────────── */

function hexToRgb(c: string): [number, number, number, number] | null {
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split("").map((x) => parseInt(x + x, 16));
    return [r, g, b, 1];
  }
  const r = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (r) return [+r[1], +r[2], +r[3], r[4] === undefined ? 1 : +r[4]];
  return null;
}

export function withAlpha(color: string, a: number): string {
  const c = hexToRgb(color);
  if (!c) return color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.round(a * 100) / 100})`;
}

export function luminance(color: string): number {
  const c = hexToRgb(color);
  if (!c) return 0.5;
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

function shade(color: string, amount: number): string {
  const c = hexToRgb(color);
  if (!c) return color;
  const t = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  const f = (v: number) => Math.round(v + (t - v) * k);
  return `rgb(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
}

/** Default gradient stops for a background colour: a bit lighter on top in dark themes, a bit darker below in light ones. */
export function defaultGradient(bg: string): [string, string] {
  return luminance(bg) < 0.5 ? [shade(bg, 0.07), bg] : [bg, shade(bg, -0.05)];
}

/* ───────────── settings → engine ───────────── */

export function composeTheme(s: ChartSettings, siteDark: boolean): ChartTheme {
  const base = baseTheme(s.preset, siteDark);
  const { gradTop, gradBottom, ...rest } = s.colors;
  const th: ChartTheme = { ...base };
  for (const [k, v] of Object.entries(rest)) if (v) (th as unknown as Record<string, string>)[k] = v;
  // volume bars and the area fill follow the candle / line colours only when the user changed those
  const volA = luminance(th.bg) < 0.5 ? 0.5 : 0.4;
  if (s.candle.upBody) {
    th.up = s.candle.upBody;
    th.volUp = withAlpha(s.candle.upBody, volA);
  }
  if (s.candle.downBody) {
    th.down = s.candle.downBody;
    th.volDown = withAlpha(s.candle.downBody, volA);
  }
  if (s.colors.line) {
    th.areaTop = withAlpha(th.line, 0.28);
    th.areaBottom = withAlpha(th.line, 0.04);
  }
  if (s.bgType === "gradient") {
    const [t, b] = defaultGradient(th.bg);
    th.bgTop = gradTop || t;
    th.bgBottom = gradBottom || b;
  }
  return th;
}

export function settingsToEngine(s: ChartSettings, siteDark: boolean): Partial<EngineOptions> {
  return {
    theme: composeTheme(s, siteDark),
    candleStyle: s.candle,
    pricePrecision: s.precision === "auto" ? undefined : s.precision,
    priceSource: s.priceSource,
    lineWidth: s.lineWidth,
    scaleMode: s.scale.mode,
    invertScale: s.scale.invert,
    lockScale: s.scale.lock,
    scaleSide: s.scale.side,
    showSymbolLabel: s.scale.symbolLabel,
    showLastPriceLabel: s.scale.lastPriceLabel,
    showPriceLine: s.scale.priceLine,
    showPrevCloseLine: s.scale.prevCloseLine,
    showCountdown: s.scale.countdown,
    showHighLow: s.scale.highLow,
    scaleFontSize: s.scale.fontSize,
    marginTop: s.scale.marginTop,
    marginBottom: s.scale.marginBottom,
    rightOffset: s.scale.rightOffset,
    gridV: s.gridV,
    gridH: s.gridH,
    crosshair: s.crosshair,
    status: s.status,
    sessionBreaks: s.sessionBreaks,
    baselinePercent: s.baselinePercent,
    transform: s.transform,
    footprint: s.footprint,
  };
}

/* ───────────── time zones ───────────── */

export const TIME_ZONES: { id: string; label: string }[] = [
  { id: "UTC", label: "UTC" },
  { id: "Europe/Moscow", label: "Москва" },
  { id: "Europe/London", label: "Лондон" },
  { id: "Europe/Berlin", label: "Берлин" },
  { id: "Europe/Istanbul", label: "Стамбул" },
  { id: "Asia/Dubai", label: "Дубай" },
  { id: "Asia/Kolkata", label: "Мумбаи" },
  { id: "Asia/Shanghai", label: "Шанхай" },
  { id: "Asia/Hong_Kong", label: "Гонконг" },
  { id: "Asia/Singapore", label: "Сингапур" },
  { id: "Asia/Tokyo", label: "Токио" },
  { id: "Australia/Sydney", label: "Сидней" },
  { id: "America/New_York", label: "Нью-Йорк" },
  { id: "America/Chicago", label: "Чикаго" },
  { id: "America/Los_Angeles", label: "Лос-Анджелес" },
  { id: "America/Sao_Paulo", label: "Сан-Паулу" },
];

export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The IANA zone the time axis uses for a tz setting and a data source. */
export function resolveZone(tz: string, source: string): string {
  const exchange = source === "moex" ? "Europe/Moscow" : source === "fmp" ? "America/New_York" : "UTC";
  if (tz === "auto") return source === "moex" ? "Europe/Moscow" : localZone();
  if (tz === "exchange") return exchange;
  if (tz === "local") return localZone();
  return tz;
}

/* ───────────── storage ───────────── */

export const SETTINGS_LS_KEY = "fomo-chart-settings-v1";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** Deep merge of saved data over defaults; unknown / wrongly typed values fall back to the default. */
function mergeInto<T>(def: T, saved: unknown): T {
  if (Array.isArray(def)) return (Array.isArray(saved) ? (saved as unknown as T) : def) as T;
  if (isObj(def)) {
    const out: Json = {};
    const sv = isObj(saved) ? saved : {};
    for (const k of Object.keys(def)) out[k] = mergeInto((def as Json)[k], sv[k]);
    // keep free-form maps (colors) that have no defaults
    if (Object.keys(def).length === 0 && isObj(saved)) return saved as unknown as T;
    return out as T;
  }
  if (saved === undefined || saved === null) return def;
  if (typeof saved !== typeof def) return def;
  return saved as T;
}

export function normalizeSettings(saved: unknown): ChartSettings {
  const s = mergeInto(DEFAULT_SETTINGS, saved);
  if (!["classic", "tvdark", "tvlight"].includes(s.preset)) s.preset = "classic";
  if (isObj(saved) && typeof saved.precision === "number") s.precision = Math.max(0, Math.min(10, Math.round(saved.precision)));
  s.footprint = sanitizeFootprint(isObj(saved) ? saved.footprint : undefined);
  return s;
}

export function loadLocalSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveLocalSettings(s: ChartSettings) {
  try {
    localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(s));
  } catch {}
}

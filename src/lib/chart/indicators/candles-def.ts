import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, NumberParam, Params, SelectOption, SelectParam } from "./registry";
import { CANDLE_BY_ID, CANDLE_DISCLAIMER, CANDLE_META, MAIN_IDS, type CandleBias, type CandleId } from "../analysis/candle-meta";
import { DEFAULT_CANDLES, detectCandles, type CandleHit, type CandleOptions } from "../analysis/candles";
import { isDark, langOf, rgba } from "./patterns-def";

/* "Candlestick patterns (classic)": single, two, three and five candle patterns from OHLC only (analysis/candles.ts; the catalogue with names
   and meanings in analysis/candle-meta.ts). Each pattern is a frame with a translucent fill over exactly its candles and a solid pill with its
   name on the frame edge, joined to the frame by a short stem; everything is drawn in `drawFront`, after all the other indicators of the pane, and
   the pills keep off each other and off the labels the other indicators have put there (sc.labelBoxes). The legend row follows the crosshair: the
   pattern on the bar under it, its meaning and reliability in the tooltip of the row. This file is the parameter schema, the legend and the painter. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;
const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

const idx3 = (locale: string) => (langOf(locale) === "ru" ? 0 : langOf(locale) === "zh" ? 2 : 1);

/* ───────────── texts ───────────── */

const WORDS = {
  count: ["Паттернов", "Patterns", "形态数"],
  none: ["паттернов нет", "no patterns", "无形态"],
  strength: ["Надёжность", "Reliability", "可靠度"],
  how: [
    "размер к ATR - 40%, объём к среднему - 30%, положение у экстремума последних 20 баров - 30%",
    "size vs ATR 40%, volume vs average 30%, position at the extreme of the last 20 bars 30%",
    "相对 ATR 的大小 40%、相对均量的成交量 30%、处于近 20 根极值位置 30%",
  ],
  also: ["Также на этой свече", "Also on this bar", "同一根K线还有"],
  forming: ["свеча формируется", "bar is forming", "K线形成中"],
  candles: ["свечи", "candles", "根K线"],
  nobar: ["На этой свече паттерна нет.", "No pattern on this bar.", "这根K线上没有形态。"],
} as const;
const w = (k: keyof typeof WORDS, locale: string) => WORDS[k][idx3(locale)];

export function candleName(id: CandleId, locale: string): string {
  return CANDLE_BY_ID[id].name[idx3(locale)];
}
export function candleShort(id: CandleId, locale: string): string {
  return CANDLE_BY_ID[id].short[idx3(locale)];
}
export function candleDesc(id: CandleId, locale: string): string {
  return CANDLE_BY_ID[id].desc[idx3(locale)];
}

/* ───────────── options ───────────── */

/** Ids switched on by the parameters (preset "main" / "all" override the checklist). */
export function enabledIds(p: Params): CandleId[] {
  const preset = S(p, "cpPreset");
  if (preset === "main") return MAIN_IDS.slice();
  if (preset === "all") return CANDLE_META.map((m) => m.id);
  return CANDLE_META.filter((m) => B(p, `cp_${m.id}`)).map((m) => m.id);
}

export function candleOptionsOf(p: Params): Partial<CandleOptions> {
  return {
    enabled: new Set<string>(enabledIds(p)),
    trend: B(p, "cpTrend"),
    trendMode: S(p, "cpTrendMode") === "sma" ? "sma" : "slope",
    trendLen: N(p, "cpTrendLen"),
    trendAtr: N(p, "cpTrendAtr"),
    gaps: S(p, "cpGaps") === "price" ? "price" : "body",
    overlap: N(p, "cpOverlap") / 100,
    atrLen: N(p, "cpAtrLen"),
    minSize: N(p, "cpMinSize"),
    longBody: N(p, "cpLongBody"),
    dojiBody: N(p, "cpDojiBody") / 100,
    spinBody: N(p, "cpSpinBody") / 100,
    shadowSmall: N(p, "cpShadow") / 100,
    hammerRatio: N(p, "cpHammer"),
    starRatio: N(p, "cpStar") / 100,
    haramiRatio: N(p, "cpHarami") / 100,
    tweezerTol: N(p, "cpTweezer"),
    engulfFull: B(p, "cpEngulfFull"),
    forming: B(p, "cpForming"),
    window: N(p, "cpWindow"),
    minStrength: N(p, "cpMinStrength"),
  };
}

interface Extra {
  hits: CandleHit[];
}

/** The hit whose last bar is `i` (hits are sorted by bar). */
function hitAt(hits: CandleHit[], i: number): CandleHit | undefined {
  let a = 0;
  let b = hits.length - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    const v = hits[m].i;
    if (v === i) return hits[m];
    if (v < i) a = m + 1;
    else b = m - 1;
  }
  return undefined;
}
function firstFrom(hits: CandleHit[], i: number): number {
  let a = 0;
  let b = hits.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (hits[m].i < i) a = m + 1;
    else b = m;
  }
  return a;
}

const DEFAULT_FLAT = "#8b93a7";
/** Colour of a pattern: «one colour for all» overrides; the default neutral grey follows the theme (lighter on dark, darker on light) when `dark` is known. */
function colorOf(bias: CandleBias, p: Params, dark?: boolean): string {
  if (B(p, "cpUseAll")) return S(p, "cpColAll");
  if (bias === "bull") return S(p, "cpColUp");
  if (bias === "bear") return S(p, "cpColDown");
  const c = S(p, "cpColFlat");
  if (dark !== undefined && c.toLowerCase() === DEFAULT_FLAT) return dark ? "#a3abc0" : "#6b7385";
  return c;
}

/** What the highlight style switches on. */
function styleFlags(mode: string): { fill: boolean; frame: boolean; paint: boolean; marker: boolean } {
  return { fill: mode === "box" || mode === "all", frame: mode === "box" || mode === "frame" || mode === "all", paint: mode === "paint" || mode === "all", marker: mode === "marker" };
}

/* ───────────── painter ───────────── */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h > b.y - 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const PILL_H = 20;
const PILL_FONT = 12;
const STEM = 9;

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** The colour a bit darker, so that white text on it reads (a pill is solid, not a tint). */
function darker(hex: string, k: number): string {
  const c = hexRgb(hex);
  if (!c) return hex;
  return `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
}
function luminance(c: [number, number, number]): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
/** White text, or near-black on a light pill (`bg` is "#rrggbb" or "rgb(r,g,b)"). */
export function pillTextColor(bg: string): string {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(bg);
  const c: [number, number, number] | null = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : hexRgb(bg);
  if (!c) return "#ffffff";
  const L = luminance(c);
  // white is preferred (it is what a coloured pill usually carries) unless it would be hard to read
  return 1.05 / (L + 0.05) >= 3.2 ? "#ffffff" : "#0b0e14";
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

type PatternBox = Rect & { cx: number; hi: number; lo: number };

/** The frame around exactly the candles of the pattern (high to low of those candles, padded). */
export function patternBox(sc: SeriesContext, hit: CandleHit): PatternBox | null {
  const half = sc.barSpacing / 2;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = hit.start; j <= hit.i; j++) {
    const c = sc.candles[j];
    if (!c) continue;
    if (c.h > hi) hi = c.h;
    if (c.l < lo) lo = c.l;
  }
  if (!(hi >= lo)) return null;
  const xa = sc.x(hit.start) - half - 2.5;
  const xb = sc.x(hit.i) + half + 2.5;
  const cx = (xa + xb) / 2;
  const w = Math.max(14, xb - xa);
  let y0 = sc.y(hi) - 3;
  let y1 = sc.y(lo) + 3;
  if (y1 - y0 < 12) {
    const m = (y0 + y1) / 2;
    y0 = m - 6;
    y1 = m + 6;
  }
  if (![cx, w, y0, y1].every(Number.isFinite)) return null;
  return { x: cx - w / 2, y: y0, w, h: y1 - y0, cx, hi, lo };
}

/** First free place for a pill: on its own side of the frame, then shifted along it, then further out, then on the other side. `taken` holds the labels already there. */
export function placePill(w: number, cx: number, edge: number, dir: 1 | -1, pw: number, ph: number, taken: Rect[]): Rect | null {
  const step = 24;
  for (const side of [dir, -dir] as const) {
    for (let level = 0; level < 4; level++) {
      const y = side > 0 ? edge + STEM + level * (PILL_H + 4) : edge - STEM - PILL_H - level * (PILL_H + 4);
      if (y < 2 || y + PILL_H > ph - 2) continue;
      for (let k = 0; k < 11; k++) {
        const dk = k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2;
        const x = clamp(cx - w / 2 + dk * step, 2, Math.max(2, pw - w - 2));
        const r = { x, y, w, h: PILL_H };
        if (!taken.some((t) => overlaps(t, r))) return r;
      }
    }
  }
  return null;
}

function labelText(hit: CandleHit, p: Params, locale: string): string {
  const mode = S(p, "cpLabelMode");
  let text = mode === "full" ? candleName(hit.id, locale) : mode === "short" ? candleShort(hit.id, locale) : "";
  if (text && hit.others.length) text += ` +${hit.others.length}`;
  if (S(p, "cpStrength") === "number") text = text ? `${text} · ${hit.strength}` : String(hit.strength);
  return text;
}

/** Everything of the indicator is drawn here, after all the other series of the pane, so the highlighted candles stay readable over zones and waves. */
function paintFront(sc: SeriesContext, p: Params, res?: IndResult): void {
  const ex = res?.extra as Extra | undefined;
  if (!ex || ex.hits.length === 0) return;
  const { ctx, candles } = sc;
  const locale = sc.options.locale;
  const pw = sc.paneWidth;
  const ph = sc.paneHeight;
  const mode = S(p, "cpHighlight"); // box | frame | paint | all | marker
  const fl = styleFlags(mode);
  const dark = isDark(sc.theme.bg);
  const fillA = N(p, "cpFillOpacity") / 100;
  const borderW = N(p, "cpBorderWidth");
  const strengthMode = S(p, "cpStrength");
  const hits = ex.hits;
  const to = Math.min(sc.to + 3, candles.length - 1);
  const list: { hit: CandleHit; box: PatternBox }[] = [];
  for (let k = firstFrom(hits, sc.from - 6); k < hits.length; k++) {
    const hit = hits[k];
    if (hit.i > to) break;
    const box = patternBox(sc, hit);
    if (!box || box.x > pw + 40 || box.x + box.w < -40) continue;
    list.push({ hit, box });
  }
  if (list.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const alphaOf = (hit: CandleHit) => (strengthMode === "opacity" ? 0.72 + 0.28 * (hit.strength / 100) : 1) * (hit.forming ? 0.7 : 1);

  // 1. the formation first (fill, frame, tinted candles / the marker), so a neighbour's frame never covers a pill
  const bodyW = Math.max(1, Math.floor(sc.barSpacing * 0.72));
  for (const { hit, box } of list) {
    const color = colorOf(hit.bias, p, dark);
    ctx.globalAlpha = alphaOf(hit);
    if (fl.marker) {
      const sz = clamp(sc.barSpacing * 0.5, 4, 8);
      ctx.beginPath();
      if (hit.bias === "flat") {
        ctx.arc(box.cx, box.y - 4, Math.max(2.4, sz * 0.4), 0, Math.PI * 2);
      } else {
        const bull = hit.bias === "bull";
        const ty = bull ? box.y + box.h + 1 : box.y - 1;
        const dy = bull ? sz * 1.2 : -sz * 1.2;
        ctx.moveTo(box.cx, ty);
        ctx.lineTo(box.cx - sz * 0.65, ty + dy);
        ctx.lineTo(box.cx + sz * 0.65, ty + dy);
        ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.fill();
      continue;
    }
    if (fl.fill || fl.frame) {
      roundRectPath(ctx, box.x, box.y, box.w, box.h, 3);
      if (fl.fill) {
        ctx.fillStyle = rgba(color, hit.forming ? fillA * 0.6 : fillA);
        ctx.fill();
      }
      if (fl.frame) {
        ctx.lineWidth = borderW;
        ctx.strokeStyle = color;
        ctx.setLineDash(hit.forming ? [4, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (fl.paint) {
      // every candle of the formation: the wick and the body in the pattern colour (the body tinted, so the original candle still shows through)
      for (let j = hit.start; j <= hit.i; j++) {
        const c = candles[j];
        if (!c) continue;
        const x = sc.x(j);
        const yH = sc.y(c.h);
        const yL = sc.y(c.l);
        const yO = sc.y(c.o);
        const yC = sc.y(c.c);
        if (![x, yH, yL, yO, yC].every(Number.isFinite)) continue;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, yH);
        ctx.lineTo(x, yL);
        ctx.stroke();
        const top = Math.min(yO, yC);
        const h = Math.max(2, Math.abs(yC - yO));
        ctx.fillStyle = rgba(color, 0.55);
        ctx.fillRect(x - bodyW / 2, top, bodyW, h);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - bodyW / 2, top, bodyW, h);
      }
    }
  }

  // 2. pills with a stem to the frame, the newest first; they keep off each other and off the labels of the other indicators
  if (S(p, "cpLabelMode") !== "none" || strengthMode === "number") {
    ctx.font = `600 ${PILL_FONT}px ${sc.options.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const taken: Rect[] = (sc.labelBoxes ?? []).slice();
    for (let k = list.length - 1; k >= 0; k--) {
      const { hit, box } = list[k];
      const text = labelText(hit, p, locale);
      if (!text) continue;
      const color = colorOf(hit.bias, p, dark);
      const w = Math.ceil(ctx.measureText(text).width) + 18;
      const bull = hit.bias === "bull";
      const edge = bull ? box.y + box.h : box.y;
      const rect = placePill(w, box.cx, fl.marker ? edge + (bull ? 7 : -7) : edge, bull ? 1 : -1, pw, ph, taken);
      if (!rect) continue;
      taken.push(rect);
      sc.labelBoxes?.push(rect);
      ctx.globalAlpha = alphaOf(hit);
      const below = rect.y > edge;
      if (!fl.marker) {
        // stem from the pill to the frame, with a small arrow head on the frame edge
        const py = below ? rect.y : rect.y + rect.h;
        const sx = clamp(box.cx, rect.x + 9, rect.x + rect.w - 9);
        const s = below ? 1 : -1;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1.5, Math.min(2.5, borderW));
        ctx.beginPath();
        ctx.moveTo(sx, py);
        ctx.lineTo(box.cx, edge + s * 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(box.cx, edge);
        ctx.lineTo(box.cx - 4, edge + s * 6);
        ctx.lineTo(box.cx + 4, edge + s * 6);
        ctx.closePath();
        ctx.fill();
      }
      const bg = darker(color, 0.8);
      roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, PILL_H / 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(color, 0.95);
      ctx.setLineDash(hit.forming ? [3, 2] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pillTextColor(bg);
      ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** The pattern under the crosshair gets a stronger fill and a thicker frame (drawn on the overlay layer). */
function paintHover(sc: SeriesContext, p: Params, res: IndResult | undefined, index: number): void {
  const ex = res?.extra as Extra | undefined;
  const fl = styleFlags(S(p, "cpHighlight"));
  if (!ex || fl.marker) return;
  let hit = hitAt(ex.hits, index);
  if (!hit) {
    const k0 = firstFrom(ex.hits, index);
    for (let k = k0; k < ex.hits.length && k < k0 + 6; k++) {
      const h = ex.hits[k];
      if (h.start <= index && h.i >= index) {
        hit = h;
        break;
      }
    }
  }
  if (!hit) return;
  const box = patternBox(sc, hit);
  if (!box) return;
  const { ctx } = sc;
  const color = colorOf(hit.bias, p, isDark(sc.theme.bg));
  roundRectPath(ctx, box.x, box.y, box.w, box.h, 3);
  ctx.fillStyle = rgba(color, fl.fill ? Math.min(0.5, N(p, "cpFillOpacity") / 100 + 0.08) : 0.12);
  ctx.fill();
  ctx.lineWidth = N(p, "cpBorderWidth") + 0.75;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/* ───────────── legend ───────────── */

function legendRows(res: IndResult, p: Params, locale: string, index?: number): { text: string; color: string }[] {
  const ex = res.extra as Extra | undefined;
  if (!ex) return [];
  const out: { text: string; color: string }[] = [{ text: `${w("count", locale)}: ${ex.hits.length}`, color: S(p, "cpColFlat") }];
  const hit = index === undefined ? undefined : hitAt(ex.hits, index);
  if (hit) {
    let text = candleName(hit.id, locale);
    if (hit.others.length) text += ` +${hit.others.length}`;
    if (hit.forming) text += ` (${w("forming", locale)})`;
    out.push({ text, color: colorOf(hit.bias, p) });
  }
  return out;
}

function legendTipOf(res: IndResult, p: Params, locale: string, index?: number): string | undefined {
  const ex = res.extra as Extra | undefined;
  if (!ex) return undefined;
  const hit = index === undefined ? undefined : hitAt(ex.hits, index);
  const lines: string[] = [];
  if (hit) {
    const m = CANDLE_BY_ID[hit.id];
    lines.push(`${candleName(hit.id, locale)} (${m.bars} ${w("candles", locale)})`);
    lines.push(candleDesc(hit.id, locale));
    lines.push(`${w("strength", locale)}: ${hit.strength}/100 (${w("how", locale)})`);
    if (hit.others.length) lines.push(`${w("also", locale)}: ${hit.others.map((id) => candleName(id, locale)).join(", ")}`);
    if (hit.forming) lines.push(w("forming", locale));
  } else {
    lines.push(w("nobar", locale));
  }
  lines.push(CANDLE_DISCLAIMER[idx3(locale)]);
  return lines.join("\n");
}

/* ───────────── definition ───────────── */

const PRESETS: SelectOption[] = [
  { value: "list", label: "ind.cp.o.list" },
  { value: "main", label: "ind.cp.o.main" },
  { value: "all", label: "ind.cp.o.all" },
];
const GAPS: SelectOption[] = [
  { value: "body", label: "ind.cp.o.gbody" },
  { value: "price", label: "ind.cp.o.gprice" },
];
const TREND_MODES: SelectOption[] = [
  { value: "slope", label: "ind.cp.o.slope" },
  { value: "sma", label: "ind.cp.o.sma" },
];
const LABELS: SelectOption[] = [
  { value: "full", label: "ind.cp.o.lfull" },
  { value: "short", label: "ind.cp.o.lshort" },
  { value: "none", label: "ind.cp.o.lnone" },
];
const HIGHLIGHT: SelectOption[] = [
  { value: "box", label: "ind.cp.o.hbox" },
  { value: "frame", label: "ind.cp.o.hframe" },
  { value: "paint", label: "ind.cp.o.hpaint" },
  { value: "all", label: "ind.cp.o.hall" },
  { value: "marker", label: "ind.cp.o.hmark" },
];
const STRENGTH: SelectOption[] = [
  { value: "opacity", label: "ind.cp.o.sop" },
  { value: "number", label: "ind.cp.o.snum" },
  { value: "off", label: "ind.cp.o.soff" },
];

/** Checklist order: by number of candles, then bullish / bearish / neutral. */
const BIAS_ORDER: CandleBias[] = ["bull", "bear", "flat"];
const CHECKLIST = CANDLE_META.slice().sort((a, b) => a.bars - b.bars || BIAS_ORDER.indexOf(a.bias) - BIAS_ORDER.indexOf(b.bias));
const MAIN_SET = new Set<string>(MAIN_IDS);

const G_MAIN = "ind.cp.g.main";
const G_SHOW = "ind.cp.g.show";
const G_THR = "ind.cp.g.thr";
export const groupKeyOf = (bars: number, bias: CandleBias) => `ind.cp.g.${bars}${bias}`;

const MAIN_KEYS = ["cpPreset", "cpForming", "cpTrend", "cpGaps", "cpWindow", "cpMinStrength"];
const SHOW_KEYS = ["cpHighlight", "cpFillOpacity", "cpBorderWidth", "cpUseAll", "cpLabelMode", "cpStrength"];
const THR_KEYS = ["cpMinSize", "cpAtrLen", "cpLongBody", "cpDojiBody", "cpSpinBody", "cpShadow", "cpHammer", "cpStar", "cpHarami", "cpTweezer", "cpEngulfFull", "cpTrendMode", "cpTrendLen", "cpTrendAtr", "cpOverlap"];

const paramGroup: Record<string, string> = {};
for (const k of MAIN_KEYS) paramGroup[k] = G_MAIN;
for (const k of SHOW_KEYS) paramGroup[k] = G_SHOW;
for (const k of THR_KEYS) paramGroup[k] = G_THR;
for (const m of CHECKLIST) paramGroup[`cp_${m.id}`] = groupKeyOf(m.bars, m.bias);

export const candlesDef: IndicatorDef = {
  id: "candle_patterns",
  category: "patterns",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "candlestick candlesticks candle candles patterns pattern japanese doji hammer inverted hanging man shooting star marubozu spinning top engulfing harami cross piercing dark cloud tweezer kicker belt hold morning evening star three white soldiers black crows inside outside up down rising falling three methods abandoned baby reversal " +
    "свеча свечи свечной свечные свечных японские японских паттерн паттерны фигуры разворот доджи додж молот перевернутый повешенный падающая звезда марубозу волчок поглощение харами кросс проникающая завеса темных облаков пинцет кикер захват пояс утренняя вечерняя три солдата вороны внутри снаружи метода брошенный младенец " +
    "蜡烛 K线 烛台 形态 十字星 锤头 上吊 流星 吞没 孕线 启明星 黄昏星 红三兵 三只乌鸦",
  params: [
    sel("cpPreset", "list", PRESETS),
    bool("cpForming", false),
    bool("cpTrend", true),
    sel("cpGaps", "body", GAPS),
    num("cpWindow", 500, 50, 20000, 50),
    num("cpMinStrength", 0, 0, 100, 5),
    // `cpLabelMode` replaces the old `cpLabels` (its default was "short"): the old key is no longer read, so saved charts move to the full-name pills
    sel("cpHighlight", "all", HIGHLIGHT),
    num("cpFillOpacity", 17, 0, 60, 1),
    num("cpBorderWidth", 1.75, 0.5, 5, 0.25),
    bool("cpUseAll", false),
    sel("cpLabelMode", "full", LABELS),
    sel("cpStrength", "opacity", STRENGTH),
    ...CHECKLIST.map((m) => bool(`cp_${m.id}`, MAIN_SET.has(m.id))),
    num("cpMinSize", DEFAULT_CANDLES.minSize, 0, 5, 0.05),
    num("cpAtrLen", DEFAULT_CANDLES.atrLen, 2, 100),
    num("cpLongBody", DEFAULT_CANDLES.longBody, 0.1, 5, 0.05),
    num("cpDojiBody", DEFAULT_CANDLES.dojiBody * 100, 1, 30, 1),
    num("cpSpinBody", DEFAULT_CANDLES.spinBody * 100, 5, 60, 1),
    num("cpShadow", DEFAULT_CANDLES.shadowSmall * 100, 0, 40, 1),
    num("cpHammer", DEFAULT_CANDLES.hammerRatio, 1, 6, 0.1),
    num("cpStar", DEFAULT_CANDLES.starRatio * 100, 5, 100, 5),
    num("cpHarami", DEFAULT_CANDLES.haramiRatio * 100, 10, 100, 5),
    num("cpTweezer", DEFAULT_CANDLES.tweezerTol, 0, 1, 0.01),
    bool("cpEngulfFull", false),
    sel("cpTrendMode", "slope", TREND_MODES),
    num("cpTrendLen", DEFAULT_CANDLES.trendLen, 2, 100),
    num("cpTrendAtr", DEFAULT_CANDLES.trendAtr, 0, 10, 0.1),
    num("cpOverlap", DEFAULT_CANDLES.overlap * 100, 0, 100, 5),
    col("cpColUp", "#26a69a"),
    col("cpColDown", "#ef5350"),
    col("cpColFlat", "#8b93a7"),
    col("cpColAll", "#2962ff"),
  ],
  paramGroup,
  styleParams: ["cpColUp", "cpColDown", "cpColFlat", "cpColAll"],
  title: (p) => `Candles ${enabledIds(p).length}`,
  compute(cs, p) {
    if (cs.length < 3) return { plots: [], extra: { hits: [] } satisfies Extra };
    let hits: CandleHit[] = [];
    try {
      hits = detectCandles(cs, candleOptionsOf(p));
    } catch {
      hits = [];
    }
    return { plots: [], extra: { hits } satisfies Extra };
  },
  drawFront(sc, p, res) {
    paintFront(sc, p, res);
  },
  drawHover(sc, p, res, index) {
    paintHover(sc, p, res, index);
  },
  legendItems(res, p, locale, index) {
    return legendRows(res, p, locale, index);
  },
  legendTip(res, p, locale, index) {
    return legendTipOf(res, p, locale, index);
  },
};

export const CANDLE_DEFS: IndicatorDef[] = [candlesDef];

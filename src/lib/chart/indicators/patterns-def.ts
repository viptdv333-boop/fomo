import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, NumberParam, Params, SelectOption, SelectParam } from "./registry";
import { formatPrice } from "../format";
import {
  PATTERN_GROUPS,
  alertLevelsOf,
  detectPatterns,
  type AlertLevel,
  type DetectedPattern,
  type Degree,
  type PatternGroup,
  type PatternOptions,
  type PatternStatus,
  type PatternType,
} from "../analysis/patterns";

/* "Chart Patterns (auto)": double / triple tops and bottoms, head and shoulders, triangles, wedges, flags, pennants,
   rectangles, channels, broadening formations, cup and handle, rounding. Detection lives in analysis/patterns.ts;
   this file is the parameter schema, the cache and the canvas painter. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;
const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

const GROUP_KEY: Record<PatternGroup, string> = {
  double: "paDouble",
  triple: "paTriple",
  hs: "paHs",
  tri: "paTri",
  wedge: "paWedge",
  flag: "paFlag",
  pennant: "paPennant",
  rect: "paRect",
  channel: "paChannel",
  broad: "paBroad",
  cup: "paCup",
  round: "paRound",
};

/* ───────────── texts (canvas + legend; the React dictionary is not reachable from here) ───────────── */

type Lang = "ru" | "en" | "zh";
const langOf = (locale: string): Lang => (locale.startsWith("ru") ? "ru" : locale.startsWith("zh") ? "zh" : "en");

const NAMES: Record<PatternType, [string, string, string]> = {
  double_top: ["Двойная вершина", "Double top", "双顶"],
  double_bottom: ["Двойное дно", "Double bottom", "双底"],
  triple_top: ["Тройная вершина", "Triple top", "三重顶"],
  triple_bottom: ["Тройное дно", "Triple bottom", "三重底"],
  hs: ["Голова и плечи", "Head & shoulders", "头肩顶"],
  ihs: ["Перевёрнутая голова и плечи", "Inverse H&S", "头肩底"],
  tri_asc: ["Треугольник (восх.)", "Ascending triangle", "上升三角形"],
  tri_desc: ["Треугольник (нисх.)", "Descending triangle", "下降三角形"],
  tri_sym: ["Треугольник (симм.)", "Symmetrical triangle", "对称三角形"],
  wedge_rising: ["Клин восходящий", "Rising wedge", "上升楔形"],
  wedge_falling: ["Клин нисходящий", "Falling wedge", "下降楔形"],
  flag_bull: ["Бычий флаг", "Bull flag", "牛旗"],
  flag_bear: ["Медвежий флаг", "Bear flag", "熊旗"],
  pennant_bull: ["Бычий вымпел", "Bull pennant", "牛市三角旗"],
  pennant_bear: ["Медвежий вымпел", "Bear pennant", "熊市三角旗"],
  rectangle: ["Прямоугольник", "Rectangle", "矩形整理"],
  channel_up: ["Восходящий канал", "Ascending channel", "上升通道"],
  channel_down: ["Нисходящий канал", "Descending channel", "下降通道"],
  broadening: ["Расширяющаяся формация", "Broadening formation", "扩散形态"],
  cup: ["Чашка с ручкой", "Cup & handle", "杯柄形态"],
  rounding_bottom: ["Круглое дно", "Rounding bottom", "圆弧底"],
  rounding_top: ["Круглая вершина", "Rounding top", "圆弧顶"],
};

const STATUS: Record<PatternStatus, [string, string, string]> = {
  forming: ["формируется", "forming", "形成中"],
  breakout: ["пробой", "breakout", "已突破"],
  target: ["цель достигнута", "target hit", "目标达成"],
  failed: ["не отработал", "failed", "失败"],
};

const WORDS: Record<string, [string, string, string]> = {
  target: ["цель", "target", "目标"],
  stop: ["стоп", "stop", "止损"],
  level: ["пробой", "breakout", "突破位"],
};

export function patternName(type: PatternType, locale: string): string {
  const l = langOf(locale);
  return NAMES[type][l === "ru" ? 0 : l === "zh" ? 2 : 1];
}
const statusText = (s: PatternStatus, locale: string) => STATUS[s][langOf(locale) === "ru" ? 0 : langOf(locale) === "zh" ? 2 : 1];
const word = (k: string, locale: string) => WORDS[k][langOf(locale) === "ru" ? 0 : langOf(locale) === "zh" ? 2 : 1];

/* ───────────── detection cache ───────────── */

interface Extra {
  patterns: DetectedPattern[];
  prec: number;
}

/** Ids shown last time per chart (first candle time + parameters): a small bonus keeps the picture from flickering. */
const memory = new Map<string, Set<string>>();
let lastPatterns: DetectedPattern[] = [];

/** Alert-ready levels of the patterns found by the most recent computation (no UI; see analysis/patterns alertLevelsOf). */
export function getPatternAlertLevels(): AlertLevel[] {
  return alertLevelsOf(lastPatterns);
}

function optionsOf(p: Params, prevIds?: ReadonlySet<string>): PatternOptions {
  const enabled: Partial<Record<PatternGroup, boolean>> = {};
  for (const g of PATTERN_GROUPS) enabled[g] = B(p, GROUP_KEY[g]);
  return {
    enabled,
    degree: S(p, "paDegree") as Degree,
    minConfidence: N(p, "paMinConf"),
    minBars: N(p, "paMinBars"),
    maxBars: N(p, "paMaxBars"),
    tolAtr: N(p, "paTol"),
    bufferMode: S(p, "paBufMode") === "pct" ? "pct" : "atr",
    bufferAtr: N(p, "paBufAtr"),
    bufferPct: N(p, "paBufPct"),
    requireClose: B(p, "paClose"),
    maxShown: N(p, "paMax"),
    window: N(p, "paWindow"),
    maxAge: N(p, "paMaxAge"),
    showFailed: B(p, "paFailed"),
    prevIds,
  };
}

/** Price decimals from the last closes (the compute step has no access to the chart's precision): the 90th percentile. */
function precisionOf(cs: { c: number }[]): number {
  const ds: number[] = [];
  for (let i = Math.max(0, cs.length - 80); i < cs.length; i++) {
    const v = cs[i].c;
    if (!isFinite(v)) continue;
    let k = 0;
    while (k < 8 && Math.abs(Math.round(v * 10 ** k) / 10 ** k - v) > 1e-9 * Math.max(1, Math.abs(v))) k++;
    ds.push(k);
  }
  if (ds.length === 0) return 2;
  ds.sort((x, y) => x - y);
  return Math.min(8, ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.9))]);
}

/* ───────────── colours / helpers ───────────── */

function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function isDark(bg: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(bg);
  if (m) {
    const v = parseInt(m[1], 16);
    return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 < 128;
  }
  const r = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(bg);
  if (r) return +r[1] * 0.299 + +r[2] * 0.587 + +r[3] * 0.114 < 128;
  return true;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hit = (a: Box, b: Box, pad = 2) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** Finds a free place for a box: tries the wanted y, then steps away in both directions. */
function place(boxes: Box[], w: number, h: number, x: number, y: number, pane: { w: number; h: number }, prefer: -1 | 1): Box {
  const clampBox = (bx: number, by: number): Box => ({ x: Math.max(3, Math.min(pane.w - w - 3, bx)), y: Math.max(3, Math.min(pane.h - h - 3, by)), w, h });
  let best = clampBox(x, y);
  for (let k = 0; k < 14; k++) {
    for (const s of k === 0 ? [0] : [prefer, -prefer]) {
      const c = clampBox(x, y + s * k * (h + 3));
      if (!boxes.some((b) => hit(b, c))) return c;
    }
  }
  // sideways as the last resort
  for (let k = 1; k < 6; k++) {
    for (const s of [1, -1]) {
      const c = clampBox(x + s * k * (w * 0.6), y);
      if (!boxes.some((b) => hit(b, c))) return c;
    }
  }
  return best;
}

function pill(ctx: CanvasRenderingContext2D, b: Box, text: string, o: { bg: string; border: string; fg: string; font: string; dot?: string; strike?: boolean }) {
  ctx.save();
  ctx.fillStyle = o.bg;
  ctx.strokeStyle = o.border;
  ctx.lineWidth = 1;
  const r = 4;
  ctx.beginPath();
  ctx.moveTo(b.x + r, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = o.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let tx = b.x + 6;
  if (o.dot) {
    ctx.fillStyle = o.dot;
    ctx.beginPath();
    ctx.arc(b.x + 8, b.y + b.h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    tx += 8;
  }
  ctx.fillStyle = o.fg;
  ctx.fillText(text, tx, b.y + b.h / 2 + 0.5);
  if (o.strike) {
    const w = ctx.measureText(text).width;
    ctx.strokeStyle = o.fg;
    ctx.beginPath();
    ctx.moveTo(tx, b.y + b.h / 2);
    ctx.lineTo(tx + w, b.y + b.h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

/* ───────────── painter ───────────── */

function paint(sc: SeriesContext, p: Params, res?: IndResult): void {
  const ex = res?.extra as Extra | undefined;
  if (!ex || ex.patterns.length === 0) return;
  const { ctx } = sc;
  const locale = sc.options.locale;
  const dark = isDark(sc.theme.bg);
  const cUp = S(p, "paColUp");
  const cDown = S(p, "paColDown");
  const cFlat = S(p, "paColFlat");
  const cStop = S(p, "paColStop");
  const showTargets = B(p, "paTargets");
  const showStop = B(p, "paStops");
  const showZone = B(p, "paZone");
  const showPivots = B(p, "paPivots");
  const showLabels = B(p, "paLabels");
  const pw = sc.paneWidth;
  const ph = sc.paneHeight;
  const fontFamily = sc.options.fontFamily;
  const labelBg = dark ? "rgba(19,23,34,0.9)" : "rgba(255,255,255,0.94)";
  const labelFg = dark ? "#d1d4dc" : "#1f2937";
  const dotBg = sc.theme.bg;
  const fmt = (v: number) => formatPrice(v, ex.prec, locale);
  // the React legend (symbol line + indicator rows) covers the top-left corner of the pane: keep labels out of it
  const boxes: Box[] = [{ x: 0, y: 0, w: Math.min(pw * 0.62, 520), h: 72 }];
  const colorOf = (pt: DetectedPattern) => (pt.bias > 0 ? cUp : pt.bias < 0 ? cDown : cFlat);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // oldest first, so the freshest patterns are painted on top
  const list = ex.patterns.slice().sort((a, b) => a.endIdx - b.endIdx);
  const labelJobs: { pt: DetectedPattern; ax: number; top: number; bottom: number; col: string }[] = [];
  const priceJobs: { x: number; y: number; text: string; col: string; kind: "target" | "stop" }[] = [];

  for (const pt of list) {
    const col = colorOf(pt);
    const dim = pt.status === "failed" ? 0.5 : 1;
    const live = pt.status === "forming" || pt.status === "breakout";
    // drawn span, in bars
    const xr0 = sc.x(pt.i0);
    const lastDraw = Math.max(pt.endIdx, pt.i1);
    const xr1 = sc.x(lastDraw);
    const bracketOk = xr1 >= -20 && xr0 <= pw + 20;
    // price extent of the outline (for label placement)
    let top = -Infinity;
    let bottom = Infinity;
    for (const q of pt.pivots) {
      if (q.p > top) top = q.p;
      if (q.p < bottom) bottom = q.p;
    }
    for (const s of pt.segs) {
      for (const v of [s.p0, s.p1]) {
        if (s.kind === "ext") continue;
        if (v > top) top = v;
        if (v < bottom) bottom = v;
      }
    }
    for (const q of pt.curve) {
      if (q.p > top) top = q.p;
      if (q.p < bottom) bottom = q.p;
    }

    if (bracketOk) {
      ctx.globalAlpha = dim;
      // soft body between the boundaries
      const lines = pt.segs.filter((s) => s.kind === "line");
      if (lines.length === 2) {
        const [a, b] = lines;
        ctx.fillStyle = rgba(col, dark ? 0.07 : 0.05);
        ctx.beginPath();
        ctx.moveTo(sc.x(a.i0), sc.y(a.p0));
        ctx.lineTo(sc.x(a.i1), sc.y(a.p1));
        ctx.lineTo(sc.x(b.i1), sc.y(b.p1));
        ctx.lineTo(sc.x(b.i0), sc.y(b.p0));
        ctx.closePath();
        ctx.fill();
      } else if (pt.path.length >= 3 && pt.segs.length > 0) {
        // neckline patterns: the part of the zigzag between the pivots and the neckline
        const nk = pt.segs.find((s) => s.kind === "neck");
        if (nk) {
          const slope = nk.i1 === nk.i0 ? 0 : (nk.p1 - nk.p0) / (nk.i1 - nk.i0);
          const nAt = (i: number) => nk.p0 + slope * (i - nk.i0);
          ctx.fillStyle = rgba(col, dark ? 0.07 : 0.055);
          ctx.beginPath();
          const first = pt.path[0];
          ctx.moveTo(sc.x(first.i), sc.y(nAt(first.i)));
          for (const q of pt.path) ctx.lineTo(sc.x(q.i), sc.y(q.p));
          const last = pt.path[pt.path.length - 1];
          ctx.lineTo(sc.x(last.i), sc.y(nAt(last.i)));
          ctx.closePath();
          ctx.fill();
        }
      } else if (pt.curve.length > 2) {
        const nk = pt.segs.find((s) => s.kind === "neck");
        if (nk) {
          ctx.fillStyle = rgba(col, dark ? 0.07 : 0.055);
          ctx.beginPath();
          ctx.moveTo(sc.x(pt.curve[0].i), sc.y(nk.p0));
          for (const q of pt.curve) ctx.lineTo(sc.x(q.i), sc.y(q.p));
          ctx.lineTo(sc.x(pt.curve[pt.curve.length - 1].i), sc.y(nk.p0));
          ctx.closePath();
          ctx.fill();
        }
      }

      // zigzag path through the pivots
      if (pt.path.length >= 2) {
        ctx.strokeStyle = rgba(col, 0.6);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        pt.path.forEach((q, k) => (k === 0 ? ctx.moveTo(sc.x(q.i), sc.y(q.p)) : ctx.lineTo(sc.x(q.i), sc.y(q.p))));
        ctx.stroke();
      }
      // fitted bowl
      if (pt.curve.length >= 2) {
        ctx.strokeStyle = rgba(col, 0.85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        pt.curve.forEach((q, k) => (k === 0 ? ctx.moveTo(sc.x(q.i), sc.y(q.p)) : ctx.lineTo(sc.x(q.i), sc.y(q.p))));
        ctx.stroke();
      }
      // trendlines / neckline
      for (const s of pt.segs) {
        ctx.beginPath();
        if (s.kind === "ext") {
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = rgba(col, 0.7);
          ctx.lineWidth = 1.2;
        } else {
          ctx.setLineDash(s.kind === "neck" ? [7, 4] : []);
          ctx.strokeStyle = rgba(col, 0.95);
          ctx.lineWidth = s.kind === "neck" ? 1.4 : 1.6;
        }
        ctx.moveTo(sc.x(s.i0), sc.y(s.p0));
        ctx.lineTo(sc.x(s.i1), sc.y(s.p1));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // pivot markers
      if (showPivots) {
        for (const q of pt.pivots) {
          const x = sc.x(q.i);
          if (x < -4 || x > pw + 4) continue;
          ctx.beginPath();
          ctx.arc(x, sc.y(q.p), 3.2, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = dotBg;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // breakout level, target zone, stop
    if (pt.level !== null && pt.target !== null && showTargets && pt.status !== "failed") {
      const startIdx = pt.levelIdx >= 0 ? pt.levelIdx : lastDraw;
      const xs = Math.max(0, sc.x(startIdx));
      const done = pt.status === "target" && pt.targetIdx >= 0;
      const xEnd = done ? Math.min(pw, sc.x(pt.targetIdx)) : pw;
      if (xEnd > xs && xs < pw) {
        const yL = sc.y(pt.level);
        const yT = sc.y(pt.target);
        const zoneBars = Math.max(8, Math.min(40, Math.round((pt.i1 - pt.i0) * 0.3)));
        const zx2 = Math.min(xEnd, Math.max(xs + 18, sc.x(startIdx + zoneBars)));
        if (showZone) {
          ctx.fillStyle = rgba(col, dark ? 0.12 : 0.085);
          ctx.fillRect(xs, Math.min(yL, yT), zx2 - xs, Math.abs(yT - yL));
        }
        // level (zone base)
        ctx.setLineDash([1.5, 3.5]);
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xs, Math.round(yL) + 0.5);
        ctx.lineTo(zx2, Math.round(yL) + 0.5);
        ctx.stroke();
        // target line
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = rgba(col, done ? 0.55 : 0.95);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(xs, Math.round(yT) + 0.5);
        ctx.lineTo(xEnd, Math.round(yT) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        // arrow from the level to the target
        const ax = Math.min(zx2 - 6, xs + Math.max(10, Math.min(28, (zx2 - xs) / 2)));
        if (Math.abs(yT - yL) > 14 && ax > xs) {
          const dir = yT < yL ? -1 : 1;
          ctx.strokeStyle = rgba(col, 0.95);
          ctx.fillStyle = rgba(col, 0.95);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(ax, yL);
          ctx.lineTo(ax, yT - dir * 1);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ax, yT);
          ctx.lineTo(ax - 4.5, yT - dir * 8);
          ctx.lineTo(ax + 4.5, yT - dir * 8);
          ctx.closePath();
          ctx.fill();
        }
        priceJobs.push({ x: Math.min(pw - 4, xEnd - 2), y: yT, text: `${done ? "✓ " : ""}${word("target", locale)} ${fmt(pt.target)}`, col, kind: "target" });
      }
    }
    if (pt.stop !== null && showStop && live) {
      const startIdx = pt.levelIdx >= 0 ? pt.levelIdx : lastDraw;
      const xs = Math.max(0, sc.x(Math.max(startIdx - 4, pt.i1)));
      if (xs < pw) {
        const yS = Math.round(sc.y(pt.stop)) + 0.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = rgba(cStop, 0.85);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xs, yS);
        ctx.lineTo(pw, yS);
        ctx.stroke();
        ctx.setLineDash([]);
        priceJobs.push({ x: pw - 4, y: yS, text: `${word("stop", locale)} ${fmt(pt.stop)}`, col: cStop, kind: "stop" });
      }
    }
    if (bracketOk && showLabels) {
      const vx0 = Math.max(xr0, 6);
      const vx1 = Math.min(xr1, pw - 6);
      labelJobs.push({ pt, ax: (vx0 + vx1) / 2, top, bottom, col });
    }
  }

  // price tags first (they are small and pinned to the right edge), then the pattern labels around them
  const smallFont = `600 10px ${fontFamily}`;
  ctx.font = smallFont;
  for (const j of priceJobs) {
    const w = Math.ceil(ctx.measureText(j.text).width) + 10;
    const h = 15;
    // tag sits on the outer side of its line, right aligned
    const b = place(boxes, w, h, j.x - w, j.y - (j.kind === "target" ? h + 1 : -1), { w: pw, h: ph }, j.kind === "target" ? -1 : 1);
    boxes.push(b);
    pill(ctx, b, j.text, { bg: labelBg, border: rgba(j.col, 0.85), fg: j.col, font: smallFont });
  }

  const labFont = `600 11px ${fontFamily}`;
  ctx.font = labFont;
  // newest / most confident labels claim their spot first
  labelJobs.sort((a, b) => b.pt.endIdx - a.pt.endIdx || b.pt.confidence - a.pt.confidence);
  for (const j of labelJobs) {
    const pt = j.pt;
    const nm = patternName(pt.type, locale);
    let text = `${nm} · ${statusText(pt.status, locale)} · ${pt.confidence}%`;
    if (pt.rr !== null && pt.target !== null && pt.stop !== null && pt.status !== "failed") text += ` · R:R ${pt.rr.toFixed(1)}`;
    ctx.font = labFont;
    const w = Math.ceil(ctx.measureText(text).width) + 18;
    const h = 18;
    const above = pt.bias <= 0;
    const yAbove = sc.y(j.top) - h - 8;
    const yBelow = sc.y(j.bottom) + 8;
    let y = above ? yAbove : yBelow;
    // not enough room on the preferred side: use the other
    if (y < 76 && above && j.ax < pw * 0.62) y = yBelow;
    else if (y < 3 && above) y = yBelow;
    else if (y + h > ph - 3 && !above) y = yAbove;
    const b = place(boxes, w, h, j.ax - w / 2, y, { w: pw, h: ph }, above ? -1 : 1);
    boxes.push(b);
    const dotCol = pt.status === "target" ? cUp : pt.status === "failed" ? cStop : j.col;
    ctx.globalAlpha = pt.status === "failed" ? 0.75 : 1;
    pill(ctx, b, text, { bg: labelBg, border: rgba(j.col, 0.9), fg: labelFg, font: labFont, dot: dotCol, strike: false });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ───────────── definition ───────────── */

const DEGREES: SelectOption[] = [
  { value: "auto", label: "ind.pa.o.auto" },
  { value: "fine", label: "ind.pa.o.fine" },
  { value: "normal", label: "ind.pa.o.normal" },
  { value: "coarse", label: "ind.pa.o.coarse" },
];
const BUF_MODES: SelectOption[] = [
  { value: "atr", label: "ind.pa.o.atr" },
  { value: "pct", label: "ind.pa.o.pct" },
];

export const patternsAutoDef: IndicatorDef = {
  id: "patterns_auto",
  category: "patterns",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "chart patterns auto double top bottom triple head shoulders triangle wedge flag pennant rectangle channel broadening megaphone cup handle rounding targets graphic recognition формации паттерны фигуры графические треугольник клин флаг вымпел голова плечи",
  params: [
    bool("paDouble", true),
    bool("paTriple", true),
    bool("paHs", true),
    bool("paTri", true),
    bool("paWedge", true),
    bool("paFlag", true),
    bool("paPennant", true),
    bool("paRect", true),
    bool("paChannel", true),
    bool("paBroad", true),
    bool("paCup", true),
    bool("paRound", true),
    sel("paDegree", "auto", DEGREES),
    num("paMinConf", 55, 0, 100),
    num("paMinBars", 8, 3, 300),
    num("paMaxBars", 250, 20, 2000),
    num("paTol", 0.6, 0.1, 3, 0.05),
    sel("paBufMode", "atr", BUF_MODES),
    num("paBufAtr", 0.25, 0, 3, 0.05),
    num("paBufPct", 0.3, 0, 10, 0.05),
    bool("paClose", true),
    bool("paTargets", true),
    bool("paStops", true),
    bool("paZone", true),
    bool("paPivots", true),
    bool("paLabels", true),
    bool("paFailed", true),
    num("paMax", 5, 1, 20),
    num("paWindow", 1500, 100, 20000),
    num("paMaxAge", 60, 5, 1000),
    col("paColUp", "#26a69a"),
    col("paColDown", "#ef5350"),
    col("paColFlat", "#8b93a7"),
    col("paColStop", "#f23645"),
  ],
  styleParams: ["paColUp", "paColDown", "paColFlat", "paColStop"],
  title: (p) => `Patterns ${S(p, "paDegree")} ≥${N(p, "paMinConf")}%`,
  compute(cs, p) {
    const n = cs.length;
    if (n < 40) {
      lastPatterns = [];
      return { plots: [], extra: { patterns: [], prec: 2 } satisfies Extra };
    }
    // the memory is per chart (first candle) and settings
    const sig = `${cs[0].t}|${JSON.stringify(p)}`;
    const prev = memory.get(sig);
    let patterns: DetectedPattern[] = [];
    try {
      patterns = detectPatterns(cs, optionsOf(p, prev));
    } catch {
      patterns = [];
    }
    if (!prev && memory.size > 12) memory.delete(memory.keys().next().value as string);
    memory.set(sig, new Set(patterns.map((q) => q.id)));
    lastPatterns = patterns;
    return { plots: [], extra: { patterns, prec: precisionOf(cs) } satisfies Extra };
  },
  drawExtra(sc, p, res) {
    paint(sc, p, res);
  },
  legendItems(res, p, locale) {
    const ex = res.extra as Extra | undefined;
    const out: { text: string; color: string }[] = [];
    if (!ex) return out;
    const fmt = (v: number) => formatPrice(v, ex.prec, locale);
    const sorted = ex.patterns.slice().sort((a, b) => b.confidence - a.confidence);
    for (const pt of sorted.slice(0, 3)) {
      let text = `${patternName(pt.type, locale)} · ${statusText(pt.status, locale)} · ${pt.confidence}%`;
      if (pt.target !== null && pt.status !== "failed") text += ` · ${word("target", locale)} ${fmt(pt.target)}`;
      out.push({ text, color: pt.bias > 0 ? S(p, "paColUp") : pt.bias < 0 ? S(p, "paColDown") : S(p, "paColFlat") });
    }
    if (sorted.length > 3) out.push({ text: `+${sorted.length - 3}`, color: S(p, "paColFlat") });
    if (sorted.length === 0) out.push({ text: langOf(locale) === "ru" ? "паттернов нет" : langOf(locale) === "zh" ? "无形态" : "no patterns", color: S(p, "paColFlat") });
    return out;
  },
};

export const PATTERN_DEFS: IndicatorDef[] = [patternsAutoDef];

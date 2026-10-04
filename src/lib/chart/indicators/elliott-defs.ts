import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, NumberParam, Params, SelectOption, SelectParam } from "./registry";
import { alertLevels, analyze, DEFAULT_OPTIONS, type DegreeResult, type ElliottDegree, type ElliottOptions, type ElliottResult, type Phase, type ProjLevel, type WaveCount } from "../analysis/elliott";
import { formatPrice, inferPrecision } from "../format";
import { indT } from "./ind-text";

/* Elliott waves (auto): detection lives in analysis/elliott.ts, this file is the indicator wrapper (params, legend, alert
   levels) and the canvas painter: wave polyline with circled labels, optional channel, projections of the forming wave
   (target / retracement zones to the right of the last bar), the invalidation line and a "next expected" card. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;

const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

/* ───────────── texts (dictionary: ind.ew.*, English fallbacks here) ───────────── */

const PHASE_EN: Record<Phase, string> = {
  w2: "Wave 2 (forming)",
  w3: "Wave 3 (forming)",
  w4: "Wave 4 (forming)",
  w5: "Wave 5 (forming)",
  w5done: "Impulse 1-5 complete",
  wB: "Wave B (forming)",
  wC: "Wave C (forming)",
  wCdone: "Correction A-B-C complete",
  wE: "Wave E (forming)",
  wEdone: "Triangle complete",
  wX: "Wave X (forming)",
  wY: "Wave Y (forming)",
  wYdone: "W-X-Y complete",
};
const NEXT_EN: Record<Phase, string> = {
  w2: "Wave 2 should end, then wave 3 {dir}",
  w3: "Wave 3 should end, then a pullback (wave 4)",
  w4: "Wave 4 should end, then wave 5 {dir}",
  w5: "Wave 5 should end, then an A-B-C correction",
  w5done: "An A-B-C correction against the trend",
  wB: "Wave B, then wave C {dir}",
  wC: "C should end, then the trend resumes",
  wCdone: "The main trend should resume",
  wE: "A breakout of the triangle with the trend",
  wEdone: "A breakout of the triangle with the trend",
  wX: "Wave X, then wave Y {dir}",
  wY: "Y should end, then the trend resumes",
  wYdone: "The main trend should resume",
};
const KIND_EN: Record<string, string> = {
  impulse: "Impulse",
  leading_diagonal: "Leading diagonal",
  ending_diagonal: "Ending diagonal",
  zigzag: "Zigzag",
  flat: "Flat",
  expanded_flat: "Expanded flat",
  triangle: "Triangle",
  wxy: "Double three W-X-Y",
};
const DEG_EN: Record<ElliottDegree, string> = { minor: "Minor", intermediate: "Intermediate", primary: "Primary" };

const phaseText = (ph: Phase) => indT(`ind.ew.ph.${ph}`, PHASE_EN[ph]);
const kindText = (k: string) => indT(`ind.ew.k.${k}`, KIND_EN[k] ?? k);
const degText = (d: ElliottDegree) => indT(`ind.ew.o.${d}`, DEG_EN[d]);
const dirText = (d: 1 | -1) => (d > 0 ? indT("ind.ew.up", "up") : indT("ind.ew.down", "down"));

/* ───────────── options ───────────── */

function optionsOf(p: Params): ElliottOptions {
  return {
    degree: (S(p, "ewDegree") === "multi" ? "intermediate" : S(p, "ewDegree")) as ElliottDegree,
    sensitivity: N(p, "ewSens"),
    minConfidence: N(p, "ewMinConf"),
    allowDiagonals: B(p, "ewDiag"),
    allowComplex: B(p, "ewComplex"),
    window: N(p, "ewWindow"),
    maxCounts: N(p, "ewMaxCounts"),
    showAlternate: B(p, "ewAlt"),
  };
}

function resultOf(res: IndResult | undefined): ElliottResult | null {
  const x = res?.extra as ElliottResult | undefined;
  return x && Array.isArray(x.degrees) ? x : null;
}

const fmtP = (r: ElliottResult, locale: string, v: number, precisionOverride?: number) => formatPrice(v, precisionOverride ?? r.precision, locale);

/* ───────────── legend / summary text ───────────── */

interface Summary {
  state: string;
  conf: number;
  /** "target 1.618 = 312.4" / "zone 0.5 = 305.1", empty when there is none. */
  nextText: string;
  nextTag: string;
  invalidText: string;
  nextExpected: string;
  count: WaveCount | null;
}

function summaryOf(r: ElliottResult, locale: string): Summary | null {
  if (r.focus < 0) return null;
  const dr = r.degrees[r.focus];
  const live = dr?.live;
  if (!live) return null;
  const c = live.count;
  const pj = live.proj;
  const prefix = r.multi ? `${degText(dr.degree)}: ` : "";
  let nextText = "";
  let nextTag = "";
  if (pj.next) {
    nextTag = pj.next.tag;
    nextText = (pj.mode === "target" ? indT("ind.ew.target", "target") : indT("ind.ew.zone", "zone")) + ` ${pj.next.tag} = ${fmtP(r, locale, pj.next.price)}`;
  }
  return {
    state: prefix + phaseText(pj.phase),
    conf: c.conf,
    nextText,
    nextTag,
    invalidText: pj.invalid ? fmtP(r, locale, pj.invalid.price) : "",
    // {dir}: where the wave that FOLLOWS the forming one is heading
    nextExpected: indT(`ind.ew.next.${pj.phase}`, NEXT_EN[pj.phase], { dir: dirText(pj.dir > 0 ? -1 : 1) }),
    count: c,
  };
}

function countLine(c: WaveCount): string {
  const arrow = c.dir > 0 ? "▲" : "▼";
  const ratios = c.ratios.map((x) => `${x.k} ${x.v}`).join(", ");
  return `${kindText(c.kind)} ${arrow} ${c.labels.join("-")}${c.forming ? "?" : ""} · ${c.conf}%${ratios ? ` (${ratios})` : ""}`;
}

const MUTED = "#787b86";

function legendItems(res: IndResult, p: Params, locale: string): { text: string; color: string }[] {
  const r = resultOf(res);
  if (!r) return [];
  const sum = summaryOf(r, locale);
  if (!sum) return [{ text: indT("ind.ew.none", "no count ≥ {min}%", { min: r.minConfidence }), color: MUTED }];
  const count = sum.count as WaveCount;
  const color = count.kind === "impulse" || count.kind.endsWith("diagonal") ? (count.dir > 0 ? S(p, "ewColUp") : S(p, "ewColDown")) : S(p, "ewColCorr");
  const parts = [sum.state, `${sum.conf}%`];
  if (sum.nextText) parts.push(sum.nextText);
  return [{ text: parts.join(" · "), color }];
}

function legendTip(res: IndResult, _p: Params, locale: string): string | undefined {
  const r = resultOf(res);
  if (!r) return undefined;
  const hyp = indT("ind.ew.hyp", "A hypothesis, not a forecast.");
  const sum = summaryOf(r, locale);
  const lines: string[] = [];
  for (const d of r.degrees) {
    if (!d.counts.length) continue;
    const pre = r.multi ? "  " : "";
    if (r.multi) lines.push(`${degText(d.degree)}:`);
    for (const c of d.counts) lines.push(pre + countLine(c));
    if (d.alt) lines.push(pre + indT("ind.ew.alt", "Alternate") + ": " + countLine(d.alt));
  }
  const live = r.focus >= 0 ? r.degrees[r.focus]?.live : null;
  if (live?.proj.invalid) lines.push(`${indT("ind.ew.invalid", "Invalidation")}: ${fmtP(r, locale, live.proj.invalid.price)}`);
  if (sum) lines.push(`${indT("ind.ew.nextLabel", "Next")}: ${sum.nextExpected}`);
  lines.push(hyp);
  return lines.join("\n");
}

/* ───────────── painting ───────────── */

const rgba = (hex: string, a: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
};

const ROMAN: Record<string, string> = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V" };
const finite = (v: number) => v === v && v !== Infinity && v !== -Infinity;

interface Colors {
  up: string;
  down: string;
  corr: string;
  target: string;
  invalid: string;
}

function colorOf(c: WaveCount, k: Colors): string {
  if (c.kind === "impulse" || c.kind === "leading_diagonal" || c.kind === "ending_diagonal") return c.dir > 0 ? k.up : k.down;
  return k.corr;
}

type LabelStyle = "circle" | "paren" | "roman";
const LABEL_STYLE: Record<ElliottDegree, LabelStyle> = { minor: "circle", intermediate: "paren", primary: "roman" };

function waveLabel(sc: SeriesContext, x: number, y: number, above: boolean, text: string, color: string, style: LabelStyle, forming: boolean, alpha: number) {
  const { ctx, theme } = sc;
  const cy = above ? y - 15 : y + 15;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash(forming ? [2.5, 2] : []);
  if (style === "paren") {
    const t = `(${text})`;
    ctx.font = `700 12px ${sc.options.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(theme.bg.startsWith("#") && theme.bg.length === 7 ? theme.bg : "#ffffff", 0.9);
    ctx.strokeText(t, x, cy);
    ctx.fillStyle = color;
    ctx.fillText(t, x, cy);
  } else {
    const label = style === "roman" ? (ROMAN[text.replace("?", "")] ?? text.replace("?", "")) + (text.endsWith("?") ? "?" : "") : text;
    ctx.font = `700 ${label.length > 2 ? 9 : 11}px ${sc.options.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.max(18, ctx.measureText(label).width + 8);
    ctx.beginPath();
    if (style === "circle" && w <= 20) ctx.arc(x, cy, 9, 0, Math.PI * 2);
    else {
      const h = 18;
      const r = style === "roman" ? 4 : 9;
      ctx.roundRect ? ctx.roundRect(x - w / 2, cy - h / 2, w, h, r) : ctx.rect(x - w / 2, cy - h / 2, w, h);
    }
    ctx.fillStyle = theme.bg;
    ctx.globalAlpha = alpha * 0.88;
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = style === "roman" ? 1.8 : 1.4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.fillText(label, x, cy + 0.5);
  }
  ctx.restore();
}

interface DrawOpts {
  width: number;
  alpha: number;
  alt: boolean;
}

function drawCount(sc: SeriesContext, c: WaveCount, k: Colors, o: DrawOpts, degree: ElliottDegree) {
  const { ctx } = sc;
  const color = colorOf(c, k);
  const pts = c.pivots.map((pv) => ({ x: sc.x(pv.i), y: sc.y(pv.p), pv }));
  if (pts.some((q) => !finite(q.x) || !finite(q.y))) return;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = o.width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let j = 1; j < pts.length; j++) {
    const prov = c.forming && j === pts.length - 1;
    ctx.setLineDash(o.alt ? [2, 4] : prov ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(pts[j - 1].x, pts[j - 1].y);
    ctx.lineTo(pts[j].x, pts[j].y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // origin dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const style = LABEL_STYLE[degree];
  for (let j = 1; j < pts.length; j++) {
    const q = pts[j];
    if (q.x < -20 || q.x > sc.paneWidth + 20) continue;
    const forming = c.forming && j === pts.length - 1;
    const text = (c.labels[j - 1] ?? "") + (forming ? "?" : "");
    if (o.alt) {
      // alternate count: small dimmed plain labels
      const { ctx: cx } = sc;
      cx.save();
      cx.globalAlpha = 0.6;
      cx.font = `600 10px ${sc.options.fontFamily}`;
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillStyle = color;
      cx.fillText(text, q.x, q.pv.type === "H" ? q.y - 11 : q.y + 11);
      cx.restore();
    } else waveLabel(sc, q.x, q.y, q.pv.type === "H", text, color, style, forming, 1);
  }
}

/** Channel (impulse: base 0-2(-4) and a parallel through the extreme of 1/3/5; triangle: the two converging lines), in screen space. */
function drawChannel(sc: SeriesContext, c: WaveCount, color: string) {
  const { ctx } = sc;
  const pts = c.pivots.map((pv) => ({ x: sc.x(pv.i), y: sc.y(pv.p) }));
  if (pts.some((q) => !finite(q.x) || !finite(q.y))) return;
  const ext = c.forming ? sc.barSpacing * 8 : sc.barSpacing * 2;
  const endX = pts[pts.length - 1].x + ext;
  const lineThrough = (a: { x: number; y: number }, b: { x: number; y: number }, x1: number, x0 = a.x) => {
    const dx = b.x - a.x || 1e-6;
    const k = (b.y - a.y) / dx;
    return [
      { x: x0, y: a.y + k * (x0 - a.x) },
      { x: x1, y: a.y + k * (x1 - a.x) },
    ];
  };
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = rgba(color, 0.65);
  ctx.fillStyle = rgba(color, 0.035);
  if (c.kind === "triangle" && pts.length >= 5) {
    const up = [1, 3, 5].filter((i) => pts[i]);
    const lo = [0, 2, 4].filter((i) => pts[i]);
    const dirUpFirst = c.dir > 0;
    const hi = dirUpFirst ? up : lo.slice(1);
    const low = dirUpFirst ? lo.slice(1) : up;
    const a = lineThrough(pts[hi[0]], pts[hi[1]], endX, pts[hi[0]].x);
    const b = lineThrough(pts[low[0]], pts[low[1]], endX, pts[low[0]].x);
    ctx.beginPath();
    ctx.moveTo(a[0].x, a[0].y);
    ctx.lineTo(a[1].x, a[1].y);
    ctx.moveTo(b[0].x, b[0].y);
    ctx.lineTo(b[1].x, b[1].y);
    ctx.stroke();
  } else if ((c.kind === "impulse" || c.kind.endsWith("diagonal")) && pts.length >= 4) {
    const base = lineThrough(pts[0], pts[2], endX);
    const slope = (base[1].y - base[0].y) / (base[1].x - base[0].x || 1e-6);
    const yAt = (x: number) => base[0].y + slope * (x - base[0].x);
    // outer offset: the pivot (1, 3, 5) farthest from the base line on the side of pivot 1
    const side = Math.sign(pts[1].y - yAt(pts[1].x)) || -1;
    let off = 0;
    for (const i of [1, 3, 5]) {
      if (!pts[i]) continue;
      const d = (pts[i].y - yAt(pts[i].x)) * side;
      if (d > off) off = d;
    }
    off *= side;
    ctx.beginPath();
    ctx.moveTo(base[0].x, base[0].y);
    ctx.lineTo(base[1].x, base[1].y);
    ctx.moveTo(base[0].x, base[0].y + off);
    ctx.lineTo(base[1].x, base[1].y + off);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(base[0].x, base[0].y);
    ctx.lineTo(base[1].x, base[1].y);
    ctx.lineTo(base[1].x, base[1].y + off);
    ctx.lineTo(base[0].x, base[0].y + off);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

interface PLabel {
  y: number;
  text: string;
  color: string;
  filled: boolean;
  arrow: string;
}

/** Simple vertical collision avoidance: pushes labels apart by `gap` px, keeping them inside [top, bottom]. */
function spread(labels: PLabel[], gap: number, top: number, bottom: number) {
  labels.sort((a, b) => a.y - b.y);
  for (let i = 0; i < labels.length; i++) labels[i].y = Math.max(top, Math.min(bottom, labels[i].y));
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;
  if (labels.length && labels[labels.length - 1].y > bottom) {
    labels[labels.length - 1].y = bottom;
    for (let i = labels.length - 2; i >= 0; i--) if (labels[i + 1].y - labels[i].y < gap) labels[i].y = labels[i + 1].y - gap;
  }
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Paints the projection of the forming wave; returns the rectangles it occupies (the summary card keeps away from them). */
function drawProjection(sc: SeriesContext, r: ElliottResult, d: DegreeResult, k: Colors, p: Params): Rect[] {
  const used: Rect[] = [];
  const live = d.live;
  if (!live) return used;
  const pj = live.proj;
  const n = sc.candles.length;
  if (n === 0) return used;
  const { ctx } = sc;
  const xLast = sc.x(n - 1);
  if (!finite(xLast) || xLast > sc.paneWidth + 10) return used;
  const W = 190;
  const x1 = sc.paneWidth - 8;
  let x0 = Math.min(xLast + sc.barSpacing * 1.5, x1 - W);
  x0 = Math.max(x0, x1 - W - 120);
  if (x1 - x0 < 90) return used;
  const locale = sc.options.locale;
  const prec = sc.options.pricePrecision ?? r.precision;
  const zoneColor = pj.mode === "retrace" ? k.corr : k.target;
  const showTargets = B(p, "ewTargets");
  const showInvalid = B(p, "ewInvalid");

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sc.paneWidth, sc.paneHeight);
  ctx.clip();
  ctx.font = `600 10px ${sc.options.fontFamily}`;
  const labels: PLabel[] = [];

  if (showTargets && pj.levels.length) {
    // translucent zone between the core levels
    const core = pj.levels.filter((l) => l.core && finite(l.price));
    if (core.length >= 1) {
      const ys = core.map((l) => sc.y(l.price));
      const yTop = Math.min(...ys);
      const yBot = Math.max(...ys);
      ctx.fillStyle = rgba(zoneColor, 0.13);
      ctx.fillRect(x0, yTop, x1 - x0, Math.max(2, yBot - yTop));
      used.push({ x: x0, y: yTop, w: x1 - x0, h: Math.max(2, yBot - yTop) });
      ctx.strokeStyle = rgba(zoneColor, 0.45);
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x0 + 0.5, yTop + 0.5, x1 - x0 - 1, Math.max(2, yBot - yTop) - 1);
    }
    // dotted path from the last pivot to the next level
    if (pj.next) {
      const a = sc.x(live.count.pivots[live.count.pivots.length - 1].i);
      const ya = sc.y(live.count.pivots[live.count.pivots.length - 1].p);
      const yb = sc.y(pj.next.price);
      if (finite(a) && finite(ya) && finite(yb)) {
        ctx.strokeStyle = rgba(zoneColor, 0.7);
        ctx.lineWidth = 1.3;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(a, ya);
        ctx.lineTo((x0 + x1) / 2, yb);
        ctx.stroke();
      }
    }
    for (const l of pj.levels) {
      if (!finite(l.price)) continue;
      const y = sc.y(l.price);
      if (!finite(y)) continue;
      const isNext = pj.next === l;
      ctx.strokeStyle = rgba(zoneColor, l.core ? 0.95 : 0.6);
      ctx.lineWidth = isNext ? 1.8 : 1.1;
      ctx.setLineDash([6, 4]);
      if (y >= -1 && y <= sc.paneHeight + 1) {
        ctx.beginPath();
        ctx.moveTo(x0, Math.round(y) + 0.5);
        ctx.lineTo(x1, Math.round(y) + 0.5);
        ctx.stroke();
      }
      labels.push({ y, text: `${l.tag}  ${formatPrice(l.price, prec, locale)}`, color: zoneColor, filled: isNext, arrow: y < 0 ? "↑ " : y > sc.paneHeight ? "↓ " : "" });
    }
  }
  if (showInvalid && pj.invalid && finite(pj.invalid.price)) {
    const y = sc.y(pj.invalid.price);
    if (finite(y)) {
      const xs = Math.max(0, Math.min(sc.x(pj.invalid.fromI), x0));
      ctx.strokeStyle = k.invalid;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      if (y >= -1 && y <= sc.paneHeight + 1) {
        ctx.beginPath();
        ctx.moveTo(xs, Math.round(y) + 0.5);
        ctx.lineTo(x1, Math.round(y) + 0.5);
        ctx.stroke();
      }
      labels.push({ y, text: `${indT("ind.ew.invalid", "Invalidation")}  ${formatPrice(pj.invalid.price, prec, locale)}`, color: k.invalid, filled: true, arrow: y < 0 ? "↑ " : y > sc.paneHeight ? "↓ " : "" });
    }
  }
  ctx.setLineDash([]);
  spread(labels, 14, 9, sc.paneHeight - 9);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const lb of labels) {
    const text = lb.arrow + lb.text;
    const w = ctx.measureText(text).width + 10;
    const lx = x1 - 3;
    ctx.fillStyle = lb.filled ? lb.color : rgba(sc.theme.bg.length === 7 ? sc.theme.bg : "#ffffff", 0.82);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(lx - w, lb.y - 7, w, 14, 3);
    else ctx.rect(lx - w, lb.y - 7, w, 14);
    ctx.fill();
    if (!lb.filled) {
      ctx.strokeStyle = rgba(lb.color, 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = lb.filled ? "#ffffff" : lb.color;
    ctx.fillText(text, lx - 5, lb.y + 0.5);
    used.push({ x: lx - w, y: lb.y - 7, w, h: 14 });
  }
  ctx.restore();
  return used;
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function drawCard(sc: SeriesContext, r: ElliottResult, p: Params, k: Colors, avoid: Rect[]) {
  if (sc.paneWidth < 380) return;
  const sum = summaryOf(r, sc.options.locale);
  const { ctx, theme } = sc;
  const lines: { text: string; color: string; bold?: boolean; size?: number }[] = [];
  const title = indT("ind.ew.short", "Elliott") + (r.multi ? "" : " · " + degText(r.degrees[0]?.degree ?? "intermediate"));
  lines.push({ text: title, color: theme.text, bold: true, size: 12 });
  if (!sum) {
    lines.push({ text: indT("ind.ew.none", "no count ≥ {min}%", { min: r.minConfidence }), color: theme.textMuted });
  } else {
    const count = sum.count as WaveCount;
    lines.push({ text: `${sum.state} · ${sum.conf}%`, color: colorOf(count, k), bold: true });
    lines.push({ text: indT("ind.ew.nextLabel", "Next") + ": " + sum.nextExpected, color: theme.text });
    const live = r.degrees[r.focus]?.live;
    if (live?.proj.next && B(p, "ewTargets")) lines.push({ text: sum.nextText, color: k.target });
    if (sum.invalidText && B(p, "ewInvalid")) lines.push({ text: `${indT("ind.ew.invalid", "Invalidation")}: ${sum.invalidText}`, color: k.invalid });
  }
  lines.push({ text: indT("ind.ew.hyp", "A hypothesis, not a forecast."), color: theme.textMuted, size: 9 });
  ctx.save();
  let w = 0;
  for (const l of lines) {
    ctx.font = `${l.bold ? 700 : 500} ${l.size ?? 11}px ${sc.options.fontFamily}`;
    w = Math.max(w, ctx.measureText(l.text).width);
  }
  w = Math.min(w + 20, sc.paneWidth * 0.5);
  const lh = 15;
  const h = lines.length * lh + 8;
  // the corner where the card hides the fewest candles and none of the projection labels
  const corners: Rect[] = [
    { x: sc.paneWidth - w - 8, y: 8, w, h },
    { x: sc.paneWidth - w - 8, y: sc.paneHeight - h - 34, w, h },
    { x: 8, y: sc.paneHeight - h - 34, w, h },
    { x: 8, y: 84, w, h },
  ];
  let best = corners[0];
  let bestCost = Infinity;
  const from = Math.max(0, sc.from);
  const to = Math.min(sc.candles.length - 1, sc.to);
  for (const c of corners) {
    let cost = 0;
    for (const a of avoid) cost += overlapArea(c, a) * 6;
    for (let i = from; i <= to; i++) {
      const cx = sc.x(i);
      if (cx < c.x - 4 || cx > c.x + c.w + 4) continue;
      const yh = sc.y(sc.candles[i].h);
      const yl = sc.y(sc.candles[i].l);
      if (finite(yh) && finite(yl)) cost += overlapArea(c, { x: cx - 1.5, y: Math.min(yh, yl), w: 3, h: Math.abs(yl - yh) });
    }
    if (cost < bestCost - 1e-6) {
      bestCost = cost;
      best = c;
    }
  }
  const x = best.x;
  const y = best.y;
  // design v3: soft white card with a shadow instead of a hard frame
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = theme.bg.length === 7 ? rgba(theme.bg, 0.94) : theme.bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 12);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  lines.forEach((l, i) => {
    ctx.font = `${l.bold ? 700 : 500} ${l.size ?? 11}px ${sc.options.fontFamily}`;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, x + 10, y + 4 + lh * i + lh / 2);
  });
  ctx.restore();
}

function drawElliott(sc: SeriesContext, p: Params, res?: IndResult) {
  const r = resultOf(res);
  if (!r || sc.candles.length === 0) return;
  const k: Colors = { up: S(p, "ewColUp"), down: S(p, "ewColDown"), corr: S(p, "ewColCorr"), target: S(p, "ewColTarget"), invalid: S(p, "ewColInvalid") };
  const baseW = N(p, "ewWidth");
  const { ctx } = sc;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sc.paneWidth, sc.paneHeight);
  ctx.clip();
  // higher degrees first so that the small waves stay on top
  for (const d of r.degrees) {
    const w = r.multi ? baseW + (d.degree === "primary" ? 1.2 : d.degree === "intermediate" ? 0.5 : 0) : baseW;
    const alpha = r.multi ? (d.degree === "primary" ? 0.95 : d.degree === "intermediate" ? 0.85 : 0.75) : 1;
    if (d.alt) drawCount(sc, d.alt, k, { width: Math.max(1, w - 0.8), alpha: 0.5, alt: true }, d.degree);
    d.counts.forEach((c, i) => {
      const last = i === d.counts.length - 1;
      if (B(p, "ewChannel") && last) drawChannel(sc, c, colorOf(c, k));
      drawCount(sc, c, k, { width: w, alpha: last ? alpha : alpha * 0.8, alt: false }, d.degree);
    });
  }
  ctx.restore();
  const used = r.focus >= 0 ? drawProjection(sc, r, r.degrees[r.focus], k, p) : [];
  if (B(p, "ewSummary")) drawCard(sc, r, p, k, used);
}

/* ───────────── definition ───────────── */

const DEGREE_OPTIONS: SelectOption[] = [
  { value: "minor", label: "ind.ew.o.minor" },
  { value: "intermediate", label: "ind.ew.o.intermediate" },
  { value: "primary", label: "ind.ew.o.primary" },
  { value: "multi", label: "ind.ew.o.multi" },
];

export const ELLIOTT_DEF: IndicatorDef = {
  id: "elliott_auto",
  category: "patterns",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords: "elliott wave waves impulse correction abc zigzag flat triangle fibonacci target projection эллиотт волны импульс коррекция цели инвалидация 艾略特 波浪",
  params: [
    sel("ewDegree", DEFAULT_OPTIONS.degree, DEGREE_OPTIONS),
    num("ewSens", DEFAULT_OPTIONS.sensitivity, 1, 10),
    num("ewMinConf", DEFAULT_OPTIONS.minConfidence, 0, 100),
    num("ewMaxCounts", DEFAULT_OPTIONS.maxCounts, 1, 8),
    num("ewWindow", DEFAULT_OPTIONS.window, 200, 5000, 50),
    bool("ewTargets", true),
    bool("ewInvalid", true),
    bool("ewChannel", false),
    bool("ewDiag", DEFAULT_OPTIONS.allowDiagonals),
    bool("ewComplex", DEFAULT_OPTIONS.allowComplex),
    bool("ewAlt", DEFAULT_OPTIONS.showAlternate),
    bool("ewSummary", true),
    num("ewWidth", 2, 1, 4, 0.5),
    col("ewColUp", "#2962ff"),
    col("ewColDown", "#d500f9"),
    col("ewColCorr", "#ff9800"),
    col("ewColTarget", "#00acc1"),
    col("ewColInvalid", "#f23645"),
  ],
  styleParams: ["ewColUp", "ewColDown", "ewColCorr", "ewColTarget", "ewColInvalid"],
  title: (p) => `${indT("ind.ew.short", "Elliott")} · ${S(p, "ewDegree") === "multi" ? indT("ind.ew.o.multi", "All degrees") : degText(S(p, "ewDegree") as ElliottDegree)}`,
  compute(cs, p) {
    if (cs.length < 10) return { plots: [] };
    const res = analyze(cs, optionsOf(p), S(p, "ewDegree") === "multi");
    res.precision = inferPrecision(cs);
    return { plots: [], extra: res };
  },
  drawExtra(sc, p, res) {
    drawElliott(sc, p, res);
  },
  legendItems,
  legendTip,
  alertLevels(res) {
    return alertLevels(resultOf(res));
  },
};

export const ELLIOTT_DEFS: IndicatorDef[] = [ELLIOTT_DEF];

/** Prices of the invalidation and the next target of the live count (only data, no UI): for alerts later. */
export function elliottAlertLevels(res: IndResult | undefined): number[] {
  return alertLevels(resultOf(res));
}

export type { ProjLevel };

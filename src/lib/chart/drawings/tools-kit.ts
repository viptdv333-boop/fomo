import type { DrawingStyle } from "../contracts";
import type { Candle } from "../types";
import * as G from "./geometry";
import type { DPoint, DrawLabels, Drawing, Pt } from "./types";
import type { DrawState, Env, HandleDef, ToolDef, ToolUi } from "./tools";
import { layoutText, on, paintText as paintTextBlock, solid, textCfg, type TextCfg, type TextDefaults, type TextLayout } from "./render";

export { on, solid, textCfg, layoutText, paintTextBlock };
export type { TextCfg, TextDefaults, TextLayout };

/* Shared painting helpers for the extended drawing tools (tools-*.ts).
   Only `import type` from tools.ts, so there is no runtime cycle with the registry. */

export const TOL = 8;

export const BLUE = "#2962ff";
export const RED = "#f23645";
export const GREEN = "#089981";
export const GRAY = "#787b86";
export const ORANGE = "#ff9800";
export const PURPLE = "#9c27b0";
export const TEAL = "#00bcd4";
export const YELLOW = "#fdd835";
export const LIME = "#4caf50";

export const RAINBOW = [RED, ORANGE, LIME, GREEN, TEAL, BLUE, PURPLE, GRAY];

export const UI_LINE: ToolUi = { color: true, width: true, dash: true, fill: false, text: false };
export const UI_SHAPE: ToolUi = { color: true, width: true, dash: true, fill: true, text: false };
export const UI_TEXT: ToolUi = { color: true, width: true, dash: false, fill: false, text: true };
export const UI_BOX_TEXT: ToolUi = { color: true, width: false, dash: false, fill: true, text: true };
export const UI_COLOR: ToolUi = { color: true, width: false, dash: false, fill: false, text: false };

export function mkStyle(color: string, width = 1, dash = "solid", extra: Partial<DrawingStyle> = {}): DrawingStyle {
  return { color, width, dash, ...extra };
}

/* ───────────── translatable strings painted inside drawings ───────────── */

export const DRAW_TEXT_DEFAULTS: Record<string, string> = {
  "draw.txt.leftShoulder": "Left shoulder",
  "draw.txt.head": "Head",
  "draw.txt.rightShoulder": "Right shoulder",
  "draw.txt.neckline": "Neckline",
  "draw.txt.vwap": "VWAP",
  "draw.txt.poc": "POC",
  "draw.txt.vah": "VAH",
  "draw.txt.val": "VAL",
  "draw.txt.volume": "Volume",
  "draw.txt.forecast": "Forecast",
  "draw.txt.target": "Target",
  "draw.txt.bars": "bars",
  "draw.txt.angle": "Angle",
  "draw.txt.projection": "Projection",
  "draw.txt.signpost": "Signpost",
  "draw.txt.tableDefault": "Parameter|Value;Entry|0",
  "draw.txt.regression": "Regression",
};

let texts: Record<string, string> = { ...DRAW_TEXT_DEFAULTS };

/** The toolbar pushes translated strings here (same idea as DrawLabels). */
export function setDrawTexts(patch: Record<string, string>) {
  texts = { ...texts, ...patch };
}

export function tx(key: string): string {
  return texts[key] ?? DRAW_TEXT_DEFAULTS[key] ?? key;
}

/* ───────────── stroke & fill ───────────── */

export function lw(d: Drawing, st: DrawState): number {
  return Math.max(1, d.style.width) + (st.hover && !st.selected ? 1 : 0);
}

export function dashArray(kind: string, w: number): number[] {
  if (kind === "dashed") return [6 + w, 4 + w];
  if (kind === "dotted") return [1.5, 2.5 + w];
  return [];
}

/** Aligns a coordinate to the pixel grid so 1px (odd width) lines are crisp. */
export function sn(v: number, w: number): number {
  return Math.round(w) % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v);
}

export function stroke(ctx: CanvasRenderingContext2D, d: Drawing, st: DrawState, colorOverride?: string, dashOverride?: string) {
  const w = lw(d, st);
  ctx.strokeStyle = colorOverride ?? d.style.color;
  ctx.lineWidth = w;
  ctx.setLineDash(dashArray(dashOverride ?? d.style.dash, w));
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
}

/** Thin dashed auxiliary line (guides between anchors). */
export function guide(ctx: CanvasRenderingContext2D, d: Drawing, color?: string) {
  ctx.strokeStyle = color ?? d.style.color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
}

export function clipRect(env: Env) {
  return { x0: -4, y0: -4, x1: env.w + 4, y1: env.h + 4 };
}

export function strokeMode(ctx: CanvasRenderingContext2D, env: Env, a: Pt, b: Pt, mode: G.LineMode) {
  const seg = G.clipLineToRect(a, b, mode, clipRect(env));
  if (!seg) return;
  ctx.beginPath();
  ctx.moveTo(seg[0].x, seg[0].y);
  ctx.lineTo(seg[1].x, seg[1].y);
  ctx.stroke();
}

export function strokeSeg(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function polyPath(ctx: CanvasRenderingContext2D, pts: Pt[], close = false) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (close) ctx.closePath();
}

export function strokePoly(ctx: CanvasRenderingContext2D, pts: Pt[], close = false) {
  polyPath(ctx, pts, close);
  ctx.stroke();
}

/** Background switched off in the properties ("showFill" = false). */
export function fillOn(d: Drawing): boolean {
  return d.style.showFill !== false;
}

/** Border switched on (default). */
export function borderOn(d: Drawing): boolean {
  return d.style.showBorder !== false;
}

/** Boolean tool option stored in the style (schema key), with a default. */
export function opt(d: Drawing, key: string, def: boolean): boolean {
  return on(d.style[key], def);
}

/** Numeric tool option stored in the style, clamped. */
export function optNum(d: Drawing, key: string, def: number, lo: number, hi: number): number {
  const v = d.style[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
}

export function fillCur(ctx: CanvasRenderingContext2D, d: Drawing, color?: string, mul = 1) {
  if (!fillOn(d)) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (d.style.fillOpacity ?? 0.15) * mul));
  ctx.fillStyle = color ?? d.style.fill ?? d.style.color;
  ctx.fill();
  ctx.restore();
}

export function fillPoly(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], color?: string, mul = 1) {
  if (pts.length < 3) return;
  polyPath(ctx, pts, true);
  fillCur(ctx, d, color, mul);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function dot(ctx: CanvasRenderingContext2D, p: Pt, r: number, color: string) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, size: number) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(ang - 0.42), to.y - size * Math.sin(ang - 0.42));
  ctx.lineTo(to.x - size * Math.cos(ang + 0.42), to.y - size * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
  ctx.restore();
}

/* ───────────── text ───────────── */

let measureCtx: CanvasRenderingContext2D | null = null;
export function textW(env: Env, text: string, size = 11, weight = 600): number {
  if (!measureCtx && typeof document !== "undefined") {
    try {
      measureCtx = document.createElement("canvas").getContext("2d");
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return text.length * size * 0.58;
  measureCtx.font = `${weight} ${size}px ${env.font}`;
  return measureCtx.measureText(text).width;
}

export interface LabelOpts {
  align?: "left" | "center" | "right";
  base?: "top" | "middle" | "bottom";
  fg?: string;
  bg?: string;
  size?: number;
  clamp?: boolean;
  alpha?: number;
}

/** Text on a small rounded background; readable on any theme. Returns the box it occupied. */
export function label(ctx: CanvasRenderingContext2D, env: Env, text: string | string[], x: number, y: number, o: LabelOpts = {}) {
  const lines = Array.isArray(text) ? text : [text];
  const size = o.size ?? 11;
  const lh = size + 3;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `600 ${size}px ${env.font}`;
  let mw = 0;
  for (const l of lines) mw = Math.max(mw, ctx.measureText(l).width);
  const bw = mw + 10;
  const bh = lines.length * lh + 3;
  let bx = o.align === "right" ? x - bw : o.align === "center" ? x - bw / 2 : x;
  let by = o.base === "bottom" ? y - bh : o.base === "middle" ? y - bh / 2 : y;
  if (o.clamp !== false) {
    bx = Math.max(2, Math.min(env.w - bw - 2, bx));
    by = Math.max(2, Math.min(env.h - bh - 2, by));
  }
  ctx.globalAlpha = o.alpha ?? 0.92;
  ctx.fillStyle = o.bg ?? env.theme.labelBg;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = o.fg ?? env.theme.labelText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, bx + 5, by + 1.5 + lh * i + lh / 2));
  ctx.restore();
  return { x: bx, y: by, w: bw, h: bh };
}

/**
 * Text of a drawing through the shared text pipeline (font, colour, alignment, wrapping, text background / border
 * from the Text tab). An empty text shows the placeholder faded.
 */
export function textBlock(env: Env, d: Drawing, def: TextDefaults, opts: { text?: string; placeholder?: boolean; maxW?: number | null; bgFromColor?: boolean } = {}) {
  const cfg = textCfg(d, def);
  let empty = false;
  if (opts.text !== undefined) cfg.text = opts.text;
  else if (cfg.text === "" && opts.placeholder !== false) {
    cfg.text = env.labels.empty;
    empty = true;
  }
  if (opts.bgFromColor && cfg.bg && d.style.textBg === undefined) cfg.bg = solid(d.style.color);
  const lay = layoutText(env, cfg, cfg.text, cfg.wrap ? (opts.maxW ?? 220) : null);
  return { cfg, lay, empty };
}

/** Plain text without a background (pattern vertex letters, ratios). */
export function plainText(ctx: CanvasRenderingContext2D, env: Env, s: string, x: number, y: number, color: string, size = 12, align: CanvasTextAlign = "center", base: CanvasTextBaseline = "middle") {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `600 ${size}px ${env.font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/**
 * Vertex label of a pattern / wave: placed above a local high and below a local low.
 * `circled` draws the letter inside a ring (Elliott style).
 */
export function vertexLabel(ctx: CanvasRenderingContext2D, env: Env, P: Pt[], i: number, text: string, color: string, circled = false) {
  if (!text) return;
  const p = P[i];
  const prev = P[i - 1];
  const next = P[i + 1];
  let above: boolean;
  if (prev && next) above = p.y <= Math.min(prev.y, next.y) || (p.y < prev.y && p.y < next.y);
  else if (prev) above = p.y <= prev.y;
  else if (next) above = p.y <= next.y;
  else above = true;
  const off = circled ? 15 : 11;
  const y = above ? p.y - off : p.y + off;
  if (circled) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = env.theme.bg;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
    plainText(ctx, env, text, p.x, y + 0.5, color, text.length > 2 ? 8 : 10.5);
  } else {
    plainText(ctx, env, text, p.x, y, color, 12);
  }
}

/** Small ratio badge (harmonic patterns). */
export function ratioBadge(ctx: CanvasRenderingContext2D, env: Env, at: Pt, text: string, color: string) {
  label(ctx, env, text, at.x, at.y, { align: "center", base: "middle", bg: color, fg: "#ffffff", size: 10, alpha: 0.85, clamp: false });
}

/* ───────────── numbers ───────────── */

export function fmtSigned(env: Env, v: number): string {
  return (v >= 0 ? "+" : "-") + env.fmt(Math.abs(v));
}
export function pctOf(a: number, b: number): number {
  return a !== 0 ? ((b - a) / Math.abs(a)) * 100 : 0;
}
export function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(2) + "%";
}
export function fmtDuration(ms: number, L: DrawLabels): string {
  let mins = Math.floor(Math.abs(ms) / 60000);
  const days = Math.floor(mins / 1440);
  mins -= days * 1440;
  const hours = Math.floor(mins / 60);
  mins -= hours * 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}${L.d}`);
  if (hours) parts.push(`${hours}${L.h}`);
  if (mins) parts.push(`${mins}${L.m}`);
  if (parts.length === 0) return `0${L.m}`;
  return parts.slice(0, 2).join(" ");
}
export function ratioText(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return String(Math.round(v * 1000) / 1000);
}

export function lerpPt(a: Pt, b: Pt, k: number): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Signed distance (pixels) from p to the infinite line a-b; positive on the left of a->b in screen space. */
export function signedDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return G.dist(p, a);
  return ((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Unit normal of a->b (rotated by +90 degrees in screen space). */
export function unitNormal(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/* ───────────── hit testing ───────────── */

export function segHit(x: number, y: number, ...segs: [Pt, Pt, G.LineMode][]): boolean {
  const p = { x, y };
  for (const [a, b, m] of segs) if (G.distToLineMode(p, a, b, m) <= TOL) return true;
  return false;
}

export function polyHit(x: number, y: number, pts: Pt[], closed = false, filled = false): boolean {
  const p = { x, y };
  if (G.distToPolyline(p, pts, closed) <= TOL) return true;
  return filled && pts.length > 2 && G.pointInPolygon(p, pts);
}

export function pointsHit(x: number, y: number, pts: Pt[], r = TOL): boolean {
  for (const q of pts) if (Math.hypot(q.x - x, q.y - y) <= r) return true;
  return false;
}

export function boxHandles(P: Pt[]): HandleDef[] {
  return [
    { x: P[0].x, y: P[0].y, idx: 0 },
    { x: P[1].x, y: P[1].y, idx: 1 },
    {
      x: P[1].x,
      y: P[0].y,
      drag: (pts, t, p) => {
        pts[1].t = t;
        pts[0].p = p;
      },
    },
    {
      x: P[0].x,
      y: P[1].y,
      drag: (pts, t, p) => {
        pts[0].t = t;
        pts[1].p = p;
      },
    },
  ];
}

/** Rays/segments of a vertical stripe list: does (x,y) lie within TOL of any vertical line? */
export function nearVertical(x: number, xs: number[]): boolean {
  for (const v of xs) if (Math.abs(x - v) <= TOL) return true;
  return false;
}

/* ───────────── chart data (candles) ───────────── */

/** Index of the first candle with t >= time (binary search). */
export function lowerBound(c: Candle[], t: number): number {
  let lo = 0;
  let hi = c.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (c[m].t < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Candles whose start time lies in [t1, t2] (order-insensitive). Empty when the env has no data access. */
export function candleSlice(env: Env, t1: number, t2: number): Candle[] {
  const all = env.candles?.();
  if (!all || all.length === 0) return [];
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  const a = lowerBound(all, lo);
  let b = lowerBound(all, hi + 1);
  if (b < a) b = a;
  return all.slice(a, b);
}

/** Small deterministic PRNG (mulberry32) for "ghost" candles. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws a candle-like bar (body + wick) from prices already converted to pixels. */
export function paintCandle(ctx: CanvasRenderingContext2D, x: number, w: number, yo: number, yh: number, yl: number, yc: number, up: string, down: string, alpha = 1) {
  const col = yc <= yo ? up : down;
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, yh);
  ctx.lineTo(Math.round(x) + 0.5, yl);
  ctx.stroke();
  const bh = Math.max(1, Math.abs(yc - yo));
  ctx.fillRect(x - w / 2, Math.min(yo, yc), w, bh);
  ctx.restore();
}

/** Typical bar width in pixels (distance of two neighbouring bars). */
export function barPx(env: Env, t: number): number {
  return Math.abs(env.toX(t + env.intervalMs) - env.toX(t)) || 6;
}

/* ───────────── generic factories ───────────── */

export interface PtsTool {
  id: string;
  points: number;
  total?: number;
  style: DrawingStyle;
  ui: ToolUi;
}

/** Keeps DPoint import used for tools that mutate anchors. */
export type Anchors = DPoint[];

export type { Candle, Env, DrawState, ToolDef, HandleDef, Drawing, Pt, DPoint };

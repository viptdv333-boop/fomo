import type { DrawingStyle } from "../contracts";
import type { Candle, ChartTheme } from "../types";
import { EXTRA_TOOLS, GROUP_LAYOUT } from "./tools-extra";
import * as G from "./geometry";
import { contrastOn, getLevels, layoutText, on, paintLineText, paintText, paintTextInBox, positionStats, solid, textCfg, type FibLevel, type LevelKind, type TextDefaults } from "./render";
import type { DPoint, DrawLabels, Drawing, Pt } from "./types";

/* Registry of drawing tools: how many anchors, how to paint, how to hit-test, default style, handles.
   Everything works in screen space (anchors are converted by the controller); the Env gives back
   time/price conversions for tools that need to derive new anchors or read prices. */

export interface Env {
  w: number;
  h: number;
  theme: ChartTheme;
  font: string;
  intervalMs: number;
  labels: DrawLabels;
  toX(t: number): number;
  toY(p: number): number;
  timeAt(x: number): number;
  priceAt(y: number): number;
  /** Number of bars between two times (fractional; negative when t2 < t1). */
  barsBetween(t1: number, t2: number): number;
  fmt(price: number): string;
  /** Loaded candles (ascending by time) for data-driven tools: regression, VWAP, volume profile, bars pattern. */
  candles?(): Candle[];
  /** Order flow of the chart (real trades where fetched): volume profile / VWAP tools use it when present. */
  flow?(): import("../orderflow/store").OrderFlowStore | null;
}

export interface DrawState {
  selected: boolean;
  hover: boolean;
  preview: boolean;
}

export interface HandleDef {
  x: number;
  y: number;
  /** Index of the anchor this handle moves (default drag sets that anchor to the pointer). */
  idx?: number;
  /** Custom drag for virtual handles (box corners): mutate the points given the pointer's time and price. */
  drag?: (pts: DPoint[], t: number, p: number) => void;
}

export interface ToolUi {
  color: boolean;
  width: boolean;
  dash: boolean;
  fill: boolean;
  text: boolean;
}

export interface ToolDef {
  id: string;
  labelKey: string;
  /** Anchors the user places. 0 = freehand (brush). */
  points: number;
  /** Anchors stored per drawing when it differs from `points` (position tools expand 1 click into 3). */
  total?: number;
  style: DrawingStyle;
  ui: ToolUi;
  /** Expands the placed anchors into the full set (position tools). */
  complete?(pts: DPoint[], env: Env): DPoint[];
  /** Restores invariants after a handle drag (e.g. stop and target share a right edge). */
  constrain?(d: Drawing, handleIdx: number): void;
  draw(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, P: Pt[], st: DrawState): void;
  hit(env: Env, d: Drawing, P: Pt[], x: number, y: number): boolean;
  handles?(env: Env, d: Drawing, P: Pt[]): HandleDef[];
  /** Glyph for stamps. */
  glyph?: string;
  /**
   * Variable number of anchors (polyline, path): `points` is the minimum, every click adds one,
   * Enter or a double click finishes. Stored drawings keep every placed anchor.
   */
  variable?: boolean;
}

export const TOL = 6;

const BLUE = "#2962ff";
const RED = "#f23645";
const GREEN = "#089981";
const GRAY = "#787b86";
const ORANGE = "#ff9800";

const FIB_BAND_COLORS = [RED, ORANGE, "#4caf50", GREEN, "#00bcd4", GRAY];

/* ───────────── drawing helpers ───────────── */

const UI_LINE: ToolUi = { color: true, width: true, dash: true, fill: false, text: false };
const UI_SHAPE: ToolUi = { color: true, width: true, dash: true, fill: true, text: false };
const UI_TEXT: ToolUi = { color: true, width: true, dash: false, fill: false, text: true };

function style(color: string, width = 1, dash = "solid", extra: Partial<DrawingStyle> = {}): DrawingStyle {
  return { color, width, dash, ...extra };
}

function lineWidth(d: Drawing, st: DrawState): number {
  return Math.max(1, d.style.width) + (st.hover && !st.selected ? 1 : 0);
}

function dashArray(kind: string, w: number): number[] {
  if (kind === "dashed") return [6 + w, 4 + w];
  if (kind === "dotted") return [1.5, 2.5 + w];
  return [];
}

/** Aligns a coordinate to the pixel grid so 1px (odd width) lines are crisp. */
function sn(v: number, w: number): number {
  return Math.round(w) % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v);
}

function applyStroke(ctx: CanvasRenderingContext2D, d: Drawing, st: DrawState, colorOverride?: string, dashOverride?: string) {
  const w = lineWidth(d, st);
  ctx.strokeStyle = colorOverride ?? d.style.color;
  ctx.lineWidth = w;
  ctx.setLineDash(dashArray(dashOverride ?? d.style.dash, w));
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
}

function clipRect(env: Env) {
  return { x0: -4, y0: -4, x1: env.w + 4, y1: env.h + 4 };
}

function strokeLineMode(ctx: CanvasRenderingContext2D, env: Env, a: Pt, b: Pt, mode: G.LineMode) {
  const seg = G.clipLineToRect(a, b, mode, clipRect(env));
  if (!seg) return;
  ctx.beginPath();
  ctx.moveTo(seg[0].x, seg[0].y);
  ctx.lineTo(seg[1].x, seg[1].y);
  ctx.stroke();
}

function pathPoly(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

function fillCurrent(ctx: CanvasRenderingContext2D, d: Drawing, color?: string, opacityMul = 1) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (d.style.fillOpacity ?? 0.15) * opacityMul));
  ctx.fillStyle = color ?? d.style.fill ?? d.style.color;
  ctx.fill();
  ctx.restore();
}

function fillPoly(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[], color?: string) {
  pathPoly(ctx, pts);
  fillCurrent(ctx, d, color);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

let measureCtx: CanvasRenderingContext2D | null = null;
export function textWidth(env: Env, text: string, size = 11, weight = 600): number {
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

interface LabelOpts {
  align?: "left" | "center" | "right";
  base?: "top" | "middle" | "bottom";
  fg?: string;
  bg?: string;
  size?: number;
  clamp?: boolean;
  alpha?: number;
}

/** Text on a small rounded background; readable on any theme. Returns the box it occupied. */
function label(ctx: CanvasRenderingContext2D, env: Env, text: string | string[], x: number, y: number, o: LabelOpts = {}) {
  const lines = Array.isArray(text) ? text : [text];
  const size = o.size ?? 11;
  const lh = size + 3;
  ctx.save();
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
  roundRectPath(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = o.fg ?? env.theme.labelText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, bx + 5, by + 1.5 + lh * i + lh / 2));
  ctx.restore();
  return { x: bx, y: by, w: bw, h: bh };
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, size: number) {
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

function fmtSigned(env: Env, v: number): string {
  return (v >= 0 ? "+" : "-") + env.fmt(Math.abs(v));
}
function pctOf(a: number, b: number): number {
  return a !== 0 ? ((b - a) / Math.abs(a)) * 100 : 0;
}
function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(2) + "%";
}
function fmtDuration(ms: number, L: DrawLabels): string {
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
function barsText(env: Env, t1: number, t2: number): string {
  return `${Math.round(env.barsBetween(t1, t2))} ${env.labels.bars}`;
}

function segHit(P: Pt, x: number, y: number, ...segs: [Pt, Pt, G.LineMode][]): boolean {
  void P;
  const p = { x, y };
  for (const [a, b, m] of segs) if (G.distToLineMode(p, a, b, m) <= TOL) return true;
  return false;
}

function boxHandles(P: Pt[]): HandleDef[] {
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

/* ───────────── property helpers (lines, ends, stats, text) ───────────── */

const LINE_TXT: TextDefaults = { size: 12, valign: "top", align: "center" };
const SHAPE_TXT: TextDefaults = { size: 14, valign: "middle", align: "center" };

/** Line segment / ray / infinite line from the extend-left / extend-right properties; left-only runs the ray backwards. */
function extMode(s: DrawingStyle, a: Pt, b: Pt): [Pt, Pt, G.LineMode] {
  const l = !!s.extendLeft;
  const r = !!s.extendRight;
  if (l && r) return [a, b, "line"];
  if (r) return [a, b, "ray"];
  if (l) return [b, a, "ray"];
  return [a, b, "segment"];
}

/** Ends of the line after extension by a far reach (for fill polygons; strokes use the clipped version). */
function extEnds(s: DrawingStyle, a: Pt, b: Pt, reach: number): [Pt, Pt] {
  const f = s.extendLeft ? G.farPoint(a, b, -reach) : a;
  const t = s.extendRight ? G.farPoint(a, b, reach) : b;
  return [f, t];
}

function strokeExt(ctx: CanvasRenderingContext2D, env: Env, s: DrawingStyle, a: Pt, b: Pt) {
  const [f, t, mode] = extMode(s, a, b);
  strokeLineMode(ctx, env, f, t, mode);
}

function angleDeg(a: Pt, b: Pt): number {
  return (-Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Text of the stats badge: price range / percent / bars / time / distance / angle, each behind its own toggle. */
function statLines(env: Env, d: Drawing, P: Pt[]): string[] {
  const s = d.style;
  const a = d.points[0];
  const b = d.points[1];
  const out: string[] = [];
  const price: string[] = [];
  if (on(s.showPrice, false)) price.push(fmtSigned(env, b.p - a.p));
  if (on(s.showPct, false)) price.push(price.length ? `(${fmtPct(pctOf(a.p, b.p))})` : fmtPct(pctOf(a.p, b.p)));
  if (price.length) out.push(price.join(" "));
  const bt: string[] = [];
  if (on(s.showBars, false)) bt.push(barsText(env, a.t, b.t));
  if (on(s.showTime, false)) bt.push(fmtDuration(b.t - a.t, env.labels));
  if (bt.length) out.push(bt.join(", "));
  const geo: string[] = [];
  if (on(s.showDist, false)) geo.push(`${Math.round(G.dist(P[0], P[1]))} px`);
  if (on(s.showAngle, false)) geo.push(`${angleDeg(P[0], P[1]).toFixed(1)}°`);
  if (geo.length) out.push(geo.join(", "));
  return out;
}

/* ───────────── line tools ───────────── */

function lineTool(id: string, color = BLUE, extra: Partial<DrawingStyle> = {}): ToolDef {
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 2,
    style: style(color, 2, "solid", extra),
    ui: UI_LINE,
    draw(ctx, env, d, P, st) {
      const s = d.style;
      const [a, b] = P;
      applyStroke(ctx, d, st);
      const w = lineWidth(d, st);
      const head = 8 + w * 2;
      const len = G.dist(a, b);
      const rArrow = s.rightEnd === "arrow";
      const lArrow = s.leftEnd === "arrow";
      // stop the shaft at the arrow base so a thick line does not poke through the tip
      const A = lArrow && !s.extendLeft && len > 1 ? G.farPoint(a, b, Math.min(len, head * 0.7)) : a;
      const B = rArrow && !s.extendRight && len > 1 ? G.farPoint(b, a, Math.min(len, head * 0.7)) : b;
      strokeExt(ctx, env, s, A, B);
      if (rArrow && len > 1) arrowHead(ctx, a, b, head);
      if (lArrow && len > 1) arrowHead(ctx, b, a, head);
      if (on(s.showMid, false)) {
        const m = G.mid(a, b);
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3 + w / 2, 0, Math.PI * 2);
        ctx.fillStyle = typeof s.midColor === "string" ? s.midColor : s.color;
        ctx.fill();
      }
      const bg = solid(s.color);
      const fg = contrastOn(bg);
      if (on(s.showEndPrice, false)) {
        const right = a.x <= b.x ? 1 : 0;
        label(ctx, env, env.fmt(d.points[right ? 1 : 0].p), P[right ? 1 : 0].x + 8, P[right ? 1 : 0].y, { base: "middle", bg, fg, size: 10 });
        label(ctx, env, env.fmt(d.points[right ? 0 : 1].p), P[right ? 0 : 1].x - 8, P[right ? 0 : 1].y, { align: "right", base: "middle", bg, fg, size: 10 });
      }
      const lines = statLines(env, d, P);
      if (lines.length) label(ctx, env, lines, b.x + 8, b.y, { base: "middle", bg, fg });
      paintLineText(ctx, env, d, { ...LINE_TXT, color: s.color }, a, b);
    },
    hit(_env, d, P, x, y) {
      const [f, t, mode] = extMode(d.style, P[0], P[1]);
      return segHit(P[0], x, y, [f, t, mode]);
    },
  };
}

function hLike(id: string, kind: "hline" | "hray" | "vline" | "cross"): ToolDef {
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 1,
    style: style(kind === "cross" ? GRAY : BLUE, 1, "solid", kind === "hline" || kind === "hray" ? { showPrice: true } : {}),
    ui: UI_LINE,
    draw(ctx, env, d, P, st) {
      const s = d.style;
      applyStroke(ctx, d, st);
      const w = lineWidth(d, st);
      const x = sn(P[0].x, w);
      const y = sn(P[0].y, w);
      const xl = kind === "hray" && s.extendLeft ? -2 : x;
      ctx.beginPath();
      if (kind === "hline" || kind === "cross") {
        ctx.moveTo(-2, y);
        ctx.lineTo(env.w + 2, y);
      }
      if (kind === "hray") {
        ctx.moveTo(xl, y);
        ctx.lineTo(env.w + 2, y);
      }
      if (kind === "vline" || kind === "cross") {
        ctx.moveTo(x, -2);
        ctx.lineTo(x, env.h + 2);
      }
      ctx.stroke();
      if ((kind === "hline" || kind === "hray") && on(s.showPrice, true)) {
        const bg = solid(s.color);
        label(ctx, env, env.fmt(d.points[0].p), env.w - 4, P[0].y, { align: "right", base: "middle", bg, fg: contrastOn(bg), clamp: false });
      }
      if (kind === "hline") paintLineText(ctx, env, d, { ...LINE_TXT, color: s.color }, { x: 0, y: P[0].y }, { x: env.w, y: P[0].y });
      else if (kind === "hray") paintLineText(ctx, env, d, { ...LINE_TXT, color: s.color }, { x: Math.max(0, P[0].x), y: P[0].y }, { x: env.w, y: P[0].y });
      else if (kind === "vline") paintLineText(ctx, env, d, { ...LINE_TXT, color: s.color }, { x: P[0].x, y: env.h }, { x: P[0].x, y: 0 });
    },
    hit(_env, d, P, x, y) {
      const dx = Math.abs(x - P[0].x);
      const dy = Math.abs(y - P[0].y);
      if (kind === "hline") return dy <= TOL;
      if (kind === "hray") return dy <= TOL && (d.style.extendLeft || x >= P[0].x - TOL);
      if (kind === "vline") return dx <= TOL;
      return dy <= TOL || dx <= TOL;
    },
  };
}

function channelGeom(P: Pt[]) {
  const off = G.verticalOffsetFromLine(P[0], P[1], P[2]);
  const a2 = G.shift(P[0], 0, off);
  const b2 = G.shift(P[1], 0, off);
  return { off, a2, b2 };
}

const channel: ToolDef = {
  id: "channel",
  labelKey: "draw.tool.channel",
  points: 3,
  style: style(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.1, showMid: true, midDash: "dashed" }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const { a2, b2 } = channelGeom(P);
    if (on(s.showFill, true)) {
      const reach = (env.w + env.h) * 3;
      const [f1, t1] = extEnds(s, P[0], P[1], reach);
      const [f2, t2] = extEnds(s, a2, b2, reach);
      fillPoly(ctx, d, [f1, t1, t2, f2]);
    }
    applyStroke(ctx, d, st);
    strokeExt(ctx, env, s, P[0], P[1]);
    strokeExt(ctx, env, s, a2, b2);
    if (on(s.showMid, true)) {
      applyStroke(ctx, d, { ...st, hover: false }, typeof s.midColor === "string" ? s.midColor : undefined, typeof s.midDash === "string" ? s.midDash : "dashed");
      ctx.lineWidth = 1;
      strokeExt(ctx, env, s, G.mid(P[0], a2), G.mid(P[1], b2));
    }
    paintLineText(ctx, env, d, { ...LINE_TXT, color: s.color }, P[0], P[1]);
  },
  hit(_env, d, P, x, y) {
    const { a2, b2 } = channelGeom(P);
    const [f1, t1, m1] = extMode(d.style, P[0], P[1]);
    const [f2, t2, m2] = extMode(d.style, a2, b2);
    return segHit(P[0], x, y, [f1, t1, m1], [f2, t2, m2]) || G.pointInPolygon({ x, y }, [P[0], P[1], b2, a2]);
  },
};

/** Median line origin per pitchfork variant. */
function pitchOrigin(variant: string | undefined, P: Pt[]): Pt {
  if (variant === "schiff") return G.mid(P[0], P[1]);
  if (variant === "modified") return { x: (P[0].x + P[1].x) / 2, y: P[0].y };
  return P[0];
}

function pitchDir(P: Pt[], o: Pt): Pt | null {
  const m = G.mid(P[1], P[2]);
  const dx = m.x - o.x;
  const dy = m.y - o.y;
  return Math.hypot(dx, dy) < 1e-6 ? null : { x: dx, y: dy };
}

const pitchfork: ToolDef = {
  id: "pitchfork",
  labelKey: "draw.tool.pitchfork",
  points: 3,
  style: style(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.08, variant: "original", showMedian: true, showBase: true }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const o = pitchOrigin(typeof s.variant === "string" ? s.variant : undefined, P);
    const dir = pitchDir(P, o);
    if (!dir) return;
    const m = G.mid(P[1], P[2]);
    const half = { x: P[2].x - m.x, y: P[2].y - m.y };
    const reach = (env.w + env.h) * 3;
    const far = (q: Pt) => G.farPoint(q, { x: q.x + dir.x, y: q.y + dir.y }, reach);
    const levels = getLevels(d, "pitch")
      .filter((l) => l.on && l.v > 0)
      .sort((p, q) => p.v - q.v);
    const at = (v: number, side: 1 | -1): Pt => ({ x: m.x + half.x * v * side, y: m.y + half.y * v * side });
    // bands: median -> first level -> next level ... on both sides
    if (on(s.showFill, true)) {
      let prev = 0;
      for (const l of levels) {
        for (const side of [1, -1] as const) {
          const q0 = at(prev, side);
          const q1 = at(l.v, side);
          fillPoly(ctx, d, [q0, far(q0), far(q1), q1]);
        }
        prev = l.v;
      }
    }
    if (on(s.showMedian, true)) {
      applyStroke(ctx, d, st);
      strokeLineMode(ctx, env, o, m, "ray");
    }
    for (const l of levels) {
      applyStroke(ctx, d, st, l.color || s.color, l.dash);
      for (const side of [1, -1] as const) {
        const q = at(l.v, side);
        strokeLineMode(ctx, env, q, { x: q.x + dir.x, y: q.y + dir.y }, "ray");
      }
    }
    if (on(s.showBase, true)) {
      applyStroke(ctx, d, { ...st, hover: false }, undefined, "dotted");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(P[1].x, P[1].y);
      ctx.lineTo(P[2].x, P[2].y);
      ctx.stroke();
    }
    paintLineText(ctx, env, d, { ...LINE_TXT, color: s.color }, o, m);
  },
  hit(_env, d, P, x, y) {
    const o = pitchOrigin(typeof d.style.variant === "string" ? d.style.variant : undefined, P);
    const dir = pitchDir(P, o);
    if (!dir) return false;
    const m = G.mid(P[1], P[2]);
    const half = { x: P[2].x - m.x, y: P[2].y - m.y };
    const segs: [Pt, Pt, G.LineMode][] = [[o, m, "ray"]];
    for (const l of getLevels(d, "pitch")) {
      if (!l.on || l.v <= 0) continue;
      for (const side of [1, -1]) {
        const q = { x: m.x + half.x * l.v * side, y: m.y + half.y * l.v * side };
        segs.push([q, { x: q.x + dir.x, y: q.y + dir.y }, "ray"]);
      }
    }
    segs.push([P[1], P[2], "segment"]);
    return segHit(P[0], x, y, ...segs);
  },
};

/* ───────────── fibonacci ───────────── */

interface FibView {
  levels: FibLevel[];
  useOne: boolean;
  reverse: boolean;
  log: boolean;
  labelPos: "left" | "right" | "off";
  percent: boolean;
  showPrice: boolean;
  showFill: boolean;
  trend: boolean;
}

function fibView(d: Drawing, kind: LevelKind): FibView {
  const s = d.style;
  return {
    levels: getLevels(d, kind)
      .filter((l) => l.on)
      .sort((a, b) => a.v - b.v),
    useOne: on(s.useOneColor, false),
    reverse: on(s.reverse, false),
    log: on(s.logScale, false),
    labelPos: s.labelPos === "right" ? "right" : s.labelPos === "off" ? "off" : "left",
    percent: s.labelFmt === "percent",
    showPrice: on(s.showPrice, true),
    showFill: on(s.showFill, true),
    trend: on(s.showTrend, true),
  };
}

function levelText(v: FibView, lv: number, price: number, env: Env): string {
  const base = v.percent ? G.fibPercentLabel(lv) : `${G.fibLevelLabel(lv)}`;
  return v.showPrice ? `${base} (${env.fmt(price)})` : base;
}

function drawFibLevels(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, st: DrawState, v: FibView, priceOf: (lv: number) => number, xl: number, xr: number) {
  const s = d.style;
  const lv = v.levels;
  const ys = lv.map((l) => env.toY(priceOf(l.v)));
  const colorOf = (l: FibLevel) => (v.useOne ? s.color : l.color || s.color);
  if (v.showFill) {
    for (let i = 0; i < lv.length - 1; i++) {
      ctx.beginPath();
      ctx.rect(xl, Math.min(ys[i], ys[i + 1]), xr - xl, Math.abs(ys[i + 1] - ys[i]));
      fillCurrent(ctx, d, s.fill ?? (v.useOne ? s.color : lv[i + 1].color || s.color));
    }
  }
  const w = lineWidth(d, st);
  lv.forEach((l, i) => {
    const y = sn(ys[i], w);
    ctx.strokeStyle = colorOf(l);
    ctx.lineWidth = w;
    ctx.setLineDash(dashArray(l.dash ?? s.dash, w));
    ctx.beginPath();
    ctx.moveTo(xl, y);
    ctx.lineTo(xr, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  if (v.labelPos !== "off") {
    lv.forEach((l, i) => {
      const txt = levelText(v, l.v, priceOf(l.v), env);
      const right = v.labelPos === "right";
      label(ctx, env, txt, right ? xr + 4 : xl - 4, ys[i], { align: right ? "left" : "right", base: "middle", bg: env.theme.bg, fg: colorOf(l), alpha: 0.8, size: 10 });
    });
  }
}

function fibHitLevels(env: Env, x: number, y: number, levels: FibLevel[], priceOf: (lv: number) => number, xl: number, xr: number): boolean {
  let top = Infinity;
  let bot = -Infinity;
  for (const l of levels) {
    if (!l.on) continue;
    const ly = env.toY(priceOf(l.v));
    top = Math.min(top, ly);
    bot = Math.max(bot, ly);
    if (Math.abs(y - ly) <= TOL && x >= xl - TOL && x <= xr + TOL) return true;
  }
  return x >= xl && x <= xr && y >= top && y <= bot;
}

/** Fibonacci price with optional reversed direction and logarithmic spacing. */
function fibRetrPrice(a: number, b: number, lv: number, v: { reverse: boolean; log: boolean }): number {
  const p1 = v.reverse ? b : a;
  const p2 = v.reverse ? a : b;
  if (v.log && p1 > 0 && p2 > 0) return Math.exp(Math.log(p2) + (Math.log(p1) - Math.log(p2)) * lv);
  return G.fibRetracementPrice(p1, p2, lv);
}

function fibExtPrice(a: number, b: number, c: number, lv: number, v: { reverse: boolean; log: boolean }): number {
  const k = v.reverse ? -1 : 1;
  if (v.log && a > 0 && b > 0 && c > 0) return c * Math.exp(k * Math.log(b / a) * lv);
  return c + k * (b - a) * lv;
}

function fibTrendLine(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, P: Pt[]) {
  const s = d.style;
  ctx.save();
  ctx.strokeStyle = typeof s.trendColor === "string" ? s.trendColor : env.theme.textMuted;
  ctx.lineWidth = typeof s.trendWidth === "number" ? s.trendWidth : 1;
  ctx.setLineDash(dashArray(typeof s.trendDash === "string" ? s.trendDash : "dashed", ctx.lineWidth));
  ctx.beginPath();
  P.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

const FIB_STYLE: Partial<DrawingStyle> = { fillOpacity: 0.12, showTrend: true, showPrice: true, labelPos: "left", labelFmt: "value" };

/** x-range of a fib box after extend-left / extend-right. */
function fibSpan(env: Env, s: DrawingStyle, xs: number[]): [number, number] {
  const xl = s.extendLeft ? -4 : Math.min(...xs);
  const xr = s.extendRight ? env.w + 4 : Math.max(...xs);
  return [xl, xr];
}

const fibRetr: ToolDef = {
  id: "fib_retr",
  labelKey: "draw.tool.fib_retr",
  points: 2,
  style: style(GRAY, 1, "solid", FIB_STYLE),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const [a, b] = d.points;
    const v = fibView(d, "retr");
    const [xl, xr] = fibSpan(env, d.style, [P[0].x, P[1].x]);
    drawFibLevels(ctx, env, d, st, v, (lv) => fibRetrPrice(a.p, b.p, lv, v), xl, xr);
    if (v.trend) fibTrendLine(ctx, env, d, P);
    paintLineText(ctx, env, d, { ...LINE_TXT, color: d.style.color }, P[0], P[1]);
  },
  hit(env, d, P, x, y) {
    const [a, b] = d.points;
    const v = fibView(d, "retr");
    const [xl, xr] = fibSpan(env, d.style, [P[0].x, P[1].x]);
    return segHit(P[0], x, y, [P[0], P[1], "segment"]) || fibHitLevels(env, x, y, v.levels, (lv) => fibRetrPrice(a.p, b.p, lv, v), xl, xr);
  },
};

const fibExt: ToolDef = {
  id: "fib_ext",
  labelKey: "draw.tool.fib_ext",
  points: 3,
  style: style(GRAY, 1, "solid", { ...FIB_STYLE, fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const [a, b, c] = d.points;
    const v = fibView(d, "ext");
    const [xl, xr] = fibSpan(env, d.style, [P[0].x, P[1].x, P[2].x]);
    drawFibLevels(ctx, env, d, st, v, (lv) => fibExtPrice(a.p, b.p, c.p, lv, v), xl, xr);
    if (v.trend) fibTrendLine(ctx, env, d, P);
    paintLineText(ctx, env, d, { ...LINE_TXT, color: d.style.color }, P[0], P[1]);
  },
  hit(env, d, P, x, y) {
    const [a, b, c] = d.points;
    const v = fibView(d, "ext");
    const [xl, xr] = fibSpan(env, d.style, [P[0].x, P[1].x, P[2].x]);
    return segHit(P[0], x, y, [P[0], P[1], "segment"], [P[1], P[2], "segment"]) || fibHitLevels(env, x, y, v.levels, (lv) => fibExtPrice(a.p, b.p, c.p, lv, v), xl, xr);
  },
};

const fibChannel: ToolDef = {
  id: "fib_channel",
  labelKey: "draw.tool.fib_channel",
  points: 3,
  style: style(GRAY, 1, "solid", { ...FIB_STYLE, fillOpacity: 0.1, labelPos: "right" }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const v = fibView(d, "channel");
    const off = G.verticalOffsetFromLine(P[0], P[1], P[2]) * (v.reverse ? -1 : 1);
    const lv = v.levels;
    const colorOf = (l: FibLevel) => (v.useOne ? s.color : l.color || s.color);
    const reach = (env.w + env.h) * 3;
    const line = (o: number): [Pt, Pt] => extEnds(s, G.shift(P[0], 0, o), G.shift(P[1], 0, o), reach);
    if (v.showFill) {
      for (let i = 0; i < lv.length - 1; i++) {
        const [f0, t0] = line(off * lv[i].v);
        const [f1, t1] = line(off * lv[i + 1].v);
        fillPoly(ctx, d, [f0, t0, t1, f1], s.fill ?? (v.useOne ? s.color : lv[i + 1].color || s.color));
      }
    }
    lv.forEach((l) => {
      applyStroke(ctx, d, st, colorOf(l), l.dash);
      strokeExt(ctx, env, s, G.shift(P[0], 0, off * l.v), G.shift(P[1], 0, off * l.v));
    });
    ctx.setLineDash([]);
    if (v.trend) fibTrendLine(ctx, env, d, [P[0], P[1]]);
    const xa = Math.min(P[0].x, P[1].x);
    const xb = Math.max(P[0].x, P[1].x);
    const right = v.labelPos === "right";
    lv.forEach((l) => {
      const o = off * l.v;
      const base = right ? (P[1].x >= P[0].x ? P[1] : P[0]) : P[1].x >= P[0].x ? P[0] : P[1];
      const pt = G.shift(base, 0, o);
      const txt = v.percent ? G.fibPercentLabel(l.v) : G.fibLevelLabel(l.v);
      if (v.labelPos === "off") return;
      label(ctx, env, txt, right ? Math.max(xb, pt.x) + 4 : Math.min(xa, pt.x) - 4, pt.y, { align: right ? "left" : "right", base: "middle", bg: env.theme.bg, fg: colorOf(l), alpha: 0.8, size: 10 });
    });
  },
  hit(_env, d, P, x, y) {
    const v = fibView(d, "channel");
    const off = G.verticalOffsetFromLine(P[0], P[1], P[2]) * (v.reverse ? -1 : 1);
    const p = { x, y };
    for (const l of v.levels) {
      const [f, t, m] = extMode(d.style, G.shift(P[0], 0, off * l.v), G.shift(P[1], 0, off * l.v));
      if (G.distToLineMode(p, f, t, m) <= TOL) return true;
    }
    const far = off * (v.levels.length ? v.levels[v.levels.length - 1].v : 1);
    return G.pointInPolygon(p, [P[0], P[1], G.shift(P[1], 0, far), G.shift(P[0], 0, far)]);
  },
};

/* ───────────── forecasting & measure ───────────── */

const PROFIT = GREEN;
const LOSS = RED;

function positionTool(id: "long" | "short"): ToolDef {
  const isLong = id === "long";
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 1,
    total: 3,
    style: style(PROFIT, 1, "solid", { fill: LOSS, fillOpacity: 0.2, accountSize: 1000, riskType: "pct", risk: 1, lotSize: 1, showStats: true, showQty: true, showBorder: true }),
    ui: { color: true, width: false, dash: false, fill: true, text: false },
    complete(pts, env) {
      const e = pts[0];
      const ye = env.toY(e.p);
      const tR = env.timeAt(env.toX(e.t) + 170);
      const up = isLong ? -1 : 1;
      return [e, { t: tR, p: env.priceAt(ye + up * 130) }, { t: tR, p: env.priceAt(ye - up * 65) }];
    },
    constrain(d, idx) {
      if (idx === 1) d.points[2].t = d.points[1].t;
      else if (idx === 2) d.points[1].t = d.points[2].t;
    },
    draw(ctx, env, d, P, st) {
      const s = d.style;
      const x0 = Math.min(P[0].x, P[1].x);
      const x1 = Math.max(P[0].x, P[1].x);
      const yE = P[0].y;
      const yT = P[1].y;
      const yS = P[2].y;
      const w = Math.max(1, Math.round(lineWidth(d, st)));
      const profitColor = s.color;
      const lossColor = s.fill ?? LOSS;
      const opacity = s.fillOpacity ?? 0.2;
      const entryColor = typeof s.entryColor === "string" ? s.entryColor : GRAY;
      const txt = s.textColor ?? "#ffffff";
      if (on(s.showFill, true)) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = profitColor;
        ctx.fillRect(x0, Math.min(yE, yT), x1 - x0, Math.abs(yT - yE));
        ctx.fillStyle = lossColor;
        ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE));
        ctx.restore();
      }
      ctx.lineWidth = w;
      ctx.setLineDash(dashArray(s.dash, w));
      if (on(s.showBorder, true)) {
        ctx.strokeStyle = profitColor;
        ctx.strokeRect(x0 + 0.5, Math.min(yE, yT) + 0.5, x1 - x0, Math.abs(yT - yE));
        ctx.strokeStyle = lossColor;
        ctx.strokeRect(x0 + 0.5, Math.min(yE, yS) + 0.5, x1 - x0, Math.abs(yS - yE));
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = entryColor;
      ctx.beginPath();
      ctx.moveTo(x0, sn(yE, w));
      ctx.lineTo(x1, sn(yE, w));
      ctx.stroke();

      if (!(on(s.showStats, true) || st.selected || st.hover)) return;
      const pe = d.points[0].p;
      const pt = d.points[1].p;
      const psl = d.points[2].p;
      const stats = positionStats(s, pe, pt, psl);
      const L = env.labels;
      const xm = (x0 + x1) / 2;
      const showQty = on(s.showQty, true) && stats.qty > 0;
      const tLines = [`${L.target}: ${fmtSigned(env, pt - pe)} (${fmtPct(pctOf(pe, pt))})`];
      const sLines = [`${L.stop}: ${fmtSigned(env, psl - pe)} (${fmtPct(pctOf(pe, psl))})`];
      if (showQty) {
        tLines.push(`${L.qty ?? "Qty"}: ${stats.qty}, ${L.reward ?? "Reward"}: ${stats.rewardCash.toFixed(2)}`);
        sLines.push(`${L.qty ?? "Qty"}: ${stats.qty}, ${L.risk ?? "Risk"}: ${(stats.qty * stats.risk).toFixed(2)}`);
      }
      label(ctx, env, tLines, xm, (yE + yT) / 2, { align: "center", base: "middle", bg: solid(profitColor), fg: txt, clamp: false });
      label(ctx, env, sLines, xm, (yE + yS) / 2, { align: "center", base: "middle", bg: solid(lossColor), fg: txt, clamp: false });
      label(ctx, env, `${L.rr} ${stats.rr.toFixed(2)}`, xm, yE, { align: "center", base: "middle", bg: solid(entryColor), fg: txt, clamp: false });
    },
    hit(_env, _d, P, x, y) {
      const x0 = Math.min(P[0].x, P[1].x) - TOL;
      const x1 = Math.max(P[0].x, P[1].x) + TOL;
      const y0 = Math.min(P[0].y, P[1].y, P[2].y) - TOL;
      const y1 = Math.max(P[0].y, P[1].y, P[2].y) + TOL;
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    },
    handles(_env, _d, P) {
      return [
        { x: P[0].x, y: P[0].y, idx: 0 },
        { x: P[1].x, y: P[1].y, idx: 1 },
        { x: P[2].x, y: P[2].y, idx: 2 },
      ];
    },
  };
}

const RANGE_STYLE = { fill: BLUE, fillOpacity: 0.12 };

const priceRange: ToolDef = {
  id: "price_range",
  labelKey: "draw.tool.price_range",
  points: 2,
  style: style(BLUE, 1, "solid", { ...RANGE_STYLE, showPrice: true, showPct: true }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const x0 = Math.min(P[0].x, P[1].x);
    const x1 = Math.max(P[0].x, P[1].x);
    const xm = (x0 + x1) / 2;
    if (on(s.showFill, true)) {
      ctx.beginPath();
      ctx.rect(x0, Math.min(P[0].y, P[1].y), x1 - x0, Math.abs(P[1].y - P[0].y));
      fillCurrent(ctx, d);
    }
    applyStroke(ctx, d, st);
    const w = lineWidth(d, st);
    ctx.beginPath();
    if (on(s.showBorder, true)) {
      ctx.moveTo(x0, sn(P[0].y, w));
      ctx.lineTo(x1, sn(P[0].y, w));
      ctx.moveTo(x0, sn(P[1].y, w));
      ctx.lineTo(x1, sn(P[1].y, w));
    }
    ctx.moveTo(sn(xm, w), P[0].y);
    ctx.lineTo(sn(xm, w), P[1].y);
    ctx.stroke();
    arrowHead(ctx, { x: xm, y: P[0].y }, { x: xm, y: P[1].y }, 7);
    const lines = statLines(env, d, P);
    const bg = solid(s.color);
    if (lines.length) label(ctx, env, lines, xm, (P[0].y + P[1].y) / 2, { align: "center", base: "middle", bg, fg: contrastOn(bg) });
    paintTextInBox(ctx, env, d, { ...SHAPE_TXT, color: s.color, valign: "top" }, x0, Math.min(P[0].y, P[1].y), x1, Math.max(P[0].y, P[1].y));
  },
  hit(_env, _d, P, x, y) {
    return G.pointInRect({ x, y }, P[0], P[1]) || G.distToRectEdge({ x, y }, P[0], P[1]) <= TOL;
  },
  handles: (_env, _d, P) => boxHandles(P),
};

const dateRange: ToolDef = {
  id: "date_range",
  labelKey: "draw.tool.date_range",
  points: 2,
  style: style(BLUE, 1, "solid", { ...RANGE_STYLE, showBars: true, showTime: true }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const x0 = Math.min(P[0].x, P[1].x);
    const x1 = Math.max(P[0].x, P[1].x);
    if (on(s.showFill, true)) {
      ctx.beginPath();
      ctx.rect(x0, 0, x1 - x0, env.h);
      fillCurrent(ctx, d);
    }
    applyStroke(ctx, d, st);
    const w = lineWidth(d, st);
    const ym = (P[0].y + P[1].y) / 2;
    ctx.beginPath();
    if (on(s.showBorder, true)) {
      ctx.moveTo(sn(P[0].x, w), 0);
      ctx.lineTo(sn(P[0].x, w), env.h);
      ctx.moveTo(sn(P[1].x, w), 0);
      ctx.lineTo(sn(P[1].x, w), env.h);
    }
    ctx.moveTo(P[0].x, sn(ym, w));
    ctx.lineTo(P[1].x, sn(ym, w));
    ctx.stroke();
    arrowHead(ctx, P[0], P[1], 7);
    arrowHead(ctx, P[1], P[0], 7);
    const lines = statLines(env, d, P);
    const bg = solid(s.color);
    if (lines.length) label(ctx, env, lines, (P[0].x + P[1].x) / 2, ym - 8, { align: "center", base: "bottom", bg, fg: contrastOn(bg) });
    paintTextInBox(ctx, env, d, { ...SHAPE_TXT, color: s.color, valign: "top" }, x0, 0, x1, env.h);
  },
  hit(_env, _d, P, x, y) {
    const ym = (P[0].y + P[1].y) / 2;
    return (
      Math.abs(x - P[0].x) <= TOL ||
      Math.abs(x - P[1].x) <= TOL ||
      (Math.abs(y - ym) <= TOL && x >= Math.min(P[0].x, P[1].x) && x <= Math.max(P[0].x, P[1].x))
    );
  },
  handles: (_env, _d, P) => [
    { x: P[0].x, y: P[0].y, idx: 0 },
    { x: P[1].x, y: P[1].y, idx: 1 },
  ],
};

function rangeBoxDraw(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, P: Pt[], st: DrawState, byDirection: boolean) {
  const s = d.style;
  const up = d.points[1].p >= d.points[0].p;
  const color = byDirection ? (up ? s.color : typeof s.downColor === "string" ? s.downColor : RED) : s.color;
  const x0 = Math.min(P[0].x, P[1].x);
  const x1 = Math.max(P[0].x, P[1].x);
  const y0 = Math.min(P[0].y, P[1].y);
  const y1 = Math.max(P[0].y, P[1].y);
  if (on(s.showFill, true)) {
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    fillCurrent(ctx, d, byDirection ? solid(color) : undefined);
  }
  applyStroke(ctx, d, st, color);
  const w = lineWidth(d, st);
  if (on(s.showBorder, true)) ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  const xm = sn((x0 + x1) / 2, w);
  const ym = sn((y0 + y1) / 2, w);
  ctx.beginPath();
  ctx.moveTo(P[0].x, ym);
  ctx.lineTo(P[1].x, ym);
  ctx.moveTo(xm, P[0].y);
  ctx.lineTo(xm, P[1].y);
  ctx.stroke();
  arrowHead(ctx, { x: P[0].x, y: ym }, { x: P[1].x, y: ym }, 7);
  arrowHead(ctx, { x: xm, y: P[0].y }, { x: xm, y: P[1].y }, 7);
  const below = P[1].y >= P[0].y;
  const lines = statLines(env, d, P);
  const bg = solid(color);
  if (lines.length) label(ctx, env, lines, (x0 + x1) / 2, below ? y1 + 6 : y0 - 6, { align: "center", base: below ? "top" : "bottom", bg, fg: contrastOn(bg) });
  paintTextInBox(ctx, env, d, { ...SHAPE_TXT, color: s.color, valign: "top" }, x0, y0, x1, y1);
}

const datPriceRange: ToolDef = {
  id: "datprice_range",
  labelKey: "draw.tool.datprice_range",
  points: 2,
  style: style(BLUE, 1, "solid", { ...RANGE_STYLE, showPrice: true, showPct: true, showBars: true, showTime: true }),
  ui: UI_SHAPE,
  draw: (ctx, env, d, P, st) => rangeBoxDraw(ctx, env, d, P, st, false),
  hit: (_env, _d, P, x, y) => G.pointInRect({ x, y }, P[0], P[1]) || G.distToRectEdge({ x, y }, P[0], P[1]) <= TOL,
  handles: (_env, _d, P) => boxHandles(P),
};

const measure: ToolDef = {
  id: "measure",
  labelKey: "draw.tool.measure",
  points: 2,
  style: style(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.14, downColor: RED, showPrice: true, showPct: true, showBars: true, showTime: true }),
  ui: { color: false, width: false, dash: false, fill: false, text: false },
  draw: (ctx, env, d, P, st) => rangeBoxDraw(ctx, env, d, P, st, true),
  hit: (_env, _d, P, x, y) => G.pointInRect({ x, y }, P[0], P[1]) || G.distToRectEdge({ x, y }, P[0], P[1]) <= TOL,
  handles: (_env, _d, P) => boxHandles(P),
};

/* ───────────── shapes ───────────── */

/** Fill, outline and inner text of a closed shape; the path must already be built by `path`. */
function paintShape(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, st: DrawState, path: () => void, box: [number, number, number, number]) {
  const s = d.style;
  path();
  if (on(s.showFill, true)) fillCurrent(ctx, d);
  if (on(s.showBorder, true)) {
    applyStroke(ctx, d, st, typeof s.borderColor === "string" ? s.borderColor : undefined);
    path();
    ctx.stroke();
  }
  paintTextInBox(ctx, env, d, { ...SHAPE_TXT, color: s.color }, box[0], box[1], box[2], box[3]);
}

const rectangle: ToolDef = {
  id: "rect",
  labelKey: "draw.tool.rect",
  points: 2,
  style: style(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const x0 = s.extendLeft ? -4 : Math.min(P[0].x, P[1].x);
    const x1 = s.extendRight ? env.w + 4 : Math.max(P[0].x, P[1].x);
    const y0 = Math.min(P[0].y, P[1].y);
    const y1 = Math.max(P[0].y, P[1].y);
    paintShape(
      ctx,
      env,
      d,
      st,
      () => {
        ctx.beginPath();
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
      },
      [x0, y0, x1, y1]
    );
    if (on(s.showMid, false)) {
      applyStroke(ctx, d, { ...st, hover: false }, typeof s.midColor === "string" ? s.midColor : undefined, typeof s.midDash === "string" ? s.midDash : "dashed");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, (y0 + y1) / 2);
      ctx.lineTo(x1, (y0 + y1) / 2);
      ctx.stroke();
    }
  },
  hit: (_env, d, P, x, y) => {
    const a = { x: d.style.extendLeft ? -1e5 : P[0].x, y: P[0].y };
    const b = { x: d.style.extendRight ? 1e5 : P[1].x, y: P[1].y };
    return G.pointInRect({ x, y }, a, b) || G.distToRectEdge({ x, y }, a, b) <= TOL;
  },
  handles: (_env, _d, P) => boxHandles(P),
};

const ellipse: ToolDef = {
  id: "ellipse",
  labelKey: "draw.tool.ellipse",
  points: 2,
  style: style(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const cx = (P[0].x + P[1].x) / 2;
    const cy = (P[0].y + P[1].y) / 2;
    const rx = Math.max(0.5, Math.abs(P[1].x - P[0].x) / 2);
    const ry = Math.max(0.5, Math.abs(P[1].y - P[0].y) / 2);
    paintShape(
      ctx,
      env,
      d,
      st,
      () => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      },
      [P[0].x, P[0].y, P[1].x, P[1].y]
    );
  },
  hit: (_env, _d, P, x, y) => G.pointInEllipse({ x, y }, P[0], P[1]) || G.distToEllipseEdge({ x, y }, P[0], P[1]) <= TOL,
  handles: (_env, _d, P) => boxHandles(P),
};

const triangle: ToolDef = {
  id: "triangle",
  labelKey: "draw.tool.triangle",
  points: 3,
  style: style(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const xs = P.map((p) => p.x);
    const ys = P.map((p) => p.y);
    paintShape(ctx, env, d, st, () => pathPoly(ctx, P), [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  },
  hit: (_env, _d, P, x, y) => G.pointInPolygon({ x, y }, P) || G.distToPolyline({ x, y }, P, true) <= TOL,
};

/** Moving-average smoothing passes over a stroke (each pass softens the corners a bit more). */
function smoothPts(P: Pt[], passes: number): Pt[] {
  let cur = P;
  for (let k = 0; k < passes && cur.length > 2; k++) {
    const next: Pt[] = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) next.push({ x: (cur[i - 1].x + 2 * cur[i].x + cur[i + 1].x) / 4, y: (cur[i - 1].y + 2 * cur[i].y + cur[i + 1].y) / 4 });
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

const brush: ToolDef = {
  id: "brush",
  labelKey: "draw.tool.brush",
  points: 0,
  style: style(ORANGE, 3, "solid", { smooth: 1 }),
  ui: { color: true, width: true, dash: false, fill: false, text: false },
  draw(ctx, _env, d, P0, st) {
    if (P0.length < 2) return;
    const s = d.style;
    const smooth = typeof s.smooth === "number" ? clampN(s.smooth, 0, 10) : 1;
    const P = smooth > 1 ? smoothPts(P0, Math.round(smooth) - 1) : P0;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(P[0].x, P[0].y);
      if (smooth >= 1) {
        for (let i = 1; i < P.length - 1; i++) ctx.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2);
        ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
      } else {
        for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y);
      }
    };
    if (on(s.showFill, false)) {
      path();
      ctx.closePath();
      fillCurrent(ctx, d);
    }
    applyStroke(ctx, d, st);
    ctx.lineCap = "round";
    path();
    ctx.stroke();
    const head = 8 + lineWidth(d, st) * 2;
    if (s.rightEnd === "arrow" && P.length >= 2) arrowHead(ctx, P[Math.max(0, P.length - 4)], P[P.length - 1], head);
    if (s.leftEnd === "arrow" && P.length >= 2) arrowHead(ctx, P[Math.min(P.length - 1, 3)], P[0], head);
  },
  hit: (_env, _d, P, x, y) => G.distToPolyline({ x, y }, P) <= TOL + 1,
  handles: () => [],
};

function clampN(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const arrow: ToolDef = lineTool("arrow", BLUE, { rightEnd: "arrow" });

/* ───────────── text & marks ───────────── */

/** Font size of a text-like drawing; drawings saved before font size existed derived it from the width. */
function textSize(d: Drawing): number {
  return d.style.fontSize ?? 11 + Math.round(Math.max(1, d.style.width)) * 2;
}

function textDef(d: Drawing, over: Partial<TextDefaults> = {}): TextDefaults {
  return { size: textSize(d), color: d.style.color, align: "left", ...over };
}

function textBox(env: Env, d: Drawing, P: Pt[]) {
  const cfg = textCfg(d, textDef(d));
  const empty = cfg.text === "";
  const lay = layoutText(env, cfg, empty ? env.labels.empty : cfg.text, cfg.wrap ? 240 : null);
  return { cfg, lay, empty, x: P[0].x, y: P[0].y - cfg.size - lay.pad + 2, w: lay.w, h: lay.h };
}

const text: ToolDef = {
  id: "text",
  labelKey: "draw.tool.text",
  points: 1,
  style: style(BLUE, 2, "solid", { text: "" }),
  ui: UI_TEXT,
  draw(ctx, env, d, P, st) {
    const b = textBox(env, d, P);
    ctx.save();
    if (st.selected || st.hover) {
      ctx.strokeStyle = solid(d.style.color);
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x - 2.5, b.y - 2.5, b.w + 5, b.h + 5);
    }
    ctx.restore();
    paintText(ctx, env, b.cfg, b.lay, b.x, b.y, b.empty ? 0.5 : 1);
  },
  hit(env, d, P, x, y) {
    const b = textBox(env, d, P);
    return x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4;
  },
};

function noteLayout(env: Env, d: Drawing) {
  const cfg = textCfg(d, { size: 12, bold: true, color: "#1f2937", align: "left", bg: false, border: false });
  const c = { ...cfg, bg: null, border: null };
  const empty = c.text === "";
  const lay = layoutText(env, c, empty ? env.labels.empty : c.text, c.wrap ? 220 : null);
  return { cfg: c, lay, empty, bw: lay.w + 10, bh: lay.h + 6 };
}

const note: ToolDef = {
  id: "note",
  labelKey: "draw.tool.note",
  points: 2,
  style: style(ORANGE, 1, "solid", { fill: ORANGE, fillOpacity: 0.92, text: "", textColor: "#1f2937", bold: true }),
  ui: { color: true, width: false, dash: false, fill: true, text: true },
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const anchor = P[0];
    const box = P[1];
    const { cfg, lay, empty, bw, bh } = noteLayout(env, d);
    const bx = box.x - bw / 2;
    const by = box.y - bh / 2;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = lineWidth(d, st);
    ctx.setLineDash([]);
    const c = { x: Math.max(bx, Math.min(bx + bw, anchor.x)), y: Math.max(by, Math.min(by + bh, anchor.y)) };
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    roundRectPath(ctx, bx, by, bw, bh, 5);
    if (on(s.showFill, true)) {
      ctx.globalAlpha = Math.min(1, s.fillOpacity ?? 0.92);
      ctx.fillStyle = s.fill ?? s.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (on(s.showBorder, true)) ctx.stroke();
    ctx.restore();
    paintText(ctx, env, cfg, lay, bx + 3, by + 2, empty ? 0.5 : 1);
  },
  hit(env, d, P, x, y) {
    const anchor = P[0];
    const box = P[1];
    const { bw, bh } = noteLayout(env, d);
    if (x >= box.x - bw / 2 - 2 && x <= box.x + bw / 2 + 2 && y >= box.y - bh / 2 - 2 && y <= box.y + bh / 2 + 2) return true;
    return G.distToSegment({ x, y }, anchor, box) <= TOL;
  },
};

function priceLabelGeom(env: Env, d: Drawing, P: Pt[]) {
  const cfg = textCfg(d, { size: 12, bold: true, color: "#ffffff", align: "center" });
  const txt = cfg.text || env.fmt(d.points[0].p);
  const lay = layoutText(env, { ...cfg, bg: null, border: null, wrap: false }, txt, null);
  const bw = lay.w + 8;
  const bh = Math.max(20, lay.h + 4);
  return { cfg, lay, bw, bh, x: P[0].x + 8, y: P[0].y };
}

const priceLabel: ToolDef = {
  id: "price_label",
  labelKey: "draw.tool.price_label",
  points: 1,
  style: style(BLUE, 1, "solid", { textColor: "#ffffff", fontSize: 12, bold: true }),
  ui: { color: true, width: false, dash: false, fill: false, text: false },
  draw(ctx, env, d, P) {
    const g = priceLabelGeom(env, d, P);
    ctx.save();
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.moveTo(P[0].x, g.y);
    ctx.lineTo(g.x, g.y - 5);
    ctx.lineTo(g.x, g.y + 5);
    ctx.closePath();
    ctx.fill();
    roundRectPath(ctx, g.x, g.y - g.bh / 2, g.bw, g.bh, 4);
    ctx.fill();
    ctx.restore();
    paintText(ctx, env, { ...g.cfg, bg: null, border: null, align: "center" }, g.lay, g.x + 4, g.y - g.lay.h / 2);
  },
  hit(env, d, P, x, y) {
    const g = priceLabelGeom(env, d, P);
    return x >= P[0].x - 3 && x <= g.x + g.bw + 3 && Math.abs(y - P[0].y) <= g.bh / 2 + 2;
  },
};

const flag: ToolDef = {
  id: "flag",
  labelKey: "draw.tool.flag",
  points: 1,
  style: style(RED, 2, "solid", { text: "", markSize: 30 }),
  ui: { color: true, width: false, dash: false, fill: false, text: true },
  draw(ctx, env, d, P, st) {
    const s = d.style;
    const k = clampN(typeof s.markSize === "number" ? s.markSize : 30, 12, 200) / 30;
    const x = Math.round(P[0].x) + 0.5;
    const y = P[0].y;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = lineWidth(d, st);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 30 * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 30 * k);
    ctx.lineTo(x + 18 * k, y - 24 * k);
    ctx.lineTo(x, y - 17 * k);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const cfg = textCfg(d, { size: 11, bold: true, color: contrastOn(solid(s.color)), bg: true, align: "left" });
    if (cfg.bg && s.textBg === undefined) cfg.bg = solid(s.color);
    if (cfg.text) {
      const lay = layoutText(env, cfg, cfg.text, cfg.wrap ? 220 : null);
      paintText(ctx, env, cfg, lay, x + 22 * k, y - 23 * k - lay.h / 2);
    }
  },
  hit(env, d, P, x, y) {
    const k = clampN(typeof d.style.markSize === "number" ? d.style.markSize : 30, 12, 200) / 30;
    const t = d.style.text ?? "";
    const tw = t ? textWidth(env, t.split("\n")[0], 11, 600) + 34 * k : 22 * k;
    return x >= P[0].x - 5 && x <= P[0].x + tw && y >= P[0].y - 34 * k && y <= P[0].y + 5;
  },
};

/** Stamp size in px; stamps saved before the size property derived it from the width. */
function stampSize(d: Drawing): number {
  return d.style.fontSize ?? 14 + Math.round(Math.max(1, d.style.width)) * 4;
}

function stampTool(id: string, glyph: string): ToolDef {
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 1,
    style: style("#f59e0b", 2),
    ui: { color: false, width: true, dash: false, fill: false, text: false },
    glyph,
    draw(ctx, env, d, P, st) {
      const size = stampSize(d);
      ctx.save();
      ctx.font = `${size}px ${env.font}, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000";
      ctx.fillText(glyph, P[0].x, P[0].y);
      if (st.hover && !st.selected) {
        ctx.strokeStyle = env.theme.crosshair;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(P[0].x, P[0].y, size / 2 + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
    hit(_env, d, P, x, y) {
      return Math.hypot(x - P[0].x, y - P[0].y) <= stampSize(d) / 2 + 4;
    },
  };
}

/* ───────────── registry ───────────── */

const STAMPS: [string, string][] = [
  ["stamp_star", "⭐"],
  ["stamp_rocket", "🚀"],
  ["stamp_fire", "🔥"],
  ["stamp_warn", "⚠️"],
  ["stamp_check", "✅"],
  ["stamp_cross", "❌"],
  ["stamp_up", "📈"],
  ["stamp_down", "📉"],
];

export const TOOL_LIST: ToolDef[] = [
  lineTool("trend"),
  lineTool("ray", BLUE, { extendRight: true }),
  lineTool("info", BLUE, { showPrice: true, showPct: true, showBars: true, showTime: true }),
  lineTool("extended", BLUE, { extendLeft: true, extendRight: true }),
  hLike("hline", "hline"),
  hLike("hray", "hray"),
  hLike("vline", "vline"),
  hLike("crossline", "cross"),
  channel,
  pitchfork,
  fibRetr,
  fibExt,
  fibChannel,
  positionTool("long"),
  positionTool("short"),
  priceRange,
  dateRange,
  datPriceRange,
  measure,
  rectangle,
  ellipse,
  triangle,
  brush,
  arrow,
  text,
  note,
  priceLabel,
  flag,
  ...STAMPS.map(([id, g]) => stampTool(id, g)),
  ...EXTRA_TOOLS,
];

const REGISTRY = new Map<string, ToolDef>(TOOL_LIST.map((t) => [t.id, t]));

export function getToolDef(id: string): ToolDef | undefined {
  return REGISTRY.get(id);
}

export function isDrawingTool(id: string | null | undefined): boolean {
  return !!id && REGISTRY.has(id);
}

export const CURSOR_TOOLS = ["cursor_cross", "cursor_dot", "cursor_arrow"] as const;

export function isCursorTool(id: string | null | undefined): boolean {
  return !!id && (CURSOR_TOOLS as readonly string[]).includes(id);
}

export function defaultHandles(def: ToolDef, env: Env, d: Drawing, P: Pt[]): HandleDef[] {
  if (def.handles) return def.handles(env, d, P);
  return P.map((p, i) => ({ x: p.x, y: p.y, idx: i }));
}

export interface DrawingSection {
  id: string;
  labelKey: string;
  tools: { id: string; labelKey: string }[];
}

export interface DrawingGroup {
  id: string;
  labelKey: string;
  /** Flat list of every tool in the group (sections flattened). */
  tools: { id: string; labelKey: string }[];
  /** Optional headed sections of the flyout (TradingView style). */
  sections?: DrawingSection[];
  /** Render the flyout as an icon grid (stamps). */
  grid?: boolean;
}

const sectioned = (id: string, layout: { id: string; ids: string[] }[], grid = false): DrawingGroup => {
  const sections: DrawingSection[] = layout.map((sec) => ({
    id: sec.id,
    labelKey: `draw.sec.${sec.id}`,
    tools: sec.ids.filter((t) => REGISTRY.has(t)).map((t) => ({ id: t, labelKey: REGISTRY.get(t)?.labelKey ?? `draw.tool.${t}` })),
  }));
  return { id, labelKey: `draw.group.${id}`, tools: sections.flatMap((sec) => sec.tools), sections, grid };
};

export const DRAWING_GROUPS: DrawingGroup[] = [
  {
    id: "cursors",
    labelKey: "draw.group.cursors",
    tools: CURSOR_TOOLS.map((id) => ({ id, labelKey: `draw.tool.${id}` })),
  },
  ...GROUP_LAYOUT.map((gl) => sectioned(gl.id, gl.sections, gl.grid)),
];

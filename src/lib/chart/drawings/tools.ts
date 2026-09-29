import type { DrawingStyle } from "../contracts";
import type { ChartTheme } from "../types";
import * as G from "./geometry";
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

/* ───────────── line tools ───────────── */

function lineTool(id: string, mode: G.LineMode, color = BLUE): ToolDef {
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 2,
    style: style(color, 2),
    ui: UI_LINE,
    draw(ctx, env, d, P, st) {
      applyStroke(ctx, d, st);
      strokeLineMode(ctx, env, P[0], P[1], mode);
    },
    hit(_env, _d, P, x, y) {
      return segHit(P[0], x, y, [P[0], P[1], mode]);
    },
  };
}

const infoLine: ToolDef = {
  ...lineTool("info", "segment"),
  draw(ctx, env, d, P, st) {
    applyStroke(ctx, d, st);
    strokeLineMode(ctx, env, P[0], P[1], "segment");
    const a = d.points[0];
    const b = d.points[1];
    const dp = b.p - a.p;
    const lines = [`${fmtSigned(env, dp)} (${fmtPct(pctOf(a.p, b.p))})`, `${barsText(env, a.t, b.t)}, ${fmtDuration(b.t - a.t, env.labels)}`];
    label(ctx, env, lines, P[1].x + 8, P[1].y, { base: "middle", bg: d.style.color, fg: "#ffffff" });
  },
};

function hLike(id: string, kind: "hline" | "hray" | "vline" | "cross"): ToolDef {
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 1,
    style: style(kind === "cross" ? GRAY : BLUE, 1),
    ui: UI_LINE,
    draw(ctx, env, d, P, st) {
      applyStroke(ctx, d, st);
      const w = lineWidth(d, st);
      const x = sn(P[0].x, w);
      const y = sn(P[0].y, w);
      ctx.beginPath();
      if (kind === "hline" || kind === "cross") {
        ctx.moveTo(-2, y);
        ctx.lineTo(env.w + 2, y);
      }
      if (kind === "hray") {
        ctx.moveTo(x, y);
        ctx.lineTo(env.w + 2, y);
      }
      if (kind === "vline" || kind === "cross") {
        ctx.moveTo(x, -2);
        ctx.lineTo(x, env.h + 2);
      }
      ctx.stroke();
      if (kind === "hline" || kind === "hray") {
        label(ctx, env, env.fmt(d.points[0].p), env.w - 4, P[0].y, { align: "right", base: "middle", bg: d.style.color, fg: "#ffffff", clamp: false });
      }
    },
    hit(_env, _d, P, x, y) {
      const dx = Math.abs(x - P[0].x);
      const dy = Math.abs(y - P[0].y);
      if (kind === "hline") return dy <= TOL;
      if (kind === "hray") return dy <= TOL && x >= P[0].x - TOL;
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
  style: style(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const { a2, b2 } = channelGeom(P);
    fillPoly(ctx, d, [P[0], P[1], b2, a2]);
    applyStroke(ctx, d, st);
    strokeLineMode(ctx, env, P[0], P[1], "segment");
    strokeLineMode(ctx, env, a2, b2, "segment");
    applyStroke(ctx, d, { ...st, hover: false }, undefined, "dashed");
    ctx.lineWidth = 1;
    strokeLineMode(ctx, env, G.mid(P[0], a2), G.mid(P[1], b2), "segment");
  },
  hit(_env, _d, P, x, y) {
    const { a2, b2 } = channelGeom(P);
    return segHit(P[0], x, y, [P[0], P[1], "segment"], [a2, b2, "segment"]) || G.pointInPolygon({ x, y }, [P[0], P[1], b2, a2]);
  },
};

function pitchDir(P: Pt[]): Pt | null {
  const m = G.mid(P[1], P[2]);
  const dx = m.x - P[0].x;
  const dy = m.y - P[0].y;
  return Math.hypot(dx, dy) < 1e-6 ? null : { x: dx, y: dy };
}

const pitchfork: ToolDef = {
  id: "pitchfork",
  labelKey: "draw.tool.pitchfork",
  points: 3,
  style: style(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.08 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const dir = pitchDir(P);
    if (!dir) return;
    const m = G.mid(P[1], P[2]);
    const reach = (env.w + env.h) * 3;
    const far = (o: Pt) => G.farPoint(o, { x: o.x + dir.x, y: o.y + dir.y }, reach);
    fillPoly(ctx, d, [P[1], far(P[1]), far(m), m]);
    fillPoly(ctx, d, [P[2], far(P[2]), far(m), m]);
    applyStroke(ctx, d, st);
    strokeLineMode(ctx, env, P[0], m, "ray");
    strokeLineMode(ctx, env, P[1], { x: P[1].x + dir.x, y: P[1].y + dir.y }, "ray");
    strokeLineMode(ctx, env, P[2], { x: P[2].x + dir.x, y: P[2].y + dir.y }, "ray");
    applyStroke(ctx, d, { ...st, hover: false }, undefined, "dotted");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P[1].x, P[1].y);
    ctx.lineTo(P[2].x, P[2].y);
    ctx.stroke();
  },
  hit(_env, _d, P, x, y) {
    const dir = pitchDir(P);
    if (!dir) return false;
    const m = G.mid(P[1], P[2]);
    const dirOf = (o: Pt): Pt => ({ x: o.x + dir.x, y: o.y + dir.y });
    return segHit(P[0], x, y, [P[0], m, "ray"], [P[1], dirOf(P[1]), "ray"], [P[2], dirOf(P[2]), "ray"], [P[1], P[2], "segment"]);
  },
};

/* ───────────── fibonacci ───────────── */

function drawFibLevels(
  ctx: CanvasRenderingContext2D,
  env: Env,
  d: Drawing,
  st: DrawState,
  levels: number[],
  priceOf: (lv: number) => number,
  xl: number,
  xr: number
) {
  const ys = levels.map((lv) => env.toY(priceOf(lv)));
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    ctx.beginPath();
    ctx.rect(xl, Math.min(y0, y1), xr - xl, Math.abs(y1 - y0));
    fillCurrent(ctx, d, d.style.fill ?? FIB_BAND_COLORS[i % FIB_BAND_COLORS.length]);
  }
  const w = lineWidth(d, st);
  ctx.strokeStyle = d.style.color;
  ctx.lineWidth = w;
  ctx.setLineDash(dashArray(d.style.dash, w));
  levels.forEach((lv, i) => {
    const y = sn(ys[i], w);
    ctx.beginPath();
    ctx.moveTo(xl, y);
    ctx.lineTo(xr, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  levels.forEach((lv, i) => {
    const txt = `${G.fibLevelLabel(lv)} (${G.fibPercentLabel(lv)}) ${env.fmt(priceOf(lv))}`;
    label(ctx, env, txt, xl - 4, ys[i], { align: "right", base: "middle", bg: env.theme.bg, fg: env.theme.text, alpha: 0.8, size: 10 });
  });
}

function fibHitLevels(env: Env, x: number, y: number, levels: number[], priceOf: (lv: number) => number, xl: number, xr: number): boolean {
  let top = Infinity;
  let bot = -Infinity;
  for (const lv of levels) {
    const ly = env.toY(priceOf(lv));
    top = Math.min(top, ly);
    bot = Math.max(bot, ly);
    if (Math.abs(y - ly) <= TOL && x >= xl - TOL && x <= xr + TOL) return true;
  }
  return x >= xl && x <= xr && y >= top && y <= bot;
}

const fibRetr: ToolDef = {
  id: "fib_retr",
  labelKey: "draw.tool.fib_retr",
  points: 2,
  style: style(GRAY, 1, "solid", { fillOpacity: 0.12 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const [a, b] = d.points;
    const xl = Math.min(P[0].x, P[1].x);
    const xr = Math.max(P[0].x, P[1].x);
    drawFibLevels(ctx, env, d, st, G.FIB_RETR_LEVELS, (lv) => G.fibRetracementPrice(a.p, b.p, lv), xl, xr);
    ctx.save();
    ctx.strokeStyle = env.theme.textMuted;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(P[1].x, P[1].y);
    ctx.stroke();
    ctx.restore();
  },
  hit(env, d, P, x, y) {
    const [a, b] = d.points;
    const xl = Math.min(P[0].x, P[1].x);
    const xr = Math.max(P[0].x, P[1].x);
    return segHit(P[0], x, y, [P[0], P[1], "segment"]) || fibHitLevels(env, x, y, G.FIB_RETR_LEVELS, (lv) => G.fibRetracementPrice(a.p, b.p, lv), xl, xr);
  },
};

const fibExt: ToolDef = {
  id: "fib_ext",
  labelKey: "draw.tool.fib_ext",
  points: 3,
  style: style(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const [a, b, c] = d.points;
    const xl = Math.min(P[0].x, P[1].x, P[2].x);
    const xr = Math.max(P[0].x, P[1].x, P[2].x);
    drawFibLevels(ctx, env, d, st, G.FIB_EXT_LEVELS, (lv) => G.fibExtensionPrice(a.p, b.p, c.p, lv), xl, xr);
    ctx.save();
    ctx.strokeStyle = env.theme.textMuted;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(P[1].x, P[1].y);
    ctx.lineTo(P[2].x, P[2].y);
    ctx.stroke();
    ctx.restore();
  },
  hit(env, d, P, x, y) {
    const [a, b, c] = d.points;
    const xl = Math.min(P[0].x, P[1].x, P[2].x);
    const xr = Math.max(P[0].x, P[1].x, P[2].x);
    return (
      segHit(P[0], x, y, [P[0], P[1], "segment"], [P[1], P[2], "segment"]) ||
      fibHitLevels(env, x, y, G.FIB_EXT_LEVELS, (lv) => G.fibExtensionPrice(a.p, b.p, c.p, lv), xl, xr)
    );
  },
};

const fibChannel: ToolDef = {
  id: "fib_channel",
  labelKey: "draw.tool.fib_channel",
  points: 3,
  style: style(GRAY, 1, "solid", { fillOpacity: 0.1 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const off = G.verticalOffsetFromLine(P[0], P[1], P[2]);
    const levels = G.FIB_CHANNEL_LEVELS;
    for (let i = 0; i < levels.length - 1; i++) {
      const o0 = off * levels[i];
      const o1 = off * levels[i + 1];
      fillPoly(ctx, d, [G.shift(P[0], 0, o0), G.shift(P[1], 0, o0), G.shift(P[1], 0, o1), G.shift(P[0], 0, o1)], d.style.fill ?? FIB_BAND_COLORS[i % FIB_BAND_COLORS.length]);
    }
    applyStroke(ctx, d, st);
    levels.forEach((lv) => strokeLineMode(ctx, env, G.shift(P[0], 0, off * lv), G.shift(P[1], 0, off * lv), "segment"));
    ctx.setLineDash([]);
    const rightX = Math.max(P[0].x, P[1].x);
    levels.forEach((lv) => {
      const o = off * lv;
      const right = P[1].x >= P[0].x ? G.shift(P[1], 0, o) : G.shift(P[0], 0, o);
      label(ctx, env, G.fibLevelLabel(lv), Math.max(rightX, right.x) + 4, right.y, { base: "middle", bg: env.theme.bg, fg: env.theme.text, alpha: 0.8, size: 10 });
    });
  },
  hit(_env, _d, P, x, y) {
    const off = G.verticalOffsetFromLine(P[0], P[1], P[2]);
    const p = { x, y };
    for (const lv of G.FIB_CHANNEL_LEVELS) {
      if (G.distToSegment(p, G.shift(P[0], 0, off * lv), G.shift(P[1], 0, off * lv)) <= TOL) return true;
    }
    const far = off * G.FIB_CHANNEL_LEVELS[G.FIB_CHANNEL_LEVELS.length - 1];
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
    style: style(PROFIT, 1, "solid", { fill: LOSS, fillOpacity: 0.2 }),
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
      const x0 = Math.min(P[0].x, P[1].x);
      const x1 = Math.max(P[0].x, P[1].x);
      const yE = P[0].y;
      const yT = P[1].y;
      const yS = P[2].y;
      const w = Math.max(1, Math.round(lineWidth(d, st)));
      const lossColor = d.style.fill ?? LOSS;
      const opacity = d.style.fillOpacity ?? 0.2;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = d.style.color;
      ctx.fillRect(x0, Math.min(yE, yT), x1 - x0, Math.abs(yT - yE));
      ctx.fillStyle = lossColor;
      ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE));
      ctx.restore();
      ctx.lineWidth = w;
      ctx.setLineDash([]);
      ctx.strokeStyle = d.style.color;
      ctx.strokeRect(x0 + 0.5, Math.min(yE, yT) + 0.5, x1 - x0, Math.abs(yT - yE));
      ctx.strokeStyle = lossColor;
      ctx.strokeRect(x0 + 0.5, Math.min(yE, yS) + 0.5, x1 - x0, Math.abs(yS - yE));
      ctx.strokeStyle = GRAY;
      ctx.beginPath();
      ctx.moveTo(x0, sn(yE, w));
      ctx.lineTo(x1, sn(yE, w));
      ctx.stroke();

      const pe = d.points[0].p;
      const pt = d.points[1].p;
      const ps = d.points[2].p;
      const xm = (x0 + x1) / 2;
      label(ctx, env, `${env.labels.target}: ${fmtSigned(env, pt - pe)} (${fmtPct(pctOf(pe, pt))})`, xm, (yE + yT) / 2, {
        align: "center",
        base: "middle",
        bg: d.style.color,
        fg: "#ffffff",
        clamp: false,
      });
      label(ctx, env, `${env.labels.stop}: ${fmtSigned(env, ps - pe)} (${fmtPct(pctOf(pe, ps))})`, xm, (yE + yS) / 2, {
        align: "center",
        base: "middle",
        bg: lossColor,
        fg: "#ffffff",
        clamp: false,
      });
      const risk = Math.abs(pe - ps);
      const rr = risk > 0 ? Math.abs(pt - pe) / risk : 0;
      label(ctx, env, `${env.labels.rr} ${rr.toFixed(2)}`, xm, yE, { align: "center", base: "middle", bg: GRAY, fg: "#ffffff", clamp: false });
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

function rangeLabel(env: Env, d: Drawing, withBars: boolean, withPrice: boolean): string[] {
  const [a, b] = d.points;
  const lines: string[] = [];
  if (withPrice) lines.push(`${fmtSigned(env, b.p - a.p)} (${fmtPct(pctOf(a.p, b.p))})`);
  if (withBars) lines.push(`${barsText(env, a.t, b.t)}, ${fmtDuration(b.t - a.t, env.labels)}`);
  return lines;
}

const priceRange: ToolDef = {
  id: "price_range",
  labelKey: "draw.tool.price_range",
  points: 2,
  style: style(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.12 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const x0 = Math.min(P[0].x, P[1].x);
    const x1 = Math.max(P[0].x, P[1].x);
    const xm = (x0 + x1) / 2;
    ctx.beginPath();
    ctx.rect(x0, Math.min(P[0].y, P[1].y), x1 - x0, Math.abs(P[1].y - P[0].y));
    fillCurrent(ctx, d);
    applyStroke(ctx, d, st);
    const w = lineWidth(d, st);
    ctx.beginPath();
    ctx.moveTo(x0, sn(P[0].y, w));
    ctx.lineTo(x1, sn(P[0].y, w));
    ctx.moveTo(x0, sn(P[1].y, w));
    ctx.lineTo(x1, sn(P[1].y, w));
    ctx.moveTo(sn(xm, w), P[0].y);
    ctx.lineTo(sn(xm, w), P[1].y);
    ctx.stroke();
    arrowHead(ctx, { x: xm, y: P[0].y }, { x: xm, y: P[1].y }, 7);
    label(ctx, env, rangeLabel(env, d, false, true), xm, (P[0].y + P[1].y) / 2, { align: "center", base: "middle", bg: d.style.color, fg: "#ffffff" });
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
  style: style(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.12 }),
  ui: UI_SHAPE,
  draw(ctx, env, d, P, st) {
    const x0 = Math.min(P[0].x, P[1].x);
    const x1 = Math.max(P[0].x, P[1].x);
    ctx.beginPath();
    ctx.rect(x0, 0, x1 - x0, env.h);
    fillCurrent(ctx, d);
    applyStroke(ctx, d, st);
    const w = lineWidth(d, st);
    const ym = (P[0].y + P[1].y) / 2;
    ctx.beginPath();
    ctx.moveTo(sn(P[0].x, w), 0);
    ctx.lineTo(sn(P[0].x, w), env.h);
    ctx.moveTo(sn(P[1].x, w), 0);
    ctx.lineTo(sn(P[1].x, w), env.h);
    ctx.moveTo(P[0].x, sn(ym, w));
    ctx.lineTo(P[1].x, sn(ym, w));
    ctx.stroke();
    arrowHead(ctx, P[0], P[1], 7);
    arrowHead(ctx, P[1], P[0], 7);
    label(ctx, env, rangeLabel(env, d, true, false), (P[0].x + P[1].x) / 2, ym - 8, { align: "center", base: "bottom", bg: d.style.color, fg: "#ffffff" });
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
  const up = d.points[1].p >= d.points[0].p;
  const color = byDirection ? (up ? BLUE : RED) : d.style.color;
  const x0 = Math.min(P[0].x, P[1].x);
  const x1 = Math.max(P[0].x, P[1].x);
  const y0 = Math.min(P[0].y, P[1].y);
  const y1 = Math.max(P[0].y, P[1].y);
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  fillCurrent(ctx, d, byDirection ? color : undefined);
  applyStroke(ctx, d, st, color);
  const w = lineWidth(d, st);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
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
  label(ctx, env, rangeLabel(env, d, true, true), (x0 + x1) / 2, below ? y1 + 6 : y0 - 6, {
    align: "center",
    base: below ? "top" : "bottom",
    bg: color,
    fg: "#ffffff",
  });
}

const datPriceRange: ToolDef = {
  id: "datprice_range",
  labelKey: "draw.tool.datprice_range",
  points: 2,
  style: style(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.12 }),
  ui: UI_SHAPE,
  draw: (ctx, env, d, P, st) => rangeBoxDraw(ctx, env, d, P, st, false),
  hit: (_env, _d, P, x, y) => G.pointInRect({ x, y }, P[0], P[1]) || G.distToRectEdge({ x, y }, P[0], P[1]) <= TOL,
  handles: (_env, _d, P) => boxHandles(P),
};

const measure: ToolDef = {
  id: "measure",
  labelKey: "draw.tool.measure",
  points: 2,
  style: style(BLUE, 1, "solid", { fill: BLUE, fillOpacity: 0.14 }),
  ui: { color: false, width: false, dash: false, fill: false, text: false },
  draw: (ctx, env, d, P, st) => rangeBoxDraw(ctx, env, d, P, st, true),
  hit: (_env, _d, P, x, y) => G.pointInRect({ x, y }, P[0], P[1]) || G.distToRectEdge({ x, y }, P[0], P[1]) <= TOL,
  handles: (_env, _d, P) => boxHandles(P),
};

/* ───────────── shapes ───────────── */

const rectangle: ToolDef = {
  id: "rect",
  labelKey: "draw.tool.rect",
  points: 2,
  style: style(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE,
  draw(ctx, _env, d, P, st) {
    const x0 = Math.min(P[0].x, P[1].x);
    const y0 = Math.min(P[0].y, P[1].y);
    ctx.beginPath();
    ctx.rect(x0, y0, Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y));
    fillCurrent(ctx, d);
    applyStroke(ctx, d, st);
    ctx.stroke();
  },
  hit: (_env, _d, P, x, y) => G.pointInRect({ x, y }, P[0], P[1]) || G.distToRectEdge({ x, y }, P[0], P[1]) <= TOL,
  handles: (_env, _d, P) => boxHandles(P),
};

const ellipse: ToolDef = {
  id: "ellipse",
  labelKey: "draw.tool.ellipse",
  points: 2,
  style: style(BLUE, 2, "solid", { fill: BLUE, fillOpacity: 0.15 }),
  ui: UI_SHAPE,
  draw(ctx, _env, d, P, st) {
    const cx = (P[0].x + P[1].x) / 2;
    const cy = (P[0].y + P[1].y) / 2;
    const rx = Math.max(0.5, Math.abs(P[1].x - P[0].x) / 2);
    const ry = Math.max(0.5, Math.abs(P[1].y - P[0].y) / 2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    fillCurrent(ctx, d);
    applyStroke(ctx, d, st);
    ctx.stroke();
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
  draw(ctx, _env, d, P, st) {
    pathPoly(ctx, P);
    fillCurrent(ctx, d);
    applyStroke(ctx, d, st);
    ctx.stroke();
  },
  hit: (_env, _d, P, x, y) => G.pointInPolygon({ x, y }, P) || G.distToPolyline({ x, y }, P, true) <= TOL,
};

const brush: ToolDef = {
  id: "brush",
  labelKey: "draw.tool.brush",
  points: 0,
  style: style(ORANGE, 3),
  ui: { color: true, width: true, dash: false, fill: false, text: false },
  draw(ctx, _env, d, P, st) {
    if (P.length < 2) return;
    applyStroke(ctx, d, st, undefined, "solid");
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length - 1; i++) {
      const mx = (P[i].x + P[i + 1].x) / 2;
      const my = (P[i].y + P[i + 1].y) / 2;
      ctx.quadraticCurveTo(P[i].x, P[i].y, mx, my);
    }
    ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
    ctx.stroke();
  },
  hit: (_env, _d, P, x, y) => G.distToPolyline({ x, y }, P) <= TOL + 1,
  handles: () => [],
};

const arrow: ToolDef = {
  id: "arrow",
  labelKey: "draw.tool.arrow",
  points: 2,
  style: style(BLUE, 2),
  ui: UI_LINE,
  draw(ctx, env, d, P, st) {
    applyStroke(ctx, d, st);
    const len = G.dist(P[0], P[1]);
    const head = 8 + lineWidth(d, st) * 2;
    if (len < 1) return;
    // stop the shaft at the head base so a thick line does not poke through the tip
    const back = G.farPoint(P[1], P[0], Math.min(len, head * 0.7));
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(back.x, back.y);
    ctx.stroke();
    arrowHead(ctx, P[0], P[1], head);
  },
  hit: (_env, _d, P, x, y) => segHit(P[0], x, y, [P[0], P[1], "segment"]),
};

/* ───────────── text & marks ───────────── */

function textSize(d: Drawing): number {
  return 11 + Math.round(Math.max(1, d.style.width)) * 2;
}

function textLines(env: Env, d: Drawing): string[] {
  const t = d.style.text ?? "";
  return (t === "" ? env.labels.empty : t).split("\n");
}

function textBox(env: Env, d: Drawing, P: Pt[]) {
  const size = textSize(d);
  const lines = textLines(env, d);
  let mw = 0;
  for (const l of lines) mw = Math.max(mw, textWidth(env, l, size, 600));
  return { x: P[0].x, y: P[0].y - size, w: mw + 8, h: lines.length * (size + 3) + 4, size, lines };
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
      ctx.strokeStyle = d.style.color;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x - 2.5, b.y - 2.5, b.w + 4, b.h + 2);
    }
    ctx.globalAlpha = (d.style.text ?? "") === "" ? 0.5 : 1;
    ctx.font = `600 ${b.size}px ${env.font}`;
    ctx.fillStyle = d.style.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    b.lines.forEach((l, i) => ctx.fillText(l, b.x + 2, b.y + 2 + i * (b.size + 3)));
    ctx.restore();
  },
  hit(env, d, P, x, y) {
    const b = textBox(env, d, P);
    return x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4;
  },
};

function noteGeom(P: Pt[]) {
  return { anchor: P[0], box: P[1] };
}

const note: ToolDef = {
  id: "note",
  labelKey: "draw.tool.note",
  points: 2,
  style: style(ORANGE, 1, "solid", { fill: ORANGE, fillOpacity: 0.92, text: "" }),
  ui: { color: true, width: false, dash: false, fill: true, text: true },
  draw(ctx, env, d, P, st) {
    const { anchor, box } = noteGeom(P);
    const lines = textLines(env, d);
    ctx.save();
    ctx.font = `600 12px ${env.font}`;
    let mw = 0;
    for (const l of lines) mw = Math.max(mw, ctx.measureText(l).width);
    const bw = mw + 14;
    const bh = lines.length * 15 + 8;
    const bx = box.x - bw / 2;
    const by = box.y - bh / 2;
    ctx.strokeStyle = d.style.color;
    ctx.lineWidth = lineWidth(d, st);
    ctx.setLineDash([]);
    const c = { x: Math.max(bx, Math.min(bx + bw, anchor.x)), y: Math.max(by, Math.min(by + bh, anchor.y)) };
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = d.style.color;
    ctx.fill();
    roundRectPath(ctx, bx, by, bw, bh, 5);
    ctx.globalAlpha = Math.min(1, d.style.fillOpacity ?? 0.92);
    ctx.fillStyle = d.style.fill ?? d.style.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.fillStyle = "#1f2937";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = (d.style.text ?? "") === "" ? 0.5 : 1;
    lines.forEach((l, i) => ctx.fillText(l, bx + 7, by + 4 + i * 15 + 7.5));
    ctx.restore();
  },
  hit(env, d, P, x, y) {
    const { anchor, box } = noteGeom(P);
    const lines = textLines(env, d);
    let mw = 0;
    for (const l of lines) mw = Math.max(mw, textWidth(env, l, 12, 600));
    const bw = mw + 14;
    const bh = lines.length * 15 + 8;
    if (x >= box.x - bw / 2 - 2 && x <= box.x + bw / 2 + 2 && y >= box.y - bh / 2 - 2 && y <= box.y + bh / 2 + 2) return true;
    return G.distToSegment({ x, y }, anchor, box) <= TOL;
  },
};

const priceLabel: ToolDef = {
  id: "price_label",
  labelKey: "draw.tool.price_label",
  points: 1,
  style: style(BLUE, 1),
  ui: { color: true, width: false, dash: false, fill: false, text: false },
  draw(ctx, env, d, P) {
    const txt = env.fmt(d.points[0].p);
    ctx.save();
    ctx.font = `600 12px ${env.font}`;
    const bw = ctx.measureText(txt).width + 12;
    const bh = 20;
    const x = P[0].x + 8;
    const y = P[0].y;
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.moveTo(P[0].x, y);
    ctx.lineTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.closePath();
    ctx.fill();
    roundRectPath(ctx, x, y - bh / 2, bw, bh, 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, x + 6, y + 0.5);
    ctx.restore();
  },
  hit(env, d, P, x, y) {
    const bw = textWidth(env, env.fmt(d.points[0].p), 12, 600) + 12;
    return x >= P[0].x - 3 && x <= P[0].x + 8 + bw + 3 && Math.abs(y - P[0].y) <= 12;
  },
};

const flag: ToolDef = {
  id: "flag",
  labelKey: "draw.tool.flag",
  points: 1,
  style: style(RED, 2, "solid", { text: "" }),
  ui: { color: true, width: false, dash: false, fill: false, text: true },
  draw(ctx, env, d, P, st) {
    const x = Math.round(P[0].x) + 0.5;
    const y = P[0].y;
    ctx.save();
    ctx.strokeStyle = d.style.color;
    ctx.fillStyle = d.style.color;
    ctx.lineWidth = lineWidth(d, st);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x + 18, y - 24);
    ctx.lineTo(x, y - 17);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const t = d.style.text ?? "";
    if (t) label(ctx, env, t.split("\n"), x + 22, y - 23, { base: "middle", bg: d.style.color, fg: "#ffffff", clamp: false });
  },
  hit(env, d, P, x, y) {
    const t = d.style.text ?? "";
    const tw = t ? textWidth(env, t.split("\n")[0], 11, 600) + 34 : 22;
    return x >= P[0].x - 5 && x <= P[0].x + tw && y >= P[0].y - 34 && y <= P[0].y + 5;
  },
};

function stampTool(id: string, glyph: string): ToolDef {
  return {
    id,
    labelKey: `draw.tool.${id}`,
    points: 1,
    style: style("#f59e0b", 2),
    ui: { color: false, width: true, dash: false, fill: false, text: false },
    glyph,
    draw(ctx, env, d, P, st) {
      const size = 14 + Math.round(Math.max(1, d.style.width)) * 4;
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
      const size = 14 + Math.round(Math.max(1, d.style.width)) * 4;
      return Math.hypot(x - P[0].x, y - P[0].y) <= size / 2 + 4;
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
  lineTool("trend", "segment"),
  lineTool("ray", "ray"),
  infoLine,
  lineTool("extended", "line"),
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

export interface DrawingGroup {
  id: string;
  labelKey: string;
  tools: { id: string; labelKey: string }[];
}

const g = (id: string, ids: string[]): DrawingGroup => ({
  id,
  labelKey: `draw.group.${id}`,
  tools: ids.map((t) => ({ id: t, labelKey: REGISTRY.get(t)?.labelKey ?? `draw.tool.${t}` })),
});

export const DRAWING_GROUPS: DrawingGroup[] = [
  {
    id: "cursors",
    labelKey: "draw.group.cursors",
    tools: CURSOR_TOOLS.map((id) => ({ id, labelKey: `draw.tool.${id}` })),
  },
  g("lines", ["trend", "ray", "info", "extended", "hline", "hray", "vline", "crossline", "channel", "pitchfork"]),
  g("fib", ["fib_retr", "fib_ext", "fib_channel"]),
  g("forecast", ["long", "short", "price_range", "date_range", "datprice_range", "measure"]),
  g("shapes", ["rect", "ellipse", "triangle", "brush", "arrow"]),
  g("text", ["text", "note", "price_label", "flag"]),
  g("stamps", STAMPS.map(([id]) => id)),
];


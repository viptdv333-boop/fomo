import type { Pt, Rect } from "./types";

/* Pure screen-space geometry for drawing tools: hit-testing, clipping, fibonacci math, magnet. No DOM access. */

export type LineMode = "segment" | "ray" | "line";

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from p to the line through a,b limited by mode (segment: a..b, ray: a onward through b, line: infinite). */
export function distToLineMode(p: Pt, a: Pt, b: Pt, mode: LineMode): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (mode === "segment") t = Math.max(0, Math.min(1, t));
  else if (mode === "ray") t = Math.max(0, t);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  return distToLineMode(p, a, b, "segment");
}
export function distToRay(p: Pt, a: Pt, b: Pt): number {
  return distToLineMode(p, a, b, "ray");
}
export function distToLine(p: Pt, a: Pt, b: Pt): number {
  return distToLineMode(p, a, b, "line");
}

export function distToPolyline(p: Pt, pts: Pt[], closed = false): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return dist(p, pts[0]);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]));
  if (closed && pts.length > 2) best = Math.min(best, distToSegment(p, pts[pts.length - 1], pts[0]));
  return best;
}

/**
 * Liang-Barsky clip of the (segment | ray | line) through a,b against rect.
 * Returns the visible piece, or null when nothing is visible. Direction a->b is preserved.
 */
export function clipLineToRect(a: Pt, b: Pt, mode: LineMode, r: Rect): [Pt, Pt] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return null;
  let t0 = mode === "line" ? -Infinity : 0;
  let t1 = mode === "segment" ? 1 : Infinity;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return null;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t0) t0 = t;
    } else if (t < t1) t1 = t;
    if (t0 > t1) return null;
  }
  if (!isFinite(t0) || !isFinite(t1)) return null;
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

export function pointInRect(p: Pt, a: Pt, b: Pt): boolean {
  return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pointInEllipse(p: Pt, a: Pt, b: Pt): boolean {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  if (rx < 0.5 || ry < 0.5) return false;
  const u = (p.x - cx) / rx;
  const v = (p.y - cy) / ry;
  return u * u + v * v <= 1;
}

/** Approximate distance of p to the outline of the ellipse inscribed in the box a,b (in pixels). */
export function distToEllipseEdge(p: Pt, a: Pt, b: Pt): number {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  if (rx < 0.5 && ry < 0.5) return dist(p, { x: cx, y: cy });
  const u = (p.x - cx) / Math.max(rx, 0.5);
  const v = (p.y - cy) / Math.max(ry, 0.5);
  const k = Math.hypot(u, v);
  if (k < 1e-9) return Math.min(rx, ry);
  // nearest point on the ellipse along the ray from the center (good enough for a 6px tolerance)
  const ex = cx + (p.x - cx) / k;
  const ey = cy + (p.y - cy) / k;
  return dist(p, { x: ex, y: ey });
}

/** Distance from p to the outline of the rectangle a,b. */
export function distToRectEdge(p: Pt, a: Pt, b: Pt): number {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const c: Pt[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return distToPolyline(p, c, true);
}

/* ───────────── fibonacci ───────────── */

export const FIB_RETR_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];
export const FIB_CHANNEL_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618];

/** Retracement: level 0 sits on the second anchor, level 1 on the first. */
export function fibRetracementPrice(p1: number, p2: number, level: number): number {
  return p2 + (p1 - p2) * level;
}

/** Trend-based extension: levels are projected from the third anchor by the size of the first move. */
export function fibExtensionPrice(p1: number, p2: number, p3: number, level: number): number {
  return p3 + (p2 - p1) * level;
}

export function fibLevelLabel(level: number): string {
  return String(Math.round(level * 1000) / 1000);
}

export function fibPercentLabel(level: number): string {
  return `${Math.round(level * 1000) / 10}%`;
}

/* ───────────── parallel offsets ───────────── */

/** Vertical offset (pixels) of point c from the line a-b measured at c.x. */
export function verticalOffsetFromLine(a: Pt, b: Pt, c: Pt): number {
  const dx = b.x - a.x;
  if (Math.abs(dx) < 1e-9) return c.y - a.y;
  return c.y - (a.y + ((b.y - a.y) * (c.x - a.x)) / dx);
}

export function shift(p: Pt, dx: number, dy: number): Pt {
  return { x: p.x + dx, y: p.y + dy };
}

export function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Point far along a->b (used to build fill polygons of rays; the canvas clip removes the excess). */
export function farPoint(a: Pt, b: Pt, reach: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / len) * reach, y: a.y + (dy / len) * reach };
}

/* ───────────── magnet ───────────── */

export interface OhlcLike {
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Nearest of open/high/low/close to the pixel y, with its pixel distance. */
export function nearestOhlc(candle: OhlcLike, py: number, toY: (price: number) => number): { price: number; dist: number } {
  let best = { price: candle.c, dist: Infinity };
  for (const price of [candle.o, candle.h, candle.l, candle.c]) {
    const d = Math.abs(toY(price) - py);
    if (d < best.dist) best = { price, dist: d };
  }
  return best;
}

/** Sanity clamp for pixel coordinates used in canvas calls. */
export function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

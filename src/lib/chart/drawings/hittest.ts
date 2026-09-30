import { distToSegment, pointInPolygon } from "./geometry";
import type { Pt } from "./types";

/* Generic hit testing for drawing tools.
   Instead of every tool re-implementing "where is my stroke", the tool's own draw() is replayed on a
   recording context that only remembers geometry: stroked segments, filled polygons and text boxes.
   A pointer position then hits a drawing when it is near a stroke, on a label / text, or inside a fill.
   This follows whatever the tool actually paints (rays beyond the anchors, fib levels, channel bands, labels ...),
   including tools added later, so a drawing can always be grabbed where it is visible. */

interface Seg {
  a: Pt;
  b: Pt;
  w: number;
}
interface Poly {
  pts: Pt[];
  alpha: number;
}
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Recorded {
  strokes: Seg[];
  fills: Poly[];
  texts: Box[];
}

export interface HitResult {
  /** Near a line, a label / text or an opaque fill: a deliberate grab. */
  strong: boolean;
  /** Inside a translucent fill only: grabbed only when nothing stronger is under the pointer. */
  weak: boolean;
  /** Smallest distance (px) to a stroke, Infinity when there is none. */
  dist: number;
}

interface State {
  m: [number, number, number, number, number, number];
  lineWidth: number;
  globalAlpha: number;
  fillAlpha: number;
  strokeAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    } catch {
      measureCtx = null;
    }
  }
  return measureCtx ?? null;
}

/** Alpha channel of a CSS colour string; 1 for anything that is not clearly translucent. */
function colorAlpha(v: unknown): number {
  if (typeof v !== "string") return 1;
  const s = v.trim().toLowerCase();
  if (s === "transparent") return 0;
  const m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length >= 4) {
      const a = parseFloat(parts[3]);
      return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
    }
    return 1;
  }
  const h = /^#([0-9a-f]{8})$/.exec(s);
  if (h) return parseInt(h[1].slice(6, 8), 16) / 255;
  const h4 = /^#([0-9a-f]{4})$/.exec(s);
  if (h4) return parseInt(h4[1][3] + h4[1][3], 16) / 255;
  return 1;
}

function fontSizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : 12;
}

class Recorder {
  rec: Recorded = { strokes: [], fills: [], texts: [] };
  private subs: Pt[][] = [];
  private cur: Pt[] | null = null;
  private st: State = { m: [1, 0, 0, 1, 0, 0], lineWidth: 1, globalAlpha: 1, fillAlpha: 1, strokeAlpha: 1, font: "12px sans-serif", textAlign: "start", textBaseline: "alphabetic" };
  private stack: State[] = [];

  private tp(x: number, y: number): Pt {
    const m = this.st.m;
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
  }

  // state
  save() {
    this.stack.push({ ...this.st, m: [...this.st.m] as State["m"] });
  }
  restore() {
    const s = this.stack.pop();
    if (s) this.st = s;
  }
  translate(x: number, y: number) {
    const m = this.st.m;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
  }
  scale(x: number, y: number) {
    const m = this.st.m;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
  }
  rotate(a: number) {
    const m = this.st.m;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const [a0, b0, c0, d0] = m;
    m[0] = a0 * c + c0 * s;
    m[1] = b0 * c + d0 * s;
    m[2] = -a0 * s + c0 * c;
    m[3] = -b0 * s + d0 * c;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.st.m = [a, b, c, d, e, f];
  }
  resetTransform() {
    this.st.m = [1, 0, 0, 1, 0, 0];
  }

  // path
  beginPath() {
    this.subs = [];
    this.cur = null;
  }
  moveTo(x: number, y: number) {
    this.cur = [this.tp(x, y)];
    this.subs.push(this.cur);
  }
  lineTo(x: number, y: number) {
    if (!this.cur) {
      this.moveTo(x, y);
      return;
    }
    this.cur.push(this.tp(x, y));
  }
  closePath() {
    if (!this.cur || this.cur.length === 0) return;
    const start = this.cur[0];
    this.cur.push({ ...start });
    this.cur = [{ ...start }];
    this.subs.push(this.cur);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const from = this.cur && this.cur.length ? this.cur[this.cur.length - 1] : null;
    if (!from) {
      this.moveTo(x, y);
      return;
    }
    const c = this.tp(cx, cy);
    const e = this.tp(x, y);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const u = 1 - t;
      this.cur!.push({ x: u * u * from.x + 2 * u * t * c.x + t * t * e.x, y: u * u * from.y + 2 * u * t * c.y + t * t * e.y });
    }
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    const from = this.cur && this.cur.length ? this.cur[this.cur.length - 1] : null;
    if (!from) {
      this.moveTo(x, y);
      return;
    }
    const a = this.tp(c1x, c1y);
    const b = this.tp(c2x, c2y);
    const e = this.tp(x, y);
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const u = 1 - t;
      this.cur!.push({
        x: u * u * u * from.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * e.x,
        y: u * u * u * from.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * e.y,
      });
    }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number) {
    // rounded corners only matter as a pixel or two; the corner point is a fine stand-in
    void x2;
    void y2;
    this.lineTo(x1, y1);
  }
  private sweep(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw: boolean) {
    let da = a1 - a0;
    const TAU = Math.PI * 2;
    if (!ccw && da < 0) da = ((da % TAU) + TAU) % TAU;
    else if (ccw && da > 0) da = -(((-da % TAU) + TAU) % TAU);
    if (Math.abs(da) > TAU) da = da > 0 ? TAU : -TAU;
    const n = Math.max(8, Math.ceil(Math.abs(da) / (Math.PI / 18)));
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (da * i) / n;
      const px = rx * Math.cos(a);
      const py = ry * Math.sin(a);
      const p = { x: x + px * cr - py * sr, y: y + px * sr + py * cr };
      if (i === 0 && !this.cur) this.moveTo(p.x, p.y);
      else this.lineTo(p.x, p.y);
    }
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    this.sweep(x, y, r, r, 0, a0, a1, ccw);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) {
    this.sweep(x, y, rx, ry, rot, a0, a1, ccw);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x: number, y: number, w: number, h: number) {
    this.rect(x, y, w, h);
  }

  // painting
  private pushPoly(pts: Pt[], alpha: number) {
    if (pts.length >= 3 && alpha > 0.005 && pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) this.rec.fills.push({ pts, alpha });
  }
  fill() {
    const alpha = this.st.globalAlpha * this.st.fillAlpha;
    for (const s of this.subs) this.pushPoly(s.slice(), alpha);
  }
  stroke() {
    const alpha = this.st.globalAlpha * this.st.strokeAlpha;
    if (alpha <= 0.005) return;
    const w = Math.max(0.5, this.st.lineWidth);
    for (const s of this.subs) {
      for (let i = 0; i < s.length - 1; i++) {
        const a = s[i];
        const b = s[i + 1];
        if (Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y)) this.rec.strokes.push({ a, b, w });
      }
    }
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const alpha = this.st.globalAlpha * this.st.fillAlpha;
    this.pushPoly([this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h)], alpha);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    const keepSubs = this.subs;
    const keepCur = this.cur;
    this.subs = [];
    this.cur = null;
    this.rect(x, y, w, h);
    this.stroke();
    this.subs = keepSubs;
    this.cur = keepCur;
  }
  private textBox(text: string, x: number, y: number) {
    const size = fontSizeOf(this.st.font);
    const mc = getMeasureCtx();
    let w = text.length * size * 0.58;
    if (mc) {
      mc.font = this.st.font;
      w = mc.measureText(text).width;
    }
    const s = this.st;
    let x0 = x;
    if (s.textAlign === "center") x0 = x - w / 2;
    else if (s.textAlign === "right" || s.textAlign === "end") x0 = x - w;
    let y0 = y - size * 0.8;
    if (s.textBaseline === "top" || s.textBaseline === "hanging") y0 = y;
    else if (s.textBaseline === "middle") y0 = y - size / 2;
    else if (s.textBaseline === "bottom" || s.textBaseline === "ideographic") y0 = y - size;
    const a = this.tp(x0, y0);
    const b = this.tp(x0 + w, y0 + size * 1.15);
    if ([a.x, a.y, b.x, b.y].every(Number.isFinite)) {
      this.rec.texts.push({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
    }
  }
  fillText(text: string, x: number, y: number) {
    if (this.st.globalAlpha * this.st.fillAlpha > 0.05) this.textBox(String(text), x, y);
  }
  strokeText(text: string, x: number, y: number) {
    if (this.st.globalAlpha * this.st.strokeAlpha > 0.05) this.textBox(String(text), x, y);
  }
  measureText(text: string) {
    const mc = getMeasureCtx();
    if (mc) {
      mc.font = this.st.font;
      return mc.measureText(text);
    }
    return { width: text.length * fontSizeOf(this.st.font) * 0.58 } as TextMetrics;
  }
  drawImage(_img: unknown, x: number, y: number, w?: number, h?: number) {
    if (typeof w === "number" && typeof h === "number") this.pushPoly([this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h)], 1);
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  getLineDash() {
    return [];
  }
  isPointInPath() {
    return false;
  }

  setProp(name: string, v: unknown): boolean {
    switch (name) {
      case "lineWidth":
        this.st.lineWidth = typeof v === "number" ? v : this.st.lineWidth;
        return true;
      case "globalAlpha":
        this.st.globalAlpha = typeof v === "number" ? Math.max(0, Math.min(1, v)) : this.st.globalAlpha;
        return true;
      case "fillStyle":
        this.st.fillAlpha = colorAlpha(v);
        return true;
      case "strokeStyle":
        this.st.strokeAlpha = colorAlpha(v);
        return true;
      case "font":
        if (typeof v === "string") this.st.font = v;
        return true;
      case "textAlign":
        if (typeof v === "string") this.st.textAlign = v;
        return true;
      case "textBaseline":
        if (typeof v === "string") this.st.textBaseline = v;
        return true;
      default:
        return true;
    }
  }
  getProp(name: string): unknown {
    switch (name) {
      case "lineWidth":
        return this.st.lineWidth;
      case "globalAlpha":
        return this.st.globalAlpha;
      case "font":
        return this.st.font;
      case "textAlign":
        return this.st.textAlign;
      case "textBaseline":
        return this.st.textBaseline;
      default:
        return undefined;
    }
  }
}

const PROP_NAMES = new Set(["lineWidth", "globalAlpha", "fillStyle", "strokeStyle", "font", "textAlign", "textBaseline", "lineCap", "lineJoin", "miterLimit", "lineDashOffset", "shadowBlur", "shadowColor", "shadowOffsetX", "shadowOffsetY", "globalCompositeOperation", "direction", "imageSmoothingEnabled"]);

/** Runs `paint` against a recording context and returns the geometry it produced. */
export function recordDraw(paint: (ctx: CanvasRenderingContext2D) => void): Recorded {
  const r = new Recorder();
  const noop = () => undefined;
  const ctx = new Proxy(r as unknown as object, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (PROP_NAMES.has(prop)) return r.getProp(prop);
      const v = (target as Record<string, unknown>)[prop];
      if (typeof v === "function") return (v as (...a: unknown[]) => unknown).bind(target);
      if (prop === "canvas") return undefined;
      return noop;
    },
    set(_t, prop, value) {
      if (typeof prop === "string") r.setProp(prop, value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  try {
    paint(ctx);
  } catch {
    /* a broken tool simply records less */
  }
  return r.rec;
}

/** Bounding box of everything recorded that is finite and not absurdly large (used for marquee selection). */
export function recordedBounds(rec: Recorded, limit = 1e5): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Pt) => {
    if (Math.abs(p.x) > limit || Math.abs(p.y) > limit) return;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  };
  for (const s of rec.strokes) {
    add(s.a);
    add(s.b);
  }
  for (const f of rec.fills) f.pts.forEach(add);
  for (const t of rec.texts) {
    add({ x: t.x0, y: t.y0 });
    add({ x: t.x1, y: t.y1 });
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

export function evalHit(rec: Recorded, x: number, y: number, tol: number): HitResult {
  const p: Pt = { x, y };
  let strong = false;
  let weak = false;
  let dist = Infinity;
  for (const s of rec.strokes) {
    const d = distToSegment(p, s.a, s.b);
    if (d < dist) dist = d;
    if (d <= tol + Math.max(0, (s.w - 1) / 2)) strong = true;
  }
  for (const t of rec.texts) {
    if (x >= t.x0 - 3 && x <= t.x1 + 3 && y >= t.y0 - 3 && y <= t.y1 + 3) strong = true;
  }
  for (const f of rec.fills) {
    if (!pointInPolygon(p, f.pts)) continue;
    if (f.alpha >= 0.5) strong = true;
    else weak = true;
  }
  return { strong, weak: weak && !strong, dist };
}

/** Does the recorded geometry touch the rectangle? Used by the rubber-band selection. */
export function recordedIntersectsRect(rec: Recorded, r: Box): boolean {
  const inside = (p: Pt) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
  const segHits = (a: Pt, b: Pt) => {
    if (inside(a) || inside(b)) return true;
    if (Math.max(a.x, b.x) < r.x0 || Math.min(a.x, b.x) > r.x1 || Math.max(a.y, b.y) < r.y0 || Math.min(a.y, b.y) > r.y1) return false;
    // crossing test against the four rectangle sides
    const sides: [Pt, Pt][] = [
      [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }],
      [{ x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }],
      [{ x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }],
      [{ x: r.x0, y: r.y1 }, { x: r.x0, y: r.y0 }],
    ];
    return sides.some(([c, d]) => segCross(a, b, c, d));
  };
  for (const s of rec.strokes) if (segHits(s.a, s.b)) return true;
  for (const t of rec.texts) if (!(t.x1 < r.x0 || t.x0 > r.x1 || t.y1 < r.y0 || t.y0 > r.y1)) return true;
  return false;
}

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, s: Pt) => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

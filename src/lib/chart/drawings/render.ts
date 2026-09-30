import type { DrawingStyle } from "../contracts";
import type { Drawing, Pt } from "./types";
import type { Env } from "./tools";

/* Rendering helpers that turn drawing properties (DrawingStyle / Drawing.extra) into pixels:
   colours, text blocks, fibonacci level lists, per-timeframe visibility, position-tool maths.
   Pure canvas + data; imports only types from tools.ts so there is no runtime cycle. */

/* ───────────── small value helpers ───────────── */

/** Boolean property with a default when it was never stored. */
export function on(v: unknown, def: boolean): boolean {
  return v === undefined || v === null ? def : !!v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function parseRgba(c: string | undefined | null): { r: number; g: number; b: number; a: number } | null {
  const s = (c || "").trim();
  let m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return { r: Math.min(255, +m[1]), g: Math.min(255, +m[2]), b: Math.min(255, +m[3]), a: m[4] === undefined ? 1 : clamp(+m[4], 0, 1) };
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split("").map((ch) => parseInt(ch + ch, 16));
    return { r, g, b, a: 1 };
  }
  return null;
}

/** Fully opaque "#rrggbb" of any colour (alpha dropped); used where a solid background is needed. */
export function solid(c: string | undefined | null, fallback = "#2962ff"): string {
  const p = parseRgba(c);
  if (!p) return c && c.startsWith("#") ? c : fallback;
  return "#" + [p.r, p.g, p.b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function withAlpha(c: string | undefined | null, a: number): string {
  const p = parseRgba(c) ?? { r: 41, g: 98, b: 255, a: 1 };
  return `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.round(clamp(a, 0, 1) * 100) / 100})`;
}

/** Readable text colour (black / white) for a background colour. */
export function contrastOn(bg: string): string {
  const p = parseRgba(bg);
  if (!p) return "#ffffff";
  return (p.r * 299 + p.g * 587 + p.b * 114) / 1000 > 160 ? "#131722" : "#ffffff";
}

/* ───────────── text ───────────── */

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface TextCfg {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  bg: string | null;
  border: string | null;
  align: HAlign;
  valign: VAlign;
  wrap: boolean;
}

export interface TextDefaults {
  size: number;
  bold?: boolean;
  color?: string;
  bg?: boolean;
  border?: boolean;
  align?: HAlign;
  valign?: VAlign;
}

export const DEFAULT_TEXT_BG = "rgba(19, 23, 34, 0.85)";

export function textCfg(d: Drawing, def: TextDefaults): TextCfg {
  const s = d.style;
  const align = s.textAlign === "left" || s.textAlign === "right" || s.textAlign === "center" ? s.textAlign : def.align ?? "center";
  const valign = s.textVAlign === "top" || s.textVAlign === "bottom" || s.textVAlign === "middle" ? s.textVAlign : def.valign ?? "middle";
  return {
    text: s.text ?? "",
    size: clamp(s.fontSize ?? def.size, 6, 120),
    bold: on(s.bold, def.bold ?? false),
    italic: on(s.italic, false),
    color: s.textColor ?? def.color ?? s.color,
    bg: on(s.showTextBg, def.bg ?? false) ? s.textBg ?? DEFAULT_TEXT_BG : null,
    border: on(s.showTextBorder, def.border ?? false) ? s.textBorder ?? s.color : null,
    align,
    valign,
    wrap: on(s.textWrap, false),
  };
}

export function fontStr(env: Env, c: Pick<TextCfg, "size" | "bold" | "italic">): string {
  return `${c.italic ? "italic " : ""}${c.bold ? 700 : 500} ${c.size}px ${env.font}`;
}

let mctx: CanvasRenderingContext2D | null = null;
function measure(env: Env, c: Pick<TextCfg, "size" | "bold" | "italic">, s: string): number {
  if (!mctx && typeof document !== "undefined") {
    try {
      mctx = document.createElement("canvas").getContext("2d");
    } catch {
      mctx = null;
    }
  }
  if (!mctx) return s.length * c.size * 0.58;
  mctx.font = fontStr(env, c);
  return mctx.measureText(s).width;
}

export interface TextLayout {
  lines: string[];
  w: number;
  h: number;
  lh: number;
  pad: number;
}

function wrapLine(env: Env, c: TextCfg, line: string, maxW: number): string[] {
  if (measure(env, c, line) <= maxW) return [line];
  const words = line.split(/(\s+)/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur + w;
    if (cur && measure(env, c, trial.trimEnd()) > maxW) {
      out.push(cur.trimEnd());
      cur = w.trimStart();
    } else cur = trial;
    // a single very long word: break by characters
    while (measure(env, c, cur) > maxW && cur.length > 1) {
      let k = cur.length - 1;
      while (k > 1 && measure(env, c, cur.slice(0, k)) > maxW) k--;
      out.push(cur.slice(0, k));
      cur = cur.slice(k);
    }
  }
  if (cur) out.push(cur.trimEnd());
  return out.length ? out : [""];
}

export function layoutText(env: Env, c: TextCfg, text: string, maxW: number | null): TextLayout {
  const pad = c.bg || c.border ? 5 : 2;
  let lines = text.split("\n");
  if (c.wrap && maxW && maxW > 20) lines = lines.flatMap((l) => wrapLine(env, c, l, maxW - pad * 2));
  let mw = 0;
  for (const l of lines) mw = Math.max(mw, measure(env, c, l));
  const lh = Math.round(c.size * 1.25);
  return { lines, w: mw + pad * 2, h: lines.length * lh + pad * 2 - 2, lh, pad };
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Paints a laid-out block with its top-left at (x, y); lines aligned inside the block width. */
export function paintText(ctx: CanvasRenderingContext2D, env: Env, c: TextCfg, lay: TextLayout, x: number, y: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash([]);
  if (c.bg) {
    ctx.fillStyle = c.bg;
    rrect(ctx, x, y, lay.w, lay.h, 4);
    ctx.fill();
  }
  if (c.border) {
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    rrect(ctx, x + 0.5, y + 0.5, lay.w - 1, lay.h - 1, 4);
    ctx.stroke();
  }
  ctx.font = fontStr(env, c);
  ctx.fillStyle = c.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = c.align;
  const tx = c.align === "left" ? x + lay.pad : c.align === "right" ? x + lay.w - lay.pad : x + lay.w / 2;
  lay.lines.forEach((l, i) => ctx.fillText(l, tx, y + lay.pad - 1 + lay.lh * i + lay.lh / 2));
  ctx.restore();
}

/** Text placed inside a box by its alignment (shapes: rectangle, ellipse, triangle...). */
export function paintTextInBox(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, def: TextDefaults, x0: number, y0: number, x1: number, y1: number) {
  const c = textCfg(d, def);
  if (!c.text) return;
  const bw = Math.abs(x1 - x0);
  const lay = layoutText(env, c, c.text, c.wrap ? Math.max(40, bw - 8) : null);
  const m = 6;
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const bh = Math.abs(y1 - y0);
  const x = c.align === "left" ? left + m : c.align === "right" ? left + bw - lay.w - m : left + (bw - lay.w) / 2;
  const y = c.valign === "top" ? top + m : c.valign === "bottom" ? top + bh - lay.h - m : top + (bh - lay.h) / 2;
  paintText(ctx, env, c, lay, x, y);
}

/** Text along a line from a to b (rotated to the line, kept upright), aligned along it and above / on / below it. */
export function paintLineText(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, def: TextDefaults, a: Pt, b: Pt) {
  const c = textCfg(d, def);
  if (!c.text) return;
  const lay = layoutText(env, c, c.text, c.wrap ? 220 : null);
  const L = a.x <= b.x ? a : b;
  const R = a.x <= b.x ? b : a;
  const len = Math.hypot(R.x - L.x, R.y - L.y);
  const ux = len > 0.001 ? (R.x - L.x) / len : 1;
  const uy = len > 0.001 ? (R.y - L.y) / len : 0;
  const ang = Math.atan2(uy, ux);
  const m = lay.w / 2 + 6;
  const f = c.align === "left" ? m : c.align === "right" ? Math.max(m, len - m) : len / 2;
  const off = c.valign === "top" ? -(lay.h / 2 + 4) : c.valign === "bottom" ? lay.h / 2 + 4 : 0;
  const cx = L.x + ux * f - uy * off;
  const cy = L.y + uy * f + ux * off;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  const cc = { ...c, align: "center" as HAlign };
  paintText(ctx, env, cc, lay, -lay.w / 2, -lay.h / 2);
  ctx.restore();
}

/* ───────────── fibonacci-style level lists ───────────── */

export interface FibLevel {
  v: number;
  on: boolean;
  color: string;
  /** Optional per-level line style, else the drawing's. */
  dash?: string;
}

export type LevelKind = "retr" | "ext" | "channel" | "pitch";

const C_RED = "#f23645";
const C_ORANGE = "#ff9800";
const C_GREEN = "#4caf50";
const C_TEAL = "#089981";
const C_CYAN = "#00bcd4";
const C_GRAY = "#787b86";
const C_BLUE = "#2962ff";
const C_PURPLE = "#9c27b0";
const C_PINK = "#e91e63";

const LVL_COLORS: Record<string, string> = {
  "0": C_GRAY,
  "0.236": C_RED,
  "0.382": C_ORANGE,
  "0.5": C_GREEN,
  "0.618": C_TEAL,
  "0.786": C_CYAN,
  "1": C_GRAY,
  "1.272": C_ORANGE,
  "1.414": C_RED,
  "1.618": C_BLUE,
  "2": C_PURPLE,
  "2.618": C_RED,
  "3.618": C_PURPLE,
  "4.236": C_PINK,
};

export function levelColor(v: number): string {
  return LVL_COLORS[String(Math.round(v * 1000) / 1000)] ?? C_GRAY;
}

const mk = (vs: number[], onSet: number[]): FibLevel[] => vs.map((v) => ({ v, on: onSet.includes(v), color: levelColor(v) }));

const RETR_ALL = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618, 3.618, 4.236];
const EXT_ALL = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.414, 1.618, 2, 2.618, 3.618, 4.236];
const CH_ALL = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236];

export function defaultLevels(kind: LevelKind): FibLevel[] {
  switch (kind) {
    case "retr":
      return mk(RETR_ALL, [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
    case "ext":
      return mk(EXT_ALL, [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618]);
    case "channel":
      return mk(CH_ALL, [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618]);
    case "pitch":
      return [
        { v: 0.25, on: false, color: C_ORANGE },
        { v: 0.5, on: false, color: C_GREEN },
        { v: 0.75, on: false, color: C_TEAL },
        { v: 1, on: true, color: C_BLUE },
        { v: 1.5, on: false, color: C_PURPLE },
        { v: 2, on: false, color: C_PINK },
      ];
  }
}

export function sanitizeLevels(raw: unknown, kind: LevelKind): FibLevel[] {
  if (!Array.isArray(raw)) return defaultLevels(kind);
  const out: FibLevel[] = [];
  for (const it of raw.slice(0, 40)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const v = typeof r.v === "number" && Number.isFinite(r.v) ? r.v : null;
    if (v === null) continue;
    out.push({
      v,
      on: r.on !== false,
      color: typeof r.color === "string" ? r.color : levelColor(v),
      ...(typeof r.dash === "string" ? { dash: r.dash } : {}),
    });
  }
  return out.length ? out : defaultLevels(kind);
}

export function getLevels(d: Drawing, kind: LevelKind): FibLevel[] {
  return sanitizeLevels(d.extra?.levels, kind);
}

/* ───────────── per-timeframe visibility ───────────── */

export const VIS_UNITS = ["seconds", "minutes", "hours", "days", "weeks", "months"] as const;
export type VisUnit = (typeof VIS_UNITS)[number];
export const VIS_LIMITS: Record<VisUnit, [number, number]> = {
  seconds: [1, 59],
  minutes: [1, 59],
  hours: [1, 24],
  days: [1, 366],
  weeks: [1, 52],
  months: [1, 12],
};
export interface VisRange {
  on: boolean;
  min: number;
  max: number;
}
export type VisMap = Record<VisUnit, VisRange>;

export function defaultVis(): VisMap {
  const out = {} as VisMap;
  for (const u of VIS_UNITS) out[u] = { on: true, min: VIS_LIMITS[u][0], max: VIS_LIMITS[u][1] };
  return out;
}

export function getVis(d: Pick<Drawing, "extra">): VisMap {
  const base = defaultVis();
  const raw = d.extra?.vis;
  if (!raw || typeof raw !== "object") return base;
  for (const u of VIS_UNITS) {
    const r = (raw as Record<string, unknown>)[u];
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const [lo, hi] = VIS_LIMITS[u];
    const min = typeof o.min === "number" ? clamp(Math.round(o.min), lo, hi) : lo;
    const max = typeof o.max === "number" ? clamp(Math.round(o.max), lo, hi) : hi;
    base[u] = { on: o.on !== false, min: Math.min(min, max), max: Math.max(min, max) };
  }
  return base;
}

const DAY = 86_400_000;

/** Unit and multiplier of a timeframe (1H -> hours x1, 4H -> hours x4, D -> days x1, W -> weeks x1). */
export function intervalUnit(ms: number): { unit: VisUnit; mult: number } {
  if (ms < 60_000) return { unit: "seconds", mult: Math.max(1, Math.round(ms / 1000)) };
  if (ms < 3_600_000) return { unit: "minutes", mult: Math.max(1, Math.round(ms / 60_000)) };
  if (ms < DAY) return { unit: "hours", mult: Math.max(1, Math.round(ms / 3_600_000)) };
  if (ms < 7 * DAY) return { unit: "days", mult: Math.max(1, Math.round(ms / DAY)) };
  if (ms < 28 * DAY) return { unit: "weeks", mult: Math.max(1, Math.round(ms / (7 * DAY))) };
  return { unit: "months", mult: Math.max(1, Math.round(ms / (30 * DAY))) };
}

/** False when the drawing is switched off for the current timeframe (Visibility tab). */
export function visibleAt(d: Pick<Drawing, "extra">, intervalMs: number): boolean {
  if (!d.extra || !d.extra.vis) return true;
  const { unit, mult } = intervalUnit(intervalMs);
  const r = getVis(d)[unit];
  return r.on && mult >= r.min && mult <= r.max;
}

/* ───────────── position tools ───────────── */

export interface PositionStats {
  risk: number;
  reward: number;
  rr: number;
  riskCash: number;
  qty: number;
  rewardCash: number;
}

export function positionStats(s: DrawingStyle, entry: number, target: number, stop: number): PositionStats {
  const account = typeof s.accountSize === "number" && s.accountSize > 0 ? s.accountSize : 1000;
  const riskVal = typeof s.risk === "number" && s.risk > 0 ? s.risk : 1;
  const lot = typeof s.lotSize === "number" && s.lotSize > 0 ? s.lotSize : 1;
  const riskCash = s.riskType === "cash" ? riskVal : (account * riskVal) / 100;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const qty = risk > 0 ? Math.floor(riskCash / risk / lot) * lot : 0;
  return { risk, reward, rr: risk > 0 ? reward / risk : 0, riskCash, qty, rewardCash: qty * reward };
}

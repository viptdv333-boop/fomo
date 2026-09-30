import type { FillStyle, IndicatorStyle, LevelStyle, PlotStyle } from "../contracts";
import type { IndResult, LineStyleName, PlotShape } from "./registry";

/* Extended per-instance style: validation (layouts come from localStorage / the server) and the merge of a style
   onto a computed IndResult. Pure, no DOM. */

const COLOR_RE = /^(#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;
const SHAPES: readonly PlotShape[] = ["line", "step", "area", "histogram", "columns", "circles"];
const LINE_STYLES: readonly LineStyleName[] = ["solid", "dashed", "dotted"];
export const TF_GROUPS = ["minutes", "hours", "days", "weeks", "months"] as const;
export type TfGroup = "seconds" | (typeof TF_GROUPS)[number];

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const color = (v: unknown) => (typeof v === "string" && COLOR_RE.test(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const pickOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);

function clean<T extends object>(o: T): T | undefined {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return Object.keys(o).length ? o : undefined;
}

function plotStyle(v: unknown): PlotStyle | undefined {
  if (!isObj(v)) return undefined;
  return clean<PlotStyle>({
    visible: bool(v.visible),
    color: color(v.color),
    width: num(v.width, 0.5, 8),
    lineStyle: pickOf(v.lineStyle, LINE_STYLES),
    type: pickOf(v.type, SHAPES),
    priceLine: bool(v.priceLine),
    lastValue: bool(v.lastValue),
    legendValue: bool(v.legendValue),
  });
}
function fillStyle(v: unknown): FillStyle | undefined {
  if (!isObj(v)) return undefined;
  return clean<FillStyle>({ visible: bool(v.visible), color: color(v.color) });
}
function levelStyle(v: unknown): LevelStyle | undefined {
  if (!isObj(v)) return undefined;
  return clean<LevelStyle>({
    visible: bool(v.visible),
    value: num(v.value, -1e12, 1e12),
    color: color(v.color),
    width: num(v.width, 0.5, 6),
    lineStyle: pickOf(v.lineStyle, LINE_STYLES),
  });
}
function mapOf<T>(v: unknown, f: (x: unknown) => T | undefined): Record<string, T> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, T> = {};
  for (const k of Object.keys(v).slice(0, 64)) {
    const r = f(v[k]);
    if (r) out[k] = r;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Drops everything that is not a valid style value. Returns undefined when nothing is left. */
export function sanitizeStyle(raw: unknown): IndicatorStyle | undefined {
  if (!isObj(raw)) return undefined;
  let tf: IndicatorStyle["tf"];
  if (isObj(raw.tf)) {
    const t: NonNullable<IndicatorStyle["tf"]> = {};
    for (const g of [...TF_GROUPS, "seconds"] as const) {
      const b = bool((raw.tf as Record<string, unknown>)[g]);
      if (b === false) t[g] = false;
    }
    if (Object.keys(t).length) tf = t;
  }
  return clean<IndicatorStyle>({
    plots: mapOf(raw.plots, plotStyle),
    fills: mapOf(raw.fills, fillStyle),
    levels: mapOf(raw.levels, levelStyle),
    band: fillStyle(raw.band),
    tf,
    pane: raw.pane === "main" || raw.pane === "own" ? raw.pane : undefined,
  });
}

export function cloneStyle(s: IndicatorStyle | undefined): IndicatorStyle | undefined {
  return s ? (JSON.parse(JSON.stringify(s)) as IndicatorStyle) : undefined;
}

/** Which timeframe group a bar length falls into. */
export function tfGroupOf(intervalMs: number): TfGroup {
  const D = 86_400_000;
  if (intervalMs < 60_000) return "seconds";
  if (intervalMs < 3_600_000) return "minutes";
  if (intervalMs < D) return "hours";
  if (intervalMs < 7 * D) return "days";
  if (intervalMs < 28 * D) return "weeks";
  return "months";
}

/** "#rrggbb" for flags and swatches, dropping any alpha. */
export function solidColor(c: string): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (m) return "#" + [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, "0")).join("");
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7);
  return c;
}

/** Applies a style on top of a computed result. Data arrays are shared, only the specs are copied. */
export function applyStyle(res: IndResult, style: IndicatorStyle | undefined): IndResult {
  if (!style) return res;
  const ps = style.plots;
  const plots = ps
    ? res.plots.map((p) => {
        const st = ps[p.key];
        if (!st) return p;
        const q = { ...p };
        if (st.visible === false) q.hidden = true;
        if (st.color && !p.colors) q.color = st.color;
        if (st.width !== undefined) q.width = st.width;
        if (st.lineStyle) q.lineStyle = st.lineStyle;
        else if (p.dashed && !p.lineStyle) q.lineStyle = "dashed";
        if (st.type) q.shape = st.type;
        if (st.priceLine !== undefined) q.priceLine = st.priceLine;
        if (st.lastValue !== undefined) q.flag = st.lastValue;
        if (st.legendValue !== undefined) q.legend = st.legendValue;
        return q;
      })
    : res.plots;

  const fs = style.fills;
  const fills = res.fills && fs
    ? res.fills.map((f, i) => {
        const st = fs[String(i)];
        if (!st) return f;
        return { ...f, hidden: st.visible === false ? true : f.hidden, color: st.color ?? f.color };
      })
    : res.fills;

  const ls = style.levels;
  const levels = res.levels && ls
    ? res.levels.map((l, i) => {
        const st = ls[String(i)];
        if (!st) return l;
        const q = { ...l };
        if (st.visible === false) q.hidden = true;
        if (st.value !== undefined) q.value = st.value;
        if (st.color) q.color = st.color;
        if (st.width !== undefined) q.width = st.width;
        if (st.lineStyle) q.lineStyle = st.lineStyle;
        return q;
      })
    : res.levels;

  const bs = style.band;
  const bands = res.bands
    ? res.bands.map((b) => {
        let lo = b.lo;
        let hi = b.hi;
        if (levels) {
          if (b.loLevel !== undefined && levels[b.loLevel]) lo = levels[b.loLevel].value;
          if (b.hiLevel !== undefined && levels[b.hiLevel]) hi = levels[b.hiLevel].value;
        }
        if (lo > hi) [lo, hi] = [hi, lo];
        return { ...b, lo, hi, color: bs?.color ?? b.color, hidden: bs?.visible === false ? true : b.hidden };
      })
    : res.bands;

  return { ...res, plots, fills, levels, bands };
}

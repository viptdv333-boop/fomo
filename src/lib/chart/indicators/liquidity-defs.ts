import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, NumberParam, Params, PlotSpec, SelectOption, SelectParam } from "./registry";
import { formatPrice, inferPrecision } from "../format";
import { indT } from "./ind-text";
import {
  detectDeltaImbalance,
  detectFvg,
  detectHvn,
  detectLiquidity,
  detectOrderBlocks,
  type DeltaOptions,
  type FvgOptions,
  type HvnOptions,
  type HvnResult,
  type LiqOptions,
  type Mitigation,
  type ObOptions,
  type Pool,
  type SizeUnit,
  type Zone,
} from "../analysis/zones";

/* Imbalances and liquidity (category «Имбалансы / Ликвидность»), all from candles only:
     fvg          fair value gaps (+ opening gaps, volume imbalances), mitigation, partial shrink
     liq_pools    equal highs / lows = buy-side / sell-side liquidity, until swept
     liq_hvn      high-volume nodes (volume clusters) of the last N bars
     order_blocks the last opposite candle before an impulse
     delta_imb    delta imbalance bars / stacks from the CANDLE-APPROXIMATED delta (approximate, labelled so)
   Detection is in analysis/zones.ts; this file is the parameter schema, the painter and the legend. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;
const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

const UNIT_OPTIONS: SelectOption[] = [
  { value: "atr", label: "ind.zn.o.atr" },
  { value: "pct", label: "ind.zn.o.pct" },
];
const MIT_OPTIONS: SelectOption[] = [
  { value: "touch", label: "ind.zn.o.touch" },
  { value: "wick", label: "ind.zn.o.wick" },
  { value: "close", label: "ind.zn.o.close" },
];
const SWEEP_OPTIONS: SelectOption[] = [
  { value: "wick", label: "ind.zn.o.swWick" },
  { value: "close", label: "ind.zn.o.swClose" },
];

const G_DETECT = "ind.zn.g.detect";
const G_SHOW = "ind.zn.g.show";

/** Section headings of the Inputs tab. The colour rows of the Style tab already sit under their own «Цвета» heading, so they get none. */
function groups(detect: string[], show: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of detect) out[k] = G_DETECT;
  for (const k of show) out[k] = G_SHOW;
  return out;
}

const finite = (v: number) => v === v && v !== Infinity && v !== -Infinity;

function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, a))})`;
}

/** Linear mix of two #rrggbb colours (t = share of `b`). */
function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a);
  const pb = /^#([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const va = parseInt(pa[1], 16);
  const vb = parseInt(pb[1], 16);
  const ch = (s: number) => Math.round(((va >> s) & 255) * (1 - t) + ((vb >> s) & 255) * t);
  return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

/* ───────────── box painter ───────────── */

interface Box {
  /** First bar; the box starts at the left edge of that bar. */
  i0: number;
  /** Last bar; null = to the right edge of the pane. */
  i1: number | null;
  lo: number;
  hi: number;
  color: string;
  /** Fill opacity 0..1. */
  alpha: number;
  border: boolean;
  label?: string;
  /** Faded (mitigated / swept). */
  dim?: boolean;
  /** Dotted line at 50 % of the box. */
  mid?: boolean;
  /** Dashed edges instead of solid. */
  dashed?: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function paintBoxes(sc: SeriesContext, boxes: Box[]): void {
  if (!boxes.length) return;
  const { ctx } = sc;
  const W = sc.paneWidth;
  const H = sc.paneHeight;
  const half = sc.barSpacing / 2;
  const placed: Rect[] = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.font = `600 10px ${sc.options.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const b of boxes) {
    const xa = sc.x(b.i0) - half;
    const xb = b.i1 === null ? W : sc.x(b.i1) + half;
    if (!finite(xa) || !finite(xb) || xb < 0 || xa > W) continue;
    const ya = sc.y(b.hi);
    const yb = sc.y(b.lo);
    if (!finite(ya) || !finite(yb)) continue;
    const top = Math.min(ya, yb);
    const bot = Math.max(ya, yb);
    if (bot < 0 || top > H) continue;
    const x0 = Math.max(0, xa);
    const x1 = Math.min(W, xb);
    if (x1 <= x0) continue;
    const h = Math.max(1, bot - top);
    const k = b.dim ? 0.45 : 1;
    ctx.fillStyle = rgba(b.color, b.alpha * k);
    ctx.fillRect(x0, top, x1 - x0, h);
    if (b.border) {
      ctx.strokeStyle = rgba(b.color, Math.min(1, (b.alpha + 0.5) * k));
      ctx.lineWidth = 1;
      ctx.setLineDash(b.dashed || b.dim ? [4, 3] : []);
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(top) + 0.5, Math.max(1, x1 - x0 - 1), Math.max(1, h - 1));
      ctx.setLineDash([]);
    }
    if (b.mid && h >= 6) {
      const ym = Math.round((top + bot) / 2) + 0.5;
      ctx.strokeStyle = rgba(b.color, 0.55 * k);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, ym);
      ctx.lineTo(x1, ym);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (b.label) {
      const tw = ctx.measureText(b.label).width;
      const inside = h >= 11;
      const lx = Math.max(x0, 0) + 4;
      const ly = inside ? top + h / 2 : top - 7;
      if (lx + tw < x1 + 40) {
        const r: Rect = { x: lx, y: ly - 6, w: tw, h: 12 };
        if (!placed.some((q) => overlap(q, r)) && ly > 5 && ly < H - 4) {
          placed.push(r);
          sc.labelBoxes?.push(r);
          ctx.fillStyle = rgba(b.color, (b.dim ? 0.6 : 0.95));
          ctx.fillText(b.label, lx, ly + 0.5);
        }
      }
    }
  }
  ctx.restore();
}

/* ───────────── shared helpers ───────────── */

interface ZoneExtra {
  zones: Zone[];
  lastClose: number;
  prec: number;
}

function zonesOf(res: IndResult | undefined): ZoneExtra | null {
  const e = res?.extra as ZoneExtra | undefined;
  return e && Array.isArray(e.zones) ? e : null;
}

/** Newest `max` live zones and (optionally) the newest `max` mitigated ones. */
function selectZones(zones: Zone[], max: number, showMit: boolean): Zone[] {
  const live: Zone[] = [];
  const done: Zone[] = [];
  for (const z of zones) (z.i1 < 0 ? live : done).push(z);
  const m = Math.max(1, Math.floor(max));
  return showMit ? done.slice(-m).concat(live.slice(-m)) : live.slice(-m);
}

function zoneAlertLevels(res: IndResult): number[] {
  const e = zonesOf(res);
  if (!e) return [];
  const live = e.zones.filter((z) => z.i1 < 0).sort((a, b) => Math.abs((a.lo + a.hi) / 2 - e.lastClose) - Math.abs((b.lo + b.hi) / 2 - e.lastClose)).slice(0, 3);
  const out: number[] = [];
  for (const z of live) out.push(z.hi, z.lo);
  return out;
}

function zoneLegend(res: IndResult, cBull: string, cBear: string): { text: string; color: string }[] {
  const e = zonesOf(res);
  if (!e) return [];
  let up = 0;
  let dn = 0;
  for (const z of e.zones) {
    if (z.i1 >= 0) continue;
    if (z.dir > 0) up++;
    else dn++;
  }
  return [
    { text: `▲ ${up}`, color: cBull },
    { text: `▼ ${dn}`, color: cBear },
  ];
}

/** Right end of a box that is not extended: `len` bars after its start (but at least up to the last bar if it is still young). */
function endOf(i0: number, len: number): number {
  return i0 + Math.max(1, Math.floor(len));
}

/* ───────────── FVG ───────────── */

const KIND_LABEL = { fvg: "FVG", gap: "GAP", vi: "VI", ob: "OB" } as const;

function fvgOptions(p: Params): FvgOptions {
  return {
    lookback: N(p, "fvLookback"),
    minSize: N(p, "fvMinSize"),
    unit: S(p, "fvUnit") as SizeUnit,
    atrLen: N(p, "fvAtrLen"),
    mitigation: S(p, "fvMitigation") as Mitigation,
    shrink: B(p, "fvShrink"),
    gaps: B(p, "fvGaps"),
    volImb: B(p, "fvVi"),
  };
}

function paintZoneBoxes(sc: SeriesContext, zones: Zone[], o: { color: (z: Zone) => string; alpha: number; border: boolean; label: boolean; mid: boolean; extend: boolean; len: number }): void {
  const n = sc.candles.length;
  const boxes: Box[] = [];
  for (const z of zones) {
    const dead = z.i1 >= 0;
    let i1: number | null;
    if (dead) i1 = z.i1;
    else if (o.extend) i1 = null;
    else i1 = Math.min(n - 1, endOf(z.i0, o.len));
    boxes.push({
      i0: z.i0,
      i1,
      lo: z.lo,
      hi: z.hi,
      color: o.color(z),
      alpha: o.alpha,
      border: o.border,
      label: o.label ? KIND_LABEL[z.kind] : undefined,
      dim: dead,
      mid: o.mid && !dead,
    });
  }
  // mitigated first, live ones on top
  boxes.sort((a, b) => Number(!!b.dim) - Number(!!a.dim));
  paintBoxes(sc, boxes);
}

export const fvgDef: IndicatorDef = {
  id: "fvg",
  category: "liquidity",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "fair value gap fvg imbalance imbalances inefficiency gap volume imbalance opening gap smart money ict mitigation имбаланс имбалансы разрыв гэп неэффективность справедливой стоимости 失衡 缺口 公允价值缺口",
  params: [
    num("fvMinSize", 0.25, 0, 20, 0.05),
    sel("fvUnit", "atr", UNIT_OPTIONS),
    num("fvAtrLen", 14, 1, 200),
    sel("fvMitigation", "wick", MIT_OPTIONS),
    bool("fvShrink", true),
    bool("fvGaps", false),
    bool("fvVi", false),
    num("fvLookback", 1000, 50, 20000, 50),
    num("fvMax", 10, 1, 100),
    bool("fvShowMit", false),
    bool("fvExtend", true),
    num("fvLen", 25, 2, 500),
    bool("fvMid", true),
    bool("fvLabel", true),
    bool("fvBorder", true),
    num("fvOpacity", 18, 2, 80),
    col("fvColBull", "#26a69a"),
    col("fvColBear", "#ef5350"),
  ],
  paramGroup: groups(
    ["fvMinSize", "fvUnit", "fvAtrLen", "fvMitigation", "fvShrink", "fvGaps", "fvVi", "fvLookback"],
    ["fvMax", "fvShowMit", "fvExtend", "fvLen", "fvMid", "fvLabel", "fvBorder", "fvOpacity"],
  ),
  styleParams: ["fvColBull", "fvColBear"],
  title: (p) => `FVG ${N(p, "fvMinSize")} ${S(p, "fvUnit") === "pct" ? "%" : "ATR"}`,
  compute(cs, p) {
    const zones = selectZones(detectFvg(cs, fvgOptions(p)), N(p, "fvMax"), B(p, "fvShowMit"));
    return { plots: [], extra: { zones, lastClose: cs[cs.length - 1].c, prec: inferPrecision(cs) } satisfies ZoneExtra };
  },
  drawExtra(sc, p, res) {
    const e = zonesOf(res);
    if (!e) return;
    const up = S(p, "fvColBull");
    const dn = S(p, "fvColBear");
    paintZoneBoxes(sc, e.zones, {
      color: (z) => (z.dir > 0 ? up : dn),
      alpha: N(p, "fvOpacity") / 100,
      border: B(p, "fvBorder"),
      label: B(p, "fvLabel"),
      mid: B(p, "fvMid"),
      extend: B(p, "fvExtend"),
      len: N(p, "fvLen"),
    });
  },
  legendItems: (res, p) => zoneLegend(res, S(p, "fvColBull"), S(p, "fvColBear")),
  alertLevels: zoneAlertLevels,
};

/* ───────────── order blocks ───────────── */

function obOptions(p: Params): ObOptions {
  return { lookback: N(p, "obLookback"), impulse: N(p, "obImpulse"), atrLen: N(p, "obAtrLen"), within: N(p, "obWithin"), mitigation: S(p, "obMitigation") as Mitigation };
}

export const orderBlocksDef: IndicatorDef = {
  id: "order_blocks",
  category: "liquidity",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords: "order block ob smart money ict demand supply last opposite candle impulse ордер блок ордерблок зона спроса предложения 订单块",
  params: [
    num("obImpulse", 1.5, 0.3, 20, 0.1),
    num("obAtrLen", 14, 1, 200),
    num("obWithin", 3, 1, 20),
    sel("obMitigation", "close", MIT_OPTIONS),
    num("obLookback", 1000, 50, 20000, 50),
    num("obMax", 6, 1, 50),
    bool("obShowMit", false),
    bool("obExtend", true),
    num("obLen", 25, 2, 500),
    bool("obLabel", true),
    bool("obBorder", true),
    num("obOpacity", 20, 2, 80),
    col("obColBull", "#2196f3"),
    col("obColBear", "#ff7043"),
  ],
  paramGroup: groups(
    ["obImpulse", "obAtrLen", "obWithin", "obMitigation", "obLookback"],
    ["obMax", "obShowMit", "obExtend", "obLen", "obLabel", "obBorder", "obOpacity"],
  ),
  styleParams: ["obColBull", "obColBear"],
  title: (p) => `OB ${N(p, "obImpulse")} ATR`,
  compute(cs, p) {
    const zones = selectZones(detectOrderBlocks(cs, obOptions(p)), N(p, "obMax"), B(p, "obShowMit"));
    return { plots: [], extra: { zones, lastClose: cs[cs.length - 1].c, prec: inferPrecision(cs) } satisfies ZoneExtra };
  },
  drawExtra(sc, p, res) {
    const e = zonesOf(res);
    if (!e) return;
    const up = S(p, "obColBull");
    const dn = S(p, "obColBear");
    paintZoneBoxes(sc, e.zones, {
      color: (z) => (z.dir > 0 ? up : dn),
      alpha: N(p, "obOpacity") / 100,
      border: B(p, "obBorder"),
      label: B(p, "obLabel"),
      mid: false,
      extend: B(p, "obExtend"),
      len: N(p, "obLen"),
    });
  },
  legendItems: (res, p) => zoneLegend(res, S(p, "obColBull"), S(p, "obColBear")),
  alertLevels: zoneAlertLevels,
};

/* ───────────── liquidity pools ───────────── */

interface LiqExtra {
  pools: Pool[];
  lastClose: number;
  prec: number;
  nearBsl: number;
  nearSsl: number;
}

function liqOptions(p: Params): LiqOptions {
  return {
    lookback: N(p, "lqLookback"),
    pivot: N(p, "lqPivot"),
    tol: N(p, "lqTol"),
    unit: S(p, "lqUnit") as SizeUnit,
    atrLen: N(p, "lqAtrLen"),
    minTouches: N(p, "lqMinTouch"),
    sweep: S(p, "lqSweep") as "wick" | "close",
  };
}

function liqOf(res: IndResult | undefined): LiqExtra | null {
  const e = res?.extra as LiqExtra | undefined;
  return e && Array.isArray(e.pools) ? e : null;
}

function selectPools(all: Pool[], last: number, max: number, showSwept: boolean): { pools: Pool[]; nearBsl: number; nearSsl: number } {
  const m = Math.max(1, Math.floor(max));
  const live = all.filter((q) => q.swept < 0);
  const pick = (side: 1 | -1) =>
    live
      .filter((q) => q.side === side)
      .sort((a, b) => Math.abs(a.level - last) - Math.abs(b.level - last))
      .slice(0, m);
  const bsl = pick(1);
  const ssl = pick(-1);
  const out = [...bsl, ...ssl];
  if (showSwept) {
    const done = all
      .filter((q) => q.swept >= 0)
      .sort((a, b) => b.swept - a.swept)
      .slice(0, Math.min(12, m * 2));
    out.push(...done);
  }
  return { pools: out, nearBsl: bsl.length ? bsl[0].level : NaN, nearSsl: ssl.length ? ssl[0].level : NaN };
}

function paintPools(sc: SeriesContext, p: Params, res?: IndResult): void {
  const e = liqOf(res);
  if (!e || !e.pools.length) return;
  const { ctx } = sc;
  const W = sc.paneWidth;
  const H = sc.paneHeight;
  const n = sc.candles.length;
  const half = sc.barSpacing / 2;
  const cB = S(p, "lqColBsl");
  const cS = S(p, "lqColSsl");
  const cX = S(p, "lqColSwept");
  const alpha = N(p, "lqOpacity") / 100;
  const ext = B(p, "lqExtend");
  const len = N(p, "lqLen");
  const labels: Rect[] = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.font = `600 10px ${sc.options.fontFamily}`;
  ctx.textBaseline = "middle";
  // swept first, live on top
  const list = e.pools.slice().sort((a, b) => Number(b.swept >= 0) - Number(a.swept >= 0));
  for (const q of list) {
    const dead = q.swept >= 0;
    const color = dead ? cX : q.side > 0 ? cB : cS;
    const xa = sc.x(q.i0) - half;
    const iEnd = dead ? q.swept : ext ? null : Math.min(n - 1, endOf(q.iLast, len));
    const xb = iEnd === null ? W : sc.x(iEnd) + half;
    if (!finite(xa) || !finite(xb) || xb < 0 || xa > W) continue;
    const yL = sc.y(q.level);
    const yE = sc.y(q.edge);
    if (!finite(yL) || !finite(yE)) continue;
    if (yL < -4 || yL > H + 4) continue;
    const x0 = Math.max(0, xa);
    const x1 = Math.min(W, xb);
    if (x1 <= x0) continue;
    const k = dead ? 0.55 : 1;
    // the band of the cluster (between the extreme and the other edge), at least a hairline
    if (B(p, "lqBand")) {
      const top = Math.min(yL, yE);
      const h = Math.max(3, Math.abs(yL - yE) + 3);
      ctx.fillStyle = rgba(color, alpha * k);
      ctx.fillRect(x0, top - (h - Math.abs(yL - yE)) / 2, x1 - x0, h);
    }
    // the line at the extreme: where the stops rest
    const y = Math.round(yL) + 0.5;
    ctx.strokeStyle = rgba(color, dead ? 0.55 : 0.95);
    ctx.lineWidth = 1.2;
    ctx.setLineDash(dead ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // the swings of the cluster
    if (B(p, "lqPoints")) {
      ctx.fillStyle = rgba(color, dead ? 0.6 : 1);
      for (const pt of q.pts) {
        const x = sc.x(pt);
        if (x < -4 || x > W + 4) continue;
        const c = sc.candles[pt];
        const py = sc.y(q.side > 0 ? c.h : c.l);
        if (!finite(py)) continue;
        ctx.beginPath();
        ctx.arc(x, py, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // swept marker: a cross where the level was taken
    if (dead) {
      const x = sc.x(q.swept);
      if (x >= 0 && x <= W) {
        ctx.strokeStyle = rgba(cX, 0.95);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 3.5, y - 3.5);
        ctx.lineTo(x + 3.5, y + 3.5);
        ctx.moveTo(x + 3.5, y - 3.5);
        ctx.lineTo(x - 3.5, y + 3.5);
        ctx.stroke();
      }
    }
    if (B(p, "lqLabel")) {
      const text = `${q.side > 0 ? "BSL" : "SSL"}${q.pts.length > 1 ? " ×" + q.pts.length : ""}${dead ? " ✕" : ""}`;
      const tw = ctx.measureText(text).width;
      const lx = Math.min(x1 - 4, W - 4) - tw;
      const ly = q.side > 0 ? y - 8 : y + 9;
      if (lx > x0 && ly > 5 && ly < H - 4) {
        const r: Rect = { x: lx, y: ly - 6, w: tw, h: 12 };
        if (!labels.some((z) => overlap(z, r))) {
          labels.push(r);
          sc.labelBoxes?.push(r);
          ctx.fillStyle = rgba(color, dead ? 0.7 : 1);
          ctx.textAlign = "left";
          ctx.fillText(text, lx, ly + 0.5);
        }
      }
    }
  }
  ctx.restore();
}

export const liqPoolsDef: IndicatorDef = {
  id: "liq_pools",
  category: "liquidity",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "liquidity pools equal highs equal lows buy side sell side bsl ssl sweep stop hunt liquidity grab swing smart money ict ликвидность скопление ликвидности равные максимумы минимумы снятие ликвидности стопы 流动性 等高 等低",
  params: [
    num("lqPivot", 3, 1, 30),
    num("lqTol", 0.15, 0, 5, 0.01),
    sel("lqUnit", "atr", UNIT_OPTIONS),
    num("lqAtrLen", 14, 1, 200),
    num("lqMinTouch", 2, 1, 10),
    sel("lqSweep", "wick", SWEEP_OPTIONS),
    num("lqLookback", 1000, 50, 20000, 50),
    num("lqMax", 5, 1, 30),
    bool("lqShowSwept", true),
    bool("lqExtend", true),
    num("lqLen", 20, 2, 500),
    bool("lqBand", true),
    bool("lqPoints", true),
    bool("lqLabel", true),
    bool("lqAxis", true),
    num("lqOpacity", 14, 2, 80),
    col("lqColBsl", "#2962ff"),
    col("lqColSsl", "#ff9800"),
    col("lqColSwept", "#8e8e93"),
  ],
  paramGroup: groups(
    ["lqPivot", "lqTol", "lqUnit", "lqAtrLen", "lqMinTouch", "lqSweep", "lqLookback"],
    ["lqMax", "lqShowSwept", "lqExtend", "lqLen", "lqBand", "lqPoints", "lqLabel", "lqAxis", "lqOpacity"],
  ),
  styleParams: ["lqColBsl", "lqColSsl", "lqColSwept"],
  title: (p) => `Liquidity ${N(p, "lqPivot")} ${N(p, "lqTol")} ${S(p, "lqUnit") === "pct" ? "%" : "ATR"}`,
  compute(cs, p) {
    const last = cs[cs.length - 1].c;
    const sel2 = selectPools(detectLiquidity(cs, liqOptions(p)), last, N(p, "lqMax"), B(p, "lqShowSwept"));
    return { plots: [], extra: { pools: sel2.pools, lastClose: last, prec: inferPrecision(cs), nearBsl: sel2.nearBsl, nearSsl: sel2.nearSsl } satisfies LiqExtra };
  },
  drawExtra(sc, p, res) {
    paintPools(sc, p, res);
  },
  legendItems(res, p) {
    const e = liqOf(res);
    if (!e) return [];
    let b = 0;
    let s = 0;
    for (const q of e.pools) {
      if (q.swept >= 0) continue;
      if (q.side > 0) b++;
      else s++;
    }
    return [
      { text: `BSL ${b}`, color: S(p, "lqColBsl") },
      { text: `SSL ${s}`, color: S(p, "lqColSsl") },
    ];
  },
  axisFlags(res, p) {
    const e = liqOf(res);
    if (!e || !B(p, "lqAxis")) return [];
    const out: { price: number; color: string; caption?: string }[] = [];
    if (finite(e.nearBsl)) out.push({ price: e.nearBsl, color: S(p, "lqColBsl"), caption: "BSL" });
    if (finite(e.nearSsl)) out.push({ price: e.nearSsl, color: S(p, "lqColSsl"), caption: "SSL" });
    return out;
  },
  alertLevels(res) {
    const e = liqOf(res);
    return e ? e.pools.filter((q) => q.swept < 0).map((q) => q.level) : [];
  },
};

/* ───────────── high-volume nodes ───────────── */

interface HvnExtra {
  hvn: HvnResult | null;
  prec: number;
}

function hvnOptions(p: Params): HvnOptions {
  return { lookback: N(p, "hvLookback"), rows: N(p, "hvRows"), smooth: N(p, "hvSmooth"), top: N(p, "hvTop"), width: N(p, "hvWidth"), minVol: N(p, "hvMinVol") };
}

function hvnOf(res: IndResult | undefined): HvnExtra | null {
  const e = res?.extra as HvnExtra | undefined;
  return e && "hvn" in e ? e : null;
}

export const liqHvnDef: IndicatorDef = {
  id: "liq_hvn",
  category: "liquidity",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords:
    "high volume nodes hvn volume clusters liquidity zones volume profile poc accumulation acceptance зоны скопления объема кластеры объема ликвидность узлы объема 成交密集区 成交量节点",
  params: [
    num("hvLookback", 300, 20, 20000, 10),
    num("hvRows", 50, 10, 300),
    num("hvSmooth", 1, 0, 5),
    num("hvTop", 3, 1, 10),
    num("hvWidth", 60, 20, 95, 5),
    num("hvMinVol", 40, 5, 100, 5),
    bool("hvExtend", true),
    bool("hvPoc", true),
    bool("hvLabel", true),
    bool("hvAxis", true),
    bool("hvBorder", true),
    num("hvOpacity", 16, 2, 80),
    col("hvCol", "#7e57c2"),
    col("hvColPoc", "#fbc02d"),
  ],
  paramGroup: groups(
    ["hvLookback", "hvRows", "hvSmooth", "hvTop", "hvWidth", "hvMinVol"],
    ["hvExtend", "hvPoc", "hvLabel", "hvAxis", "hvBorder", "hvOpacity"],
  ),
  styleParams: ["hvCol", "hvColPoc"],
  title: (p) => `HVN ${N(p, "hvLookback")} ${N(p, "hvTop")}`,
  compute(cs, p) {
    return { plots: [], extra: { hvn: detectHvn(cs, hvnOptions(p)), prec: inferPrecision(cs) } satisfies HvnExtra };
  },
  drawExtra(sc, p, res) {
    const e = hvnOf(res);
    const h = e?.hvn;
    if (!e || !h) return;
    const boxes: Box[] = h.nodes.map((nd) => ({
      i0: h.a,
      i1: B(p, "hvExtend") ? null : h.b,
      lo: nd.lo,
      hi: nd.hi,
      color: S(p, "hvCol"),
      alpha: N(p, "hvOpacity") / 100,
      border: B(p, "hvBorder"),
      label: B(p, "hvLabel") ? `HVN ${nd.rank} · ${nd.share.toFixed(nd.share < 10 ? 1 : 0)}%` : undefined,
    }));
    paintBoxes(sc, boxes);
    if (B(p, "hvPoc")) {
      const { ctx } = sc;
      const x0 = Math.max(0, sc.x(h.a) - sc.barSpacing / 2);
      const x1 = B(p, "hvExtend") ? sc.paneWidth : Math.min(sc.paneWidth, sc.x(h.b) + sc.barSpacing / 2);
      const y = Math.round(sc.y(h.poc)) + 0.5;
      if (finite(y) && x1 > x0 && y > -2 && y < sc.paneHeight + 2) {
        ctx.save();
        ctx.strokeStyle = rgba(S(p, "hvColPoc"), 0.95);
        ctx.lineWidth = 1.3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.restore();
      }
    }
  },
  legendItems(res, p, locale) {
    const e = hvnOf(res);
    const h = e?.hvn;
    if (!e || !h) return [];
    return [{ text: `POC ${formatPrice(h.poc, e.prec, locale)}`, color: S(p, "hvColPoc") }];
  },
  axisFlags(res, p) {
    const h = hvnOf(res)?.hvn;
    if (!h || !B(p, "hvAxis")) return [];
    return [{ price: h.poc, color: S(p, "hvColPoc"), caption: "HVN POC" }];
  },
  alertLevels(res) {
    const h = hvnOf(res)?.hvn;
    if (!h) return [];
    const out = [h.poc];
    for (const nd of h.nodes) out.push(nd.hi, nd.lo);
    return out;
  },
};

/* ───────────── delta imbalance (approximate) ───────────── */

function deltaOptions(p: Params): DeltaOptions {
  return { ratio: N(p, "dlRatio"), stack: N(p, "dlStack"), volMult: N(p, "dlVolMult"), maLen: N(p, "dlMaLen") };
}

export const deltaImbDef: IndicatorDef = {
  id: "delta_imb",
  category: "liquidity",
  pane: "own",
  paneRatio: 0.18,
  fmt: "vol",
  keywords:
    "delta imbalance stacked imbalance order flow aggressive buyers sellers approximate candle delta дельта имбаланс стек имбалансов приблизительно кластерный анализ 增量失衡",
  params: [num("dlRatio", 0.6, 0.1, 1, 0.05), num("dlStack", 3, 2, 10), num("dlVolMult", 1, 0, 5, 0.1), num("dlMaLen", 20, 2, 200), col("dlColBuy", "#26a69a"), col("dlColSell", "#ef5350"), col("dlColStack", "#fbc02d")],
  paramGroup: groups(["dlRatio", "dlStack", "dlVolMult", "dlMaLen"], []),
  title: (p) => `Δ imb ≈ ${N(p, "dlRatio")} ×${N(p, "dlStack")}`,
  compute(cs, p) {
    const r = detectDeltaImbalance(cs, deltaOptions(p));
    const buy = S(p, "dlColBuy");
    const sell = S(p, "dlColSell");
    const stack = S(p, "dlColStack");
    const dimBuy = mix(buy, "#9aa0a6", 0.6);
    const dimSell = mix(sell, "#9aa0a6", 0.6);
    const n = cs.length;
    const colors = new Array<string>(n);
    for (let i = 0; i < n; i++) {
      if (r.stacked[i]) colors[i] = stack;
      else if (r.imb[i] > 0) colors[i] = buy;
      else if (r.imb[i] < 0) colors[i] = sell;
      else colors[i] = r.delta[i] >= 0 ? dimBuy : dimSell;
    }
    const plot: PlotSpec = { key: "Delta ≈", data: r.delta, kind: "hist", color: buy, colors, alpha: 0.9, flag: false, fmt: "vol", colorParams: ["dlColBuy", "dlColSell", "dlColStack"] };
    return { plots: [plot], levels: [{ value: 0, color: "rgba(120,123,134,0.5)", dashed: true, name: "ind2.lvl.zero" }], extra: { stacked: r.stacked, imb: r.imb } };
  },
  legendItems(res, p) {
    const ex = res.extra as { imb: Int8Array } | undefined;
    const out: { text: string; color: string }[] = [{ text: indT("ind.dl.approx", "approx. (from candles)"), color: "#f5a623" }];
    if (ex && ex.imb.length) {
      const s = ex.imb[ex.imb.length - 1];
      if (s !== 0) out.push({ text: s > 0 ? indT("ind.dl.buyImb", "buy imbalance") : indT("ind.dl.sellImb", "sell imbalance"), color: S(p, s > 0 ? "dlColBuy" : "dlColSell") });
    }
    return out;
  },
};

export const LIQUIDITY_DEFS: IndicatorDef[] = [fvgDef, liqPoolsDef, liqHvnDef, orderBlocksDef, deltaImbDef];

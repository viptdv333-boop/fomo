import type { Candle, SeriesContext } from "../types";
import type { IndEnv, IndicatorDef, IndResult, ParamDef, Params } from "./registry";
import type { OrderFlowStore } from "../orderflow/store";
import { formatPrice } from "../format";
import { indT } from "./ind-text";
import {
  DEFAULT_VP_OPTS,
  buildVp,
  developingVp,
  highVolumeZones,
  lowVolumeGaps,
  profileLevels,
  resolveVpRange,
  volumeMa,
  type VpDeveloping,
  type VpLevels,
  type VpOpts,
  type VpProfile,
  type VpRangeMode,
  type VpRangeSpec,
  type VpZone,
} from "../analysis/vprofile";

/* Volume Profile (configurable): one indicator for the visible range, the last N bars, a fixed bar range, the current session or
   everything since an anchor. The histogram, the level lines (Profile High, VAH, POC, VAL, Profile Low), supply / demand zones and
   gaps are painted here; the statistics table, the draggable range edges and the anchor placement are an overlay layer
   (orderflow/vpro-layer.ts) that shares the profile through getVpView() below. Maths: analysis/vprofile.ts. */

/* ───────────── parameter schema ───────────── */

type Opt = { value: string; label: string };
const o = (value: string, label: string): Opt => ({ value, label });

const G = {
  range: "ind.vp.g.range",
  profile: "ind.vp.g.profile",
  shape: "ind.vp.g.shape",
  levels: "ind.vp.g.levels",
  zones: "ind.vp.g.zones",
  table: "ind.vp.g.table",
  rows: "ind.vp.g.rows",
  colors: "ind.vp.g.colors",
} as const;

const PARAMS: ParamDef[] = [];
const GROUP_OF: Record<string, string> = {};
const COLOR_KEYS: string[] = [];

function add(group: string, p: ParamDef): void {
  PARAMS.push(p);
  GROUP_OF[p.key] = group;
  if (p.type === "color") COLOR_KEYS.push(p.key);
}
const num = (g: string, key: string, def: number, min: number, max: number, step = 1) => add(g, { key, type: "number", min, max, step, default: def });
const sel = (g: string, key: string, def: string, options: Opt[]) => add(g, { key, type: "select", options, default: def });
const bool = (g: string, key: string, def: boolean) => add(g, { key, type: "boolean", default: def });
const col = (g: string, key: string, def: string) => add(g, { key, type: "color", default: def });
const txt = (g: string, key: string, def: string) => add(g, { key, type: "text", default: def });

/* range */
sel(G.range, "vpRange", "lastN", [
  o("visible", "ind.vp.o.visible"),
  o("lastN", "ind.vp.o.lastN"),
  o("fixed", "ind.vp.o.fixed"),
  o("session", "ind.vp.o.session"),
  o("anchor", "ind.vp.o.anchor"),
]);
num(G.range, "vpLastN", 360, 2, 100000);
num(G.range, "vpFromBack", 200, 0, 1000000);
num(G.range, "vpToBack", 0, 0, 1000000);
txt(G.range, "vpFromIso", "");
txt(G.range, "vpToIso", "");
sel(G.range, "vpSession", "day", [o("day", "ind.o.day"), o("week", "ind.o.week"), o("month", "ind.o.month")]);
num(G.range, "vpAnchorTime", 0, 0, 4e12);
bool(G.range, "vpHandles", true);

/* profile */
sel(G.profile, "vpRowMode", "rows", [o("rows", "ind.of.o.rows"), o("ticks", "ind.of.o.ticks"), o("price", "ind.vp.o.rowPrice"), o("percent", "ind.vp.o.rowPct")]);
num(G.profile, "vpRows", 100, 2, 500);
num(G.profile, "vpRowTicks", 1, 1, 5000);
num(G.profile, "vpRowPrice", 1, 0.000001, 1e7, 0.01);
num(G.profile, "vpRowPct", 0.1, 0.005, 50, 0.005);
num(G.profile, "vpVaPct", 70, 1, 100);
sel(G.profile, "vpSource", "updown", [o("all", "ind.vp.o.srcAll"), o("updown", "ind.vp.o.srcUpDown"), o("delta", "ind.vp.o.srcDelta")]);
sel(G.profile, "vpPolarity", "bar", [o("bar", "ind.vp.o.polBar"), o("portion", "ind.vp.o.polPortion")]);
bool(G.profile, "vpUseFlow", true);
num(G.profile, "vpSmooth", 0, 0, 10);

/* histogram */
bool(G.shape, "vpShowHist", true);
sel(G.shape, "vpPlacement", "right", [o("right", "ind2.o.right"), o("left", "ind2.o.left"), o("start", "ind.vp.o.plStart"), o("end", "ind.vp.o.plEnd")]);
sel(G.shape, "vpWidthMode", "pct", [o("pct", "ind.vp.o.wPct"), o("px", "ind.vp.o.wPx")]);
num(G.shape, "vpWidthPct", 30, 3, 100);
num(G.shape, "vpWidthPx", 160, 20, 1500);
num(G.shape, "vpOffset", 2, -600, 600);
bool(G.shape, "vpMirror", false);
bool(G.shape, "vpGradient", false);
bool(G.shape, "vpWeighted", false);
num(G.shape, "vpAlphaVa", 62, 5, 100);
num(G.shape, "vpAlphaOut", 28, 0, 100);
bool(G.shape, "vpOutline", false);
num(G.shape, "vpOutlineW", 1, 0.5, 4, 0.5);
bool(G.shape, "vpPocBar", true);

/* levels */
const LEVELS = [
  { k: "High", show: false, color: "#868993", w: 1, style: "dashed" },
  { k: "Vah", show: true, color: "#2962ff", w: 2, style: "solid" },
  { k: "Poc", show: true, color: "#f23645", w: 2, style: "solid" },
  { k: "Val", show: true, color: "#2962ff", w: 2, style: "solid" },
  { k: "Low", show: false, color: "#868993", w: 1, style: "dashed" },
] as const;
export const VP_LEVEL_KEYS = LEVELS.map((l) => l.k);
for (const L of LEVELS) {
  bool(G.levels, `vp${L.k}Show`, L.show);
  num(G.levels, `vp${L.k}W`, L.w, 1, 6);
  sel(G.levels, `vp${L.k}Style`, L.style, [o("solid", "ind2.ls.solid"), o("dashed", "ind2.ls.dashed"), o("dotted", "ind2.ls.dotted")]);
  sel(G.levels, `vp${L.k}Ext`, "range", [o("range", "ind.vp.o.extRange"), o("right", "ind.of.o.extRight"), o("full", "ind.of.o.extFull"), o("profile", "ind.of.o.extProfile")]);
  bool(G.levels, `vp${L.k}Flag`, true);
  bool(G.levels, `vp${L.k}Lbl`, true);
}
sel(G.levels, "vpPocMode", "last", [o("last", "ind.vp.o.pocLast"), o("developing", "ind.vp.o.pocDev"), o("both", "ind.vp.o.pocBoth")]);
bool(G.levels, "vpDevVa", false);
bool(G.levels, "vpLevelLbls", true);
sel(G.levels, "vpLblSize", "small", [o("tiny", "ind.vp.o.szTiny"), o("small", "ind.vp.o.szSmall"), o("normal", "ind.vp.o.szNormal"), o("large", "ind.vp.o.szLarge")]);

/* sentiment, zones, gaps */
bool(G.zones, "vpSent", false);
bool(G.zones, "vpSd", false);
num(G.zones, "vpSdThr", 15, 0, 100);
bool(G.zones, "vpGaps", false);
num(G.zones, "vpNodePct", 7, 0, 100);
num(G.zones, "vpZoneAlpha", 16, 3, 70);

/* table */
bool(G.table, "vpTable", true);
sel(G.table, "vpTblPos", "tr", [o("tr", "ind.vp.o.posTr"), o("tl", "ind.vp.o.posTl"), o("br", "ind.vp.o.posBr"), o("bl", "ind.vp.o.posBl")]);
sel(G.table, "vpTblSize", "small", [o("tiny", "ind.vp.o.szTiny"), o("small", "ind.vp.o.szSmall"), o("normal", "ind.vp.o.szNormal"), o("large", "ind.vp.o.szLarge")]);
bool(G.table, "vpTblCompact", false);
num(G.table, "vpTblAlpha", 88, 10, 100);
bool(G.table, "vpTblAuto", true);
bool(G.table, "vpTblCollapsed", false);

/* table rows */
for (const k of ["High", "Vah", "Poc", "Val", "Low", "Total", "Avg", "Ma", "Bars", "From", "Delta", "Buy"]) bool(G.rows, `vpR${k}`, true);
num(G.rows, "vpMaLen", 21, 1, 500);

/* colours */
col(G.colors, "vpColUp", "#2962ff");
col(G.colors, "vpColDown", "#ff9800");
col(G.colors, "vpColVaUp", "#2962ff");
col(G.colors, "vpColVaDown", "#ff9800");
col(G.colors, "vpColNeutral", "#2962ff");
col(G.colors, "vpColOutline", "#9598a1");
col(G.colors, "vpColBull", "#26a69a");
col(G.colors, "vpColBear", "#ef5350");
col(G.colors, "vpColSupply", "#f23645");
col(G.colors, "vpColDemand", "#2962ff");
col(G.colors, "vpColGap", "#ff9800");
col(G.colors, "vpTblBg", "#2a2e39");
col(G.colors, "vpTblText", "#d1d4dc");
col(G.colors, "vpTblBorder", "#5d606b");
for (const L of LEVELS) col(G.levels, `vp${L.k}Col`, L.color);

/* ───────────── typed parameters ───────────── */

type LineStyle = "solid" | "dashed" | "dotted";
type Ext = "range" | "right" | "full" | "profile";
type Size = "tiny" | "small" | "normal" | "large";

export interface LevelCfg {
  key: string;
  show: boolean;
  color: string;
  width: number;
  style: LineStyle;
  ext: Ext;
  flag: boolean;
  label: boolean;
}

export interface VpCfg {
  range: VpRangeMode;
  lastN: number;
  fromBack: number;
  toBack: number;
  fromIso: string;
  toIso: string;
  session: "day" | "week" | "month";
  anchorTime: number;
  handles: boolean;
  opts: VpOpts;
  source: "all" | "updown" | "delta";
  showHist: boolean;
  placement: "left" | "right" | "start" | "end";
  widthMode: "pct" | "px";
  widthPct: number;
  widthPx: number;
  offset: number;
  mirror: boolean;
  gradient: boolean;
  weighted: boolean;
  alphaVa: number;
  alphaOut: number;
  outline: boolean;
  outlineW: number;
  pocBar: boolean;
  levels: LevelCfg[];
  pocMode: "last" | "developing" | "both";
  devVa: boolean;
  levelLbls: boolean;
  lblSize: Size;
  sent: boolean;
  sd: boolean;
  sdThr: number;
  gaps: boolean;
  nodePct: number;
  zoneAlpha: number;
  table: boolean;
  tblPos: "tr" | "tl" | "br" | "bl";
  tblSize: Size;
  tblCompact: boolean;
  tblAlpha: number;
  tblAuto: boolean;
  tblCollapsed: boolean;
  rows: Record<string, boolean>;
  maLen: number;
  c: Record<string, string>;
}

const N = (p: Params, k: string, d: number) => (typeof p[k] === "number" && isFinite(p[k] as number) ? (p[k] as number) : d);
const S = (p: Params, k: string, d: string) => (typeof p[k] === "string" ? (p[k] as string) : d);
const B = (p: Params, k: string, d: boolean) => (typeof p[k] === "boolean" ? (p[k] as boolean) : d);

const cfgCache = new WeakMap<Params, VpCfg>();

export function readVpCfg(p: Params): VpCfg {
  const hit = cfgCache.get(p);
  if (hit) return hit;
  const levels: LevelCfg[] = LEVELS.map((L) => ({
    key: L.k,
    show: B(p, `vp${L.k}Show`, L.show),
    color: S(p, `vp${L.k}Col`, L.color),
    width: N(p, `vp${L.k}W`, L.w),
    style: S(p, `vp${L.k}Style`, L.style) as LineStyle,
    ext: S(p, `vp${L.k}Ext`, "range") as Ext,
    flag: B(p, `vp${L.k}Flag`, true),
    label: B(p, `vp${L.k}Lbl`, true),
  }));
  const rows: Record<string, boolean> = {};
  for (const k of ["High", "Vah", "Poc", "Val", "Low", "Total", "Avg", "Ma", "Bars", "From", "Delta", "Buy"]) rows[k] = B(p, `vpR${k}`, true);
  const c: Record<string, string> = {};
  for (const k of COLOR_KEYS) c[k] = S(p, k, "#2962ff");
  const cfg: VpCfg = {
    range: S(p, "vpRange", "lastN") as VpRangeMode,
    lastN: N(p, "vpLastN", 360),
    fromBack: N(p, "vpFromBack", 200),
    toBack: N(p, "vpToBack", 0),
    fromIso: S(p, "vpFromIso", ""),
    toIso: S(p, "vpToIso", ""),
    session: S(p, "vpSession", "day") as VpCfg["session"],
    anchorTime: N(p, "vpAnchorTime", 0),
    handles: B(p, "vpHandles", true),
    opts: {
      ...DEFAULT_VP_OPTS,
      rowMode: S(p, "vpRowMode", "rows") as VpOpts["rowMode"],
      rows: N(p, "vpRows", 100),
      rowTicks: N(p, "vpRowTicks", 1),
      rowPrice: N(p, "vpRowPrice", 1),
      rowPct: N(p, "vpRowPct", 0.1),
      valueArea: N(p, "vpVaPct", 70),
      useFlow: B(p, "vpUseFlow", true),
      polarity: S(p, "vpPolarity", "bar") as VpOpts["polarity"],
      smooth: Math.round(N(p, "vpSmooth", 0)),
    },
    source: S(p, "vpSource", "updown") as VpCfg["source"],
    showHist: B(p, "vpShowHist", true),
    placement: S(p, "vpPlacement", "right") as VpCfg["placement"],
    widthMode: S(p, "vpWidthMode", "pct") as VpCfg["widthMode"],
    widthPct: N(p, "vpWidthPct", 30),
    widthPx: N(p, "vpWidthPx", 160),
    offset: N(p, "vpOffset", 2),
    mirror: B(p, "vpMirror", false),
    gradient: B(p, "vpGradient", false),
    weighted: B(p, "vpWeighted", false),
    alphaVa: N(p, "vpAlphaVa", 62) / 100,
    alphaOut: N(p, "vpAlphaOut", 28) / 100,
    outline: B(p, "vpOutline", false),
    outlineW: N(p, "vpOutlineW", 1),
    pocBar: B(p, "vpPocBar", true),
    levels,
    pocMode: S(p, "vpPocMode", "last") as VpCfg["pocMode"],
    devVa: B(p, "vpDevVa", false),
    levelLbls: B(p, "vpLevelLbls", true),
    lblSize: S(p, "vpLblSize", "small") as Size,
    sent: B(p, "vpSent", false),
    sd: B(p, "vpSd", false),
    sdThr: N(p, "vpSdThr", 15),
    gaps: B(p, "vpGaps", false),
    nodePct: N(p, "vpNodePct", 7),
    zoneAlpha: N(p, "vpZoneAlpha", 16) / 100,
    table: B(p, "vpTable", true),
    tblPos: S(p, "vpTblPos", "tr") as VpCfg["tblPos"],
    tblSize: S(p, "vpTblSize", "small") as Size,
    tblCompact: B(p, "vpTblCompact", false),
    tblAlpha: N(p, "vpTblAlpha", 88) / 100,
    tblAuto: B(p, "vpTblAuto", true),
    tblCollapsed: B(p, "vpTblCollapsed", false),
    rows,
    maLen: N(p, "vpMaLen", 21),
    c,
  };
  cfgCache.set(p, cfg);
  return cfg;
}

export const SIZE_PX: Record<Size, number> = { tiny: 9, small: 10.5, normal: 12, large: 14 };

/* ───────────── the shared view (profile + stats) ───────────── */

export interface VpStats {
  total: number;
  bars: number;
  avg: number;
  ma: number;
  /** "real": every bar from trades; "approx": candle estimate; "mixed". */
  kind: "real" | "approx" | "mixed";
  realPct: number;
  delta: number;
  buyPct: number;
  /** Exchange of the trades ("bybit" / "moex" / ""), for the table. */
  source: string;
  delayed: boolean;
}

export interface VpView {
  range: [number, number];
  prof: VpProfile;
  levels: VpLevels;
  stats: VpStats;
  /** Decimals of the instrument's price. */
  dec: number;
  supply: VpZone[];
  demand: VpZone[];
  gaps: VpZone[];
  /** Developing POC / VA, built on demand. */
  dev: VpDeveloping | null;
  devKey: string;
  cs: Candle[];
  flow: OrderFlowStore | null | undefined;
  opts: VpOpts;
  /** Changes whenever the numbers a legend shows change. */
  legendSig: string;
}

interface MemoEntry {
  data: string;
  cs: Candle[];
  view: VpView | null;
}
const memo = new Map<string, MemoEntry>();

function tickOf(flow: OrderFlowStore | null | undefined, precision: number): number {
  if (flow && flow.nativeTick > 0) return flow.nativeTick;
  if (flow && flow.precision >= 0) return Math.pow(10, -flow.precision);
  return Math.pow(10, -precision);
}

function paramSig(cfg: VpCfg): string {
  const o = cfg.opts;
  return [cfg.range, cfg.lastN, cfg.fromBack, cfg.toBack, cfg.fromIso, cfg.toIso, cfg.session, cfg.anchorTime, o.rowMode, o.rows, o.rowTicks, o.rowPrice, o.rowPct, o.valueArea, o.useFlow, o.polarity, o.smooth, cfg.sd ? cfg.sdThr : "-", cfg.gaps ? cfg.nodePct : "-", cfg.maLen].join("|");
}

/**
 * The profile of an indicator instance for the current data (cached: recomputed only when the range, the parameters or the data
 * change). `vis` is the engine's visible bar range; null when the caller does not know it (then "visible" gives no view).
 */
export function getVpView(p: Params, cs: Candle[], flow: OrderFlowStore | null | undefined, vis: { from: number; to: number } | null, precision = 2): VpView | null {
  const n = cs.length;
  if (n === 0) return null;
  const cfg = readVpCfg(p);
  if (cfg.range === "visible" && !vis) return null;
  const spec: VpRangeSpec = {
    mode: cfg.range,
    lastN: cfg.lastN,
    fromBack: cfg.fromBack,
    toBack: cfg.toBack,
    fromIso: cfg.fromIso,
    toIso: cfg.toIso,
    session: cfg.session,
    anchorTime: cfg.anchorTime,
    visFrom: vis ? Math.max(0, vis.from) : 0,
    visTo: vis ? Math.min(n - 1, vis.to) : n - 1,
    wallShift: flow?.wallShiftMs ?? 0,
  };
  const key = paramSig(cfg);
  const last = cs[n - 1];
  const data = `${n}|${cs[0].t}|${last.t}|${last.c}|${last.h}|${last.l}|${last.v}|${flow?.version ?? 0}|${flow?.tick ?? 0}|${flow?.avail ?? ""}|${spec.wallShift}|${spec.visFrom}|${spec.visTo}|${precision}`;
  const hit = memo.get(key);
  if (hit && hit.data === data && hit.cs === cs) return hit.view;
  let view: VpView | null = null;
  try {
    view = compute(cfg, spec, cs, flow, precision);
  } catch {
    view = null;
  }
  if (memo.size > 24) memo.delete(memo.keys().next().value as string);
  memo.delete(key);
  memo.set(key, { data, cs, view });
  return view;
}

function compute(cfg: VpCfg, spec: VpRangeSpec, cs: Candle[], flow: OrderFlowStore | null | undefined, precision: number): VpView | null {
  const r = resolveVpRange(cs, spec);
  if (!r) return null;
  const opts: VpOpts = { ...cfg.opts, tickSize: tickOf(flow, precision) };
  const prof = buildVp(cs, r[0], r[1], flow, opts);
  if (!prof) return null;
  const levels = profileLevels(prof);
  const kind = prof.realBars === 0 ? "approx" : prof.approxBars === 0 ? "real" : "mixed";
  const rb = prof.realBuy + prof.realSell;
  const stats: VpStats = {
    total: prof.total,
    bars: prof.bars,
    avg: prof.total / Math.max(1, prof.bars),
    ma: volumeMa(cs, r[1], cfg.maLen),
    kind,
    realPct: prof.realBars + prof.approxBars > 0 ? (prof.realBars / (prof.realBars + prof.approxBars)) * 100 : 0,
    delta: prof.realBuy - prof.realSell,
    buyPct: rb > 0 ? (prof.realBuy / rb) * 100 : NaN,
    source: flow?.sourceName ?? "",
    delayed: !!flow?.delayed,
  };
  const close = cs[r[1]].c;
  const supply: VpZone[] = [];
  const demand: VpZone[] = [];
  if (cfg.sd) for (const z of highVolumeZones(prof, cfg.sdThr)) ((z.lo + z.hi) / 2 >= close ? supply : demand).push(z);
  const gaps = cfg.gaps ? lowVolumeGaps(prof, cfg.nodePct) : [];
  const dec = flow && flow.precision >= 0 ? flow.precision : precision;
  const legendSig = `${levels.poc}|${levels.vah}|${levels.val}|${kind}|${cfg.opts.valueArea}`;
  return { range: r, prof, levels, stats, dec, supply, demand, gaps, dev: null, devKey: "", cs, flow, opts, legendSig };
}

/** Developing POC (and VA) of the view, built once per view. */
export function developingOf(view: VpView, withVa: boolean): VpDeveloping {
  const key = withVa ? "va" : "poc";
  if (view.dev && (view.devKey === "va" || view.devKey === key)) return view.dev;
  view.dev = developingVp(view.cs, view.range[0], view.range[1], view.flow, view.prof.grid, view.opts, withVa);
  view.devKey = key;
  return view.dev;
}

/* ───────────── alert hook ───────────── */

/** State kept in IndResult.extra. */
export interface VpState {
  view: VpView | null;
}

/** Price levels worth an alert (POC, VAH, VAL) of an indicator result or a view. Data only. */
export function vpAlertLevels(res: IndResult | VpView | null | undefined): number[] {
  if (!res) return [];
  const view: VpView | null | undefined = "levels" in res && "prof" in res ? (res as VpView) : ((res as IndResult).extra as VpState | undefined)?.view;
  if (!view) return [];
  const L = view.levels;
  return [L.poc, L.vah, L.val].filter((v) => typeof v === "number" && isFinite(v));
}

/* ───────────── painting ───────────── */

function rgba(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, a))})`;
}

export interface VpGeom {
  /** Left / right edge of the histogram band. */
  bL: number;
  bR: number;
  /** x the bars grow from and the direction. */
  x0: number;
  dir: 1 | -1;
  maxW: number;
  /** Horizontal span of the profile's bar range. */
  xA: number;
  xB: number;
}

/** Where the histogram sits. `xA` / `xB` are the screen x of the range edges (unclipped). */
export function vpGeometry(cfg: VpCfg, paneW: number, xA: number, xB: number): VpGeom {
  const cA = Math.max(0, xA);
  const cB = Math.min(paneW, xB);
  const ref = cfg.placement === "left" || cfg.placement === "right" ? paneW : Math.max(20, cB - cA);
  let maxW = cfg.widthMode === "px" ? cfg.widthPx : (ref * cfg.widthPct) / 100;
  maxW = Math.max(8, Math.min(maxW, Math.max(8, paneW * 1.5)));
  const off = cfg.offset;
  let bL: number;
  let dir: 1 | -1;
  if (cfg.placement === "left") {
    bL = off;
    dir = 1;
  } else if (cfg.placement === "right") {
    bL = paneW - off - maxW;
    dir = -1;
  } else if (cfg.placement === "start") {
    bL = cA + off;
    dir = 1;
  } else {
    bL = cB - off - maxW;
    dir = -1;
  }
  const bR = bL + maxW;
  let x0 = dir === 1 ? bL : bR;
  if (cfg.mirror) {
    dir = (dir === 1 ? -1 : 1) as 1 | -1;
    x0 = dir === 1 ? bL : bR;
  }
  return { bL, bR, x0, dir, maxW, xA, xB };
}

function dashOf(style: LineStyle, w: number): number[] {
  if (style === "dashed") return [w * 3 + 3, w * 2 + 3];
  if (style === "dotted") return [0.1, w * 2 + 2.5];
  return [];
}

function lblFont(sc: SeriesContext, size: Size): string {
  return `600 ${SIZE_PX[size]}px ${sc.options.fontFamily || "Inter, system-ui, sans-serif"}`;
}

function levelValue(L: VpLevels, key: string): number {
  return key === "High" ? L.high : key === "Vah" ? L.vah : key === "Poc" ? L.poc : key === "Val" ? L.val : L.low;
}

export function levelName(key: string): string {
  switch (key) {
    case "High":
      return indT("vp.s.high", "High");
    case "Vah":
      return "VAH";
    case "Poc":
      return "POC";
    case "Val":
      return "VAL";
    default:
      return indT("vp.s.low", "Low");
  }
}

function paintZones(sc: SeriesContext, cfg: VpCfg, v: VpView, xA: number, xB: number) {
  const { ctx } = sc;
  const x1 = Math.max(0, xA);
  const x2 = Math.min(sc.paneWidth, xB);
  if (x2 <= x1) return;
  const draw = (zs: VpZone[], color: string) => {
    ctx.fillStyle = rgba(color, cfg.zoneAlpha);
    for (const z of zs) {
      const y1 = sc.y(z.hi);
      const y2 = sc.y(z.lo);
      const top = Math.min(y1, y2);
      const h = Math.max(1, Math.abs(y2 - y1));
      if (top > sc.paneHeight || top + h < 0) continue;
      ctx.fillRect(x1, top, x2 - x1, h);
    }
  };
  ctx.save();
  draw(v.supply, cfg.c.vpColSupply);
  draw(v.demand, cfg.c.vpColDemand);
  draw(v.gaps, cfg.c.vpColGap);
  ctx.restore();
}

function paintHistogram(sc: SeriesContext, cfg: VpCfg, v: VpView, g: VpGeom) {
  const { ctx } = sc;
  const prof = v.prof;
  const maxDelta = cfg.source === "delta" ? prof.rows.reduce((m, r) => Math.max(m, Math.abs(r.up - r.down)), 0) : 0;
  const scale = cfg.source === "delta" ? (maxDelta > 0 ? maxDelta : 1) : prof.max;
  ctx.save();
  ctx.setLineDash([]);
  for (let k = 0; k < prof.rows.length; k++) {
    const r = prof.rows[k];
    const yTop = sc.y(r.hi);
    const yBot = sc.y(r.lo);
    const full = Math.abs(yBot - yTop);
    const h = Math.max(1, full - (full > 3 ? 1 : 0));
    const top = Math.min(yTop, yBot) + (full > 3 ? 0.5 : 0);
    if (top > sc.paneHeight || top + h < 0) continue;
    const tot = r.up + r.down;
    if (!(tot > 0)) continue;
    const inVa = k >= prof.vaLo && k <= prof.vaHi;
    let a = inVa ? cfg.alphaVa : cfg.alphaOut;
    if (cfg.weighted) a *= 0.35 + 0.65 * (tot / prof.max);
    const isPoc = cfg.pocBar && k === prof.poc;
    const pocColor = cfg.levels[2].color;
    const seg = (from: number, w: number, color: string, alpha: number) => {
      if (w < 0.3) return;
      const x = g.dir === 1 ? from : from - w;
      if (cfg.gradient) {
        const gr = ctx.createLinearGradient(g.dir === 1 ? x : x + w, 0, g.dir === 1 ? x + w : x, 0);
        gr.addColorStop(0, rgba(color, alpha));
        gr.addColorStop(1, rgba(color, alpha * 0.3));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = rgba(color, alpha);
      ctx.fillRect(x, top, w, h);
    };
    let wTot: number;
    if (cfg.source === "all") {
      wTot = (tot / scale) * g.maxW;
      seg(g.x0, wTot, isPoc ? pocColor : cfg.c.vpColNeutral, isPoc ? Math.max(a, 0.85) : a);
    } else if (cfg.source === "updown") {
      const wu = (r.up / scale) * g.maxW;
      const wd = (r.down / scale) * g.maxW;
      wTot = wu + wd;
      if (isPoc) seg(g.x0, wTot, pocColor, Math.max(a, 0.85));
      else {
        seg(g.x0, wu, inVa ? cfg.c.vpColVaUp : cfg.c.vpColUp, a);
        seg(g.x0 + g.dir * wu, wd, inVa ? cfg.c.vpColVaDown : cfg.c.vpColDown, a);
      }
    } else {
      const d = r.up - r.down;
      wTot = (Math.abs(d) / scale) * g.maxW;
      seg(g.x0, wTot, isPoc ? pocColor : d >= 0 ? (inVa ? cfg.c.vpColVaUp : cfg.c.vpColUp) : inVa ? cfg.c.vpColVaDown : cfg.c.vpColDown, isPoc ? Math.max(a, 0.85) : a);
    }
    if (cfg.outline && wTot >= 0.5) {
      ctx.strokeStyle = rgba(cfg.c.vpColOutline, 0.9);
      ctx.lineWidth = cfg.outlineW;
      const x = g.dir === 1 ? g.x0 : g.x0 - wTot;
      ctx.strokeRect(x + 0.5, top + 0.5, Math.max(0, wTot - 1), Math.max(0, h - 1));
    }
  }
  ctx.restore();
}

/** Bullish vs bearish share per row, a thin bar of fixed width next to the histogram. */
function paintSentiment(sc: SeriesContext, cfg: VpCfg, v: VpView, g: VpGeom) {
  const { ctx } = sc;
  const sW = Math.max(20, g.maxW * 0.4);
  const leftSide = g.bL > sc.paneWidth / 2 ? true : cfg.placement === "right" || cfg.placement === "end";
  const sx = leftSide ? g.bL - 3 - sW : g.bR + 3;
  ctx.save();
  for (let k = 0; k < v.prof.rows.length; k++) {
    const r = v.prof.rows[k];
    const tot = r.up + r.down;
    if (!(tot > 0)) continue;
    const yTop = sc.y(r.hi);
    const yBot = sc.y(r.lo);
    const full = Math.abs(yBot - yTop);
    const h = Math.max(1, full - (full > 3 ? 1 : 0));
    const top = Math.min(yTop, yBot) + (full > 3 ? 0.5 : 0);
    if (top > sc.paneHeight || top + h < 0) continue;
    const wb = (r.up / tot) * sW;
    ctx.fillStyle = rgba(cfg.c.vpColBull, 0.6);
    ctx.fillRect(sx, top, wb, h);
    ctx.fillStyle = rgba(cfg.c.vpColBear, 0.6);
    ctx.fillRect(sx + wb, top, sW - wb, h);
  }
  ctx.restore();
}

function paintLevels(sc: SeriesContext, cfg: VpCfg, v: VpView, g: VpGeom) {
  const { ctx } = sc;
  const W = sc.paneWidth;
  const xs = Math.max(0, g.xA);
  const xe = Math.min(W, g.xB);
  ctx.save();
  ctx.font = lblFont(sc, cfg.lblSize);
  for (const L of cfg.levels) {
    if (!L.show) continue;
    const price = levelValue(v.levels, L.key);
    if (!isFinite(price)) continue;
    const y = Math.round(sc.y(price)) + 0.5;
    if (y < -2 || y > sc.paneHeight + 2) continue;
    let x1: number;
    let x2: number;
    switch (L.ext) {
      case "right":
        x1 = xs;
        x2 = W;
        break;
      case "full":
        x1 = 0;
        x2 = W;
        break;
      case "profile":
        x1 = Math.max(0, g.bL);
        x2 = Math.min(W, g.bR);
        break;
      default:
        x1 = xs;
        x2 = Math.max(xe, xs);
    }
    if (x2 <= x1) continue;
    if (L.key === "Poc" && cfg.pocMode === "developing") {
      /* drawn as the developing line instead */
    } else {
      ctx.strokeStyle = L.color;
      ctx.lineWidth = L.width;
      ctx.setLineDash(dashOf(L.style, L.width));
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (cfg.levelLbls && L.label) {
      const text = `${levelName(L.key)} ${formatPrice(price, v.dec, sc.options.locale)}`;
      ctx.fillStyle = L.color;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      const lx = L.ext === "profile" ? x2 - 3 : Math.min(x2, W) - 4;
      ctx.fillText(text, Math.max(lx, 40), y - 2);
    }
  }
  ctx.restore();
}

function paintDeveloping(sc: SeriesContext, cfg: VpCfg, v: VpView) {
  const wantPoc = cfg.pocMode === "developing" || cfg.pocMode === "both";
  if (!wantPoc && !cfg.devVa) return;
  const dev = developingOf(v, cfg.devVa);
  const { ctx } = sc;
  const a = v.range[0];
  const from = Math.max(a, sc.from - 1);
  const to = Math.min(v.range[1], sc.to + 1);
  if (to < from) return;
  const line = (arr: Float64Array, color: string, width: number, dash: number[]) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    let started = false;
    let prevY = 0;
    for (let i = from; i <= to; i++) {
      const val = arr[i - a];
      if (!isFinite(val)) continue;
      const x = sc.x(i);
      const y = sc.y(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, prevY);
        ctx.lineTo(x, y);
      }
      prevY = y;
    }
    ctx.stroke();
  };
  ctx.save();
  if (wantPoc && cfg.levels[2].show) line(dev.poc, cfg.levels[2].color, cfg.levels[2].width, dashOf(cfg.levels[2].style, cfg.levels[2].width));
  if (cfg.devVa) {
    if (cfg.levels[1].show) line(dev.vah, cfg.levels[1].color, Math.max(1, cfg.levels[1].width - 0.5), [2, 3]);
    if (cfg.levels[3].show) line(dev.val, cfg.levels[3].color, Math.max(1, cfg.levels[3].width - 0.5), [2, 3]);
  }
  ctx.restore();
}

function paintNote(sc: SeriesContext, v: VpView, g: VpGeom) {
  if (v.prof.approxBars <= 0) return;
  const text =
    v.stats.delayed && v.prof.realBars > 0
      ? indT("vp.n.delayed", "≈ estimate: trades arrive ~15 min late")
      : v.prof.realBars === 0
        ? indT("vp.n.approx", "≈ candle-based estimate (no tick data)")
        : indT("vp.n.partial", "some bars are estimated");
  const { ctx } = sc;
  ctx.save();
  ctx.font = `600 10px ${sc.options.fontFamily || "Inter, system-ui, sans-serif"}`;
  const leftSide = g.bL < sc.paneWidth / 2;
  ctx.textAlign = leftSide ? "left" : "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#f5a623";
  ctx.fillText(text, leftSide ? Math.max(6, g.bL) : Math.min(sc.paneWidth - 6, g.bR), sc.paneHeight - 4);
  ctx.restore();
}

/* ───────────── the definition ───────────── */

const RANGE_TAG: Record<string, string> = { visible: "VR", lastN: "", fixed: "FR", session: "S", anchor: "AVP" };

function stateOf(res?: IndResult): VpState | null {
  const e = res?.extra as VpState | undefined;
  return e && typeof e === "object" && "view" in e ? e : null;
}

const NO_FLOW_PRECISION = 2;

export const vproDef: IndicatorDef = {
  id: "vprofile_pro",
  fixedPane: true,
  category: "volume",
  pane: "overlay",
  fmt: "price",
  usesFlow: true,
  keywords:
    "volume profile configurable recommended VPVR VPFR VPSV visible range fixed range anchored session POC VAH VAL value area point of control statistics table sentiment supply demand gaps low volume nodes " +
    "объемный профиль настраиваемый профиль объема зона стоимости точка контроля таблица статистики",
  params: PARAMS,
  paramGroup: GROUP_OF,
  styleParams: COLOR_KEYS,
  hiddenParams: ["vpAnchorTime", "vpTblCollapsed"],
  title: (p) => {
    const c = readVpCfg(p);
    const tag = c.range === "lastN" ? String(Math.round(c.lastN)) : RANGE_TAG[c.range];
    return `VP · ${c.opts.valueArea}%${tag ? " · " + tag : ""}`;
  },
  compute(cs, p, env) {
    const st: VpState = { view: null };
    const cfg = readVpCfg(p);
    if (cfg.range !== "visible") st.view = getVpView(p, cs, env?.flow, null, env?.flow ? env.flow.precision : NO_FLOW_PRECISION);
    return { plots: [], extra: st };
  },
  drawExtra(sc, p, res, env) {
    const cs = sc.candles as Candle[];
    const cfg = readVpCfg(p);
    const flow = env?.flow ?? sc.flow;
    const view = getVpView(p, cs, flow, { from: sc.from, to: sc.to }, flow ? flow.precision : NO_FLOW_PRECISION);
    const st = stateOf(res);
    if (st) st.view = view;
    if (!view) return;
    const half = sc.barSpacing / 2;
    const xA = sc.x(view.range[0]) - half;
    const xB = sc.x(view.range[1]) + half;
    if (xB < 0 && cfg.levels.every((l) => l.ext === "range" || l.ext === "profile")) return;
    const g = vpGeometry(cfg, sc.paneWidth, xA, xB);
    if (cfg.sd || cfg.gaps) paintZones(sc, cfg, view, xA, xB);
    if (cfg.showHist) {
      paintHistogram(sc, cfg, view, g);
      if (cfg.sent) paintSentiment(sc, cfg, view, g);
    }
    paintLevels(sc, cfg, view, g);
    paintDeveloping(sc, cfg, view);
    if (cfg.showHist) paintNote(sc, view, g);
  },
  legendItems(res, p, locale) {
    const view = stateOf(res)?.view;
    if (!view) return [];
    const c = readVpCfg(p);
    const f = (x: number) => formatPrice(x, view.dec, locale);
    const out: { text: string; color: string }[] = [
      { text: `POC ${f(view.levels.poc)}`, color: c.levels[2].color },
      { text: `VAH ${f(view.levels.vah)} / VAL ${f(view.levels.val)}`, color: c.levels[1].color },
    ];
    if (view.prof.approxBars > 0) out.push({ text: view.prof.realBars === 0 ? "≈" : "≈ ½", color: "#f5a623" });
    return out;
  },
  axisFlags(res, p) {
    const view = stateOf(res)?.view;
    if (!view) return [];
    const c = readVpCfg(p);
    const out: { price: number; color: string }[] = [];
    for (const L of c.levels) {
      if (!L.show || !L.flag) continue;
      const price = levelValue(view.levels, L.key);
      if (isFinite(price)) out.push({ price, color: L.color });
    }
    return out;
  },
  alertLevels: (res) => vpAlertLevels(res),
};

export const VPRO_DEFS: IndicatorDef[] = [vproDef];
export type { IndEnv };

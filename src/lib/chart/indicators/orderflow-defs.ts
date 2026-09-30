import type { Candle, SeriesContext } from "../types";
import type { BooleanParam, ColorParam, FillSpec, IndEnv, IndicatorDef, IndResult, LevelSpec, NumberParam, Params, PlotSpec, SelectOption, SelectParam } from "./registry";
import { cachedDeltaSeries, buildVProfile, type ResetPeriod } from "../orderflow/flowmath";
import { ANCHOR_MS, computeVwap, indexAtOrAfter, type PriceSourceId, type VwapAnchor, type VwapResult } from "../orderflow/vwapcalc";
import { flowLabels, fmtQty } from "../orderflow/footprint";
import { developingPoc, paintApproxNote, paintDevelopingPoc, paintProfile, rgba, sessionProfile, splitSessions, type VpStyle } from "../orderflow/vpdraw";

/* Order flow indicators: VWAP (session / weekly / monthly, deviation bands), anchored VWAP, volume profiles (visible range and
   per session), cumulative volume delta, delta per bar and volume-weighted candle colouring. They read trades from the
   chart's order flow store when it has them and fall back to candle-based estimates otherwise. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;

const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

const SRC: SelectOption[] = [
  { value: "hlc3", label: "HLC3" },
  { value: "close", label: "ind.o.close" },
  { value: "open", label: "ind.o.open" },
  { value: "high", label: "ind.o.high" },
  { value: "low", label: "ind.o.low" },
  { value: "hl2", label: "HL2" },
  { value: "ohlc4", label: "OHLC4" },
];

const zeroLevel = (): LevelSpec[] => [{ value: 0, color: "rgba(120,123,134,0.5)", dashed: true, name: "ind2.lvl.zero" }];

function line(key: string, data: ArrayLike<number>, color: string, extra?: Partial<PlotSpec>): PlotSpec {
  return { key, data, kind: "line", color, width: 1.6, ...extra };
}

/* ───────────── VWAP ───────────── */

const BAND_ALPHA = [0.08, 0.055, 0.035];

function bandsFor(p: Params, r: VwapResult, n: number, color: string, plots: PlotSpec[], fills: FillSpec[]) {
  const enabled = [B(p, "bands"), B(p, "bands2"), B(p, "bands3")];
  const mults = [N(p, "mult"), N(p, "mult2"), N(p, "mult3")];
  let prevUp: Float64Array | null = null;
  let prevLo: Float64Array | null = null;
  for (let k = 0; k < 3; k++) {
    if (!enabled[k]) continue;
    const up = new Float64Array(n);
    const lo = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      up[i] = r.vwap[i] + mults[k] * r.sd[i];
      lo[i] = r.vwap[i] - mults[k] * r.sd[i];
    }
    plots.push(line(`Upper #${k + 1}`, up, color, { width: 1.1 }), line(`Lower #${k + 1}`, lo, color, { width: 1.1 }));
    // each band is filled between itself and the previous one, so the shades do not pile up
    if (prevUp && prevLo) {
      fills.push({ a: up, b: prevUp, color: rgba(color, BAND_ALPHA[k]), name: `±${mults[k]}σ ↑` }, { a: prevLo, b: lo, color: rgba(color, BAND_ALPHA[k]), name: `±${mults[k]}σ ↓` });
    } else fills.push({ a: up, b: lo, color: rgba(color, BAND_ALPHA[k]), name: `±${mults[k]}σ` });
    prevUp = up;
    prevLo = lo;
  }
}

const vwapParams = [
  sel("anchor", "day", [
    { value: "day", label: "ind.o.day" },
    { value: "week", label: "ind.o.week" },
    { value: "month", label: "ind.o.month" },
    { value: "year", label: "ind.of.o.year" },
  ]),
  sel("source", "hlc3", SRC),
  bool("useTrades", true),
  bool("hideHigher", true),
  bool("bands", false),
  num("mult", 1, 0.1, 10, 0.1),
  bool("bands2", false),
  num("mult2", 2, 0.1, 10, 0.1),
  bool("bands3", false),
  num("mult3", 3, 0.1, 10, 0.1),
  col("color", "#1e88e5"),
  col("colorBands", "#43a047"),
];

const bandTitle = (p: Params) => {
  const parts: string[] = [];
  if (B(p, "bands")) parts.push(String(N(p, "mult")));
  if (B(p, "bands2")) parts.push(String(N(p, "mult2")));
  if (B(p, "bands3")) parts.push(String(N(p, "mult3")));
  return parts.length ? " ±" + parts.join("/") : "";
};

/** Breaks the line between two sessions (TradingView style): the first bar of a new session gets no point. */
function breakSessions(r: VwapResult, cs: Candle[], extra: (Float64Array | null)[]) {
  const n = cs.length;
  for (let i = 1; i < n - 1; i++) {
    if (r.breaks[i] && !r.breaks[i + 1]) {
      r.vwap[i] = NaN;
      r.sd[i] = NaN;
      for (const a of extra) if (a) a[i] = NaN;
    }
  }
}

const vwapDef: IndicatorDef = {
  id: "vwap",
  category: "volume",
  pane: "overlay",
  fmt: "price",
  usesFlow: true,
  keywords: "vwap volume weighted average price session anchored weekly monthly bands deviation",
  params: vwapParams,
  title: (p) => `VWAP ${S(p, "anchor")}${bandTitle(p)}`,
  compute(cs, p, env) {
    const anchor = S(p, "anchor") as VwapAnchor;
    if (B(p, "hideHigher") && (env?.intervalMs ?? 0) >= ANCHOR_MS[anchor]) return { plots: [] };
    const r = computeVwap(cs, { anchor, source: S(p, "source") as PriceSourceId, useTrades: B(p, "useTrades"), store: env?.flow });
    breakSessions(r, cs, []);
    const plots: PlotSpec[] = [line("VWAP", r.vwap, S(p, "color"), { width: 1.8 })];
    const fills: FillSpec[] = [];
    bandsFor(p, r, cs.length, S(p, "colorBands"), plots, fills);
    return { plots, fills };
  },
};

const avwapDef: IndicatorDef = {
  id: "avwap",
  category: "volume",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  usesFlow: true,
  keywords: "anchored vwap avwap anchor volume weighted average price",
  hiddenParams: ["anchorTime"],
  params: [
    num("anchorTime", 0, 0, 4e12, 1),
    sel("source", "hlc3", SRC),
    bool("useTrades", true),
    bool("bands", false),
    num("mult", 1, 0.1, 10, 0.1),
    bool("bands2", false),
    num("mult2", 2, 0.1, 10, 0.1),
    bool("bands3", false),
    num("mult3", 3, 0.1, 10, 0.1),
    col("color", "#ff9800"),
    col("colorBands", "#ff9800"),
  ],
  title: (p) => `AVWAP${bandTitle(p)}`,
  compute(cs, p, env) {
    const t0 = N(p, "anchorTime");
    if (!(t0 > 0) || cs.length === 0) return { plots: [] };
    const from = indexAtOrAfter(cs, t0);
    if (from >= cs.length) return { plots: [] };
    const r = computeVwap(cs, { anchor: { from }, source: S(p, "source") as PriceSourceId, useTrades: B(p, "useTrades"), store: env?.flow });
    const plots: PlotSpec[] = [line("VWAP", r.vwap, S(p, "color"), { width: 2 })];
    const fills: FillSpec[] = [];
    bandsFor(p, r, cs.length, S(p, "colorBands"), plots, fills);
    return { plots, fills };
  },
};

/* ───────────── volume profiles ───────────── */

const profileCommon = [
  num("rows", 24, 4, 300),
  sel("rowMode", "rows", [
    { value: "rows", label: "ind.of.o.rows" },
    { value: "ticks", label: "ind.of.o.ticks" },
  ]),
  num("ticksPerRow", 1, 1, 2000),
  num("valueArea", 70, 10, 100),
  bool("showPoc", true),
  bool("showVaLines", false),
  bool("split", true),
  bool("useFlow", true),
];

function rowSizeOf(p: Params, env?: IndEnv): number {
  if (S(p, "rowMode") !== "ticks") return 0;
  const f = env?.flow;
  const tick = f && f.nativeTick > 0 ? f.nativeTick : f ? Math.pow(10, -f.precision) : 0;
  return tick > 0 ? tick * N(p, "ticksPerRow") : 0;
}

function styleOf(p: Params, extend: VpStyle["extend"], labels: boolean): VpStyle {
  return {
    colorUp: S(p, "colorUp"),
    colorDown: S(p, "colorDown"),
    colorPoc: S(p, "colorPoc"),
    split: B(p, "split"),
    showPoc: B(p, "showPoc"),
    showVaLines: B(p, "showVaLines"),
    extend,
    labels,
  };
}

const vprofileDef: IndicatorDef = {
  id: "vprofile",
  fixedPane: true,
  category: "volume",
  pane: "overlay",
  fmt: "vol",
  usesFlow: true,
  keywords: "volume profile visible range VPVR VRVP POC value area order flow",
  params: [
    ...profileCommon,
    num("widthPct", 30, 5, 90),
    sel("placement", "left", [
      { value: "left", label: "ind2.o.left" },
      { value: "right", label: "ind2.o.right" },
    ]),
    sel("extend", "full", [
      { value: "full", label: "ind.of.o.extFull" },
      { value: "profile", label: "ind.of.o.extProfile" },
    ]),
    bool("labels", false),
    bool("developingPoc", false),
    col("colorUp", "#2962ff"),
    col("colorDown", "#ff9800"),
    col("colorPoc", "#f23645"),
  ],
  styleParams: ["colorUp", "colorDown", "colorPoc"],
  title: (p) => (S(p, "rowMode") === "ticks" ? `VP ${N(p, "ticksPerRow")}t ${N(p, "valueArea")}%` : `VP ${N(p, "rows")} ${N(p, "valueArea")}%`),
  compute() {
    return { plots: [] };
  },
  drawExtra(sc, p, _res, env) {
    const prof = buildVProfile(sc.candles, sc.from, sc.to, env?.flow, { rows: N(p, "rows"), rowSize: rowSizeOf(p, env), valueArea: N(p, "valueArea"), useFlow: B(p, "useFlow") });
    if (!prof) return;
    const left = S(p, "placement") !== "right";
    const maxW = (sc.paneWidth * N(p, "widthPct")) / 100;
    const geom = { x0: left ? 0 : sc.paneWidth, dir: (left ? 1 : -1) as 1 | -1, maxW, lineFrom: left ? 0 : sc.paneWidth - maxW, lineTo: left ? maxW : sc.paneWidth };
    paintProfile(sc, prof, styleOf(p, S(p, "extend") as VpStyle["extend"], B(p, "labels")), geom);
    if (B(p, "developingPoc")) {
      const from = Math.max(0, sc.from);
      const to = Math.min(sc.candles.length - 1, sc.to);
      paintDevelopingPoc(sc, developingPoc(sc.candles, from, to, prof, env?.flow, B(p, "useFlow")), from, S(p, "colorPoc"));
    }
    paintApproxNote(sc, prof.realBars, prof.approxBars, left ? 6 : sc.paneWidth - 6, 6, left ? "left" : "right");
  },
};

interface SessionsMemo {
  sig: string;
  list: ReturnType<typeof splitSessions>;
}
let sessMemo: SessionsMemo | null = null;

const vpSessionDef: IndicatorDef = {
  id: "vp_session",
  fixedPane: true,
  category: "volume",
  pane: "overlay",
  fmt: "vol",
  usesFlow: true,
  keywords: "session volume profile SVP day week month POC naked developing",
  params: [
    sel("session", "day", [
      { value: "day", label: "ind.o.day" },
      { value: "week", label: "ind.o.week" },
      { value: "month", label: "ind.o.month" },
    ]),
    ...profileCommon.map((d) => (d.key === "rows" ? num("rows", 30, 4, 300) : d)),
    num("widthPct", 70, 10, 100),
    sel("placement", "left", [
      { value: "left", label: "ind2.o.left" },
      { value: "right", label: "ind2.o.right" },
    ]),
    sel("extendPoc", "session", [
      { value: "none", label: "ind.of.o.extNone" },
      { value: "session", label: "ind.of.o.extSession" },
      { value: "right", label: "ind.of.o.extRight" },
    ]),
    bool("nakedPocs", false),
    bool("developingPoc", false),
    bool("labels", false),
    col("colorUp", "#2962ff"),
    col("colorDown", "#ff9800"),
    col("colorPoc", "#f23645"),
  ],
  styleParams: ["colorUp", "colorDown", "colorPoc"],
  title: (p) => `SVP ${S(p, "session")} ${S(p, "rowMode") === "ticks" ? N(p, "ticksPerRow") + "t" : N(p, "rows")}`,
  compute() {
    return { plots: [] };
  },
  drawExtra(sc, p, _res, env) {
    const cs = sc.candles;
    const n = cs.length;
    if (n === 0) return;
    const store = env?.flow;
    const shift = store?.wallShiftMs ?? 0;
    const period = S(p, "session") as "day" | "week" | "month";
    const memoSig = `${period}|${shift}|${n}|${cs[0].t}|${cs[n - 1].t}`;
    if (!sessMemo || sessMemo.sig !== memoSig) sessMemo = { sig: memoSig, list: splitSessions(cs, shift, period, 0, n - 1) };
    const all = sessMemo.list;
    // sessions that touch the visible range
    let firstVis = all.findIndex((s) => s.to >= sc.from);
    if (firstVis < 0) return;
    let lastVis = firstVis;
    while (lastVis + 1 < all.length && all[lastVis + 1].from <= sc.to) lastVis++;
    const sigExtra = `svp|${period}|${N(p, "rows")}|${S(p, "rowMode")}|${N(p, "ticksPerRow")}|${N(p, "valueArea")}|${B(p, "useFlow")}|${store?.tick ?? 0}`;
    const o = { rows: N(p, "rows"), rowSize: rowSizeOf(p, env), valueArea: N(p, "valueArea"), useFlow: B(p, "useFlow") };
    const left = S(p, "placement") !== "right";
    const extPoc = S(p, "extendPoc");
    const style = styleOf(p, extPoc === "right" ? "right" : "profile", B(p, "labels"));
    let real = 0;
    let approx = 0;
    const half = sc.barSpacing / 2;
    for (let si = firstVis; si <= lastVis; si++) {
      const ses = all[si];
      const prof = sessionProfile(cs, ses, store, o, sigExtra);
      if (!prof) continue;
      real += prof.realBars;
      approx += prof.approxBars;
      // a session that starts left of the screen keeps its profile at the visible edge
      const xA = Math.max(sc.x(ses.from) - half, 0);
      const xB = sc.x(ses.to) + half;
      const span = xB - xA;
      if (span < 6) continue;
      const maxW = (span * N(p, "widthPct")) / 100;
      const geom = {
        x0: left ? xA : xB,
        dir: (left ? 1 : -1) as 1 | -1,
        maxW,
        lineFrom: xA,
        lineTo: extPoc === "none" ? (left ? xA + maxW : xB) : xB,
      };
      paintProfile(sc, prof, style, geom, 1);
      if (B(p, "developingPoc")) {
        paintDevelopingPoc(sc, developingPoc(cs, ses.from, ses.to, prof, store, o.useFlow), ses.from, S(p, "colorPoc"));
      }
    }
    if (B(p, "nakedPocs")) {
      // POCs of finished sessions that price has not touched since: a dotted line from the session end to where it was touched
      const { ctx } = sc;
      ctx.save();
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(S(p, "colorPoc"), 0.9);
      const startS = Math.max(0, firstVis - 40);
      for (let si = startS; si < all.length - 1; si++) {
        const ses = all[si];
        const prof = sessionProfile(cs, ses, store, o, sigExtra);
        if (!prof) continue;
        const r = prof.rows[prof.poc];
        const pp = (r.lo + r.hi) / 2;
        let touch = -1;
        for (let i = ses.to + 1; i < n; i++) {
          if (cs[i].l <= pp && cs[i].h >= pp) {
            touch = i;
            break;
          }
        }
        const x1 = sc.x(ses.to) + half;
        const x2 = touch < 0 ? sc.paneWidth : sc.x(touch);
        if (x2 < 0 || x1 > sc.paneWidth) continue;
        const y = Math.round(sc.y(pp)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, x1), y);
        ctx.lineTo(Math.min(sc.paneWidth, x2), y);
        ctx.stroke();
      }
      ctx.restore();
    }
    paintApproxNote(sc, real, approx, left ? 6 : sc.paneWidth - 6, 6, left ? "left" : "right");
  },
};

/* ───────────── CVD, delta ───────────── */

const RESET_OPTIONS: SelectOption[] = [
  { value: "none", label: "ind.of.o.noReset" },
  { value: "day", label: "ind.o.day" },
  { value: "week", label: "ind.o.week" },
  { value: "month", label: "ind.o.month" },
];

const cvdDef: IndicatorDef = {
  id: "cvd",
  category: "volume",
  pane: "own",
  paneRatio: 0.2,
  fmt: "vol",
  usesFlow: true,
  keywords: "cvd cumulative volume delta order flow buy sell aggressor candles",
  params: [sel("mode", "candles", [
    { value: "candles", label: "ind.of.o.candles" },
    { value: "line", label: "ind.of.o.line" },
  ]), sel("reset", "none", RESET_OPTIONS), col("color", "#00acc1"), col("colorUp", "#26a69a"), col("colorDown", "#ef5350")],
  styleParams: ["colorUp", "colorDown"],
  title: (p, env) => {
    const f = env?.flow;
    const est = !f || f.avail !== "trades" || f.size === 0;
    return `CVD${est ? "≈" : ""}${S(p, "reset") !== "none" ? " " + S(p, "reset") : ""}`;
  },
  compute(cs, p, env) {
    const d = cachedDeltaSeries(cs, env?.flow, S(p, "reset") as ResetPeriod);
    const n = cs.length;
    if (S(p, "mode") === "line") return { plots: [line("CVD", d.cum, S(p, "color"), { width: 1.8 })], levels: zeroLevel() };
    // candles: the close is the legend value; High / Low only give the pane its scale, the bodies are painted by drawExtra
    return {
      plots: [
        line("CVD", d.cum, S(p, "color"), { width: 0, legend: true, flag: true }),
        line("High", d.cumHigh.subarray(0, n), S(p, "color"), { width: 0, legend: false, flag: false }),
        line("Low", d.cumLow.subarray(0, n), S(p, "color"), { width: 0, legend: false, flag: false }),
      ],
      levels: zeroLevel(),
    };
  },
  drawExtra(sc, p, _res, env) {
    if (S(p, "mode") === "line") return;
    const cs = sc.candles;
    const d = cachedDeltaSeries(cs, env?.flow, S(p, "reset") as ResetPeriod);
    const { ctx } = sc;
    const up = S(p, "colorUp");
    const dn = S(p, "colorDown");
    const from = Math.max(0, sc.from);
    const to = Math.min(cs.length - 1, sc.to);
    const bw = Math.max(1, Math.floor(sc.barSpacing * 0.7));
    ctx.save();
    for (let i = from; i <= to; i++) {
      const o = d.cumOpen[i];
      const c = d.cum[i];
      const color = c >= o ? up : dn;
      const x = Math.round(sc.x(i));
      ctx.globalAlpha = d.real[i] ? 1 : 0.55;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.round(sc.y(d.cumHigh[i])), 1, Math.max(1, Math.round(sc.y(d.cumLow[i]) - sc.y(d.cumHigh[i]))));
      const yo = sc.y(o);
      const yc = sc.y(c);
      ctx.fillRect(Math.round(x - bw / 2 + 0.5), Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
    ctx.restore();
    let real = 0;
    let approx = 0;
    for (let i = from; i <= to; i++) (d.real[i] ? real++ : approx++);
    paintApproxNote(sc, real, approx, 8, 6);
  },
};

const deltaDef: IndicatorDef = {
  id: "delta",
  category: "volume",
  pane: "own",
  paneRatio: 0.18,
  fmt: "vol",
  usesFlow: true,
  keywords: "delta per bar volume delta histogram order flow buy sell",
  params: [col("colorUp", "#26a69a"), col("colorDown", "#ef5350")],
  title: (_p, env) => {
    const f = env?.flow;
    return `Delta${!f || f.avail !== "trades" || f.size === 0 ? "≈" : ""}`;
  },
  compute(cs, p, env) {
    const d = cachedDeltaSeries(cs, env?.flow, "none");
    const up = S(p, "colorUp");
    const dn = S(p, "colorDown");
    const colors = new Array<string>(cs.length);
    for (let i = 0; i < cs.length; i++) {
      const base = d.delta[i] >= 0 ? up : dn;
      // estimated bars are drawn paler
      colors[i] = d.real[i] ? base : rgba(base, 0.45);
    }
    return { plots: [{ key: "Delta", data: d.delta, kind: "hist", color: up, colors, alpha: 0.85, flag: false, colorParams: ["colorUp", "colorDown"] }], levels: zeroLevel() };
  },
};

/* ───────────── volume-weighted candle colouring ───────────── */

const volColorDef: IndicatorDef = {
  id: "volcolor",
  fixedPane: true,
  category: "volume",
  pane: "overlay",
  fmt: "vol",
  keywords: "volume weighted candle colour color heat intensity",
  params: [num("length", 50, 5, 500), num("strength", 100, 10, 100), col("colorUp", "#26a69a"), col("colorDown", "#ef5350")],
  styleParams: ["colorUp", "colorDown"],
  title: (p) => `Vol colour ${N(p, "length")}`,
  compute() {
    return { plots: [] };
  },
  drawExtra(sc, p) {
    const t = sc.options.chartType;
    if (t !== "candles" && t !== "hollow" && t !== "heikin" && t !== "footprint") return;
    const cs = sc.candles;
    const from = Math.max(0, sc.from);
    const to = Math.min(cs.length - 1, sc.to);
    const len = Math.round(N(p, "length"));
    const strength = N(p, "strength") / 100;
    const bw = Math.max(1, Math.floor(sc.barSpacing * 0.72));
    const { ctx } = sc;
    ctx.save();
    // running average of volume over the last `len` bars (with a warm-up of the bars before the visible range)
    let acc = 0;
    let cnt = 0;
    const start = Math.max(0, from - len);
    const win: number[] = [];
    for (let i = start; i < from; i++) {
      win.push(cs[i].v);
      acc += cs[i].v;
      cnt++;
    }
    for (let i = from; i <= to; i++) {
      const c = cs[i];
      win.push(c.v);
      acc += c.v;
      cnt++;
      if (cnt > len) {
        acc -= win[win.length - 1 - len];
        cnt--;
      }
      const avg = cnt > 0 ? acc / cnt : 0;
      const ratio = avg > 0 ? c.v / avg : 1;
      const k = Math.max(0, Math.min(1, ratio / 2.2));
      const alpha = 1 - (1 - (0.22 + 0.78 * k)) * strength;
      const color = c.c >= c.o ? S(p, "colorUp") : S(p, "colorDown");
      const x = Math.round(sc.x(i));
      const yh = sc.y(c.h);
      const yl = sc.y(c.l);
      const yo = sc.y(c.o);
      const yc = sc.y(c.c);
      // cover the original candle, then repaint it with the intensity
      ctx.globalAlpha = 1;
      ctx.fillStyle = sc.theme.bg;
      ctx.fillRect(x - bw / 2 - 1, yh - 1, bw + 2, yl - yh + 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x, yh, 1, Math.max(1, yl - yh));
      ctx.fillRect(Math.round(x - bw / 2 + 0.5), Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
    ctx.restore();
  },
};

/* ───────────── big trades ───────────── */

const bigTradesDef: IndicatorDef = {
  id: "bigtrades",
  fixedPane: true,
  category: "volume",
  pane: "overlay",
  fmt: "vol",
  usesFlow: true,
  keywords: "big large trades bubbles prints whales order flow aggressor",
  params: [num("top", 60, 5, 300), num("maxRadius", 18, 6, 50), bool("labels", true), col("colorBuy", "#26a69a"), col("colorSell", "#ef5350")],
  styleParams: ["colorBuy", "colorSell"],
  title: (p) => `Big trades ${N(p, "top")}`,
  compute() {
    return { plots: [] };
  },
  drawExtra(sc, p, _res, env) {
    const f = env?.flow;
    const cs = sc.candles;
    if (!f || cs.length === 0) return;
    const { ctx } = sc;
    const L = flowLabels(sc.options.locale);
    const from = Math.max(0, sc.from);
    const to = Math.min(cs.length - 1, sc.to);
    if (f.avail === "none" || (f.avail === "trades" && f.big.length === 0)) {
      ctx.save();
      ctx.font = "600 10px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#f5a623";
      ctx.fillText(f.avail === "none" ? L.noData : "…", 8, sc.paneHeight - 4);
      ctx.restore();
      return;
    }
    const t0 = cs[from].t;
    const t1 = cs[to].t + env!.intervalMs;
    const vis = f.big.filter((b) => b.t >= t0 && b.t < t1);
    if (vis.length === 0) return;
    vis.sort((a, b) => b.v - a.v);
    const list = vis.slice(0, Math.round(N(p, "top")));
    const vmax = list[0].v;
    const maxR = N(p, "maxRadius");
    // time -> fractional bar index
    const idxOf = (t: number) => {
      let lo = from;
      let hi = to;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (cs[m].t <= t) lo = m;
        else hi = m - 1;
      }
      const next = lo + 1 <= to ? cs[lo + 1].t : cs[lo].t + env!.intervalMs;
      return lo + Math.min(1, Math.max(0, (t - cs[lo].t) / Math.max(1, next - cs[lo].t)));
    };
    const cb = S(p, "colorBuy");
    const cse = S(p, "colorSell");
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 10px Inter, system-ui, sans-serif";
    for (const b of list.slice().reverse()) {
      const x = sc.x(idxOf(b.t));
      const y = sc.y(b.p);
      if (x < -maxR || x > sc.paneWidth + maxR || y < -maxR || y > sc.paneHeight + maxR) continue;
      const r = Math.max(3, Math.sqrt(b.v / vmax) * maxR);
      const c = b.buy ? cb : cse;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c, 0.45);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgba(c, 0.95);
      ctx.stroke();
      if (B(p, "labels") && r >= 11) {
        ctx.fillStyle = sc.theme.text;
        ctx.fillText(fmtQty(b.v), x, y);
      }
    }
    ctx.restore();
  },
};

export const ORDERFLOW_DEFS: IndicatorDef[] = [vwapDef, avwapDef, vprofileDef, vpSessionDef, cvdDef, deltaDef, bigTradesDef, volColorDef];
/** Ids whose definitions replace older built-ins of the registry. */
export const ORDERFLOW_OVERRIDES = new Set(["vwap", "vprofile", "cvd"]);

export type { IndResult, SeriesContext };

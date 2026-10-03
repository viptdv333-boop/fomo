import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndEnv, IndicatorDef, IndResult, LevelSpec, NumberParam, Params, PlotSpec, SelectOption, SelectParam } from "./registry";
import { asOfCol, barIndexAt, barRanges, lastCol, smooth, sumCol } from "../algopack/join";
import type { AlgoAlert, AlgoDataState, AlgoNeed, AlgoStore } from "../algopack/store";
import { indT } from "./ind-text";

/* Indicators on the MOEX ALGOPACK Promo datasets. They read the chart's AlgoStore (env.algo), which lib/chart/algopack/client
   fills from /api/algopack/* — the server serves those only to entitled requesters (admins unless ALGOPACK_PUBLIC=1). Without
   data they paint a one-line note in their pane saying why (loading / no access / no data / unsupported instrument).
     ap_futoi    open interest of individuals (FIZ) and legal entities (YUR), futures only                  [FUTOI]
     ap_aggr     aggressive buy / sell volume: split, delta or cumulative delta per session                 [tradestats]
     ap_trades   trade count / average trade size (all, buy, sell)                                          [tradestats]
     ap_obimb    order-book imbalance (best level or full book, by volume or value)                         [obstats]
     ap_spread   bid-ask spread (best level, 10 levels, 1M RUB depth)                                       [obstats]
     ap_cancel   order cancellation ratio (cancelled / placed) by volume, orders or value                   [orderstats]
     ap_alerts   Mega Alerts as markers on the price chart                                                  [alerts]
     ap_hi2      HI2 market concentration, daily                                                            [hi2] */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;

const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });
const opt = (value: string, label = `ind.ap.o.${value}`): SelectOption => ({ value, label });

const UP = "#26a69a";
const DOWN = "#ef5350";
const AMBER = "#f5a623";
const zero = (): LevelSpec[] => [{ value: 0, color: "rgba(120,123,134,0.5)", dashed: true, name: "ind2.lvl.zero" }];

const EMPTY: IndResult = { plots: [] };

/** Comparable short label of a state, painted into the pane when there is nothing to draw. */
function stateText(st: AlgoDataState): string {
  switch (st) {
    case "loading": return indT("ap.note.loading", "ALGOPACK: loading…");
    case "denied": return indT("ap.note.denied", "ALGOPACK: no access (Promo data are served to admins only)");
    case "none": return indT("ap.note.none", "ALGOPACK: no data for this instrument / period");
    case "unsupported": return indT("ap.note.unsupported", "ALGOPACK: not available for this instrument");
    case "error": return indT("ap.note.error", "ALGOPACK: could not load the data");
    default: return "";
  }
}

function paintNote(sc: SeriesContext, text: string, muted = false) {
  if (!text) return;
  const { ctx } = sc;
  ctx.save();
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  // right aligned: the top-left corner of a pane belongs to the legend
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = muted ? sc.theme.textMuted : AMBER;
  ctx.fillText(text, sc.paneWidth - 8, 6);
  ctx.restore();
}

/** Painter shared by the pane indicators: the note when the dataset is not there. */
function noteFor(need: AlgoNeed) {
  return (sc: SeriesContext, _p: Params, _res?: IndResult, env?: IndEnv) => {
    const a = env?.algo;
    if (!a) return;
    const st = a.state(need);
    if (st !== "ok") paintNote(sc, stateText(st));
    else if (need !== "futoi" && need !== "hi2" && need !== "alerts" && env && env.intervalMs > 0 && env.intervalMs < 5 * 60_000) {
      // SuperCandles are 5-minute bars: finer charts repeat the value of the covering bar
      paintNote(sc, indT("ap.note.step5", "ALGOPACK: 5-minute data (repeated on finer bars)"), true);
    }
  };
}

function bars(cs: { t: number }[], env: IndEnv | undefined, t: Float64Array) {
  return barRanges(cs, env?.intervalMs ?? 0, t);
}

function signColors(data: Float64Array, up: string, dn: string): string[] {
  const out = new Array<string>(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] >= 0 ? up : dn;
  return out;
}

/* ───────────── FUTOI ───────────── */

const futoiDef: IndicatorDef = {
  id: "ap_futoi",
  category: "volume",
  pane: "own",
  paneRatio: 0.2,
  fmt: "vol",
  algo: ["futoi"],
  keywords: "futoi open interest oi fiz yur individuals legal entities positions long short algopack moex открытый интерес позиции физлиц юрлиц",
  params: [
    sel("apMetric", "net", [opt("net"), opt("gross"), opt("share"), opt("people")]),
    bool("apFiz", true),
    bool("apYur", true),
    col("apColorFiz", "#f5a623"),
    col("apColorYur", "#2962ff"),
  ],
  title: (p) => `${indT("ap.t.futoi", "Open interest")} ${S(p, "apMetric")}`,
  compute(cs, p, env) {
    const tb = env?.algo?.futoi;
    if (!tb || cs.length === 0) return EMPTY;
    const iv = env!.intervalMs;
    const get = (name: string) => asOfCol(cs, iv, tb.t, tb.col[name] ?? new Float64Array(tb.n).fill(NaN));
    const m = S(p, "apMetric");
    const plots: PlotSpec[] = [];
    const fizC = S(p, "apColorFiz");
    const yurC = S(p, "apColorYur");
    const add = (key: string, data: ArrayLike<number>, color: string, dashed = false) => plots.push({ key, data, kind: "line", shape: "step", color, width: 1.6, dashed, fmt: m === "share" ? "osc" : "vol" });
    const groups: [boolean, string, string, string][] = [
      [B(p, "apYur"), "yur", "YUR", yurC],
      [B(p, "apFiz"), "fiz", "FIZ", fizC],
    ];
    for (const [on, g, label, color] of groups) {
      if (!on) continue;
      if (m === "net") add(`${label} net`, get(`${g}_pos`), color);
      else if (m === "gross") {
        add(`${label} long`, get(`${g}_long`), color);
        add(`${label} short`, get(`${g}_short`), color, true);
      } else if (m === "share") {
        const l = get(`${g}_long`);
        const s = get(`${g}_short`);
        const r = new Float64Array(cs.length);
        for (let i = 0; i < r.length; i++) r[i] = l[i] + s[i] > 0 ? (l[i] / (l[i] + s[i])) * 100 : NaN;
        add(`${label} long %`, r, color);
      } else {
        add(`${label} long #`, get(`${g}_ln`), color);
        add(`${label} short #`, get(`${g}_sn`), color, true);
      }
    }
    const res: IndResult = { plots };
    if (m === "net") res.levels = zero();
    if (m === "share") res.levels = [{ value: 50, color: "rgba(120,123,134,0.5)", dashed: true, name: "ind2.lvl.middle" }];
    return res;
  },
  drawExtra: noteFor("futoi"),
};

/* ───────────── SuperCandles: aggressive volume ───────────── */

const aggrDef: IndicatorDef = {
  id: "ap_aggr",
  category: "volume",
  pane: "own",
  paneRatio: 0.2,
  fmt: "vol",
  algo: ["ts"],
  keywords: "aggressive buy sell volume split delta cumulative supercandles tradestats algopack moex агрессивные покупки продажи дельта",
  params: [sel("apMode", "split", [opt("split"), opt("delta"), opt("cum")]), col("colorUp", UP), col("colorDown", DOWN)],
  title: (p) => `${indT("ap.t.aggr", "Aggressive volume")} ${S(p, "apMode")}`,
  compute(cs, p, env) {
    const tb = env?.algo?.ts;
    if (!tb || cs.length === 0) return EMPTY;
    const r = bars(cs, env, tb.t);
    const vb = sumCol(r, tb.col.vol_b);
    const vs = sumCol(r, tb.col.vol_s);
    const up = S(p, "colorUp");
    const dn = S(p, "colorDown");
    const mode = S(p, "apMode");
    if (mode === "split") {
      const neg = new Float64Array(vs.length);
      for (let i = 0; i < neg.length; i++) neg[i] = -vs[i];
      return {
        plots: [
          { key: "Buy", data: vb, kind: "hist", color: up, alpha: 0.85, flag: false },
          { key: "Sell", data: neg, kind: "hist", color: dn, alpha: 0.85, flag: false },
        ],
        levels: zero(),
      };
    }
    const d = new Float64Array(vb.length);
    for (let i = 0; i < d.length; i++) d[i] = vb[i] === vb[i] || vs[i] === vs[i] ? (vb[i] || 0) - (vs[i] || 0) : NaN;
    if (mode === "delta") {
      return { plots: [{ key: "Delta", data: d, kind: "hist", color: up, colors: signColors(d, up, dn), alpha: 0.85, flag: false, colorParams: ["colorUp", "colorDown"] }], levels: zero() };
    }
    // cumulative, restarting every exchange day
    const tz = env!.algo!.tzMs;
    const cum = new Float64Array(d.length);
    let acc = 0;
    let day = NaN;
    for (let i = 0; i < d.length; i++) {
      const dk = Math.floor((cs[i].t + tz) / 86_400_000);
      if (dk !== day) {
        acc = 0;
        day = dk;
      }
      if (d[i] === d[i]) acc += d[i];
      cum[i] = acc;
    }
    return { plots: [{ key: "CumDelta", data: cum, kind: "line", color: up, width: 1.6, shape: "area" }], levels: zero() };
  },
  drawExtra: noteFor("ts"),
};

/* ───────────── SuperCandles: trade count / average size ───────────── */

const tradesDef: IndicatorDef = {
  id: "ap_trades",
  category: "volume",
  pane: "own",
  paneRatio: 0.18,
  fmt: "vol",
  algo: ["ts"],
  keywords: "trades count number average trade size lot supercandles tradestats algopack moex количество сделок средний размер сделки",
  params: [sel("apMetric", "count", [opt("count"), opt("avg"), opt("avgSides")]), num("apSmooth", 1, 1, 100), col("colorUp", UP), col("colorDown", DOWN), col("apColor", "#7e57c2")],
  title: (p) => `${indT("ap.t.trades", "Trades")} ${S(p, "apMetric")}`,
  compute(cs, p, env) {
    const tb = env?.algo?.ts;
    if (!tb || cs.length === 0) return EMPTY;
    const r = bars(cs, env, tb.t);
    const m = S(p, "apMetric");
    const up = S(p, "colorUp");
    const dn = S(p, "colorDown");
    const sm = N(p, "apSmooth");
    const ratio = (a: Float64Array, b: Float64Array) => {
      const o = new Float64Array(a.length);
      for (let i = 0; i < o.length; i++) o[i] = b[i] > 0 ? a[i] / b[i] : NaN;
      return o;
    };
    if (m === "count") {
      const tr = sumCol(r, tb.col.trades);
      const tbuy = sumCol(r, tb.col.trades_b);
      const tsell = sumCol(r, tb.col.trades_s);
      const colors = new Array<string>(tr.length);
      for (let i = 0; i < colors.length; i++) colors[i] = tbuy[i] >= tsell[i] ? up : dn;
      return { plots: [{ key: "Trades", data: tr, kind: "hist", color: up, colors, alpha: 0.85, flag: false, colorParams: ["colorUp", "colorDown"] }] };
    }
    const vol = sumCol(r, tb.col.vol);
    const trd = sumCol(r, tb.col.trades);
    if (m === "avg") return { plots: [{ key: "AvgSize", data: smooth(ratio(vol, trd), sm), kind: "line", color: S(p, "apColor"), width: 1.6, fmt: "vol" }] };
    return {
      plots: [
        { key: "AvgBuy", data: smooth(ratio(sumCol(r, tb.col.vol_b), sumCol(r, tb.col.trades_b)), sm), kind: "line", color: up, width: 1.5, fmt: "vol" },
        { key: "AvgSell", data: smooth(ratio(sumCol(r, tb.col.vol_s), sumCol(r, tb.col.trades_s)), sm), kind: "line", color: dn, width: 1.5, fmt: "vol" },
      ],
    };
  },
  drawExtra: noteFor("ts"),
};

/* ───────────── OBStats: imbalance and spread ───────────── */

const IMB_COL: Record<string, string> = { bboVol: "imb_vol_bbo", bboVal: "imb_val_bbo", fullVol: "imb_vol", fullVal: "imb_val" };

const obimbDef: IndicatorDef = {
  id: "ap_obimb",
  category: "volume",
  pane: "own",
  paneRatio: 0.18,
  fmt: "osc",
  algo: ["ob"],
  keywords: "order book imbalance bid ask depth liquidity obstats supercandles algopack moex дисбаланс стакана",
  params: [sel("apMetric", "fullVol", [opt("bboVol"), opt("bboVal"), opt("fullVol"), opt("fullVal")]), num("apSmooth", 1, 1, 100), col("colorUp", UP), col("colorDown", DOWN)],
  title: (p) => `${indT("ap.t.obimb", "Book imbalance %")} ${S(p, "apMetric")}`,
  compute(cs, p, env) {
    const tb = env?.algo?.ob;
    if (!tb || cs.length === 0) return EMPTY;
    const r = bars(cs, env, tb.t);
    const src = tb.col[IMB_COL[S(p, "apMetric")] ?? "imb_vol"] ?? new Float64Array(tb.n).fill(NaN);
    const raw = lastCol(r, src);
    for (let i = 0; i < raw.length; i++) raw[i] *= 100;
    const d = smooth(raw, N(p, "apSmooth"));
    const up = S(p, "colorUp");
    const dn = S(p, "colorDown");
    return {
      plots: [{ key: "Imbalance", data: d, kind: "hist", color: up, colors: signColors(d, up, dn), alpha: 0.85, flag: false, colorParams: ["colorUp", "colorDown"], fmt: "osc" }],
      levels: zero(),
      range: [-100, 100],
    };
  },
  drawExtra: noteFor("ob"),
};

const SPREAD_COL: Record<string, string> = { bbo: "spread_bbo", deep: "spread_deep", big: "spread_big" };

const spreadDef: IndicatorDef = {
  id: "ap_spread",
  category: "volume",
  pane: "own",
  paneRatio: 0.16,
  fmt: "osc",
  algo: ["ob"],
  keywords: "spread bid ask liquidity obstats supercandles algopack moex спред ликвидность",
  params: [sel("apMetric", "bbo", [opt("bbo"), opt("deep"), opt("big")]), num("apSmooth", 1, 1, 100), col("apColor", AMBER)],
  title: (p) => `${indT("ap.t.spread", "Spread")} ${S(p, "apMetric")}`,
  compute(cs, p, env) {
    const tb = env?.algo?.ob;
    if (!tb || cs.length === 0) return EMPTY;
    const r = bars(cs, env, tb.t);
    const src = tb.col[SPREAD_COL[S(p, "apMetric")] ?? "spread_bbo"] ?? new Float64Array(tb.n).fill(NaN);
    return { plots: [{ key: "Spread", data: smooth(lastCol(r, src), N(p, "apSmooth")), kind: "line", color: S(p, "apColor"), width: 1.6, shape: "step", fmt: "osc" }] };
  },
  drawExtra: noteFor("ob"),
};

/* ───────────── OrderStats: cancellation ratio ───────────── */

const cancelDef: IndicatorDef = {
  id: "ap_cancel",
  category: "volume",
  pane: "own",
  paneRatio: 0.16,
  fmt: "osc",
  algo: ["os"],
  keywords: "cancel cancellation ratio orders placed spoofing churn orderstats supercandles algopack moex отмена заявок отмен",
  params: [sel("apMetric", "vol", [opt("vol"), opt("orders"), opt("val")]), bool("apSides", false), num("apSmooth", 1, 1, 100), col("colorUp", UP), col("colorDown", DOWN), col("apColor", "#7e57c2")],
  title: (p) => `${indT("ap.t.cancel", "Cancel ratio %")} ${S(p, "apMetric")}`,
  compute(cs, p, env) {
    const tb = env?.algo?.os;
    if (!tb || cs.length === 0) return EMPTY;
    const r = bars(cs, env, tb.t);
    const m = S(p, "apMetric");
    const sm = N(p, "apSmooth");
    const ratio = (c: string, put: string) => {
      const a = sumCol(r, tb.col[c] ?? new Float64Array(tb.n).fill(NaN));
      const b = sumCol(r, tb.col[put] ?? new Float64Array(tb.n).fill(NaN));
      const o = new Float64Array(a.length);
      for (let i = 0; i < o.length; i++) o[i] = b[i] > 0 && a[i] === a[i] ? (a[i] / b[i]) * 100 : NaN;
      return smooth(o, sm);
    };
    const key = m === "orders" ? "orders" : m === "val" ? "val" : "vol";
    const plots: PlotSpec[] = [{ key: "Cancel %", data: ratio(`cancel_${key}`, `put_${key}`), kind: "line", color: S(p, "apColor"), width: 1.7, fmt: "osc" }];
    if (B(p, "apSides") && key !== "val") {
      plots.push({ key: "Bids %", data: ratio(`cancel_${key}_b`, `put_${key}_b`), kind: "line", color: S(p, "colorUp"), width: 1.2, fmt: "osc" });
      plots.push({ key: "Asks %", data: ratio(`cancel_${key}_s`, `put_${key}_s`), kind: "line", color: S(p, "colorDown"), width: 1.2, fmt: "osc" });
    }
    return { plots };
  },
  drawExtra: noteFor("os"),
};

/* ───────────── Mega Alerts markers ───────────── */

export interface AlertMark {
  /** bar index */
  i: number;
  dir: 1 | -1 | 0;
  type: string;
  glyph: string;
  price?: number | null;
  t: number;
}

/** One letter for the kind of an alert type. */
export function alertGlyph(type: string): string {
  if (type.startsWith("pr_change")) return "%";
  if (type.startsWith("pr_high")) return "H";
  if (type.startsWith("pr_low")) return "L";
  if (type.startsWith("net_vol")) return "Δ";
  return "V";
}

/** Group an alert type belongs to, for the `kinds` filter. */
export function alertGroup(type: string): "volume" | "netvol" | "price" | "levels" {
  if (type.startsWith("pr_high") || type.startsWith("pr_low")) return "levels";
  if (type.startsWith("pr_change")) return "price";
  if (type.startsWith("net_vol")) return "netvol";
  return "volume";
}

export function alertMarks(cs: { t: number }[], intervalMs: number, alerts: AlgoAlert[], kinds: string): AlertMark[] {
  const out: AlertMark[] = [];
  for (const a of alerts) {
    if (kinds !== "all" && alertGroup(a.type) !== kinds) continue;
    const i = barIndexAt(cs, intervalMs, a.t);
    if (i < 0) continue;
    out.push({ i, dir: a.dir, type: a.type, glyph: alertGlyph(a.type), price: a.price, t: a.t });
  }
  return out;
}

const alertsDef: IndicatorDef = {
  id: "ap_alerts",
  category: "other",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  algo: ["alerts"],
  keywords: "mega alerts anomaly abnormal volume price algopack moex алерты аномалии всплеск объема",
  params: [sel("apKinds", "all", [opt("all"), opt("volume"), opt("netvol"), opt("price"), opt("levels")]), bool("apLabels", true), col("colorUp", UP), col("colorDown", DOWN), col("apColorNeutral", AMBER)],
  styleParams: ["colorUp", "colorDown", "apColorNeutral"],
  title: () => indT("ap.t.alerts", "Mega Alerts"),
  compute(cs, p, env) {
    const a = env?.algo;
    if (!a || cs.length === 0 || a.alerts.length === 0) return EMPTY;
    const marks = alertMarks(cs, env!.intervalMs, a.alerts, S(p, "apKinds"));
    return { plots: [], extra: { marks, total: a.alerts.length } };
  },
  legendItems(res) {
    const ex = res.extra as { marks: AlertMark[]; total: number } | undefined;
    if (!ex) return [];
    const last = ex.marks[ex.marks.length - 1];
    const dir = last ? (last.dir > 0 ? "▲" : last.dir < 0 ? "▼" : "◆") : "";
    return [{ text: `${ex.marks.length}${last ? ` · ${dir} ${indT(`ap.al.${last.type}`, last.type)}` : ""}`, color: AMBER }];
  },
  drawExtra(sc, p, res, env) {
    const a = env?.algo;
    if (a) {
      const st = a.state("alerts");
      if (st !== "ok" && st !== "none") {
        paintNote(sc, stateText(st));
        return;
      }
    }
    const marks = (res?.extra as { marks: AlertMark[] } | undefined)?.marks;
    if (!marks || marks.length === 0) return;
    const { ctx } = sc;
    const cs = sc.candles;
    const colUp = S(p, "colorUp");
    const colDn = S(p, "colorDown");
    const colNe = S(p, "apColorNeutral");
    const labels = B(p, "apLabels") && sc.barSpacing >= 12;
    const stack = new Map<string, number>();
    ctx.save();
    ctx.font = "700 9px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of marks) {
      if (m.i < sc.from - 1 || m.i > sc.to + 1 || m.i >= cs.length) continue;
      const c = cs[m.i];
      const x = sc.x(m.i);
      const side = m.dir >= 0 ? (m.dir > 0 ? "b" : "n") : "t";
      const key = `${m.i}${side}`;
      const k = stack.get(key) ?? 0;
      stack.set(key, k + 1);
      const color = m.dir > 0 ? colUp : m.dir < 0 ? colDn : colNe;
      const sz = 5;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (m.dir > 0) {
        // below the low, pointing up
        const y = sc.y(c.l) + 9 + k * 13;
        ctx.moveTo(x, y - sz);
        ctx.lineTo(x + sz, y + sz * 0.8);
        ctx.lineTo(x - sz, y + sz * 0.8);
        ctx.closePath();
        ctx.fill();
        if (labels) {
          ctx.fillStyle = sc.theme.text;
          ctx.fillText(m.glyph, x, y + 12);
        }
      } else if (m.dir < 0) {
        // above the high, pointing down
        const y = sc.y(c.h) - 9 - k * 13;
        ctx.moveTo(x, y + sz);
        ctx.lineTo(x + sz, y - sz * 0.8);
        ctx.lineTo(x - sz, y - sz * 0.8);
        ctx.closePath();
        ctx.fill();
        if (labels) {
          ctx.fillStyle = sc.theme.text;
          ctx.fillText(m.glyph, x, y - 12);
        }
      } else {
        const y = sc.y(c.h) - 9 - k * 13;
        ctx.moveTo(x, y - sz);
        ctx.lineTo(x + sz, y);
        ctx.lineTo(x, y + sz);
        ctx.lineTo(x - sz, y);
        ctx.closePath();
        ctx.fill();
        if (labels) {
          ctx.fillStyle = sc.theme.text;
          ctx.fillText(m.glyph, x, y - 12);
        }
      }
    }
    ctx.restore();
  },
};

/* ───────────── HI2 ───────────── */

const HI2_METRICS = ["hhi_volume", "hhi_buy", "hhi_sell", "hhi_netflow_buy", "hhi_netflow_sell", "hhi_passive", "hhi_active", "hhi_aggressive"];

const hi2Def: IndicatorDef = {
  id: "ap_hi2",
  category: "volume",
  pane: "own",
  paneRatio: 0.14,
  fmt: "osc",
  algo: ["hi2"],
  keywords: "hi2 hhi herfindahl hirschman concentration market participants algopack moex концентрация рынка индекс херфиндаля",
  params: [sel("apMetric", "hhi_volume", HI2_METRICS.map((m) => ({ value: m, label: m }))), col("apColor", "#26c6da")],
  title: (p) => `HI2 ${S(p, "apMetric")}`,
  compute(cs, p, env) {
    const h = env?.algo?.hi2;
    if (!h || cs.length === 0) return EMPTY;
    // the asked metric, else the first one the feed has (names differ between markets)
    const want = S(p, "apMetric");
    const alias = want === "hhi_active" ? "hhi_aggressive" : want === "hhi_aggressive" ? "hhi_active" : want;
    const name = h.vals[want] ? want : h.vals[alias] ? alias : h.metrics[0];
    if (!name) return EMPTY;
    // a day's value is known after the session: one day after its start
    const data = asOfCol(cs, env!.intervalMs, h.t, h.vals[name], 86_400_000, 10 * 86_400_000);
    return {
      plots: [{ key: name, data, kind: "line", shape: "step", color: S(p, "apColor"), width: 1.6, fmt: "osc" }],
      levels: [
        { value: 1500, color: "rgba(38,166,154,0.55)", dashed: true, name: "ap.lvl.low" },
        { value: 2500, color: "rgba(239,83,80,0.55)", dashed: true, name: "ap.lvl.high" },
      ],
    };
  },
  drawExtra: noteFor("hi2"),
};

export const ALGOPACK_DEFS: IndicatorDef[] = [futoiDef, aggrDef, tradesDef, obimbDef, spreadDef, cancelDef, alertsDef, hi2Def];
export const ALGOPACK_IDS = ALGOPACK_DEFS.map((d) => d.id);

export type { AlgoStore };

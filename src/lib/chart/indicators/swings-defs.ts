import type { SeriesContext } from "../types";
import type { BooleanParam, ColorParam, IndicatorDef, IndResult, LevelSpec, LineStyleName, NumberParam, Params, SelectOption, SelectParam } from "./registry";
import { analyzeZz, specText, type ZzLayer, type ZzOptions, type ZzPivot, type ZzResult } from "../analysis/swings-zz";
import type { SwingMode, SwingSpec } from "../analysis/swings";
import { formatPrice, formatVolume, inferPrecision } from "../format";
import { indT } from "./ind-text";

/* Swings (Double ZigZag with High/Low prints): two zig-zag layers (fast / slow) drawn through the swing highs and lows, a rounded
   price label ("print") at every swing, optional market-structure tags (HH/HL/LH/LL), leg statistics, a dashed provisional last leg
   and horizontal support / resistance levels from the last swings of the slow layer. Detection is in analysis/swings-zz.ts. */

const N = (p: Params, k: string) => p[k] as number;
const S = (p: Params, k: string) => p[k] as string;
const B = (p: Params, k: string) => p[k] as boolean;

const num = (key: string, def: number, min: number, max: number, step = 1): NumberParam => ({ key, type: "number", min, max, step, default: def });
const sel = (key: string, def: string, options: SelectOption[]): SelectParam => ({ key, type: "select", options, default: def });
const bool = (key: string, def: boolean): BooleanParam => ({ key, type: "boolean", default: def });
const col = (key: string, def: string): ColorParam => ({ key, type: "color", default: def });

const finite = (v: number) => v === v && v !== Infinity && v !== -Infinity;

const MODE_OPTIONS: SelectOption[] = [
  { value: "pivot", label: "ind.sz.m.pivot" },
  { value: "pct", label: "ind.sz.m.pct" },
  { value: "atr", label: "ind.sz.m.atr" },
];
const SHOW_OPTIONS: SelectOption[] = [
  { value: "both", label: "ind.sz.s.both" },
  { value: "l1", label: "ind.sz.s.l1" },
  { value: "l2", label: "ind.sz.s.l2" },
  { value: "none", label: "ind.sz.s.none" },
];
const LS_OPTIONS: SelectOption[] = [
  { value: "solid", label: "ind2.ls.solid" },
  { value: "dashed", label: "ind2.ls.dashed" },
  { value: "dotted", label: "ind2.ls.dotted" },
];
const HHLL_OPTIONS: SelectOption[] = [
  { value: "none", label: "ind.sz.hh.none" },
  { value: "show", label: "ind.sz.hh.show" },
];
const EXT_OPTIONS: SelectOption[] = [
  { value: "broken", label: "ind.sz.ext.broken" },
  { value: "right", label: "ind.sz.ext.right" },
];

function specOf(p: Params, k: 1 | 2): SwingSpec {
  return { mode: S(p, "szMode" + k) as SwingMode, bars: N(p, "szBars" + k), pct: N(p, "szPct" + k), atr: N(p, "szAtr" + k) };
}

function optionsOf(p: Params): ZzOptions {
  return { spec1: specOf(p, 1), spec2: specOf(p, 2), window: N(p, "szWindow"), levels: N(p, "szLevels"), mergeAtr: N(p, "szMerge") };
}

function resultOf(res: IndResult | undefined): ZzResult | null {
  const x = res?.extra as ZzResult | undefined;
  return x && Array.isArray(x.layers) ? x : null;
}

const show1 = (p: Params) => S(p, "szShow") === "both" || S(p, "szShow") === "l1";
const show2 = (p: Params) => S(p, "szShow") === "both" || S(p, "szShow") === "l2";

/** Pivots of a layer that are drawn (the provisional last one only unless "confirmed only"). */
function shownPivots(l: ZzLayer, p: Params): ZzPivot[] {
  if (!B(p, "szConfirmed")) return l.pivots;
  return l.pivots.length && !l.pivots[l.pivots.length - 1].confirmed ? l.pivots.slice(0, -1) : l.pivots;
}

/* ───────────── legend ───────────── */

function fmtPct(v: number): string {
  if (!finite(v)) return "";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
}

function legendItems(res: IndResult, p: Params, locale: string): { text: string; color: string }[] {
  const r = resultOf(res);
  if (!r) return [];
  if (!show1(p) && !show2(p)) return [];
  const first: 0 | 1 = show1(p) ? 0 : 1;
  const piv = shownPivots(r.layers[first], p);
  const last = piv[piv.length - 1];
  if (!last) return [];
  const up = last.type === "H";
  const prec = r.precision;
  const pct = fmtPct(last.pct);
  const color = S(p, up ? `szC${first + 1}u` : `szC${first + 1}d`);
  const txt = `${indT("ind.sz.last", "last")}: ${up ? "↑" : "↓"} ${formatPrice(last.p, prec, locale)}${pct ? ` (${pct})` : ""}${last.confirmed ? "" : " ~"}`;
  return [{ text: txt, color: color.toLowerCase() === "#000000" ? "#787b86" : color }];
}

function legendTip(res: IndResult, p: Params, locale: string): string | undefined {
  const r = resultOf(res);
  if (!r) return undefined;
  const lines: string[] = [];
  for (const k of [0, 1] as const) {
    if (!(k === 0 ? show1(p) : show2(p))) continue;
    const piv = shownPivots(r.layers[k], p);
    lines.push(`${indT("ind.sz.layer", "Layer {n}", { n: k + 1 })} (${specText(r.layers[k].spec)}): ${piv.length} ${indT("ind.sz.swings", "swings")}`);
    for (const q of piv.slice(-3).reverse()) lines.push(`  ${q.type === "H" ? "↑" : "↓"} ${formatPrice(q.p, r.precision, locale)} ${q.tag} ${fmtPct(q.pct)}${q.confirmed ? "" : " ~"}`.trimEnd());
  }
  return lines.join("\n");
}

/* ───────────── painting ───────────── */

const rgba = (hex: string, a: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
};

/** Pure black in a colour param means "the chart's text colour" (readable on both themes, like the black default of the original). */
const themed = (sc: SeriesContext, c: string) => (c.toLowerCase() === "#000000" ? sc.theme.text : c);

function dashOf(style: LineStyleName, w: number): number[] {
  if (style === "dashed") return [w * 2.4 + 2, w * 2 + 2];
  if (style === "dotted") return [0.1, w * 2 + 2.4];
  return [];
}

function drawLayerLines(sc: SeriesContext, piv: ZzPivot[], up: string, dn: string, width: number, style: LineStyleName) {
  const { ctx } = sc;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = style === "dotted" ? "round" : "butt";
  const W = sc.paneWidth;
  for (let k = 1; k < piv.length; k++) {
    const a = piv[k - 1];
    const b = piv[k];
    const x0 = sc.x(a.i);
    const x1 = sc.x(b.i);
    if (!finite(x0) || !finite(x1)) continue;
    if (x1 < -20 || x0 > W + 20) continue;
    const y0 = sc.y(a.p);
    const y1 = sc.y(b.p);
    if (!finite(y0) || !finite(y1)) continue;
    const prov = !b.confirmed;
    ctx.strokeStyle = b.p >= a.p ? up : dn;
    ctx.globalAlpha = prov ? 0.85 : 1;
    ctx.setLineDash(prov ? [5, 4] : dashOf(style, width));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const hit = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

interface Cand {
  piv: ZzPivot;
  x: number;
  y: number;
  layer: 1 | 2;
}

function timeText(t: number, intervalMs: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}`;
  if (intervalMs >= 86_400_000) return `${date}.${String(d.getUTCFullYear()).slice(2)}`;
  return `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function drawLabels(sc: SeriesContext, r: ZzResult, p: Params) {
  const { ctx } = sc;
  const W = sc.paneWidth;
  const H = sc.paneHeight;
  const size = N(p, "szLabSize");
  const fill = S(p, "szLabFill");
  const textCol = S(p, "szLabText");
  const textAlpha = Math.max(0, Math.min(1, 1 - N(p, "szTextAlpha") / 100));
  const hhll = S(p, "szHHLL") === "show";
  const xPct = B(p, "szXPct");
  const xBars = B(p, "szXBars");
  const xVol = B(p, "szXVol");
  const xTime = B(p, "szXTime");
  const minGap = N(p, "szMinGap");
  const locale = sc.options.locale;
  const prec = sc.options.pricePrecision ?? r.precision;
  const nc = sc.candles.length;
  const interval = nc > 1 ? Math.abs(sc.candles[nc - 1].t - sc.candles[nc - 2].t) : 0;
  const family = sc.options.fontFamily;

  // candidates: provisional first, then the slow layer, then the fast one
  const prov: Cand[] = [];
  const slow: Cand[] = [];
  const fast: Cand[] = [];
  const slowKeys = new Set<number>();
  const lay: [boolean, boolean] = [show1(p) && B(p, "szLab1"), show2(p) && B(p, "szLab2")];
  for (const layerNo of [2, 1] as const) {
    if (!lay[layerNo - 1]) continue;
    const piv = shownPivots(r.layers[layerNo - 1], p);
    const gap = layerNo === 2 ? minGap * 0.5 : minGap;
    let lastX = -1e9;
    for (let k = 0; k < piv.length; k++) {
      const q = piv[k];
      const x = sc.x(q.i);
      if (!finite(x) || x < -80 || x > W + 80) continue;
      const y = sc.y(q.p);
      if (!finite(y)) continue;
      if (layerNo === 1 && slowKeys.has(q.i)) continue;
      if (!q.confirmed) {
        prov.push({ piv: q, x, y, layer: layerNo });
        continue;
      }
      if (x - lastX < gap) continue;
      lastX = x;
      if (layerNo === 2) {
        slowKeys.add(q.i);
        slow.push({ piv: q, x, y, layer: 2 });
      } else fast.push({ piv: q, x, y, layer: 1 });
    }
  }
  // a provisional swing that is already a confirmed one of the other layer is not printed twice
  const seen = new Set<number>();
  for (const c of slow) seen.add(c.piv.i);
  for (const c of fast) seen.add(c.piv.i);
  const provSeen = new Set<number>();
  const provList = prov.filter((c) => {
    if (seen.has(c.piv.i) || provSeen.has(c.piv.i)) return false;
    provSeen.add(c.piv.i);
    return true;
  });
  const order = [...provList, ...slow, ...fast];
  if (!order.length) return;

  const placed: Box[] = [];
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let budget = 500;
  for (const cd of order) {
    if (budget-- <= 0) break;
    const q = cd.piv;
    const isProv = !q.confirmed;
    const fs = isProv ? Math.max(8, size - 2) : size;
    const main = formatPrice(q.p, prec, locale) + (hhll && q.tag && !isProv ? ` ${q.tag}` : "");
    const parts: string[] = [];
    if (!isProv) {
      if (xTime) parts.push(timeText(q.t, interval));
      if (xPct && finite(q.pct)) parts.push(fmtPct(q.pct));
      if (xBars && q.bars > 0) parts.push(indT("ind.sz.barsN", "{n} bars", { n: q.bars }));
      if (xVol && q.vol > 0) parts.push(`V ${formatVolume(q.vol, locale)}`);
    }
    const extra = parts.join(" · ");
    ctx.font = `700 ${fs}px ${family}`;
    let w = ctx.measureText(main).width;
    const fs2 = Math.max(8, fs - 2);
    if (extra) {
      ctx.font = `500 ${fs2}px ${family}`;
      w = Math.max(w, ctx.measureText(extra).width);
    }
    w += 10;
    const h = fs + 6 + (extra ? fs2 + 2 : 0);
    const above = q.type === "H";
    const tip = 4;
    const baseTop = above ? cd.y - 3 - tip - h : cd.y + 3 + tip;
    let box: Box = { x: cd.x - w / 2, y: baseTop, w, h };
    let ok = !placed.some((b) => hit(box, b));
    let shift = 0;
    if (!ok) {
      for (let s = 1; s <= 6 && !ok; s++) {
        shift = s * (h + 2) * (above ? -1 : 1);
        box = { x: cd.x - w / 2, y: baseTop + shift, w, h };
        ok = !placed.some((b) => hit(box, b));
      }
      if (!ok) {
        if (cd.layer === 1 || isProv) continue;
        shift = 0;
        box = { x: cd.x - w / 2, y: baseTop, w, h };
      }
    }
    if (box.y < 1 || box.y + box.h > H - 1) {
      if (box.y + box.h < 0 || box.y > H) continue;
      box = { ...box, y: Math.max(1, Math.min(H - h - 1, box.y)) };
      shift = 1;
    }
    // keep the box inside the pane horizontally; the pointer still points at the swing
    if (box.x < 1) box = { ...box, x: 1 };
    else if (box.x + box.w > W - 1) box = { ...box, x: Math.max(1, W - 1 - box.w) };
    const px = Math.min(Math.max(cd.x, box.x + 6), box.x + box.w - 6);
    placed.push(box);
    const bg = isProv ? "rgba(120,123,134,0.22)" : fill;
    // pointer / leader
    ctx.fillStyle = bg;
    ctx.strokeStyle = isProv ? "rgba(120,123,134,0.7)" : "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1;
    if (shift !== 0) {
      ctx.beginPath();
      ctx.moveTo(cd.x, cd.y + (above ? -2 : 2));
      ctx.lineTo(cd.x, above ? box.y + box.h : box.y);
      ctx.strokeStyle = "rgba(120,123,134,0.6)";
      ctx.stroke();
      ctx.strokeStyle = isProv ? "rgba(120,123,134,0.7)" : "rgba(0,0,0,0.22)";
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 4);
    else ctx.rect(box.x, box.y, box.w, box.h);
    if (shift === 0) {
      if (above) {
        ctx.moveTo(px - 4, box.y + box.h);
        ctx.lineTo(px, box.y + box.h + tip);
        ctx.lineTo(px + 4, box.y + box.h);
      } else {
        ctx.moveTo(px - 4, box.y);
        ctx.lineTo(px, box.y - tip);
        ctx.lineTo(px + 4, box.y);
      }
    }
    if (isProv) ctx.setLineDash([3, 2]);
    ctx.fill();
    if (isProv) ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = isProv ? 1 : textAlpha;
    ctx.fillStyle = isProv ? sc.theme.textMuted : textCol;
    ctx.font = `700 ${fs}px ${family}`;
    const cy = box.y + (extra ? 3 + fs / 2 + 1 : box.h / 2 + 0.5);
    ctx.fillText(main, box.x + box.w / 2, cy);
    if (extra) {
      ctx.font = `500 ${fs2}px ${family}`;
      ctx.fillText(extra, box.x + box.w / 2, box.y + 3 + fs + 1 + fs2 / 2 + 1);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Broken levels: a segment from the swing to the bar that broke it. */
function drawBrokenLevels(sc: SeriesContext, r: ZzResult, p: Params) {
  if (S(p, "szLvlExt") !== "broken" || N(p, "szLevels") <= 0) return;
  const { ctx } = sc;
  const color = S(p, "szLvlCol");
  const w = N(p, "szLvlWidth");
  ctx.save();
  ctx.strokeStyle = rgba(color, 0.55);
  ctx.lineWidth = w;
  ctx.setLineDash(dashOf(S(p, "szLvlStyle") as LineStyleName, w));
  for (const lv of r.levels) {
    if (lv.broken < 0) continue;
    const x0 = sc.x(lv.i);
    const x1 = sc.x(lv.broken);
    if (!finite(x0) || !finite(x1) || x1 < 0 || x0 > sc.paneWidth) continue;
    const y = Math.round(sc.y(lv.p)) + 0.5;
    if (!finite(y) || y < -2 || y > sc.paneHeight + 2) continue;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, x0), y);
    ctx.lineTo(Math.min(sc.paneWidth, x1), y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSwings(sc: SeriesContext, p: Params, res?: IndResult) {
  const r = resultOf(res);
  if (!r || sc.candles.length === 0) return;
  const { ctx } = sc;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sc.paneWidth, sc.paneHeight);
  ctx.clip();
  drawBrokenLevels(sc, r, p);
  // slow layer first so the fast one stays on top
  if (show2(p)) drawLayerLines(sc, shownPivots(r.layers[1], p), themed(sc, S(p, "szC2u")), themed(sc, S(p, "szC2d")), N(p, "szW2"), S(p, "szStyle2") as LineStyleName);
  if (show1(p)) drawLayerLines(sc, shownPivots(r.layers[0], p), themed(sc, S(p, "szC1u")), themed(sc, S(p, "szC1d")), N(p, "szW1"), S(p, "szStyle1") as LineStyleName);
  ctx.restore();
}

function drawSwingLabels(sc: SeriesContext, p: Params, res?: IndResult) {
  const r = resultOf(res);
  if (!r || sc.candles.length === 0) return;
  const { ctx } = sc;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sc.paneWidth, sc.paneHeight);
  ctx.clip();
  drawLabels(sc, r, p);
  ctx.restore();
}

/* ───────────── definition ───────────── */

export const SWINGS_DEF: IndicatorDef = {
  id: "swings_zz",
  category: "trend",
  pane: "overlay",
  fixedPane: true,
  fmt: "price",
  keywords: "swings double zigzag zig zag high low prints pivots hh hl lh ll support resistance свинги зигзаг пивоты экстремумы поддержка сопротивление 摆动 之字",
  params: [
    sel("szShow", "both", SHOW_OPTIONS),
    sel("szMode1", "pivot", MODE_OPTIONS),
    num("szBars1", 5, 1, 100),
    num("szPct1", 1, 0.05, 50, 0.05),
    num("szAtr1", 2, 0.5, 20, 0.1),
    sel("szMode2", "pivot", MODE_OPTIONS),
    num("szBars2", 30, 1, 200),
    num("szPct2", 5, 0.05, 50, 0.05),
    num("szAtr2", 4, 0.5, 30, 0.1),
    bool("szLab1", true),
    bool("szLab2", true),
    sel("szHHLL", "none", HHLL_OPTIONS),
    bool("szXTime", false),
    bool("szXPct", false),
    bool("szXBars", false),
    bool("szXVol", false),
    bool("szConfirmed", false),
    num("szMinGap", 26, 0, 200),
    num("szWindow", 2000, 100, 20000, 100),
    sel("szStyle1", "dashed", LS_OPTIONS),
    num("szW1", 1, 1, 4, 0.5),
    sel("szStyle2", "solid", LS_OPTIONS),
    num("szW2", 1.5, 1, 4, 0.5),
    num("szLabSize", 11, 8, 18),
    num("szTextAlpha", 0, 0, 100, 5),
    num("szLevels", 4, 0, 12),
    sel("szLvlExt", "broken", EXT_OPTIONS),
    num("szMerge", 0.5, 0, 10, 0.1),
    num("szLvlWidth", 1, 1, 4, 0.5),
    sel("szLvlStyle", "solid", LS_OPTIONS),
    col("szC1u", "#089981"),
    col("szC1d", "#f23645"),
    col("szC2u", "#000000"),
    col("szC2d", "#000000"),
    col("szLabFill", "#ffeb3b"),
    col("szLabText", "#1e222d"),
    col("szLvlCol", "#2962ff"),
  ],
  styleParams: ["szC1u", "szC1d", "szC2u", "szC2d", "szLabFill", "szLabText", "szLvlCol"],
  title(p) {
    const parts: string[] = [];
    if (show1(p)) parts.push(specText(specOf(p, 1)));
    if (show2(p)) parts.push(specText(specOf(p, 2)));
    return `${indT("ind.sz.short", "Swings ZZ")}${parts.length ? " " + parts.join("/") : ""}`;
  },
  compute(cs, p) {
    if (cs.length < 5) return { plots: [] };
    const r = analyzeZz(cs, optionsOf(p));
    r.precision = inferPrecision(cs);
    const levels: LevelSpec[] = [];
    const ext = S(p, "szLvlExt");
    const color = S(p, "szLvlCol");
    const w = N(p, "szLvlWidth");
    const st = S(p, "szLvlStyle") as LineStyleName;
    r.levels.forEach((lv, k) => {
      if (ext === "broken" && lv.broken >= 0) return;
      levels.push({ value: lv.p, color, width: w, lineStyle: st, name: `S/R ${k + 1}`, fromIndex: lv.i, flag: true, scale: false });
    });
    return { plots: [], levels, extra: r };
  },
  drawExtra(sc, p, res) {
    drawSwings(sc, p, res);
  },
  drawTop(sc, p, res) {
    drawSwingLabels(sc, p, res);
  },
  legendItems,
  legendTip,
};

export const SWINGS_DEFS: IndicatorDef[] = [SWINGS_DEF];

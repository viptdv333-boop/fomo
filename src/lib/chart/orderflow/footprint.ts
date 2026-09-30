import type { Candle, SeriesContext } from "../types";
import type { FlowBar, FootprintSettings } from "./types";
import type { OrderFlowStore } from "./store";
import { DAY_MS } from "./flowmath";

/* Footprint chart: every bar shows the volume traded at each price level, split into bid (market sells) and ask (market
   buys). Painted inside the engine's main pane; level of detail follows the zoom (plain candles when the bars are too narrow). */

export interface FootprintHost {
  bars: Candle[];
  store: OrderFlowStore;
  settings: FootprintSettings;
  colors(up: boolean): { body: string; border: string; wick: string };
  isUp(i: number): boolean;
  fontFamily: string;
  locale: string;
}

export interface FootprintFrame {
  /** false = too narrow for cells: the engine paints ordinary candles. */
  cells: boolean;
  text: boolean;
  step: number;
  base: number;
  approxBars: number;
  realBars: number;
  /** Height of the totals table at the bottom of the pane, px. */
  totalsH: number;
}

export const NO_FRAME: FootprintFrame = { cells: false, text: false, step: 0, base: 0, approxBars: 0, realBars: 0, totalsH: 0 };

const ROW_H = 13;
const TOTAL_ROWS = 4;
const NICE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000];

export function niceMultiple(k: number): number {
  if (k <= 1) return 1;
  for (const v of NICE) if (v >= k) return v;
  return Math.ceil(k / 1000) * 1000;
}

export function footprintTotalsHeight(s: FootprintSettings): number {
  return s.totals ? TOTAL_ROWS * ROW_H + 6 : 0;
}

/* ───────────── colours ───────────── */

function parseColor(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (r) return [+r[1], +r[2], +r[3]];
  return null;
}

const rgbaCache = new Map<string, string>();
function rgba(color: string, a: number): string {
  const q = Math.round(a * 50) / 50;
  const key = color + q;
  let v = rgbaCache.get(key);
  if (!v) {
    const p = parseColor(color);
    v = p ? `rgba(${p[0]},${p[1]},${p[2]},${q})` : color;
    if (rgbaCache.size > 3000) rgbaCache.clear();
    rgbaCache.set(key, v);
  }
  return v;
}

/* ───────────── text ───────────── */

const fmtCache = new Map<number, string>();
export function fmtQty(v: number): string {
  const key = Math.round(v * 1000);
  let s = fmtCache.get(key);
  if (s !== undefined) return s;
  const a = Math.abs(v);
  if (a >= 1e9) s = (v / 1e9).toFixed(1) + "B";
  else if (a >= 1e6) s = (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
  else if (a >= 1e4) s = (v / 1e3).toFixed(1) + "K";
  else if (a >= 1000) s = (v / 1e3).toFixed(2) + "K";
  else if (a >= 100) s = v.toFixed(0);
  else if (a >= 10) s = v.toFixed(1);
  else if (a >= 1) s = v.toFixed(2);
  else if (a >= 0.001) s = v.toFixed(3);
  else s = a === 0 ? "0" : v.toExponential(0);
  if (fmtCache.size > 4000) fmtCache.clear();
  fmtCache.set(key, s);
  return s;
}
const signed = (v: number) => (v > 0 ? "+" : "") + fmtQty(v);

let measureFont = "";
const widthCache = new Map<string, number>();
function textW(ctx: CanvasRenderingContext2D, s: string): number {
  let w = widthCache.get(s);
  if (w === undefined) {
    w = ctx.measureText(s).width;
    if (widthCache.size > 3000) widthCache.clear();
    widthCache.set(s, w);
  }
  return w;
}

export interface FlowLabels {
  approx: string;
  approxShort: string;
  partial: string;
  zoom: string;
  delayed: string;
  vol: string;
  delta: string;
  cum: string;
  noData: string;
  live: string;
  price: string;
}

export function flowLabels(locale: string): FlowLabels {
  if (locale.startsWith("ru"))
    return { approx: "≈ оценка по свечам (нет тиковых данных)", approxShort: "≈ оценка", partial: "часть баров ≈ оценка", zoom: "Футпринт: приблизьте график, чтобы увидеть кластеры", delayed: "≈ оценка: сделки MOEX приходят с задержкой ~15 мин", vol: "Объём", delta: "Дельта", cum: "Накоп. Δ", noData: "нет данных", live: "тики", price: "Цена" };
  if (locale.startsWith("zh"))
    return { approx: "≈ 按K线估算 (无逐笔数据)", approxShort: "≈ 估算", partial: "部分K线为估算", zoom: "足迹图: 放大图表以查看簇", delayed: "≈ 估算: MOEX 成交延迟约15分钟", vol: "成交量", delta: "Delta", cum: "累计Δ", noData: "无数据", live: "逐笔", price: "价格" };
  return { approx: "≈ candle-based estimate (no tick data)", approxShort: "≈ estimate", partial: "some bars are estimated", zoom: "Footprint: zoom in to see the clusters", delayed: "≈ estimate: MOEX trades arrive ~15 min late", vol: "Volume", delta: "Delta", cum: "Cum. Δ", noData: "no data", live: "ticks", price: "Price" };
}

/* ───────────── per-bar analysis ───────────── */

interface Analysis {
  n: number;
  price: number[];
  bid: number[];
  ask: number[];
  maxSide: number;
  maxTotal: number;
  maxAbsDelta: number;
  poc: number;
  vaLo: number;
  vaHi: number;
  buyImb: boolean[];
  sellImb: boolean[];
  stackBuy: boolean[];
  stackSell: boolean[];
}

const analysisCache = new WeakMap<number[], { key: string; a: Analysis }>();

/** analyse() memoised per levels array (they are stable objects until the data or the step changes). */
function analyseCached(lv: number[], step: number, s: FootprintSettings): Analysis {
  const key = `${step}|${s.imbalance}|${s.imbalanceRatio}|${s.imbalanceMinVol}|${s.diagonal}|${s.stacked}|${s.stackedCount}|${s.valueArea}|${s.valueAreaPct}`;
  const hit = analysisCache.get(lv);
  if (hit && hit.key === key) return hit.a;
  const a = analyse(lv, step, s);
  analysisCache.set(lv, { key, a });
  return a;
}

function analyse(lv: number[], step: number, s: FootprintSettings): Analysis {
  const n = lv.length / 3;
  const price = new Array<number>(n);
  const bid = new Array<number>(n);
  const ask = new Array<number>(n);
  let maxSide = 0;
  let maxTotal = 0;
  let maxAbsDelta = 0;
  let poc = 0;
  let total = 0;
  for (let j = 0; j < n; j++) {
    price[j] = lv[j * 3];
    bid[j] = lv[j * 3 + 1];
    ask[j] = lv[j * 3 + 2];
    const t = bid[j] + ask[j];
    total += t;
    if (bid[j] > maxSide) maxSide = bid[j];
    if (ask[j] > maxSide) maxSide = ask[j];
    if (t > maxTotal) {
      maxTotal = t;
      poc = j;
    }
    const d = Math.abs(ask[j] - bid[j]);
    if (d > maxAbsDelta) maxAbsDelta = d;
  }
  // value area around the POC
  let vaLo = poc;
  let vaHi = poc;
  if (s.valueArea && n > 0) {
    const need = (total * s.valueAreaPct) / 100;
    let acc = maxTotal;
    const at = (j: number) => (j >= 0 && j < n ? bid[j] + ask[j] : -1);
    while (acc < need && (vaLo > 0 || vaHi < n - 1)) {
      const below = at(vaLo - 1);
      const above = at(vaHi + 1);
      if (above >= below && above >= 0) {
        vaHi++;
        acc += above;
      } else if (below >= 0) {
        vaLo--;
        acc += below;
      } else break;
    }
  }
  const buyImb = new Array<boolean>(n).fill(false);
  const sellImb = new Array<boolean>(n).fill(false);
  if (s.imbalance) {
    // one-lot prints on a level next to an empty one are noise: ignore anything below 4 % of the bar's biggest cell
    const floor = Math.max(s.imbalanceMinVol, maxSide * 0.04);
    for (let j = 0; j < n; j++) {
      if (s.diagonal) {
        // buyers at this price against the sellers one level below; sellers against the buyers one level above.
        // A missing neighbour level means nobody traded there (0). The outermost levels have no neighbour to compare with.
        if (j > 0) {
          const opp = Math.abs(price[j - 1] - (price[j] - step)) < step * 0.01 ? bid[j - 1] : 0;
          if (ask[j] > 0 && ask[j] >= floor && ask[j] >= opp * s.imbalanceRatio) buyImb[j] = true;
        }
        if (j < n - 1) {
          const opp = Math.abs(price[j + 1] - (price[j] + step)) < step * 0.01 ? ask[j + 1] : 0;
          if (bid[j] > 0 && bid[j] >= floor && bid[j] >= opp * s.imbalanceRatio) sellImb[j] = true;
        }
      } else {
        if (ask[j] > 0 && ask[j] >= floor && ask[j] >= bid[j] * s.imbalanceRatio) buyImb[j] = true;
        if (bid[j] > 0 && bid[j] >= floor && bid[j] >= ask[j] * s.imbalanceRatio) sellImb[j] = true;
      }
    }
  }
  const stackBuy = new Array<boolean>(n).fill(false);
  const stackSell = new Array<boolean>(n).fill(false);
  if (s.stacked && s.imbalance) {
    const mark = (flags: boolean[], out: boolean[]) => {
      let j = 0;
      while (j < n) {
        if (!flags[j]) {
          j++;
          continue;
        }
        let k = j;
        while (k + 1 < n && flags[k + 1] && Math.abs(price[k + 1] - price[k] - step) < step * 0.01) k++;
        if (k - j + 1 >= s.stackedCount) for (let q = j; q <= k; q++) out[q] = true;
        j = k + 1;
      }
    };
    mark(buyImb, stackBuy);
    mark(sellImb, stackSell);
  }
  return { n, price, bid, ask, maxSide, maxTotal, maxAbsDelta, poc, vaLo, vaHi, buyImb, sellImb, stackBuy, stackSell };
}

/* ───────────── frame ───────────── */

interface Cum {
  key: string;
  cum: Float64Array;
}
let cumCache: Cum | null = null;

/** Cumulative delta restarted every day, per candle index (cached). */
function cumulativeDelta(h: FootprintHost): Float64Array {
  const n = h.bars.length;
  const last = n ? h.bars[n - 1] : null;
  const key = `${h.store.version}|${n}|${h.bars[0]?.t}|${last?.t}|${last?.v}|${last?.c}`;
  if (cumCache && cumCache.key === key) return cumCache.cum;
  const cum = new Float64Array(n);
  let acc = 0;
  let day = NaN;
  const shift = h.store.wallShiftMs;
  for (let i = 0; i < n; i++) {
    const c = h.bars[i];
    const d = Math.floor((c.t + shift) / DAY_MS);
    if (d !== day) {
      day = d;
      acc = 0;
    }
    acc += barDelta(h.store, c);
    cum[i] = acc;
  }
  cumCache = { key, cum };
  return cum;
}

function barDelta(store: OrderFlowStore, c: Candle): number {
  const r = store.real(c.t);
  if (r) return r.ask - r.bid;
  const range = c.h - c.l;
  const k = range > 0 ? Math.max(-1, Math.min(1, (c.c - c.o) / range)) : 0;
  return c.v * k;
}

/** Cell step (price units) and level of detail for the current zoom. */
export function footprintLayout(h: FootprintHost, sc: SeriesContext): FootprintFrame {
  const s = h.settings;
  const spacing = sc.barSpacing;
  const totalsH = footprintTotalsHeight(s);
  if (spacing < 22 || sc.to < sc.from) return { ...NO_FRAME, totalsH };
  const store = h.store;
  const base = store.baseTick();
  const ref = h.bars[Math.min(sc.to, h.bars.length - 1)];
  const p0 = ref ? ref.c : 0;
  const px = Math.abs(sc.y(p0) - sc.y(p0 + base));
  if (!(px > 0.0001) || !isFinite(px)) return { ...NO_FRAME, totalsH };
  const wantText = spacing >= 44;
  const minCell = wantText ? 12.5 : 7;
  let k: number;
  if (s.stepTicks > 0) {
    const native = store.nativeTick > 0 ? store.nativeTick : base;
    k = Math.max(1, Math.round((s.stepTicks * native) / base));
  } else k = niceMultiple(Math.ceil(minCell / px - 1e-9));
  const step = base * k;
  const cellPx = px * k;
  const text = wantText && cellPx >= 11;
  // the cells are too flat even at the coarsest sensible step: draw candles
  if (cellPx < 3) return { ...NO_FRAME, totalsH };
  return { cells: true, text, step, base, approxBars: 0, realBars: 0, totalsH };
}

export function drawFootprint(h: FootprintHost, sc: SeriesContext, frame: FootprintFrame): FootprintFrame {
  const { ctx } = sc;
  const s = h.settings;
  const th = sc.theme;
  const store = h.store;
  const step = frame.step;
  const spacing = sc.barSpacing;
  const barW = Math.max(6, spacing * 0.94);
  const half = barW / 2;
  const centerGap = frame.text ? Math.min(14, Math.max(6, spacing * 0.1)) : 0;
  const sideW = half - centerGap / 2;
  const buyC = s.colors.buy || th.up;
  const sellC = s.colors.sell || th.down;
  const imbBuyC = s.colors.imbBuy || buyC;
  const imbSellC = s.colors.imbSell || sellC;
  const textC = s.colors.text || th.text;
  let cellFs = 11;

  let approxBars = 0;
  let realBars = 0;
  const cum = s.totals ? cumulativeDelta(h) : null;
  const totalsTop = sc.paneHeight - frame.totalsH;

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "miter";

  for (let i = sc.from; i <= sc.to; i++) {
    const c = h.bars[i];
    if (!c) continue;
    const cx = sc.x(i);
    if (cx + half < 0 || cx - half > sc.paneWidth) continue;
    const fb: FlowBar = store.barFor(c, step);
    if (fb.real) realBars++;
    else approxBars++;
    const lv = store.levelsAt(fb, step);
    const A = analyseCached(lv, step, s);
    const left = cx - half;
    const up = h.isUp(i);
    const cc = h.colors(up);
    // estimated bars (no trades for them) are drawn paler, with a dashed frame
    ctx.globalAlpha = fb.real ? 1 : 0.55;

    // value area band
    if (s.valueArea && A.n > 0) {
      const yTop = sc.y(A.price[A.vaHi] + step);
      const yBot = sc.y(A.price[A.vaLo]);
      ctx.fillStyle = rgba(s.colors.valueArea, 0.1);
      ctx.fillRect(left, yTop, barW, yBot - yTop);
    }

    // cells
    if (A.n > 0) {
      // font size follows the cell height
      const cellH0 = Math.abs(sc.y(A.price[0]) - sc.y(A.price[0] + step));
      if (frame.text) {
        cellFs = Math.max(8, Math.min(12, Math.floor(cellH0 * 0.78)));
        const font = `${cellFs}px ${h.fontFamily}`;
        ctx.font = font;
        if (measureFont !== font) {
          measureFont = font;
          widthCache.clear();
        }
      }
      for (let j = 0; j < A.n; j++) {
        const yT = sc.y(A.price[j] + step);
        const yB = sc.y(A.price[j]);
        const cellH = yB - yT;
        if (yB < -2 || yT > sc.paneHeight + 2) continue;
        const top = yT + 0.5;
        const hh = Math.max(1, cellH - 1);
        const b = A.bid[j];
        const a = A.ask[j];
        const tot = a + b;
        let bgL = "";
        let bgR = "";
        let bgAll = "";
        if (s.mode === "bidask") {
          if (b > 0) bgL = rgba(sellC, 0.1 + 0.5 * Math.min(1, b / (A.maxSide || 1)));
          if (a > 0) bgR = rgba(buyC, 0.1 + 0.5 * Math.min(1, a / (A.maxSide || 1)));
        } else if (s.mode === "delta") {
          const d = a - b;
          if (d !== 0) bgAll = rgba(d > 0 ? buyC : sellC, 0.12 + 0.6 * Math.min(1, Math.abs(d) / (A.maxAbsDelta || 1)));
        } else if (s.mode === "volume") {
          if (tot > 0) bgAll = rgba(s.colors.valueArea, 0.08 + 0.6 * Math.min(1, tot / (A.maxTotal || 1)));
        } else {
          const d = a - b;
          if (tot > 0) bgAll = rgba(d >= 0 ? buyC : sellC, 0.08 + 0.62 * Math.min(1, tot / (A.maxTotal || 1)));
        }
        if (bgAll) {
          ctx.fillStyle = bgAll;
          ctx.fillRect(left, top, barW, hh);
        } else {
          if (bgL) {
            ctx.fillStyle = bgL;
            ctx.fillRect(left, top, half - centerGap / 2, hh);
          }
          if (bgR) {
            ctx.fillStyle = bgR;
            ctx.fillRect(cx + centerGap / 2, top, half - centerGap / 2, hh);
          }
        }
      }
    }

    // bar frame + mini candle
    if (A.n > 0) {
      const yTop = sc.y(A.price[A.n - 1] + step);
      const yBot = sc.y(A.price[0]);
      ctx.strokeStyle = rgba(cc.body, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash(fb.real ? [] : [3, 3]);
      ctx.strokeRect(Math.round(left) + 0.5, Math.round(yTop) + 0.5, Math.round(barW), Math.max(1, Math.round(yBot - yTop)));
    }
    ctx.setLineDash([]);
    if (s.candleBody) {
      const wx = Math.round(cx) + 0.5;
      ctx.strokeStyle = cc.wick;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx, sc.y(c.h));
      ctx.lineTo(wx, sc.y(c.l));
      ctx.stroke();
      const bw = frame.text ? Math.max(3, Math.min(6, centerGap * 0.5)) : Math.max(3, Math.min(7, spacing * 0.22));
      const yo = sc.y(c.o);
      const yc = sc.y(c.c);
      ctx.fillStyle = cc.body;
      ctx.fillRect(Math.round(cx - bw / 2), Math.min(yo, yc), Math.round(bw), Math.max(1, Math.abs(yc - yo)));
    }

    if (A.n > 0) {
      // numbers + imbalance marks
      for (let j = 0; j < A.n; j++) {
        const yT = sc.y(A.price[j] + step);
        const yB = sc.y(A.price[j]);
        if (yB < -2 || yT > sc.paneHeight + 2) continue;
        const cellH = yB - yT;
        const mid = (yT + yB) / 2;
        const b = A.bid[j];
        const a = A.ask[j];
        const top = yT + 0.5;
        const hh = Math.max(1, cellH - 1);
        // imbalance frames (visible even without numbers); they belong to the two-column Bid x Ask layout
        if (s.mode !== "bidask") {
          /* no imbalance marks in the single-column modes */
        } else if (A.buyImb[j]) {
          ctx.strokeStyle = imbBuyC;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + centerGap / 2 + 0.5, top + 0.5, sideW - 1, Math.max(1, hh - 1));
        }
        if (s.mode === "bidask" && A.sellImb[j]) {
          ctx.strokeStyle = imbSellC;
          ctx.lineWidth = 1;
          ctx.strokeRect(left + 0.5, top + 0.5, sideW - 1, Math.max(1, hh - 1));
        }
        // stacked imbalances: a solid rail on the outer edge of the bar
        if (s.mode === "bidask" && A.stackBuy[j]) {
          ctx.fillStyle = s.colors.stacked;
          ctx.fillRect(left + barW - 3, top, 3, hh);
        }
        if (s.mode === "bidask" && A.stackSell[j]) {
          ctx.fillStyle = s.colors.stacked;
          ctx.fillRect(left, top, 3, hh);
        }
        if (frame.text) {
          const pad = 3;
          if (s.mode === "bidask") {
            if (b > 0) {
              ctx.textAlign = "right";
              ctx.fillStyle = A.sellImb[j] ? imbSellC : textC;
              if (A.sellImb[j]) ctx.font = `600 ${cellFs}px ${h.fontFamily}`;
              ctx.fillText(fitText(ctx, fmtQty(b), sideW - pad * 2), cx - centerGap / 2 - pad, mid + 0.5);
              if (A.sellImb[j]) ctx.font = `${cellFs}px ${h.fontFamily}`;
            }
            if (a > 0) {
              ctx.textAlign = "left";
              ctx.fillStyle = A.buyImb[j] ? imbBuyC : textC;
              if (A.buyImb[j]) ctx.font = `600 ${cellFs}px ${h.fontFamily}`;
              ctx.fillText(fitText(ctx, fmtQty(a), sideW - pad * 2), cx + centerGap / 2 + pad, mid + 0.5);
              if (A.buyImb[j]) ctx.font = `${cellFs}px ${h.fontFamily}`;
            }
          } else {
            const d = a - b;
            const t = a + b;
            let str: string;
            if (s.mode === "delta") str = d === 0 ? "" : signed(d);
            else if (s.mode === "volume") str = t === 0 ? "" : fmtQty(t);
            else str = t === 0 ? "" : signed(d);
            if (str) {
              ctx.textAlign = "center";
              ctx.fillStyle = textC;
              ctx.fillText(fitText(ctx, str, barW - 6), cx, mid + 0.5);
            }
          }
        }
      }
      // point of control
      if (s.poc) {
        const yT = sc.y(A.price[A.poc] + step);
        const yB = sc.y(A.price[A.poc]);
        ctx.strokeStyle = s.colors.poc;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(left + 0.5, yT + 0.5, barW - 1, Math.max(1, yB - yT - 1));
      }
      // unfinished auction
      if (s.unfinished) {
        const hi = A.n - 1;
        if (A.bid[hi] > 0 && A.ask[hi] > 0) tri(ctx, cx, sc.y(A.price[hi] + step) - 3, true, s.colors.poc);
        if (A.bid[0] > 0 && A.ask[0] > 0) tri(ctx, cx, sc.y(A.price[0]) + 3, false, s.colors.poc);
      }
      // approximation marker
      if (!fb.real) {
        ctx.fillStyle = rgba(th.textMuted, 0.9);
        ctx.font = `600 9px ${h.fontFamily}`;
        ctx.textAlign = "center";
        ctx.fillText("≈", cx, Math.min(sc.paneHeight - frame.totalsH - 6, sc.y(A.price[0]) + 10));
        if (frame.text) ctx.font = `${cellFs}px ${h.fontFamily}`;
      }
    }

    // totals column
    if (cum) {
      const vol = fb.bid + fb.ask;
      const d = fb.ask - fb.bid;
      const pct = vol > 0 ? (d / vol) * 100 : 0;
      const cd = cum[i] ?? 0;
      const rows: [string, string][] = [
        [fmtQty(vol), textC],
        [signed(d), d >= 0 ? buyC : sellC],
        [(pct > 0 ? "+" : "") + pct.toFixed(0) + "%", pct >= 0 ? buyC : sellC],
        [signed(cd), cd >= 0 ? buyC : sellC],
      ];
      ctx.font = `600 10px ${h.fontFamily}`;
      ctx.textAlign = "center";
      for (let r = 0; r < rows.length; r++) {
        const y = totalsTop + 3 + r * ROW_H;
        ctx.fillStyle = r === 0 ? rgba(th.textMuted, 0.12) : rgba(rows[r][1], 0.14);
        ctx.fillRect(left, y, barW, ROW_H - 1);
        ctx.fillStyle = rows[r][1];
        ctx.fillText(fitText(ctx, rows[r][0], barW - 4), cx, y + ROW_H / 2);
      }
      if (frame.text) ctx.font = `${cellFs}px ${h.fontFamily}`;
    }
    ctx.globalAlpha = 1;
  }

  // row names at the left edge of the totals table
  if (cum) {
    const labels = ["Σ", "Δ", "Δ%", "∑Δ"];
    ctx.font = `600 9px ${h.fontFamily}`;
    ctx.textAlign = "left";
    for (let r = 0; r < labels.length; r++) {
      const y = totalsTop + 3 + r * ROW_H;
      ctx.fillStyle = rgba(th.bg, 0.85);
      ctx.fillRect(0, y, 22, ROW_H - 1);
      ctx.fillStyle = th.textMuted;
      ctx.fillText(labels[r], 3, y + ROW_H / 2);
    }
  }
  ctx.restore();
  return { ...frame, approxBars, realBars };
}

function fitText(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (max <= 0) return "";
  if (textW(ctx, s) <= max) return s;
  // shorten: drop decimals, then give up
  const dot = s.indexOf(".");
  if (dot > 0) {
    const tail = s.replace(/[0-9.]+/, "");
    const t = s.slice(0, dot) + tail;
    if (textW(ctx, t) <= max) return t;
  }
  return "";
}

function tri(ctx: CanvasRenderingContext2D, x: number, y: number, upDir: boolean, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (upDir) {
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x - 4, y + 1);
    ctx.lineTo(x + 4, y + 1);
  } else {
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x - 4, y - 1);
    ctx.lineTo(x + 4, y - 1);
  }
  ctx.closePath();
  ctx.fill();
}

/* ───────────── crosshair tooltip ───────────── */

export interface FootprintTip {
  price: number;
  lo: number;
  hi: number;
  bid: number;
  ask: number;
  barBid: number;
  barAsk: number;
  real: boolean;
  poc: number;
}

/** Numbers under the pointer: the cell at `price` of bar `index`. */
export function footprintTip(h: FootprintHost, index: number, price: number, step: number): FootprintTip | null {
  const c = h.bars[index];
  if (!c || !(step > 0)) return null;
  const fb = h.store.barFor(c, step);
  const lv = h.store.levelsAt(fb, step);
  let bid = 0;
  let ask = 0;
  let lo = Math.floor(price / step + 1e-9) * step;
  let poc = 0;
  let pocV = -1;
  for (let k = 0; k < lv.length; k += 3) {
    const t = lv[k + 1] + lv[k + 2];
    if (t > pocV) {
      pocV = t;
      poc = lv[k];
    }
    if (Math.abs(lv[k] - lo) < step * 0.01) {
      bid = lv[k + 1];
      ask = lv[k + 2];
      lo = lv[k];
    }
  }
  return { price, lo, hi: lo + step, bid, ask, barBid: fb.bid, barAsk: fb.ask, real: fb.real, poc };
}

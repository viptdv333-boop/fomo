import type { IndicatorDef, LevelSpec } from "./registry";
import * as M from "./math";

/** First AlgoBots catalogue entry: confirmed swing levels with breakout, retest and rejection markers. */
export const ALGOBOT_DEFS: IndicatorDef[] = [
  {
    id: "test1",
    category: "algobots",
    pane: "overlay",
    fixedPane: true,
    fmt: "price",
    keywords: "algo bot levels breakout retest bounce support resistance long short",
    params: [
      { key: "pivotBars", type: "number", min: 2, max: 20, step: 1, default: 5 },
      { key: "atrLength", type: "number", min: 2, max: 100, step: 1, default: 14 },
      { key: "toleranceAtr", type: "number", min: 0.05, max: 1, step: 0.05, default: 0.2 },
      { key: "resistanceColor", type: "color", default: "#ef5350" },
      { key: "supportColor", type: "color", default: "#26a69a" },
      { key: "longColor", type: "color", default: "#00a878" },
      { key: "shortColor", type: "color", default: "#ef5350" },
    ],
    title: () => "Test1",
    compute(candles, p) {
      const n = candles.length;
      if (n < 10) return { plots: [] };
      const pivotBars = Math.max(2, Math.floor(Number(p.pivotBars) || 5));
      const atr = M.atr(candles.map((x) => x.h), candles.map((x) => x.l), candles.map((x) => x.c), Number(p.atrLength) || 14);
      const longBreak = new Float64Array(n).fill(Number.NaN);
      const shortBreak = new Float64Array(n).fill(Number.NaN);
      const longRetest = new Float64Array(n).fill(Number.NaN);
      const shortRetest = new Float64Array(n).fill(Number.NaN);
      const longBounce = new Float64Array(n).fill(Number.NaN);
      const shortBounce = new Float64Array(n).fill(Number.NaN);
      const signals: { i: number; dir: "long" | "short"; kind: "breakout" | "retest" | "bounce"; price: number }[] = [];
      let resistance: { value: number; from: number } | null = null;
      let support: { value: number; from: number } | null = null;
      let breakout: { dir: "long" | "short"; level: number; at: number; used: boolean } | null = null;

      for (let i = pivotBars * 2; i < n; i++) {
        const pivot = i - pivotBars;
        let isHigh = true;
        let isLow = true;
        for (let j = pivot - pivotBars; j <= pivot + pivotBars; j++) {
          if (j === pivot) continue;
          if (candles[j].h >= candles[pivot].h) isHigh = false;
          if (candles[j].l <= candles[pivot].l) isLow = false;
          if (!isHigh && !isLow) break;
        }
        if (isHigh) resistance = { value: candles[pivot].h, from: pivot };
        if (isLow) support = { value: candles[pivot].l, from: pivot };

        const range = Number.isFinite(atr[i]) ? Math.max(atr[i] * Number(p.toleranceAtr || 0.2), 0) : 0;
        const c = candles[i];
        const prev = candles[i - 1];
        let madeBreak = false;
        if (resistance && prev.c <= resistance.value && c.c > resistance.value) {
          longBreak[i] = c.l - (Number.isFinite(atr[i]) ? atr[i] * 0.18 : 0);
          signals.push({ i, dir: "long", kind: "breakout", price: longBreak[i] });
          breakout = { dir: "long", level: resistance.value, at: i, used: false };
          madeBreak = true;
        } else if (support && prev.c >= support.value && c.c < support.value) {
          shortBreak[i] = c.h + (Number.isFinite(atr[i]) ? atr[i] * 0.18 : 0);
          signals.push({ i, dir: "short", kind: "breakout", price: shortBreak[i] });
          breakout = { dir: "short", level: support.value, at: i, used: false };
          madeBreak = true;
        }

        if (!madeBreak && breakout && !breakout.used && i > breakout.at && i - breakout.at <= 24) {
          if (breakout.dir === "long" && c.l <= breakout.level + range && c.c > breakout.level && c.c > c.o) {
            longRetest[i] = c.l - (Number.isFinite(atr[i]) ? atr[i] * 0.18 : 0);
            signals.push({ i, dir: "long", kind: "retest", price: longRetest[i] });
            breakout.used = true;
          } else if (breakout.dir === "short" && c.h >= breakout.level - range && c.c < breakout.level && c.c < c.o) {
            shortRetest[i] = c.h + (Number.isFinite(atr[i]) ? atr[i] * 0.18 : 0);
            signals.push({ i, dir: "short", kind: "retest", price: shortRetest[i] });
            breakout.used = true;
          }
        }

        if (!madeBreak && support && c.l <= support.value + range && c.c > support.value && c.c > c.o && prev.l > support.value + range) {
          longBounce[i] = c.l - (Number.isFinite(atr[i]) ? atr[i] * 0.18 : 0);
          signals.push({ i, dir: "long", kind: "bounce", price: longBounce[i] });
        }
        if (!madeBreak && resistance && c.h >= resistance.value - range && c.c < resistance.value && c.c < c.o && prev.h < resistance.value - range) {
          shortBounce[i] = c.h + (Number.isFinite(atr[i]) ? atr[i] * 0.18 : 0);
          signals.push({ i, dir: "short", kind: "bounce", price: shortBounce[i] });
        }
        if (breakout && (i - breakout.at > 24 || (breakout.dir === "long" ? c.c < breakout.level - range : c.c > breakout.level + range))) breakout = null;
      }

      const levels: LevelSpec[] = [];
      if (resistance) levels.push({ value: resistance.value, color: String(p.resistanceColor), label: "R", name: "ind.test1.resistance", fromIndex: resistance.from, flag: true, scale: false });
      if (support) levels.push({ value: support.value, color: String(p.supportColor), label: "S", name: "ind.test1.support", fromIndex: support.from, flag: true, scale: false });
      return {
        levels,
        extra: { signals },
        plots: [
          { key: "LONG breakout", data: longBreak, kind: "dots", color: String(p.longColor), flag: false, legend: false },
          { key: "SHORT breakout", data: shortBreak, kind: "dots", color: String(p.shortColor), flag: false, legend: false },
          { key: "LONG retest", data: longRetest, kind: "dots", color: String(p.longColor), flag: false, legend: false },
          { key: "SHORT retest", data: shortRetest, kind: "dots", color: String(p.shortColor), flag: false, legend: false },
          { key: "LONG bounce", data: longBounce, kind: "dots", color: String(p.longColor), flag: false, legend: false },
          { key: "SHORT bounce", data: shortBounce, kind: "dots", color: String(p.shortColor), flag: false, legend: false },
        ],
      };
    },
    drawTop(sc, p, res) {
      const signals = (res?.extra as { signals?: { i: number; dir: "long" | "short"; kind: "breakout" | "retest" | "bounce"; price: number }[] } | undefined)?.signals;
      if (!signals?.length) return;
      const { ctx } = sc;
      ctx.save();
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const signal of signals) {
        if (signal.i < sc.from - 1 || signal.i > sc.to + 1) continue;
        const color = String(signal.dir === "long" ? p.longColor : p.shortColor);
        const label = `${signal.dir === "long" ? "ЛОНГ" : "ШОРТ"} · ${signal.kind === "breakout" ? "пробой" : signal.kind === "retest" ? "ретест" : "отскок"}`;
        const x = sc.x(signal.i);
        const y = sc.y(signal.price) + (signal.dir === "long" ? 11 : -11);
        const w = ctx.measureText(label).width + 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x - w / 2, y - 8, w, 16, 4);
        else ctx.rect(x - w / 2, y - 8, w, 16);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x, y + 0.5);
      }
      ctx.restore();
    },
  },
];

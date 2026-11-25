import type { IndicatorDef, LevelSpec } from "./registry";
import * as M from "./math";

type PivotSet = { period: "day" | "week"; start: number; p: M.PivotLevels };
type Signal = { i: number; dir: "long" | "short"; kind: "breakout" | "retest" | "bounce"; price: number };

/** First AlgoBots catalogue entry: daily/weekly pivots with close-confirmed entry markers. */
export const ALGOBOT_DEFS: IndicatorDef[] = [
  {
    id: "test1",
    category: "algobots",
    pane: "overlay",
    fixedPane: true,
    fmt: "price",
    keywords: "algo bot levels daily weekly pivots breakout retest bounce support resistance long short",
    params: [
      { key: "atrLength", type: "number", min: 2, max: 100, step: 1, default: 14 },
      { key: "toleranceAtr", type: "number", min: 0.05, max: 1, step: 0.05, default: 0.2 },
      { key: "dayColor", type: "color", default: "#f59e0b" },
      { key: "weekColor", type: "color", default: "#2962ff" },
      { key: "longColor", type: "color", default: "#00a878" },
      { key: "shortColor", type: "color", default: "#ef4444" },
    ],
    title: () => "Test1",
    compute(candles, p) {
      const n = candles.length;
      if (n < 3) return { plots: [] };
      const periods: PivotSet[] = [];
      for (const period of ["day", "week"] as const) {
        const lastKey = M.periodKey(candles[n - 1].t, period);
        let currentStart = n - 1;
        while (currentStart > 0 && M.periodKey(candles[currentStart - 1].t, period) === lastKey) currentStart--;
        if (currentStart === 0) continue;
        const prevKey = M.periodKey(candles[currentStart - 1].t, period);
        let high = -Infinity;
        let low = Infinity;
        let close = NaN;
        for (let i = currentStart - 1; i >= 0 && M.periodKey(candles[i].t, period) === prevKey; i--) {
          high = Math.max(high, candles[i].h);
          low = Math.min(low, candles[i].l);
          if (!Number.isFinite(close)) close = candles[i].c;
        }
        if (Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close)) {
          periods.push({ period, start: currentStart, p: M.classicPivots(high, low, close) });
        }
      }

      const h = candles.map((c) => c.h);
      const l = candles.map((c) => c.l);
      const c = candles.map((x) => x.c);
      const atr = M.atr(h, l, c, Number(p.atrLength) || 14);
      const toleranceAtr = Number(p.toleranceAtr) || 0.2;
      const supportLevels = periods.flatMap((x) => [x.p.S1, x.p.S2, x.p.S3]);
      const resistanceLevels = periods.flatMap((x) => [x.p.R1, x.p.R2, x.p.R3]);
      const allSignalLevels = [...supportLevels, ...resistanceLevels];
      const signals: Signal[] = [];
      let pending: { dir: "long" | "short"; level: number; at: number; done: boolean } | null = null;
      for (let i = 1; i < n; i++) {
        const bar = candles[i];
        const prev = candles[i - 1];
        const tolerance = Number.isFinite(atr[i]) ? Math.max(0, atr[i] * toleranceAtr) : 0;
        let breakout = false;
        const brokenResistance = resistanceLevels.find((level) => prev.c <= level && bar.c > level);
        const brokenSupport = supportLevels.find((level) => prev.c >= level && bar.c < level);
        if (brokenResistance !== undefined) {
          signals.push({ i, dir: "long", kind: "breakout", price: bar.l - (Number.isFinite(atr[i]) ? atr[i] * 0.15 : 0) });
          pending = { dir: "long", level: brokenResistance, at: i, done: false };
          breakout = true;
        } else if (brokenSupport !== undefined) {
          signals.push({ i, dir: "short", kind: "breakout", price: bar.h + (Number.isFinite(atr[i]) ? atr[i] * 0.15 : 0) });
          pending = { dir: "short", level: brokenSupport, at: i, done: false };
          breakout = true;
        }

        if (!breakout && pending && !pending.done && i > pending.at && i - pending.at <= 24) {
          if (pending.dir === "long" && bar.l <= pending.level + tolerance && bar.c > pending.level && bar.c > bar.o) {
            signals.push({ i, dir: "long", kind: "retest", price: bar.l - (Number.isFinite(atr[i]) ? atr[i] * 0.15 : 0) });
            pending.done = true;
          } else if (pending.dir === "short" && bar.h >= pending.level - tolerance && bar.c < pending.level && bar.c < bar.o) {
            signals.push({ i, dir: "short", kind: "retest", price: bar.h + (Number.isFinite(atr[i]) ? atr[i] * 0.15 : 0) });
            pending.done = true;
          }
        }

        if (!breakout && !signals.some((s) => s.i === i)) {
          const support = supportLevels.filter((level) => prev.l > level + tolerance && bar.l <= level + tolerance && bar.c > level && bar.c > bar.o).sort((a, b) => b - a)[0];
          const resistance = resistanceLevels.filter((level) => prev.h < level - tolerance && bar.h >= level - tolerance && bar.c < level && bar.c < bar.o).sort((a, b) => a - b)[0];
          if (support !== undefined) signals.push({ i, dir: "long", kind: "bounce", price: bar.l - (Number.isFinite(atr[i]) ? atr[i] * 0.15 : 0) });
          else if (resistance !== undefined) signals.push({ i, dir: "short", kind: "bounce", price: bar.h + (Number.isFinite(atr[i]) ? atr[i] * 0.15 : 0) });
        }
        if (pending && (i - pending.at > 24 || (pending.dir === "long" ? bar.c < pending.level - tolerance : bar.c > pending.level + tolerance))) pending = null;
      }

      const levels: LevelSpec[] = [];
      for (const item of periods) {
        const daily = item.period === "day";
        const color = String(daily ? p.dayColor : p.weekColor);
        const prefix = daily ? "D" : "W";
        const entries: [string, number][] = [["P", item.p.P], ["R1", item.p.R1], ["S1", item.p.S1]];
        for (const [name, value] of entries) {
          levels.push({ value, color, label: `${prefix} ${name}`, name: `ind.test1.${daily ? "day" : "week"}.${name.toLowerCase()}`, fromIndex: item.start, width: name === "P" ? 1.4 : 2.4, dashed: name === "P", flag: true, scale: false });
        }
      }
      // Keep the last confirmed levels available for the chart's level-alert UI.
      const alertLevels = allSignalLevels.filter(Number.isFinite);
      return { plots: [], levels, extra: { signals, alertLevels } };
    },
    drawTop(sc, p, res) {
      const signals = (res?.extra as { signals?: Signal[] } | undefined)?.signals;
      if (!signals?.length) return;
      const { ctx } = sc;
      ctx.save();
      for (const signal of signals) {
        if (signal.i < sc.from - 1 || signal.i > sc.to + 1) continue;
        const x = sc.x(signal.i);
        const y = sc.y(signal.price);
        const size = 7;
        ctx.fillStyle = String(signal.dir === "long" ? p.longColor : p.shortColor);
        ctx.beginPath();
        if (signal.dir === "long") {
          ctx.moveTo(x, y + size);
          ctx.lineTo(x - size, y - size);
          ctx.lineTo(x + size, y - size);
        } else {
          ctx.moveTo(x, y - size);
          ctx.lineTo(x - size, y + size);
          ctx.lineTo(x + size, y + size);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
    alertLevels(res) {
      return (res?.extra as { alertLevels?: number[] } | undefined)?.alertLevels ?? [];
    },
  },
];

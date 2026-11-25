import type { IndicatorDef, LevelSpec } from "./registry";
import * as M from "./math";

type PivotSet = { period: "day" | "week"; start: number; p: M.PivotLevels };
type Signal = { i: number; dir: "long" | "short"; kind: "breakout" | "retest" | "bounce"; price: number };
type LevelSignal = { level: number; dir: "long" | "short" };
type TradePlan = { i: number; dir: "long" | "short"; entry: number; stop: number; take: number };

/** First AlgoBots catalogue entry: daily/weekly pivots with one-shot confirmed entries and an entry/stop/target plan. */
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
      // Only trade the levels the indicator actually draws. The hidden S2/S3 and R2/R3
      // were creating extra arrows that had no corresponding highlighted level.
      const signalLevels = [...new Set(periods.flatMap((x) => [x.p.P, x.p.R1, x.p.S1]).filter(Number.isFinite))];
      const signals: Signal[] = [];
      let latestPlan: TradePlan | null = null;
      const markSignal = (i: number, dir: "long" | "short", kind: Signal["kind"]) => {
        const bar = candles[i];
        const atrBuffer = Number.isFinite(atr[i]) ? Math.max(0, atr[i] * 0.15) : 0;
        const entry = bar.c;
        const stop = dir === "long" ? bar.l - atrBuffer : bar.h + atrBuffer;
        const minimumRisk = Number.isFinite(atr[i]) ? atr[i] * 0.25 : Math.abs(entry) * 0.001;
        const risk = Math.max(Math.abs(entry - stop), minimumRisk, Number.EPSILON);
        const structuralTarget = signalLevels
          .filter((level) => dir === "long" ? level > entry : level < entry)
          .sort((a, b) => Math.abs(a - entry) - Math.abs(b - entry))[0];
        const take = structuralTarget ?? entry + (dir === "long" ? 2 : -2) * risk;
        const offset = Number.isFinite(atr[i]) ? atr[i] * 0.15 : 0;
        signals.push({ i, dir, kind, price: dir === "long" ? bar.l - offset : bar.h + offset });
        latestPlan = { i, dir, entry, stop, take };
      };
      const fired = new Map<number, "long" | "short">();
      let pending: { dir: "long" | "short"; level: number; at: number } | null = null;
      for (let i = 1; i < n; i++) {
        const bar = candles[i];
        const prev = candles[i - 1];
        const tolerance = Number.isFinite(atr[i]) ? Math.max(0, atr[i] * toleranceAtr) : 0;
        // One entry per level interaction. Rearm only after price closes back through the level.
        for (const [level, dir] of fired) {
          if ((dir === "long" && bar.c < level - tolerance) || (dir === "short" && bar.c > level + tolerance)) fired.delete(level);
        }

        let signaled = false;
        if (pending && i > pending.at) {
          const invalidated = pending.dir === "long" ? bar.c < pending.level - tolerance : bar.c > pending.level + tolerance;
          if (invalidated || i - pending.at > 24) pending = null;
          else {
            // The breakout candle itself is not an entry: wait for the next candle to hold the level.
            const held = pending.dir === "long"
              ? bar.c > pending.level && (bar.l <= pending.level + tolerance || bar.c >= prev.c)
              : bar.c < pending.level && (bar.h >= pending.level - tolerance || bar.c <= prev.c);
            if (held && !fired.has(pending.level)) {
              const dir = pending.dir;
              markSignal(i, dir, "breakout");
              fired.set(pending.level, dir);
              pending = null;
              signaled = true;
            }
          }
        }

        if (!signaled && !pending) {
          // Confirm a single hold/rejection at a visible pivot. Once marked, further candles
          // around that level stay quiet until price has invalidated the side of the entry.
          const bounce = signalLevels
            .filter((level) => !fired.has(level))
            .flatMap<LevelSignal>((level) => {
              if (prev.c >= level && bar.l <= level + tolerance && bar.c > level && bar.c > bar.o) return [{ level, dir: "long" }];
              if (prev.c <= level && bar.h >= level - tolerance && bar.c < level && bar.c < bar.o) return [{ level, dir: "short" }];
              return [];
            })
            .sort((a, b) => Math.abs(bar.c - a.level) - Math.abs(bar.c - b.level))[0];
          if (bounce) {
            markSignal(i, bounce.dir, "bounce");
            fired.set(bounce.level, bounce.dir);
            signaled = true;
          }
        }

        if (!signaled && !pending) {
          const crossed = signalLevels
            .filter((level) => !fired.has(level))
            .flatMap<LevelSignal>((level) => {
              if (prev.c <= level && bar.c > level) return [{ level, dir: "long" }];
              if (prev.c >= level && bar.c < level) return [{ level, dir: "short" }];
              return [];
            })
            .sort((a, b) => Math.abs(bar.c - a.level) - Math.abs(bar.c - b.level))[0];
          if (crossed) pending = { dir: crossed.dir, level: crossed.level, at: i };
        }
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
      const savedPlan = latestPlan as TradePlan | null;
      const planForLevels = savedPlan && !candles.slice(savedPlan.i + 1).some((bar) => savedPlan.dir === "long"
        ? bar.l <= savedPlan.stop || bar.h >= savedPlan.take
        : bar.h >= savedPlan.stop || bar.l <= savedPlan.take) ? savedPlan : null;
      if (planForLevels) {
        levels.push(
          { value: planForLevels.entry, color: "#f59e0b", label: "ВХОД", name: "ind.test1.plan.entry", fromIndex: planForLevels.i, width: 2.2, flag: true, scale: false },
          { value: planForLevels.stop, color: "#ef4444", label: "СТОП", name: "ind.test1.plan.stop", fromIndex: planForLevels.i, width: 2.2, flag: true, scale: false },
          { value: planForLevels.take, color: "#00a878", label: "ТЕЙК", name: "ind.test1.plan.take", fromIndex: planForLevels.i, width: 2.2, flag: true, scale: false },
        );
      }
      // Keep the last confirmed levels available for the chart's level-alert UI.
      const alertLevels = signalLevels;
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
          ctx.moveTo(x, y - size);
          ctx.lineTo(x - size, y + size);
          ctx.lineTo(x + size, y + size);
        } else {
          ctx.moveTo(x, y + size);
          ctx.lineTo(x - size, y - size);
          ctx.lineTo(x + size, y - size);
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

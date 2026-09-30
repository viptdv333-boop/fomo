import type { ChartEngine } from "../engine";
import type { FlowBar, FootprintSettings } from "./types";

/* Keeps the engine's OrderFlowStore filled: looks at what the chart shows (visible bars, price zoom), asks /api/orderflow for
   those bars, and keeps polling the live edge. Sources without trade data (US stocks) switch the store to "none" and the
   consumers fall back to approximations. */

export const FOOTPRINT_MIN_SPACING = 22;
const MAX_WINDOW = 400;
const POLL_MS = 3000;
const SETTLE_MS = 150_000;

export interface FlowClientDeps {
  engine: ChartEngine;
  source: string;
  ticker: string;
  /** chart time = real UTC ms + offset */
  getOffsetMs(): number;
  getFootprint(): FootprintSettings;
}

export class OrderFlowClient {
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private off: (() => void) | null = null;
  private busy = false;
  private stopped = false;
  private complete = new Set<number>();
  private failures = 0;
  private nextAllowed = 0;
  private lastKey = "";
  private lastInfoKey = "";
  private supported = true;

  constructor(private d: FlowClientDeps) {}

  start() {
    const { engine } = this.d;
    this.d.engine.flow.reset();
    this.complete.clear();
    if (this.d.source !== "bybit" && this.d.source !== "moex") this.supported = false;
    this.off = engine.addViewListener(() => this.kick());
    this.timer = setInterval(() => void this.cycle(), POLL_MS);
    this.kick(150);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
    this.off?.();
  }

  /** Something changed (view, needs, settings): look again soon. */
  kick(delay = 250) {
    if (this.stopped) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.cycle(), delay);
  }

  private desiredTick(range: { min: number; max: number; height: number }, fine: boolean): number {
    const store = this.d.engine.flow;
    const span = range.max - range.min;
    if (!(span > 0)) return 0;
    if (fine) {
      const fp = this.d.getFootprint();
      if (fp.stepTicks > 0 && store.nativeTick > 0) return fp.stepTicks * store.nativeTick;
      const cells = Math.max(8, Math.floor(range.height / 13));
      return span / cells;
    }
    return span / 80;
  }

  async cycle() {
    if (this.stopped || this.busy) return;
    const { engine, source, ticker } = this.d;
    const store = engine.flow;
    if (store.needs.size === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!this.supported) {
      if (store.avail !== "none") {
        store.avail = "none";
        store.emit();
      }
      return;
    }
    if (Date.now() < this.nextAllowed) return;
    const candles = engine.getCandles();
    const n = candles.length;
    if (n === 0) return;
    const fineNeed = store.needs.has("footprint") && engine.getBarSpacing() >= FOOTPRINT_MIN_SPACING;
    const bigNeed = store.needs.has("big");
    const levelsNeed = store.needs.has("ind") || store.needs.has("draw");
    const coarseNeed = levelsNeed || bigNeed;
    if (!fineNeed && !coarseNeed) return;

    const v = engine.getVisibleRange();
    const pad = Math.ceil((v.to - v.from) * 0.4);
    let i0 = Math.max(0, v.from - pad);
    const i1 = Math.min(n - 1, v.to + pad);
    if (i1 - i0 + 1 > MAX_WINDOW) i0 = i1 - MAX_WINDOW + 1;
    if (i1 < i0) return;

    const range = engine.getPaneRange("main");
    let want = range ? this.desiredTick(range, fineNeed) : 0;
    // finer than what we hold (and we hold something coarser than the instrument's tick): refetch on the new grid
    if (store.tick > 0 && want > 0 && store.nativeTick > 0) {
      const tooCoarse = want < store.tick / 1.8 && store.tick > store.nativeTick * 1.0001;
      const tooFine = fineNeed ? false : want > store.tick * 6;
      if (tooCoarse || tooFine) {
        store.dropBars();
        this.complete.clear();
      } else want = store.tick;
    }

    // contiguous window from the first bar that is not settled to the last one
    let a = -1;
    let b = -1;
    for (let i = i0; i <= i1; i++) {
      if (!this.complete.has(candles[i].t)) {
        if (a < 0) a = i;
        b = i;
      }
    }
    if (a < 0) {
      return;
    }
    if (b - a + 1 > MAX_WINDOW) a = b - MAX_WINDOW + 1;

    const off = this.d.getOffsetMs();
    const starts: number[] = [];
    for (let i = a; i <= b; i++) starts.push(candles[i].t - off);
    const ivMs = engine.getIntervalMs();
    const endChart = b + 1 < n ? candles[b + 1].t : candles[b].t + ivMs;
    const end = endChart - off;
    const key = `${source}:${ticker}`;
    this.lastKey = key;

    this.busy = true;
    try {
      const res = await fetch("/api/orderflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, ticker, starts, end, tick: want, levels: fineNeed || levelsNeed, big: bigNeed }),
      });
      if (this.stopped || key !== this.lastKey) return;
      if (res.status === 429) {
        this.nextAllowed = Date.now() + 15_000;
        return;
      }
      if (!res.ok) throw new Error("http " + res.status);
      const j = await res.json();
      this.failures = 0;
      if (this.stopped) return;
      if (!j.supported) {
        store.avail = "none";
        this.supported = false;
        store.emit();
        return;
      }
      const cov: [number, number][] = (j.cov ?? []).map((r: [number, number]) => [r[0] + off, r[1] + off]);
      const bars: FlowBar[] = [];
      for (const ob of j.bars ?? []) {
        const c = candles[a + ob.i];
        if (!c) continue;
        const lv: number[] = ob.lv;
        let bid = 0;
        let ask = 0;
        for (let k = 0; k < lv.length; k += 3) {
          bid += lv[k + 1];
          ask += lv[k + 2];
        }
        bars.push({ t: c.t, lv, bid, ask, dh: ob.dh ?? Math.max(0, ask - bid), dl: ob.dl ?? Math.min(0, ask - bid), real: true });
      }
      const infoKey = `${j.tick}|${j.nativeTick}|${!!j.live}|${!!j.pending}|${!!j.delayed}|${store.avail}`;
      store.setInfo({ supported: true, tick: j.tick, nativeTick: j.nativeTick, cov, live: !!j.live, pending: !!j.pending, delayed: !!j.delayed });
      store.put(bars, j.tick);
      if (Array.isArray(j.big)) {
        store.putBig(
          j.big.map((x: number[]) => ({ t: x[0] + off, p: x[1], v: x[2], buy: x[3] === 1 })),
          starts[0] + off,
          end + off,
        );
      }
      const now = Date.now();
      for (let i = a; i <= b; i++) {
        const c = candles[i];
        const endReal = (i + 1 < n ? candles[i + 1].t : c.t + ivMs) - off;
        if (!j.pending && endReal < now - SETTLE_MS) this.complete.add(c.t);
      }
      // nothing new (no trades, same state): do not wake the indicators and the painter
      if (bars.length > 0 || Array.isArray(j.big) || infoKey !== this.lastInfoKey) store.emit();
      this.lastInfoKey = infoKey;
      // more history is still being loaded on the server: come back soon
      if (j.pending) this.kick(2500);
    } catch (e) {
      this.failures++;
      this.nextAllowed = Date.now() + Math.min(30_000, 2000 * 2 ** this.failures);
    } finally {
      this.busy = false;
    }
  }
}

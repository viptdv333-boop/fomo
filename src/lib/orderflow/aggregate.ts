import type { MinuteBook } from "./book";

/** What a data provider exposes to the aggregator. */
export interface FlowSource {
  /** Visits one minute of trades (whichever book has it). Returns false when the minute has no data. */
  minute(minute: number, cb: (price: number, bid: number, ask: number) => void): boolean;
}

export interface OutBar {
  /** Index into the request's `starts`. */
  i: number;
  /** Flat [price, bid, ask, ...], ascending price. */
  lv: number[];
  /** Highest / lowest running delta inside the bar (minute resolution), relative to the bar start. */
  dh: number;
  dl: number;
}

export function decimalsOf(tick: number): number {
  if (!(tick > 0)) return 2;
  return Math.max(0, Math.min(10, Math.ceil(-Math.log10(tick) - 1e-9)));
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * Sums the minutes of every bar [starts[i], starts[i+1]) (the last one ends at `end`) into price buckets of
 * `k` native ticks. Bars without a single trade are left out.
 */
export function aggregateBars(src: FlowSource, starts: number[], end: number, nativeTick: number, k: number, bounds?: [number, number]): OutBar[] {
  const out: OutBar[] = [];
  const dec = decimalsOf(nativeTick);
  const step = nativeTick * k;
  for (let i = 0; i < starts.length; i++) {
    // only minutes the source can have (bars far in the past would otherwise cost a scan of millions of empty minutes)
    const a = Math.max(Math.ceil(starts[i] / 60_000), bounds ? bounds[0] : -Infinity);
    const b = Math.min(Math.ceil((i + 1 < starts.length ? starts[i + 1] : end) / 60_000), bounds ? bounds[1] + 1 : Infinity);
    const map = new Map<number, [number, number]>();
    let run = 0;
    let dh = 0;
    let dl = 0;
    let any = false;
    for (let m = a; m < b; m++) {
      let md = 0;
      const has = src.minute(m, (price, bid, ask) => {
        const idx = Math.floor(Math.round(price / nativeTick) / k);
        let lv = map.get(idx);
        if (!lv) {
          lv = [0, 0];
          map.set(idx, lv);
        }
        lv[0] += bid;
        lv[1] += ask;
        md += ask - bid;
      });
      if (!has) continue;
      any = true;
      run += md;
      if (run > dh) dh = run;
      if (run < dl) dl = run;
    }
    if (!any) continue;
    const idxs = Array.from(map.keys()).sort((x, y) => x - y);
    const lv: number[] = [];
    for (const ix of idxs) {
      const v = map.get(ix)!;
      lv.push(+(ix * step).toFixed(dec), r6(v[0]), r6(v[1]));
    }
    out.push({ i, lv, dh: r6(dh), dl: r6(dl) });
  }
  return out;
}

export function bookSource(...books: MinuteBook[]): FlowSource {
  return {
    minute(minute, cb) {
      for (const b of books) {
        if (b.has(minute)) {
          b.each(minute, cb);
          return true;
        }
      }
      return false;
    },
  };
}

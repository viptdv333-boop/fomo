/* Server-side store of executed trades aggregated per minute and price level.
   A "level" is [bid volume, ask volume]: bid = volume of market SELLS that hit the bid, ask = volume of market BUYS that
   lifted the ask (the aggressor side). Finished minutes are frozen into typed arrays to keep memory small. */

export interface Frozen {
  p: Float64Array;
  b: Float32Array;
  a: Float32Array;
}
type Live = Map<number, [number, number]>;

export class MinuteBook {
  private mins = new Map<number, Live | Frozen>();
  private levels = 0;
  minMinute = Infinity;
  maxMinute = -Infinity;

  add(minute: number, price: number, buy: boolean, vol: number): void {
    let m = this.mins.get(minute);
    if (m === undefined) {
      m = new Map();
      this.mins.set(minute, m);
      if (minute < this.minMinute) this.minMinute = minute;
      if (minute > this.maxMinute) this.maxMinute = minute;
    } else if (!(m instanceof Map)) {
      // late trade into a frozen minute: thaw it
      const live: Live = new Map();
      for (let i = 0; i < m.p.length; i++) live.set(m.p[i], [m.b[i], m.a[i]]);
      this.levels -= m.p.length;
      this.levels += live.size;
      this.mins.set(minute, live);
      m = live;
    }
    let lv = m.get(price);
    if (!lv) {
      lv = [0, 0];
      m.set(price, lv);
      this.levels++;
    }
    if (buy) lv[1] += vol;
    else lv[0] += vol;
  }

  freeze(minute: number): void {
    const m = this.mins.get(minute);
    if (!m || !(m instanceof Map)) return;
    const n = m.size;
    const keys = Array.from(m.keys()).sort((x, y) => x - y);
    const p = new Float64Array(n);
    const b = new Float32Array(n);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lv = m.get(keys[i])!;
      p[i] = keys[i];
      b[i] = lv[0];
      a[i] = lv[1];
    }
    this.mins.set(minute, { p, b, a });
  }

  /** Freezes every live minute older than `minute`. */
  freezeBefore(minute: number): void {
    for (const [k, v] of this.mins) if (k < minute && v instanceof Map) this.freeze(k);
  }

  has(minute: number): boolean {
    return this.mins.has(minute);
  }

  each(minute: number, cb: (price: number, bid: number, ask: number) => void): void {
    const m = this.mins.get(minute);
    if (!m) return;
    if (m instanceof Map) {
      for (const [p, lv] of m) cb(p, lv[0], lv[1]);
    } else {
      for (let i = 0; i < m.p.length; i++) cb(m.p[i], m.b[i], m.a[i]);
    }
  }

  dropBefore(minute: number): void {
    for (const [k, v] of this.mins) {
      if (k < minute) {
        this.levels -= v instanceof Map ? v.size : v.p.length;
        this.mins.delete(k);
      }
    }
    this.minMinute = Infinity;
    this.maxMinute = -Infinity;
    for (const k of this.mins.keys()) {
      if (k < this.minMinute) this.minMinute = k;
      if (k > this.maxMinute) this.maxMinute = k;
    }
  }

  get size(): number {
    return this.levels;
  }
  get minutes(): number {
    return this.mins.size;
  }

  /** Smallest positive price step seen in the sampled minutes (the instrument's tick), or 0 when unknown. */
  inferTick(): number {
    const seen = new Set<number>();
    let sample = 0;
    for (const [, v] of this.mins) {
      if (v instanceof Map) for (const p of v.keys()) seen.add(p);
      else for (let i = 0; i < v.p.length; i++) seen.add(v.p[i]);
      if (++sample > 400 || seen.size > 6000) break;
    }
    if (seen.size < 2) return 0;
    const arr = Array.from(seen).sort((x, y) => x - y);
    let min = Infinity;
    for (let i = 1; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      if (d > 1e-12 && d < min) min = d;
    }
    if (!isFinite(min)) return 0;
    return Math.round(min * 1e9) / 1e9;
  }
}

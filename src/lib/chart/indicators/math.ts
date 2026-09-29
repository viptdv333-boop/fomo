/* Pure indicator math. No DOM. Every function returns an array aligned with its input,
   with NaN where the value is not defined yet. Inputs may only have NaN as a leading prefix. */

export type F64 = Float64Array;

export function nanArray(n: number): F64 {
  return new Float64Array(n).fill(NaN);
}

export function firstValid(a: ArrayLike<number>): number {
  for (let i = 0; i < a.length; i++) if (a[i] === a[i]) return i;
  return -1;
}

/** Simple moving average. */
export function sma(src: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const s = firstValid(src);
  if (s < 0 || len - s < n) return out;
  let sum = 0;
  for (let i = s; i < s + n; i++) sum += src[i];
  out[s + n - 1] = sum / n;
  for (let i = s + n; i < len; i++) {
    sum += src[i] - src[i - n];
    out[i] = sum / n;
  }
  return out;
}

function expSmooth(src: ArrayLike<number>, n: number, k: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const s = firstValid(src);
  if (s < 0 || len - s < n) return out;
  let sum = 0;
  for (let i = s; i < s + n; i++) sum += src[i];
  let prev = sum / n;
  out[s + n - 1] = prev;
  for (let i = s + n; i < len; i++) {
    prev = src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Exponential moving average, alpha = 2 / (n + 1), seeded with the SMA of the first n values. */
export function ema(src: ArrayLike<number>, n: number): F64 {
  n = Math.max(1, Math.floor(n));
  return expSmooth(src, n, 2 / (n + 1));
}

/** Wilder smoothing (RMA), alpha = 1 / n, seeded with the SMA of the first n values. */
export function rma(src: ArrayLike<number>, n: number): F64 {
  n = Math.max(1, Math.floor(n));
  return expSmooth(src, n, 1 / n);
}

/** Linear weighted moving average (weights 1..n, newest heaviest). */
export function wma(src: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const s = firstValid(src);
  if (s < 0 || len - s < n) return out;
  const denom = (n * (n + 1)) / 2;
  let total = 0;
  let numer = 0;
  for (let j = 0; j < n; j++) {
    total += src[s + j];
    numer += (j + 1) * src[s + j];
  }
  out[s + n - 1] = numer / denom;
  for (let i = s + n; i < len; i++) {
    numer = numer - total + n * src[i];
    total += src[i] - src[i - n];
    out[i] = numer / denom;
  }
  return out;
}

/** Hull moving average. */
export function hma(src: ArrayLike<number>, n: number): F64 {
  n = Math.max(1, Math.floor(n));
  const half = Math.max(1, Math.floor(n / 2));
  const sq = Math.max(1, Math.round(Math.sqrt(n)));
  const a = wma(src, half);
  const b = wma(src, n);
  const raw = nanArray(src.length);
  for (let i = 0; i < raw.length; i++) raw[i] = 2 * a[i] - b[i];
  return wma(raw, sq);
}

/** Volume-weighted moving average. */
export function vwma(src: ArrayLike<number>, vol: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  if (len < n) return out;
  let pv = 0;
  let v = 0;
  for (let i = 0; i < len; i++) {
    pv += src[i] * vol[i];
    v += vol[i];
    if (i >= n) {
      pv -= src[i - n] * vol[i - n];
      v -= vol[i - n];
    }
    if (i >= n - 1) out[i] = v > 0 ? pv / v : src[i];
  }
  return out;
}

/** Arnaud Legoux moving average (Gaussian-weighted). */
export function alma(src: ArrayLike<number>, n: number, offset = 0.85, sigma = 6): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const s0 = firstValid(src);
  if (s0 < 0 || len - s0 < n) return out;
  const m = offset * (n - 1);
  const s = n / sigma;
  const w = new Float64Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    w[i] = Math.exp(-((i - m) * (i - m)) / (2 * s * s));
    norm += w[i];
  }
  for (let i = s0 + n - 1; i < len; i++) {
    let acc = 0;
    const base = i - n + 1;
    for (let j = 0; j < n; j++) acc += w[j] * src[base + j];
    out[i] = acc / norm;
  }
  return out;
}

/** Population standard deviation over a rolling window. */
export function stdev(src: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const s = firstValid(src);
  if (s < 0 || len - s < n) return out;
  for (let i = s + n - 1; i < len; i++) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += src[j];
    const mean = sum / n;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = src[j] - mean;
      sq += d * d;
    }
    out[i] = Math.sqrt(sq / n);
  }
  return out;
}

export function highest(src: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const s = firstValid(src);
  if (s < 0) return out;
  for (let i = s + n - 1; i < len; i++) {
    let m = -Infinity;
    for (let j = i - n + 1; j <= i; j++) if (src[j] > m) m = src[j];
    out[i] = m;
  }
  return out;
}

export function lowest(src: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const s = firstValid(src);
  if (s < 0) return out;
  for (let i = s + n - 1; i < len; i++) {
    let m = Infinity;
    for (let j = i - n + 1; j <= i; j++) if (src[j] < m) m = src[j];
    out[i] = m;
  }
  return out;
}

/** True range; the first bar uses high - low. */
export function trueRange(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>): F64 {
  const len = h.length;
  const out = nanArray(len);
  for (let i = 0; i < len; i++) {
    if (i === 0) out[i] = h[i] - l[i];
    else out[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  return out;
}

/** Average true range with Wilder smoothing. */
export function atr(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, n: number): F64 {
  return rma(trueRange(h, l, c), n);
}

/** Relative strength index (Wilder). */
export function rsi(src: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const up = nanArray(len);
  const dn = nanArray(len);
  for (let i = 1; i < len; i++) {
    const d = src[i] - src[i - 1];
    up[i] = d > 0 ? d : 0;
    dn[i] = d < 0 ? -d : 0;
  }
  const ru = rma(up, n);
  const rd = rma(dn, n);
  const out = nanArray(len);
  for (let i = 0; i < len; i++) {
    if (ru[i] !== ru[i] || rd[i] !== rd[i]) continue;
    out[i] = rd[i] === 0 ? 100 : ru[i] === 0 ? 0 : 100 - 100 / (1 + ru[i] / rd[i]);
  }
  return out;
}

export function maByType(type: string, src: ArrayLike<number>, n: number, vol?: ArrayLike<number>): F64 {
  switch (type) {
    case "ema": return ema(src, n);
    case "wma": return wma(src, n);
    case "rma": return rma(src, n);
    case "hma": return hma(src, n);
    case "vwma": return vol ? vwma(src, vol, n) : sma(src, n);
    default: return sma(src, n);
  }
}

export interface MacdOut {
  macd: F64;
  signal: F64;
  hist: F64;
}

export function macd(src: ArrayLike<number>, fast: number, slow: number, signalLen: number, signalType = "ema"): MacdOut {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const len = src.length;
  const m = nanArray(len);
  for (let i = 0; i < len; i++) m[i] = f[i] - s[i];
  const sig = signalType === "sma" ? sma(m, signalLen) : ema(m, signalLen);
  const hist = nanArray(len);
  for (let i = 0; i < len; i++) hist[i] = m[i] - sig[i];
  return { macd: m, signal: sig, hist };
}

/** Raw %K of the stochastic oscillator over `n` bars of an arbitrary series. */
export function stochRaw(src: ArrayLike<number>, hi: ArrayLike<number>, lo: ArrayLike<number>, n: number): F64 {
  const hh = highest(hi, n);
  const ll = lowest(lo, n);
  const out = nanArray(src.length);
  for (let i = 0; i < src.length; i++) {
    if (hh[i] !== hh[i] || ll[i] !== ll[i]) continue;
    const r = hh[i] - ll[i];
    out[i] = r === 0 ? 50 : (100 * (src[i] - ll[i])) / r;
  }
  return out;
}

export function stochastic(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, kLen: number, kSmooth: number, dLen: number) {
  const raw = stochRaw(c, h, l, kLen);
  const k = kSmooth > 1 ? sma(raw, kSmooth) : raw;
  const d = sma(k, dLen);
  return { k, d };
}

export function stochasticRsi(src: ArrayLike<number>, rsiLen: number, stochLen: number, kSmooth: number, dSmooth: number) {
  const r = rsi(src, rsiLen);
  const raw = stochRaw(r, r, r, stochLen);
  const k = kSmooth > 1 ? sma(raw, kSmooth) : raw;
  const d = sma(k, dSmooth);
  return { k, d };
}

export function adx(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, diLen: number, adxLen: number) {
  const len = h.length;
  const plus = nanArray(len);
  const minus = nanArray(len);
  const tr = nanArray(len);
  for (let i = 1; i < len; i++) {
    const up = h[i] - h[i - 1];
    const down = l[i - 1] - l[i];
    plus[i] = up > down && up > 0 ? up : 0;
    minus[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  const sp = rma(plus, diLen);
  const sm = rma(minus, diLen);
  const st = rma(tr, diLen);
  const pdi = nanArray(len);
  const mdi = nanArray(len);
  const dx = nanArray(len);
  for (let i = 0; i < len; i++) {
    if (st[i] !== st[i]) continue;
    pdi[i] = st[i] === 0 ? 0 : (100 * sp[i]) / st[i];
    mdi[i] = st[i] === 0 ? 0 : (100 * sm[i]) / st[i];
    const sum = pdi[i] + mdi[i];
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(pdi[i] - mdi[i])) / sum;
  }
  return { adx: rma(dx, adxLen), plus: pdi, minus: mdi };
}

/** Commodity channel index. */
export function cci(src: ArrayLike<number>, n: number): F64 {
  const len = src.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const mean = sma(src, n);
  for (let i = n - 1; i < len; i++) {
    if (mean[i] !== mean[i]) continue;
    let dev = 0;
    for (let j = i - n + 1; j <= i; j++) dev += Math.abs(src[j] - mean[i]);
    dev /= n;
    out[i] = dev === 0 ? 0 : (src[i] - mean[i]) / (0.015 * dev);
  }
  return out;
}

export function williamsR(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, n: number): F64 {
  const hh = highest(h, n);
  const ll = lowest(l, n);
  const out = nanArray(c.length);
  for (let i = 0; i < c.length; i++) {
    if (hh[i] !== hh[i] || ll[i] !== ll[i]) continue;
    const r = hh[i] - ll[i];
    out[i] = r === 0 ? -50 : (-100 * (hh[i] - c[i])) / r;
  }
  return out;
}

/** Money flow index over typical price and volume. */
export function mfi(tp: ArrayLike<number>, vol: ArrayLike<number>, n: number): F64 {
  const len = tp.length;
  const out = nanArray(len);
  n = Math.max(1, Math.floor(n));
  const pos = new Float64Array(len);
  const neg = new Float64Array(len);
  for (let i = 1; i < len; i++) {
    const mf = tp[i] * vol[i];
    if (tp[i] > tp[i - 1]) pos[i] = mf;
    else if (tp[i] < tp[i - 1]) neg[i] = mf;
  }
  let sp = 0;
  let sn = 0;
  for (let i = 1; i < len; i++) {
    sp += pos[i];
    sn += neg[i];
    if (i > n) {
      sp -= pos[i - n];
      sn -= neg[i - n];
    }
    if (i >= n) out[i] = sn <= 0 ? 100 : 100 - 100 / (1 + sp / sn);
  }
  return out;
}

export function obv(c: ArrayLike<number>, v: ArrayLike<number>): F64 {
  const len = c.length;
  const out = nanArray(len);
  let acc = 0;
  for (let i = 0; i < len; i++) {
    if (i > 0) {
      if (c[i] > c[i - 1]) acc += v[i];
      else if (c[i] < c[i - 1]) acc -= v[i];
    }
    out[i] = acc;
  }
  return out;
}

/** Approximate cumulative volume delta from bar shape: volume * clamp((close - open) / (high - low)). */
export function cvdApprox(o: ArrayLike<number>, h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, v: ArrayLike<number>): F64 {
  const len = c.length;
  const out = nanArray(len);
  let acc = 0;
  for (let i = 0; i < len; i++) {
    const range = h[i] - l[i] || 1;
    const k = Math.max(-1, Math.min(1, (c[i] - o[i]) / range));
    acc += v[i] * k;
    out[i] = acc;
  }
  return out;
}

export function roc(src: ArrayLike<number>, n: number): F64 {
  const out = nanArray(src.length);
  n = Math.max(1, Math.floor(n));
  for (let i = n; i < src.length; i++) out[i] = src[i - n] === 0 ? NaN : (100 * (src[i] - src[i - n])) / src[i - n];
  return out;
}

export function momentum(src: ArrayLike<number>, n: number): F64 {
  const out = nanArray(src.length);
  n = Math.max(1, Math.floor(n));
  for (let i = n; i < src.length; i++) out[i] = src[i] - src[i - n];
  return out;
}

export interface SupertrendOut {
  /** Trend line while the trend is up (below price), NaN otherwise. */
  up: F64;
  /** Trend line while the trend is down (above price), NaN otherwise. */
  down: F64;
  /** +1 up, -1 down. */
  dir: Int8Array;
}

export function supertrend(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, period: number, mult: number): SupertrendOut {
  const len = h.length;
  const a = atr(h, l, c, period);
  const up = nanArray(len);
  const down = nanArray(len);
  const dir = new Int8Array(len);
  let pu = NaN;
  let pd = NaN;
  let d = 1;
  for (let i = 0; i < len; i++) {
    if (a[i] !== a[i]) {
      dir[i] = 0;
      continue;
    }
    const mid = (h[i] + l[i]) / 2;
    let u = mid - mult * a[i];
    let dn = mid + mult * a[i];
    if (pu === pu && c[i - 1] > pu) u = Math.max(u, pu);
    if (pd === pd && c[i - 1] < pd) dn = Math.min(dn, pd);
    if (pu === pu) {
      if (d === -1 && c[i] > pd) d = 1;
      else if (d === 1 && c[i] < pu) d = -1;
    }
    dir[i] = d;
    if (d === 1) up[i] = u;
    else down[i] = dn;
    pu = u;
    pd = dn;
  }
  return { up, down, dir };
}

export interface SarOut {
  sar: F64;
  /** +1 when the SAR is below price (uptrend), -1 above. */
  dir: Int8Array;
}

export function parabolicSar(h: ArrayLike<number>, l: ArrayLike<number>, c: ArrayLike<number>, start: number, inc: number, max: number): SarOut {
  const len = h.length;
  const sar = nanArray(len);
  const dir = new Int8Array(len);
  if (len < 2) return { sar, dir };
  let up = c[1] >= c[0];
  let cur = up ? l[0] : h[0];
  let ep = up ? h[0] : l[0];
  let af = start;
  sar[0] = cur;
  dir[0] = up ? 1 : -1;
  for (let i = 1; i < len; i++) {
    let ns = cur + af * (ep - cur);
    if (up) {
      ns = Math.min(ns, l[i - 1], i > 1 ? l[i - 2] : l[i - 1]);
      if (l[i] < ns) {
        up = false;
        ns = ep;
        ep = l[i];
        af = start;
      } else if (h[i] > ep) {
        ep = h[i];
        af = Math.min(af + inc, max);
      }
    } else {
      ns = Math.max(ns, h[i - 1], i > 1 ? h[i - 2] : h[i - 1]);
      if (h[i] > ns) {
        up = true;
        ns = ep;
        ep = h[i];
        af = start;
      } else if (l[i] < ep) {
        ep = l[i];
        af = Math.min(af + inc, max);
      }
    }
    cur = ns;
    sar[i] = ns;
    dir[i] = up ? 1 : -1;
  }
  return { sar, dir };
}

/** Wall-clock bucket key of a timestamp (UTC fields, which is how MOEX times are stored). */
export function periodKey(t: number, period: "day" | "week" | "month"): number {
  if (period === "day") return Math.floor(t / 86_400_000);
  if (period === "week") return Math.floor((Math.floor(t / 86_400_000) + 3) / 7); // weeks start on Monday
  const d = new Date(t);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Session-anchored VWAP with volume-weighted standard deviation. Resets whenever the period key changes. */
export function vwapAnchored(
  t: ArrayLike<number>,
  h: ArrayLike<number>,
  l: ArrayLike<number>,
  c: ArrayLike<number>,
  v: ArrayLike<number>,
  anchor: "day" | "week" | "month",
): { vwap: F64; sd: F64 } {
  const len = t.length;
  const vwap = nanArray(len);
  const sd = nanArray(len);
  let key = NaN;
  let sv = 0;
  let spv = 0;
  let spv2 = 0;
  for (let i = 0; i < len; i++) {
    const k = periodKey(t[i], anchor);
    if (k !== key) {
      key = k;
      sv = 0;
      spv = 0;
      spv2 = 0;
    }
    const p = (h[i] + l[i] + c[i]) / 3;
    sv += v[i];
    spv += p * v[i];
    spv2 += p * p * v[i];
    if (sv > 0) {
      const m = spv / sv;
      vwap[i] = m;
      sd[i] = Math.sqrt(Math.max(0, spv2 / sv - m * m));
    } else {
      vwap[i] = p;
      sd[i] = 0;
    }
  }
  return { vwap, sd };
}

export interface PivotLevels {
  P: number;
  R1: number;
  R2: number;
  R3: number;
  S1: number;
  S2: number;
  S3: number;
}

export function classicPivots(high: number, low: number, close: number): PivotLevels {
  const P = (high + low + close) / 3;
  return {
    P,
    R1: 2 * P - low,
    S1: 2 * P - high,
    R2: P + (high - low),
    S2: P - (high - low),
    R3: high + 2 * (P - low),
    S3: low - 2 * (high - P),
  };
}

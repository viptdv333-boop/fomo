/* Classic candlestick patterns from OHLC only (catalogue and texts: candle-meta.ts).
   Pure functions, no DOM, no network.

   Rules (all sizes are relative, so the same defaults fit any instrument and interval):
   - body = |close - open|, range = high - low, upper / lower shadow = distance from the body to the high / low.
   - ATR = Wilder ATR(14) of the PREVIOUS bars (a huge candle does not inflate its own yardstick). A pattern must span at least `minSize` x ATR
     (tiny candles never trigger); "long candle" = body >= `longBody` x ATR.
   - Trend context (option): the move before the pattern's first candle, measured on closes: "slope" = close[s-1] - close[s-1-N] beyond
     `trendAtr` x ATR, or "sma" = close[s-1] above / below SMA(N). Reversal patterns need the opposite trend, continuation patterns
     (three methods) the same trend, context-free ones (doji, marubozu, spinning top, soldiers / crows) none.
   - Gaps: 24h markets (crypto, forex) have none, so by default "gap" means "body beyond the previous body" (touching is fine, the bodies may
     overlap by `overlap` of the previous body); mode "price" asks for a real price gap between the candle ranges (stocks, futures).
   - Nothing looks ahead: a pattern that ends on bar i is decided by bars <= i only, so a CLOSED bar never changes. The last bar of the
     data is the forming one: it is left out unless `forming` is on (then its hit is marked `forming`).
   - Several patterns can end on one bar: the one with the highest priority is the hit, the rest are listed in `others`. */

import type { Candle } from "../types";
import { CANDLE_BY_ID, CANDLE_IDS, type CandleBias, type CandleId } from "./candle-meta";

export interface CandleOptions {
  /** Patterns to look for; null = all. */
  enabled: ReadonlySet<string> | null;
  /** Require the prior trend a pattern needs. */
  trend: boolean;
  trendMode: "slope" | "sma";
  /** Bars of the trend measure. */
  trendLen: number;
  /** Slope threshold, ATR. */
  trendAtr: number;
  gaps: "body" | "price";
  /** Allowed overlap of bodies in "body" gap mode, share of the previous body. */
  overlap: number;
  atrLen: number;
  /** Smallest span of a pattern, ATR. */
  minSize: number;
  /** Long candle: body, ATR. */
  longBody: number;
  /** Doji: body up to this share of the range. */
  dojiBody: number;
  /** Spinning top: body up to this share of the range. */
  spinBody: number;
  /** "No shadow" on the near side of a hammer / dragonfly: share of the range. */
  shadowSmall: number;
  /** Marubozu: shadows up to this share of the range. */
  maruShadow: number;
  /** Hammer: long shadow >= this x body. */
  hammerRatio: number;
  /** Star: body up to this share of the first candle's body. */
  starRatio: number;
  /** Harami: inner body up to this share of the outer body. */
  haramiRatio: number;
  /** Tweezers: highs / lows equal within this x ATR. */
  tweezerTol: number;
  /** Engulfing must cover the shadows too. */
  engulfFull: boolean;
  /** Also look at the forming (last) bar. */
  forming: boolean;
  /** Only the last N bars are scanned. */
  window: number;
  /** Hide hits weaker than this (0-100). */
  minStrength: number;
}

export const DEFAULT_CANDLES: CandleOptions = {
  enabled: null,
  trend: true,
  trendMode: "slope",
  trendLen: 8,
  trendAtr: 1,
  gaps: "body",
  overlap: 0.25,
  atrLen: 14,
  minSize: 0.5,
  longBody: 0.8,
  dojiBody: 0.08,
  spinBody: 0.3,
  shadowSmall: 0.1,
  maruShadow: 0.05,
  hammerRatio: 2,
  starRatio: 0.35,
  haramiRatio: 0.5,
  tweezerTol: 0.1,
  engulfFull: false,
  forming: false,
  window: 500,
  minStrength: 0,
};

export interface CandleHit {
  /** Last bar of the pattern (the marker sits here). */
  i: number;
  /** First bar of the pattern. */
  start: number;
  id: CandleId;
  bias: CandleBias;
  /** 0-100: size against ATR, volume against the average, position at the recent extreme. */
  strength: number;
  /** The last (still open) bar. */
  forming: boolean;
  /** Weaker patterns that also end on this bar, strongest first. */
  others: CandleId[];
}

interface Ctx {
  n: number;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
  top: Float64Array;
  bot: Float64Array;
  body: Float64Array;
  rng: Float64Array;
  up: Float64Array;
  lo: Float64Array;
  atr: Float64Array;
  sma: Float64Array;
}

function prepare(cs: Candle[], opts: CandleOptions): Ctx {
  const n = cs.length;
  const f = () => new Float64Array(n);
  const x: Ctx = { n, o: f(), h: f(), l: f(), c: f(), v: f(), top: f(), bot: f(), body: f(), rng: f(), up: f(), lo: f(), atr: f(), sma: f() };
  const L = Math.max(1, Math.round(opts.atrLen));
  const N = Math.max(1, Math.round(opts.trendLen));
  let run = 0;
  let atr = 0;
  for (let i = 0; i < n; i++) {
    const k = cs[i];
    const o = k.o;
    const c = k.c;
    const h = Math.max(k.h, o, c);
    const l = Math.min(k.l, o, c);
    x.o[i] = o;
    x.h[i] = h;
    x.l[i] = l;
    x.c[i] = c;
    x.v[i] = k.v > 0 ? k.v : 0;
    const t = o > c ? o : c;
    const b = o > c ? c : o;
    x.top[i] = t;
    x.bot[i] = b;
    x.body[i] = t - b;
    x.rng[i] = h - l;
    x.up[i] = h - t;
    x.lo[i] = b - l;
    const tr = i === 0 ? h - l : Math.max(h - l, Math.abs(h - x.c[i - 1]), Math.abs(l - x.c[i - 1]));
    atr = i === 0 ? tr : i < L ? (atr * i + tr) / (i + 1) : (atr * (L - 1) + tr) / L;
    x.atr[i] = atr;
    run += c;
    if (i >= N) run -= x.c[i - N];
    x.sma[i] = i >= N - 1 ? run / N : NaN;
  }
  return x;
}

/** Trend before the first candle `s` of a pattern: 1 up, -1 down, 0 none / unknown. */
function trendBefore(x: Ctx, opts: CandleOptions, s: number): number {
  const r = s - 1;
  if (r < 0) return 0;
  const N = Math.max(1, Math.round(opts.trendLen));
  if (opts.trendMode === "sma") {
    const m = x.sma[r];
    if (!(m === m)) return 0;
    return x.c[r] > m ? 1 : x.c[r] < m ? -1 : 0;
  }
  if (r - N < 0) return 0;
  const d = x.c[r] - x.c[r - N];
  const th = opts.trendAtr * x.atr[r];
  return d > th ? 1 : d < -th ? -1 : 0;
}

interface Match {
  id: CandleId;
  start: number;
}

/** The matcher of the patterns that END on a bar (before the priority pick). The helpers are made once per scan, not per bar. */
function makeMatcher(x: Ctx, opts: CandleOptions): (at: number, out: Match[]) => void {
  const { o, h, l, c, top, bot, body, rng, up, lo } = x;
  let i = 0;
  let A = 0;
  let sink: Match[] = [];
  const price = opts.gaps === "price";
  const ov = opts.overlap;
  const en = (id: CandleId) => !opts.enabled || opts.enabled.has(id);

  const bull = (k: number) => c[k] > o[k];
  const bear = (k: number) => c[k] < o[k];
  const doji = (k: number) => rng[k] > 0 && body[k] <= opts.dojiBody * rng[k];
  const long = (k: number) => body[k] >= opts.longBody * A && body[k] >= 0.5 * rng[k];
  const gapDown = (p: number, q: number) => (price ? h[q] < l[p] : top[q] <= bot[p] + ov * body[p]);
  const gapUp = (p: number, q: number) => (price ? l[q] > h[p] : bot[q] >= top[p] - ov * body[p]);

  const spanOf = (s: number): number => {
    let hi = -Infinity;
    let low = Infinity;
    for (let k = s; k <= i; k++) {
      if (h[k] > hi) hi = h[k];
      if (l[k] < low) low = l[k];
    }
    return hi - low;
  };
  const add = (id: CandleId, s: number) => {
    const m = CANDLE_BY_ID[id];
    if (opts.trend && m.trend !== 0 && trendBefore(x, opts, s) !== m.trend) return;
    if (spanOf(s) < opts.minSize * A) return;
    sink.push({ id, start: s });
  };

  /** The three middle candles of the methods patterns: small bodies inside the range of the first candle `a`. */
  const smallInside = (a: number): boolean => {
    for (let k = a + 1; k <= a + 3; k++) {
      if (body[k] > 0.6 * body[a] || h[k] > h[a] || l[k] < l[a]) return false;
    }
    return true;
  };

  return (at, out) => {
    i = at;
    A = x.atr[i - 1];
    if (!(A > 0)) return;
    sink = out;

    /* ───── one candle ───── */
    if (rng[i] > 0) {
      const R = rng[i];
      const B = body[i];
      if (doji(i)) {
        if (up[i] <= opts.shadowSmall * R) {
          if (en("dragonfly")) add("dragonfly", i);
        } else if (lo[i] <= opts.shadowSmall * R) {
          if (en("gravestone")) add("gravestone", i);
        } else if (up[i] >= 0.3 * R && lo[i] >= 0.3 * R && R >= A) {
          if (en("longlegged")) add("longlegged", i);
        } else if (en("doji")) add("doji", i);
      } else {
        // hammer family: long shadow >= ratio x body, almost none on the other side
        if (lo[i] >= opts.hammerRatio * B && up[i] <= opts.shadowSmall * R) {
          // without the trend context only the bullish name is used (the hanging man is told apart by the trend alone)
          if (!opts.trend || trendBefore(x, opts, i) <= 0) {
            if (en("hammer")) add("hammer", i);
          } else if (en("hanging")) add("hanging", i);
        } else if (up[i] >= opts.hammerRatio * B && lo[i] <= opts.shadowSmall * R) {
          if (!opts.trend || trendBefore(x, opts, i) >= 0) {
            if (en("shooting")) add("shooting", i);
          } else if (en("invhammer")) add("invhammer", i);
        }
        // marubozu / belt-hold
        if (body[i] >= opts.longBody * A) {
          const ms = opts.maruShadow * R;
          if (up[i] <= ms && lo[i] <= ms) {
            const id: CandleId = bull(i) ? "maru_bull" : "maru_bear";
            if (en(id)) add(id, i);
          } else if (bull(i) && lo[i] <= ms && en("belt_bull")) add("belt_bull", i);
          else if (bear(i) && up[i] <= ms && en("belt_bear")) add("belt_bear", i);
        }
        // spinning top: small body, both shadows longer than the body
        if (B <= opts.spinBody * R && up[i] >= B && lo[i] >= B && en("spinning")) add("spinning", i);
      }
    }

    /* ───── two candles ───── */
    if (i >= 1) {
      const p = i - 1;
      const q = i;
      if (bear(p) && bull(q)) {
        if (en("engulf_bull") && !doji(p) && top[q] >= top[p] && bot[q] <= bot[p] && body[q] > body[p] && (!opts.engulfFull || (h[q] >= h[p] && l[q] <= l[p]))) add("engulf_bull", p);
        if (long(p) && top[q] <= top[p] && bot[q] >= bot[p] && !doji(q) && body[q] <= opts.haramiRatio * body[p] && en("harami_bull")) add("harami_bull", p);
        if (long(p) && en("piercing") && (price ? o[q] < l[p] : o[q] <= bot[p] + ov * body[p]) && c[q] > (o[p] + c[p]) / 2 && c[q] < o[p]) add("piercing", p);
        if (en("kicker_bull") && long(p) && long(q) && gapUp(p, q)) add("kicker_bull", p);
        if (en("tweezer_bottom") && !doji(p) && !doji(q) && Math.abs(l[p] - l[q]) <= opts.tweezerTol * A) add("tweezer_bottom", p);
      } else if (bull(p) && bear(q)) {
        if (en("engulf_bear") && !doji(p) && top[q] >= top[p] && bot[q] <= bot[p] && body[q] > body[p] && (!opts.engulfFull || (h[q] >= h[p] && l[q] <= l[p]))) add("engulf_bear", p);
        if (long(p) && top[q] <= top[p] && bot[q] >= bot[p] && !doji(q) && body[q] <= opts.haramiRatio * body[p] && en("harami_bear")) add("harami_bear", p);
        if (long(p) && en("darkcloud") && (price ? o[q] > h[p] : o[q] >= top[p] - ov * body[p]) && c[q] < (o[p] + c[p]) / 2 && c[q] > o[p]) add("darkcloud", p);
        if (en("kicker_bear") && long(p) && long(q) && gapDown(p, q)) add("kicker_bear", p);
        if (en("tweezer_top") && !doji(p) && !doji(q) && Math.abs(h[p] - h[q]) <= opts.tweezerTol * A) add("tweezer_top", p);
      }
      // harami cross: a doji inside the body of a long candle (the colour of the doji does not matter)
      if (doji(q) && long(p) && top[q] <= top[p] && bot[q] >= bot[p]) {
        if (bear(p) && en("haramix_bull")) add("haramix_bull", p);
        else if (bull(p) && en("haramix_bear")) add("haramix_bear", p);
      }
    }

    /* ───── three candles ───── */
    if (i >= 2) {
      const a = i - 2;
      const b = i - 1;
      const q = i;
      // stars
      if (long(a) && rng[b] > 0) {
        const small = body[b] <= opts.starRatio * body[a];
        const dj = doji(b);
        if (bear(a) && bull(q) && gapDown(a, b) && c[q] > (o[a] + c[a]) / 2 && (!price || l[q] > h[b])) {
          if (dj) {
            if (en("abandoned_bull") && (price ? h[b] < l[a] && h[b] < l[q] : top[b] <= bot[a] + ov * body[a] && top[b] <= bot[q] + ov * body[q])) add("abandoned_bull", a);
            if (en("morning_doji")) add("morning_doji", a);
          } else if (small && en("morning")) add("morning", a);
        } else if (bull(a) && bear(q) && gapUp(a, b) && c[q] < (o[a] + c[a]) / 2 && (!price || h[q] < l[b])) {
          if (dj) {
            if (en("abandoned_bear") && (price ? l[b] > h[a] && l[b] > h[q] : bot[b] >= top[a] - ov * body[a] && bot[b] >= top[q] - ov * body[q])) add("abandoned_bear", a);
            if (en("evening_doji")) add("evening_doji", a);
          } else if (small && en("evening")) add("evening", a);
        }
      }
      // three soldiers / crows
      const sb = 0.5 * A;
      if (bull(a) && bull(b) && bull(q) && c[b] > c[a] && c[q] > c[b] && body[a] >= sb && body[b] >= sb && body[q] >= sb) {
        if (
          o[b] >= bot[a] && o[b] <= top[a] && o[q] >= bot[b] && o[q] <= top[b] &&
          up[a] <= 0.3 * rng[a] && up[b] <= 0.3 * rng[b] && up[q] <= 0.3 * rng[q] &&
          body[a] >= 0.5 * rng[a] && body[b] >= 0.5 * rng[b] && body[q] >= 0.5 * rng[q] && en("soldiers")
        )
          add("soldiers", a);
      } else if (bear(a) && bear(b) && bear(q) && c[b] < c[a] && c[q] < c[b] && body[a] >= sb && body[b] >= sb && body[q] >= sb) {
        if (
          o[b] >= bot[a] && o[b] <= top[a] && o[q] >= bot[b] && o[q] <= top[b] &&
          lo[a] <= 0.3 * rng[a] && lo[b] <= 0.3 * rng[b] && lo[q] <= 0.3 * rng[q] &&
          body[a] >= 0.5 * rng[a] && body[b] >= 0.5 * rng[b] && body[q] >= 0.5 * rng[q] && en("crows")
        )
          add("crows", a);
      }
      // three inside (confirmed harami) and three outside (confirmed engulfing)
      if (long(a) && bear(a) && bull(b) && bull(q) && top[b] <= top[a] && bot[b] >= bot[a] && !doji(b) && body[b] <= opts.haramiRatio * body[a] && c[q] > c[b] && c[q] > top[a] && en("inside_up")) add("inside_up", a);
      if (long(a) && bull(a) && bear(b) && bear(q) && top[b] <= top[a] && bot[b] >= bot[a] && !doji(b) && body[b] <= opts.haramiRatio * body[a] && c[q] < c[b] && c[q] < bot[a] && en("inside_down")) add("inside_down", a);
      if (bear(a) && bull(b) && bull(q) && !doji(a) && top[b] >= top[a] && bot[b] <= bot[a] && body[b] > body[a] && c[q] > c[b] && en("outside_up")) add("outside_up", a);
      if (bull(a) && bear(b) && bear(q) && !doji(a) && top[b] >= top[a] && bot[b] <= bot[a] && body[b] > body[a] && c[q] < c[b] && en("outside_down")) add("outside_down", a);
    }

    /* ───── five candles: rising / falling three methods ───── */
    if (i >= 4) {
      const a = i - 4;
      const q = i;
      if (bull(a) && long(a) && bull(q) && long(q) && c[q] > c[a] && c[q] > Math.max(top[a + 1], top[a + 2], top[a + 3]) && en("rising3") && smallInside(a)) add("rising3", a);
      else if (bear(a) && long(a) && bear(q) && long(q) && c[q] < c[a] && c[q] < Math.min(bot[a + 1], bot[a + 2], bot[a + 3]) && en("falling3") && smallInside(a)) add("falling3", a);
    }
  };
}

/** 0-100: how convincing a hit is. 40% size against ATR, 30% volume against the average of the 20 bars before, 30% position at the recent extreme. */
function strengthOf(x: Ctx, id: CandleId, s: number, i: number): number {
  const A = x.atr[i - 1];
  let hi = -Infinity;
  let low = Infinity;
  let vs = 0;
  for (let k = s; k <= i; k++) {
    if (x.h[k] > hi) hi = x.h[k];
    if (x.l[k] < low) low = x.l[k];
    vs += x.v[k];
  }
  const size = A > 0 ? Math.min(1, (hi - low) / (2 * A)) : 0;
  let vol = 0.5;
  const from = Math.max(0, s - 20);
  if (s - from >= 5) {
    let vb = 0;
    for (let k = from; k < s; k++) vb += x.v[k];
    vb /= s - from;
    const vp = vs / (i - s + 1);
    if (vb > 0 && vp > 0) vol = Math.max(0, Math.min(1, (vp / vb - 0.7) / 0.8));
  }
  let loc = 0.5;
  const bias = CANDLE_BY_ID[id].bias;
  if (bias !== "flat" && s > 0 && A > 0) {
    if (bias === "bull") {
      let m = Infinity;
      for (let k = from; k < s; k++) if (x.l[k] < m) m = x.l[k];
      loc = low <= m + 0.5 * A ? 1 : low <= m + 2 * A ? 0.5 : 0;
    } else {
      let m = -Infinity;
      for (let k = from; k < s; k++) if (x.h[k] > m) m = x.h[k];
      loc = hi >= m - 0.5 * A ? 1 : hi >= m - 2 * A ? 0.5 : 0;
    }
  }
  return Math.round(100 * (0.4 * size + 0.3 * vol + 0.3 * loc));
}

export function detectCandles(cs: Candle[], over?: Partial<CandleOptions>): CandleHit[] {
  const opts: CandleOptions = over ? { ...DEFAULT_CANDLES, ...over } : DEFAULT_CANDLES;
  const n = cs.length;
  if (n < 3) return [];
  const x = prepare(cs, opts);
  const last = opts.forming ? n - 1 : n - 2;
  const first = Math.max(1, n - Math.max(1, Math.round(opts.window)));
  const hits: CandleHit[] = [];
  const found: Match[] = [];
  const match = makeMatcher(x, opts);
  for (let i = first; i <= last; i++) {
    found.length = 0;
    match(i, found);
    if (found.length === 0) continue;
    found.sort((p, q) => CANDLE_BY_ID[q.id].prio - CANDLE_BY_ID[p.id].prio);
    const top = found[0];
    const strength = strengthOf(x, top.id, top.start, i);
    if (strength < opts.minStrength) continue;
    hits.push({ i, start: top.start, id: top.id, bias: CANDLE_BY_ID[top.id].bias, strength, forming: i === n - 1, others: found.slice(1).map((m) => m.id) });
  }
  return hits;
}

/** Ids of the patterns of a preset ("main" / "all"); anything else (custom list) is up to the caller. */
export function allCandleIds(): CandleId[] {
  return CANDLE_IDS.slice();
}

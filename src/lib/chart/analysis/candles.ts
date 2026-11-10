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
     Patterns that live IN the gap (tasuki, side-by-side lines, two crows, mat hold, breakaway) need the bodies clear of each other, with no
     overlap; windows and island reversals are always real price gaps, so a 24h market simply has none.
   - "The same price" (tweezers, meeting / separating lines, matching low / high, stick sandwich) = within `tweezerTol` x ATR.
   - Variable length: three methods take 2-5 small candles between the two long ones, an island reversal 1-5 candles between its two gaps;
     the shortest fit that ends on the bar is the hit, `start` is its real first candle.
   - A pattern that completes a weaker one (catalogue: `absorbs`) removes that one's hit of the bar before, once its own last bar is closed.
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
  /** Extra strength points of this very hit (tweezers of opposite colours). */
  boost: number;
}

/** Most candles between the two gaps of an island reversal, and the limits of the pause of the three methods. */
const ISLAND_MAX = 5;
const METHODS_MIN = 2;
const METHODS_MAX = 5;

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
  const add = (id: CandleId, s: number, boost = 0) => {
    const m = CANDLE_BY_ID[id];
    if (opts.trend && m.trend !== 0 && trendBefore(x, opts, s) !== m.trend) return;
    if (spanOf(s) < opts.minSize * A) return;
    sink.push({ id, start: s, boost });
  };
  /** A gap between the BODIES (in "price" mode between the whole candles), no overlap allowed: tasuki, side-by-side lines, crows, mat hold, breakaway. */
  const clearUp = (p: number, q: number) => (price ? l[q] > h[p] : bot[q] > top[p]);
  const clearDown = (p: number, q: number) => (price ? h[q] < l[p] : top[q] < bot[p]);
  const inBody = (v: number, k: number) => v >= bot[k] && v <= top[k];

  /** The middle candles a+1 .. e of the methods patterns: small bodies inside the range of the first candle `a`. */
  const smallInside = (a: number, e: number): boolean => {
    for (let k = a + 1; k <= e; k++) {
      if (body[k] > 0.6 * body[a] || h[k] > h[a] || l[k] < l[a]) return false;
    }
    return true;
  };
  /** Rising (dir 1) / falling (dir -1) three methods that end on the bar `i`: a long candle, METHODS_MIN..METHODS_MAX small candles held inside
      its range that do not go on with the trend, and a long candle of the first colour closing beyond the first close. The shortest fit wins. */
  const methods = (dir: 1 | -1): void => {
    const id: CandleId = dir > 0 ? "rising3" : "falling3";
    if (!en(id) || !long(i) || (dir > 0 ? !bull(i) : !bear(i))) return;
    for (let k = METHODS_MIN; k <= METHODS_MAX; k++) {
      const a = i - k - 1;
      if (a < 0) return;
      if (!long(a) || (dir > 0 ? !bull(a) : !bear(a))) continue;
      if (dir > 0 ? c[i] <= c[a] : c[i] >= c[a]) continue;
      if (!smallInside(a, i - 1)) continue;
      // the pause drifts against the trend: its last close has not gone beyond the first candle's close
      if (dir > 0 ? c[i - 1] >= c[a] : c[i - 1] <= c[a]) continue;
      let ok = true;
      for (let j = a + 1; j < i && ok; j++) ok = dir > 0 ? c[i] > top[j] : c[i] < bot[j];
      if (!ok) continue;
      add(id, a);
      return;
    }
  };
  /** Island reversal that ends on the bar `i` (the first candle after the second gap): 1..ISLAND_MAX candles cut off by REAL price gaps on
      both sides (whatever the gap mode: an island is a chart figure of gaps between the candle ranges). dir 1 = top, -1 = bottom. */
  const island = (dir: 1 | -1): void => {
    const id: CandleId = dir > 0 ? "island_top" : "island_bottom";
    if (!en(id)) return;
    const g = 0.05 * A;
    let edge = dir > 0 ? Infinity : -Infinity; // the side of the island that faces the gaps: its lowest low (top) / highest high (bottom)
    for (let k = 1; k <= ISLAND_MAX; k++) {
      const j = i - k;
      const a = j - 1;
      if (a < 0) return;
      if (dir > 0) {
        if (l[j] < edge) edge = l[j];
        if (edge <= h[i] + g) return; // no gap after the island: a longer one has none either
        if (edge > h[a] + g) return add(id, a);
      } else {
        if (h[j] > edge) edge = h[j];
        if (edge >= l[i] - g) return;
        if (edge < l[a] - g) return add(id, a);
      }
    }
  };

  return (at, out) => {
    i = at;
    A = x.atr[i - 1];
    if (!(A > 0)) return;
    sink = out;
    // "the same price" (tweezers, meeting / separating lines, matching closes): within the tweezer tolerance
    const eq = opts.tweezerTol * A;

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
        // counterattack (meeting lines): a long candle from far below back to the previous close
        const meet = long(p) && long(q) && o[q] < c[p] && Math.abs(c[q] - c[p]) <= eq;
        if (meet && en("counter_bull")) add("counter_bull", p);
        // the weak bounces after a long black candle (below a piercing line): on-neck at its low, in-neck at its close, thrusting below the middle
        // of its body; a LONG white candle back to the close is the counterattack above, not a neck line
        if (!meet && long(p) && (price ? o[q] < l[p] : o[q] < c[p])) {
          if (Math.abs(c[q] - l[p]) <= eq && c[q] <= c[p] + eq) {
            if (en("onneck")) add("onneck", p);
          } else if (c[q] >= c[p] - eq && c[q] <= c[p] + 0.15 * body[p]) {
            if (en("inneck")) add("inneck", p);
          } else if (c[q] > c[p] + 0.15 * body[p] && c[q] <= (o[p] + c[p]) / 2) {
            if (en("thrusting")) add("thrusting", p);
          }
        }
        // separating lines: the same open, opposite colours, the second candle long and with the trend
        if (en("separating_bull") && long(q) && body[p] >= 0.5 * A && Math.abs(o[q] - o[p]) <= eq) add("separating_bull", p);
      } else if (bull(p) && bear(q)) {
        if (en("engulf_bear") && !doji(p) && top[q] >= top[p] && bot[q] <= bot[p] && body[q] > body[p] && (!opts.engulfFull || (h[q] >= h[p] && l[q] <= l[p]))) add("engulf_bear", p);
        if (long(p) && top[q] <= top[p] && bot[q] >= bot[p] && !doji(q) && body[q] <= opts.haramiRatio * body[p] && en("harami_bear")) add("harami_bear", p);
        if (long(p) && en("darkcloud") && (price ? o[q] > h[p] : o[q] >= top[p] - ov * body[p]) && c[q] < (o[p] + c[p]) / 2 && c[q] > o[p]) add("darkcloud", p);
        if (en("kicker_bear") && long(p) && long(q) && gapDown(p, q)) add("kicker_bear", p);
        if (en("counter_bear") && long(p) && long(q) && o[q] > c[p] && Math.abs(c[q] - c[p]) <= eq) add("counter_bear", p);
        if (en("separating_bear") && long(q) && body[p] >= 0.5 * A && Math.abs(o[q] - o[p]) <= eq) add("separating_bear", p);
      } else if (bear(p) && bear(q)) {
        if (long(p)) {
          // homing pigeon: a harami of two black candles; matching low: two black candles with the same close
          if (en("homing_pigeon") && top[q] <= top[p] && bot[q] >= bot[p] && !doji(q) && body[q] <= opts.haramiRatio * body[p]) add("homing_pigeon", p);
          if (en("matching_low") && Math.abs(c[q] - c[p]) <= eq) add("matching_low", p);
        }
      } else if (bull(p) && bull(q)) {
        if (long(p) && en("matching_high") && Math.abs(c[q] - c[p]) <= eq) add("matching_high", p);
      }
      // tweezers: (near-)equal lows / highs of two adjacent candles; the colours do not matter (opposite ones make the hit stronger)
      if (rng[p] > 0 && rng[q] > 0 && !(doji(p) && doji(q))) {
        if (en("tweezer_bottom") && Math.abs(l[p] - l[q]) <= eq) add("tweezer_bottom", p, bear(p) && bull(q) ? 10 : 0);
        if (en("tweezer_top") && Math.abs(h[p] - h[q]) <= eq) add("tweezer_top", p, bull(p) && bear(q) ? 10 : 0);
      }
      // windows: a real price gap between the two candles (in any gap mode: on a 24h market there are simply none)
      if (l[q] > h[p] + 0.05 * A) {
        if (en("window_up")) add("window_up", p);
      } else if (h[q] < l[p] - 0.05 * A) {
        if (en("window_down")) add("window_down", p);
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

    /* ───── three candles, part 2 ───── */
    if (i >= 2) {
      const a = i - 2;
      const b = i - 1;
      const q = i;
      const eqb = Math.max(eq, 0.15 * body[b]);
      if (bull(a) && bull(b)) {
        if (bear(q)) {
          // upside Tasuki gap: the black candle opens inside the second body and closes in the gap without filling it
          if (en("tasuki_up") && clearUp(a, b) && o[q] > bot[b] && o[q] < top[b] && c[q] < bot[b] && c[q] > (price ? h[a] : top[a])) add("tasuki_up", a);
        } else if (bull(q)) {
          if (en("sidebyside_bull") && clearUp(a, b) && clearUp(a, q) && Math.abs(o[q] - o[b]) <= eqb && body[q] >= 0.6 * body[b] && body[q] <= 1.67 * body[b]) add("sidebyside_bull", a);
          if (c[b] > c[a] && c[q] > c[b]) {
            // advance block: soldiers whose bodies shrink while the upper shadows grow
            if (
              en("advance_block") && long(a) && inBody(o[b], a) && inBody(o[q], b) && body[b] < body[a] && body[q] < body[b] &&
              up[b] >= 0.25 * rng[b] && up[q] >= 0.25 * rng[q] && up[q] >= up[a]
            )
              add("advance_block", a);
            // deliberation: two long white candles, then a small one (a star) at the close of the second
            if (en("deliberation") && long(a) && long(b) && rng[q] > 0 && body[q] <= opts.starRatio * body[b] && o[q] >= c[b] - ov * body[b]) add("deliberation", a);
          }
        }
      } else if (bear(a) && bear(b)) {
        if (bull(q) && en("tasuki_down") && clearDown(a, b) && o[q] > bot[b] && o[q] < top[b] && c[q] > top[b] && c[q] < (price ? l[a] : bot[a])) add("tasuki_down", a);
        // unique three-river bottom: a black harami with a long lower shadow to a new low, then a small white candle under its close
        if (
          bull(q) && en("three_river") && long(a) && top[b] <= top[a] && bot[b] >= bot[a] && l[b] < l[a] && lo[b] >= body[b] && lo[b] >= 0.4 * rng[b] &&
          c[q] < c[b] && l[q] > l[b] && body[q] <= 0.5 * body[a]
        )
          add("three_river", a);
      } else if (bear(a) && bull(b)) {
        if (bull(q) && en("sidebyside_bear") && clearDown(a, b) && clearDown(a, q) && Math.abs(o[q] - o[b]) <= eqb && body[q] >= 0.6 * body[b] && body[q] <= 1.67 * body[b]) add("sidebyside_bear", a);
        // stick sandwich: a white candle that trades above the close of the first black one, then a black one back to that very close
        if (bear(q) && en("stick_sandwich") && body[a] >= 0.5 * A && l[b] > c[a] && o[q] >= c[b] && Math.abs(c[q] - c[a]) <= eq) add("stick_sandwich", a);
      } else if (bull(a) && bear(b) && bear(q) && long(a) && bot[b] > top[a] && (!price || l[b] > h[a])) {
        // two crows: the second crow opens inside the first and closes inside the white body; upside-gap two crows: it engulfs the first crow but stays above the white body
        if (o[q] > o[b] && c[q] < c[b] && c[q] > c[a]) {
          if (en("upgap_two_crows")) add("upgap_two_crows", a);
        } else if (inBody(o[q], b) && c[q] < top[a] && c[q] > bot[a]) {
          if (en("two_crows")) add("two_crows", a);
        }
      }
      // tri-star: three doji, the middle one beyond the other two
      if (doji(a) && doji(b) && doji(q)) {
        if (en("tristar_bull") && (price ? h[b] < l[a] && h[b] < l[q] : top[b] < bot[a] && top[b] < bot[q])) add("tristar_bull", a);
        else if (en("tristar_bear") && (price ? l[b] > h[a] && l[b] > h[q] : bot[b] > top[a] && bot[b] > top[q])) add("tristar_bear", a);
      }
    }

    /* ───── four candles ───── */
    if (i >= 3) {
      const s = i - 3;
      const q = i;
      const sb = 0.5 * A;
      // three-line strike: three candles one way (each opens in or near the previous body), then one candle that wipes them all out
      if (bull(s) && bull(s + 1) && bull(s + 2) && bear(q)) {
        if (
          en("strike_bull") && c[s + 1] > c[s] && c[s + 2] > c[s + 1] && body[s] >= sb && body[s + 1] >= sb && body[s + 2] >= sb &&
          o[s + 1] >= bot[s] && o[s + 1] <= top[s] + eq && o[s + 2] >= bot[s + 1] && o[s + 2] <= top[s + 1] + eq && o[q] >= c[s + 2] - eq && c[q] < o[s]
        )
          add("strike_bull", s);
      } else if (bear(s) && bear(s + 1) && bear(s + 2)) {
        if (bull(q)) {
          if (
            en("strike_bear") && c[s + 1] < c[s] && c[s + 2] < c[s + 1] && body[s] >= sb && body[s + 1] >= sb && body[s + 2] >= sb &&
            o[s + 1] <= top[s] && o[s + 1] >= bot[s] - eq && o[s + 2] <= top[s + 1] && o[s + 2] >= bot[s + 1] - eq && o[q] <= c[s + 2] + eq && c[q] > o[s]
          )
            add("strike_bear", s);
        } else if (bear(q) && en("concealing_swallow")) {
          // concealing baby swallow: two black marubozu, a black candle that opens lower with an upper shadow into the second body, a black candle that engulfs it with its shadows
          const t = s + 2;
          const maru = (k: number) => body[k] >= opts.longBody * A && up[k] <= opts.shadowSmall * rng[k] && lo[k] <= opts.shadowSmall * rng[k];
          if (maru(s) && maru(s + 1) && c[s + 1] < c[s] && o[t] < c[s + 1] && h[t] > c[s + 1] && up[t] >= body[t] && o[q] >= h[t] && c[q] <= l[t]) add("concealing_swallow", s);
        }
      }
    }

    /* ───── five candles ───── */
    if (i >= 4) {
      const s = i - 4;
      const q = i;
      if (bull(s) && long(s)) {
        // mat hold: a small candle gaps up, two more small ones drift lower but stay above the open of the first, a white candle closes above their highs
        if (
          en("mathold") && bull(q) && bot[s + 1] > top[s] && (!price || l[s + 1] > h[s]) &&
          body[s + 1] <= 0.6 * body[s] && body[s + 2] <= 0.6 * body[s] && body[s + 3] <= 0.6 * body[s] &&
          c[s + 2] < top[s + 1] && c[s + 3] < c[s + 1] && bot[s + 2] > o[s] && bot[s + 3] > o[s] && c[q] > Math.max(h[s + 1], h[s + 2], h[s + 3])
        )
          add("mathold", s);
        // bearish breakaway: a gap up, higher and higher closes, a long black candle back into the gap
        if (
          en("breakaway_bear") && bear(q) && long(q) && bull(s + 1) && bull(s + 3) && clearUp(s, s + 1) && c[s + 2] > c[s + 1] && c[s + 3] > c[s + 2] &&
          c[q] < bot[s + 1] && c[q] > c[s]
        )
          add("breakaway_bear", s);
      } else if (bear(s)) {
        if (
          en("breakaway_bull") && long(s) && bull(q) && long(q) && bear(s + 1) && bear(s + 3) && clearDown(s, s + 1) && c[s + 2] < c[s + 1] && c[s + 3] < c[s + 2] &&
          c[q] > top[s + 1] && c[q] < c[s]
        )
          add("breakaway_bull", s);
        // ladder bottom: three black steps down, a black candle with an upper shadow, a white candle above its body that closes above its high
        if (
          en("ladder_bottom") && bull(q) && bear(s + 1) && bear(s + 2) && bear(s + 3) && o[s + 1] < o[s] && c[s + 1] < c[s] && o[s + 2] < o[s + 1] && c[s + 2] < c[s + 1] &&
          body[s] >= 0.5 * A && body[s + 1] >= 0.5 * A && body[s + 2] >= 0.5 * A &&
          c[s + 3] < c[s + 2] && up[s + 3] >= 0.3 * rng[s + 3] && up[s + 3] >= body[s + 3] * 0.5 && (price ? o[q] > o[s + 3] : o[q] >= c[s + 3]) && c[q] > h[s + 3]
        )
          add("ladder_bottom", s);
      }
    }

    /* ───── variable length: three methods (2-5 candles in the pause), island reversals (1-5 candles on the island) ───── */
    methods(1);
    methods(-1);
    island(1);
    island(-1);
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
    const strength = Math.min(100, strengthOf(x, top.id, top.start, i) + top.boost);
    if (strength < opts.minStrength) continue;
    // a completed (closed) pattern swallows its sub-pattern of one bar earlier on the same candles: three-line strike = soldiers / crows + one candle
    const eats = CANDLE_BY_ID[top.id].absorbs;
    const prev = hits[hits.length - 1];
    if (eats && i < n - 1 && prev && prev.i === i - 1 && prev.start >= top.start && eats.includes(prev.id)) hits.pop();
    hits.push({ i, start: top.start, id: top.id, bias: CANDLE_BY_ID[top.id].bias, strength, forming: i === n - 1, others: found.slice(1).map((m) => m.id) });
  }
  return hits;
}

/** Ids of the patterns of a preset ("main" / "all"); anything else (custom list) is up to the caller. */
export function allCandleIds(): CandleId[] {
  return CANDLE_IDS.slice();
}

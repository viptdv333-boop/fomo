/* Source of the sandboxed Web Worker that runs user indicator scripts.
   It is plain JavaScript in a string (no imports, no template literals inside!) and is started from a Blob URL,
   so it does not depend on how Next bundles workers. Before any user code runs, every network / storage / timer /
   code-generation capability is removed from the worker scope; user code is compiled with those names shadowed.

   Protocol (all messages are plain objects):
     main -> worker  { type:"run", id, code, params, interval, precision, t,o,h,l,c,v (Float64Array, transferred), limits }
     worker -> main  { type:"ready" }  |  { type:"done", id, ok, ... }
*/

export const WORKER_SRC = String.raw`
(function () {
"use strict";
var G = self;
var post = G.postMessage.bind(G);
var addL = G.addEventListener.bind(G);
var Fn = Function;
var F64 = Float64Array;
var NAN = NaN;
var now = (G.performance && G.performance.now) ? G.performance.now.bind(G.performance) : Date.now;
var hasOwn = Object.prototype.hasOwnProperty;

/* ─────────── series helpers ─────────── */

var N = 0;
function nanArr(n) { var a = new F64(n); a.fill(NAN); return a; }
function num(v) { return v == null ? NAN : (v === true ? 1 : v === false ? 0 : +v); }
function fin(v) { return v - v === 0; }
function S(x) {
  if (x instanceof F64) return x;
  if (typeof x === "number" || typeof x === "boolean") { var a = new F64(N); a.fill(num(x)); return a; }
  if (x && typeof x.length === "number" && typeof x !== "string") {
    var L = x.length, b = new F64(L);
    for (var i = 0; i < L; i++) b[i] = num(x[i]);
    return b;
  }
  throw new TypeError("Expected a series (array) or a number");
}
function ilen(n) { n = Math.floor(+n); if (!(n >= 1)) n = 1; if (n > 1000000) n = 1000000; return n; }
function truthy(v) { return v === v && v !== 0 && v != null; }
function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ─────────── technical analysis library ─────────── */

function rsum(src, n) {
  src = S(src); n = ilen(n);
  var L = src.length, out = nanArr(L), sum = 0, bad = 0;
  for (var i = 0; i < L; i++) {
    var v = src[i];
    if (fin(v)) sum += v; else bad++;
    if (i >= n) { var o = src[i - n]; if (fin(o)) sum -= o; else bad--; }
    if (i >= n - 1 && bad === 0) out[i] = sum;
  }
  return out;
}
function sma(src, n) {
  n = ilen(n);
  var s = rsum(src, n);
  for (var i = 0; i < s.length; i++) s[i] = s[i] / n;
  return s;
}
function expS(src, n, k) {
  src = S(src);
  var L = src.length, out = nanArr(L), seed = sma(src, n), prev = NAN;
  for (var i = 0; i < L; i++) {
    var v = src[i];
    if (!fin(v)) { prev = NAN; continue; }
    if (prev !== prev) prev = seed[i]; else prev = k * v + (1 - k) * prev;
    out[i] = prev;
  }
  return out;
}
function ema(src, n) { n = ilen(n); return expS(src, n, 2 / (n + 1)); }
function rma(src, n) { n = ilen(n); return expS(src, n, 1 / n); }
function wma(src, n) {
  src = S(src); n = ilen(n);
  var L = src.length, out = nanArr(L), den = n * (n + 1) / 2;
  for (var i = n - 1; i < L; i++) {
    var acc = 0, ok = true;
    for (var j = 0; j < n; j++) {
      var v = src[i - n + 1 + j];
      if (!fin(v)) { ok = false; break; }
      acc += (j + 1) * v;
    }
    if (ok) out[i] = acc / den;
  }
  return out;
}
function hma(src, n) {
  n = ilen(n);
  var a = wma(src, Math.max(1, Math.floor(n / 2))), b = wma(src, n), raw = nanArr(a.length);
  for (var i = 0; i < raw.length; i++) raw[i] = 2 * a[i] - b[i];
  return wma(raw, Math.max(1, Math.round(Math.sqrt(n))));
}
function dema(src, n) { var e = ema(src, n), e2 = ema(e, n), o = nanArr(e.length); for (var i = 0; i < o.length; i++) o[i] = 2 * e[i] - e2[i]; return o; }
function tema(src, n) { var e = ema(src, n), e2 = ema(e, n), e3 = ema(e2, n), o = nanArr(e.length); for (var i = 0; i < o.length; i++) o[i] = 3 * (e[i] - e2[i]) + e3[i]; return o; }
function alma(src, n, offset, sigma) {
  src = S(src); n = ilen(n);
  if (offset == null) offset = 0.85;
  if (sigma == null) sigma = 6;
  var L = src.length, out = nanArr(L), m = offset * (n - 1), s = n / sigma, w = new F64(n), norm = 0, j;
  for (j = 0; j < n; j++) { w[j] = Math.exp(-((j - m) * (j - m)) / (2 * s * s)); norm += w[j]; }
  for (var i = n - 1; i < L; i++) {
    var acc = 0, ok = true;
    for (j = 0; j < n; j++) { var v = src[i - n + 1 + j]; if (!fin(v)) { ok = false; break; } acc += w[j] * v; }
    if (ok) out[i] = acc / norm;
  }
  return out;
}
function variance(src, n) {
  src = S(src); n = ilen(n);
  var L = src.length, out = nanArr(L);
  for (var i = n - 1; i < L; i++) {
    var sum = 0, ok = true, j;
    for (j = i - n + 1; j <= i; j++) { var v = src[j]; if (!fin(v)) { ok = false; break; } sum += v; }
    if (!ok) continue;
    var mean = sum / n, sq = 0;
    for (j = i - n + 1; j <= i; j++) { var d = src[j] - mean; sq += d * d; }
    out[i] = sq / n;
  }
  return out;
}
function stdev(src, n) { var v = variance(src, n); for (var i = 0; i < v.length; i++) v[i] = Math.sqrt(v[i]); return v; }
function hilo(src, n, isMax) {
  src = S(src); n = ilen(n);
  var L = src.length, out = nanArr(L);
  for (var i = n - 1; i < L; i++) {
    var m = isMax ? -Infinity : Infinity, any = false;
    for (var j = i - n + 1; j <= i; j++) {
      var v = src[j];
      if (!fin(v)) continue;
      any = true;
      if (isMax ? v > m : v < m) m = v;
    }
    if (any) out[i] = m;
  }
  return out;
}
function highest(src, n) { return hilo(src, n, true); }
function lowest(src, n) { return hilo(src, n, false); }
function shift(src, n) {
  src = S(src); n = Math.floor(+n) || 0;
  var L = src.length, out = nanArr(L);
  for (var i = 0; i < L; i++) { var k = i - n; if (k >= 0 && k < L) out[i] = src[k]; }
  return out;
}
function change(src, n) {
  src = S(src); n = ilen(n == null ? 1 : n);
  var L = src.length, out = nanArr(L);
  for (var i = n; i < L; i++) out[i] = src[i] - src[i - n];
  return out;
}
function roc(src, n) {
  src = S(src); n = ilen(n == null ? 1 : n);
  var L = src.length, out = nanArr(L);
  for (var i = n; i < L; i++) out[i] = src[i - n] === 0 ? NAN : 100 * (src[i] - src[i - n]) / src[i - n];
  return out;
}
function cum(src) {
  src = S(src);
  var L = src.length, out = nanArr(L), acc = 0;
  for (var i = 0; i < L; i++) { if (fin(src[i])) acc += src[i]; out[i] = acc; }
  return out;
}
function cmp(a, b, kind) {
  var x = S(a), y = S(b), L = x.length, out = new F64(L);
  for (var i = 0; i < L; i++) {
    var p = x[i], q = y[i];
    out[i] = kind === 0 ? (p > q ? 1 : 0) : kind === 1 ? (p >= q ? 1 : 0) : kind === 2 ? (p < q ? 1 : 0) : kind === 3 ? (p <= q ? 1 : 0) : kind === 4 ? (p === q ? 1 : 0) : (p !== q ? 1 : 0);
  }
  return out;
}
function crossover(a, b) {
  var x = S(a), y = S(b), L = x.length, out = new F64(L);
  for (var i = 1; i < L; i++) out[i] = (x[i] > y[i] && x[i - 1] <= y[i - 1]) ? 1 : 0;
  return out;
}
function crossunder(a, b) {
  var x = S(a), y = S(b), L = x.length, out = new F64(L);
  for (var i = 1; i < L; i++) out[i] = (x[i] < y[i] && x[i - 1] >= y[i - 1]) ? 1 : 0;
  return out;
}
function cross(a, b) {
  var u = crossover(a, b), d = crossunder(a, b);
  for (var i = 0; i < u.length; i++) u[i] = u[i] || d[i];
  return u;
}
function trend(src, n, up) {
  src = S(src); n = ilen(n == null ? 1 : n);
  var L = src.length, out = new F64(L), run = 0;
  for (var i = 1; i < L; i++) {
    run = up ? (src[i] > src[i - 1] ? run + 1 : 0) : (src[i] < src[i - 1] ? run + 1 : 0);
    out[i] = run >= n ? 1 : 0;
  }
  return out;
}
function barssince(cond) {
  var c = S(cond), L = c.length, out = nanArr(L), last = -1;
  for (var i = 0; i < L; i++) { if (truthy(c[i])) last = i; if (last >= 0) out[i] = i - last; }
  return out;
}
function valuewhen(cond, src, occ) {
  var c = S(cond), s = S(src), L = c.length, out = nanArr(L), hits = [];
  occ = Math.max(0, Math.floor(+occ || 0));
  for (var i = 0; i < L; i++) {
    if (truthy(c[i])) hits.push(s[i]);
    var k = hits.length - 1 - occ;
    if (k >= 0) out[i] = hits[k];
  }
  return out;
}
function pivot(src, left, right, isHigh) {
  src = S(src); left = ilen(left == null ? 5 : left); right = ilen(right == null ? left : right);
  var L = src.length, out = nanArr(L);
  for (var p = left; p + right < L; p++) {
    var v = src[p];
    if (!fin(v)) continue;
    var ok = true, k;
    for (k = 1; k <= left && ok; k++) if (!(isHigh ? src[p - k] < v : src[p - k] > v)) ok = false;
    for (k = 1; k <= right && ok; k++) if (!(isHigh ? src[p + k] <= v : src[p + k] >= v)) ok = false;
    if (ok) out[p + right] = v;
  }
  return out;
}
function linreg(src, n, offset) {
  src = S(src); n = ilen(n); offset = Math.floor(+offset || 0);
  var L = src.length, out = nanArr(L), sx = 0, sxx = 0, k;
  for (k = 0; k < n; k++) { sx += k; sxx += k * k; }
  var den = n * sxx - sx * sx;
  for (var i = n - 1; i < L; i++) {
    var sy = 0, sxy = 0, ok = true;
    for (k = 0; k < n; k++) { var y = src[i - n + 1 + k]; if (!fin(y)) { ok = false; break; } sy += y; sxy += k * y; }
    if (!ok) continue;
    var slope = den !== 0 ? (n * sxy - sx * sy) / den : 0;
    var icpt = (sy - slope * sx) / n;
    out[i] = icpt + slope * (n - 1 - offset);
  }
  return out;
}
function correlation(a, b, n) {
  var x = S(a), y = S(b), L = Math.min(x.length, y.length), out = nanArr(L);
  n = ilen(n);
  for (var i = n - 1; i < L; i++) {
    var sx = 0, sy = 0, ok = true, j;
    for (j = i - n + 1; j <= i; j++) { if (!fin(x[j]) || !fin(y[j])) { ok = false; break; } sx += x[j]; sy += y[j]; }
    if (!ok) continue;
    var mx = sx / n, my = sy / n, sxy = 0, sxx = 0, syy = 0;
    for (j = i - n + 1; j <= i; j++) { var dx = x[j] - mx, dy = y[j] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    out[i] = sxx === 0 || syy === 0 ? NAN : sxy / Math.sqrt(sxx * syy);
  }
  return out;
}
function rsi(src, n) {
  src = S(src);
  var L = src.length, up = nanArr(L), dn = nanArr(L);
  for (var i = 1; i < L; i++) { var d = src[i] - src[i - 1]; up[i] = d > 0 ? d : (d === d ? 0 : NAN); dn[i] = d < 0 ? -d : (d === d ? 0 : NAN); }
  var ru = rma(up, n), rd = rma(dn, n), out = nanArr(L);
  for (var j = 0; j < L; j++) {
    if (ru[j] !== ru[j] || rd[j] !== rd[j]) continue;
    out[j] = rd[j] === 0 ? 100 : ru[j] === 0 ? 0 : 100 - 100 / (1 + ru[j] / rd[j]);
  }
  return out;
}
function macd(src, fast, slow, sig) {
  fast = fast == null ? 12 : fast; slow = slow == null ? 26 : slow; sig = sig == null ? 9 : sig;
  var f = ema(src, fast), s = ema(src, slow), L = f.length, m = nanArr(L);
  for (var i = 0; i < L; i++) m[i] = f[i] - s[i];
  var sg = ema(m, sig), h = nanArr(L);
  for (var j = 0; j < L; j++) h[j] = m[j] - sg[j];
  return { macd: m, signal: sg, hist: h };
}
function bbands(src, n, mult) {
  n = n == null ? 20 : n; mult = mult == null ? 2 : mult;
  var b = sma(src, n), sd = stdev(src, n), L = b.length, up = nanArr(L), lo = nanArr(L);
  for (var i = 0; i < L; i++) { up[i] = b[i] + mult * sd[i]; lo[i] = b[i] - mult * sd[i]; }
  return { basis: b, upper: up, lower: lo };
}
function stochRaw(src, hi, lo, n) {
  src = S(src);
  var hh = highest(hi, n), ll = lowest(lo, n), L = src.length, out = nanArr(L);
  for (var i = 0; i < L; i++) {
    if (hh[i] !== hh[i] || ll[i] !== ll[i]) continue;
    var r = hh[i] - ll[i];
    out[i] = r === 0 ? 50 : 100 * (src[i] - ll[i]) / r;
  }
  return out;
}
function periodKey(t, anchor) {
  if (anchor === "day" || anchor === "session") return Math.floor(t / 86400000);
  if (anchor === "week") return Math.floor((Math.floor(t / 86400000) + 3) / 7);
  var d = new Date(t);
  if (anchor === "month") return d.getUTCFullYear() * 12 + d.getUTCMonth();
  if (anchor === "year") return d.getUTCFullYear();
  return 0;
}
function pickSource(B, key) {
  switch (key) {
    case "open": return B.open;
    case "high": return B.high;
    case "low": return B.low;
    case "volume": return B.volume;
    case "hl2": return B.hl2;
    case "hlc3": return B.hlc3;
    case "ohlc4": return B.ohlc4;
    default: return B.close;
  }
}

function makeBars(m) {
  var n = m.c.length;
  var B = { time: m.t, open: m.o, high: m.h, low: m.l, close: m.c, volume: m.v, length: n };
  var cache = {};
  function lazy(name, f) {
    Object.defineProperty(B, name, { enumerable: true, configurable: false, get: function () { return cache[name] || (cache[name] = f()); } });
  }
  lazy("hl2", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = (m.h[i] + m.l[i]) / 2; return a; });
  lazy("hlc3", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = (m.h[i] + m.l[i] + m.c[i]) / 3; return a; });
  lazy("ohlc4", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = (m.o[i] + m.h[i] + m.l[i] + m.c[i]) / 4; return a; });
  lazy("hlcc4", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = (m.h[i] + m.l[i] + 2 * m.c[i]) / 4; return a; });
  lazy("range", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = m.h[i] - m.l[i]; return a; });
  lazy("body", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = Math.abs(m.c[i] - m.o[i]); return a; });
  lazy("bullish", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = m.c[i] >= m.o[i] ? 1 : 0; return a; });
  lazy("bearish", function () { var a = new F64(n); for (var i = 0; i < n; i++) a[i] = m.c[i] < m.o[i] ? 1 : 0; return a; });
  return B;
}

function makeDt(B) {
  var n = B.length, cache = {}, dt = {};
  function lazy(name, f) {
    Object.defineProperty(dt, name, { enumerable: true, configurable: false, get: function () {
      if (cache[name]) return cache[name];
      var a = new F64(n);
      for (var i = 0; i < n; i++) a[i] = f(new Date(B.time[i]));
      return (cache[name] = a);
    } });
  }
  lazy("year", function (d) { return d.getUTCFullYear(); });
  lazy("month", function (d) { return d.getUTCMonth() + 1; });
  lazy("day", function (d) { return d.getUTCDate(); });
  lazy("dow", function (d) { return d.getUTCDay(); });
  lazy("hour", function (d) { return d.getUTCHours(); });
  lazy("minute", function (d) { return d.getUTCMinutes(); });
  return dt;
}

function makeTa(B) {
  var n = B.length;
  function tr() {
    var out = nanArr(n);
    for (var i = 0; i < n; i++) out[i] = i === 0 ? B.high[i] - B.low[i] : Math.max(B.high[i] - B.low[i], Math.abs(B.high[i] - B.close[i - 1]), Math.abs(B.low[i] - B.close[i - 1]));
    return out;
  }
  function atr(len) { return rma(tr(), len == null ? 14 : len); }
  function vwma(src, len) {
    var s = S(src), pv = new F64(s.length);
    for (var i = 0; i < s.length; i++) pv[i] = s[i] * B.volume[i];
    var a = rsum(pv, len), b = rsum(B.volume, len), out = nanArr(s.length);
    for (var j = 0; j < s.length; j++) out[j] = b[j] > 0 ? a[j] / b[j] : s[j];
    return out;
  }
  function vwap(anchor, src) {
    anchor = anchor || "day";
    var s = src == null ? B.hlc3 : S(src), out = nanArr(n), key = NaN, sv = 0, spv = 0;
    for (var i = 0; i < n; i++) {
      var k = periodKey(B.time[i], anchor);
      if (k !== key) { key = k; sv = 0; spv = 0; }
      sv += B.volume[i]; spv += s[i] * B.volume[i];
      out[i] = sv > 0 ? spv / sv : s[i];
    }
    return out;
  }
  function stoch(kLen, kSmooth, dLen) {
    kLen = kLen == null ? 14 : kLen; kSmooth = kSmooth == null ? 3 : kSmooth; dLen = dLen == null ? 3 : dLen;
    var raw = stochRaw(B.close, B.high, B.low, kLen);
    var k = kSmooth > 1 ? sma(raw, kSmooth) : raw;
    return { k: k, d: sma(k, dLen) };
  }
  function willr(len) {
    len = len == null ? 14 : len;
    var hh = highest(B.high, len), ll = lowest(B.low, len), out = nanArr(n);
    for (var i = 0; i < n; i++) { var r = hh[i] - ll[i]; if (r === r) out[i] = r === 0 ? -50 : -100 * (hh[i] - B.close[i]) / r; }
    return out;
  }
  function cci(src, len) {
    var s = S(src); len = ilen(len == null ? 20 : len);
    var mean = sma(s, len), out = nanArr(s.length);
    for (var i = len - 1; i < s.length; i++) {
      if (mean[i] !== mean[i]) continue;
      var dev = 0;
      for (var j = i - len + 1; j <= i; j++) dev += Math.abs(s[j] - mean[i]);
      dev /= len;
      out[i] = dev === 0 ? 0 : (s[i] - mean[i]) / (0.015 * dev);
    }
    return out;
  }
  function mfi(len, src) {
    len = ilen(len == null ? 14 : len);
    var tp = src == null ? B.hlc3 : S(src), pos = new F64(n), neg = new F64(n), out = nanArr(n), i;
    for (i = 1; i < n; i++) {
      var mf = tp[i] * B.volume[i];
      if (tp[i] > tp[i - 1]) pos[i] = mf; else if (tp[i] < tp[i - 1]) neg[i] = mf;
    }
    var sp = 0, sn = 0;
    for (i = 1; i < n; i++) {
      sp += pos[i]; sn += neg[i];
      if (i > len) { sp -= pos[i - len]; sn -= neg[i - len]; }
      if (i >= len) out[i] = sn <= 0 ? 100 : 100 - 100 / (1 + sp / sn);
    }
    return out;
  }
  function obv() {
    var out = nanArr(n), acc = 0;
    for (var i = 0; i < n; i++) {
      if (i > 0) { if (B.close[i] > B.close[i - 1]) acc += B.volume[i]; else if (B.close[i] < B.close[i - 1]) acc -= B.volume[i]; }
      out[i] = acc;
    }
    return out;
  }
  function adx(len, smooth) {
    len = ilen(len == null ? 14 : len); smooth = smooth == null ? len : smooth;
    var plus = nanArr(n), minus = nanArr(n), t = nanArr(n), i;
    for (i = 1; i < n; i++) {
      var up = B.high[i] - B.high[i - 1], down = B.low[i - 1] - B.low[i];
      plus[i] = up > down && up > 0 ? up : 0;
      minus[i] = down > up && down > 0 ? down : 0;
      t[i] = Math.max(B.high[i] - B.low[i], Math.abs(B.high[i] - B.close[i - 1]), Math.abs(B.low[i] - B.close[i - 1]));
    }
    var sp = rma(plus, len), sm = rma(minus, len), st = rma(t, len);
    var pdi = nanArr(n), mdi = nanArr(n), dx = nanArr(n);
    for (i = 0; i < n; i++) {
      if (st[i] !== st[i]) continue;
      pdi[i] = st[i] === 0 ? 0 : 100 * sp[i] / st[i];
      mdi[i] = st[i] === 0 ? 0 : 100 * sm[i] / st[i];
      var sum = pdi[i] + mdi[i];
      dx[i] = sum === 0 ? 0 : 100 * Math.abs(pdi[i] - mdi[i]) / sum;
    }
    return { adx: rma(dx, smooth), plus: pdi, minus: mdi };
  }
  function supertrend(mult, len) {
    mult = mult == null ? 3 : mult; len = ilen(len == null ? 10 : len);
    var a = atr(len), hl2 = B.hl2, value = nanArr(n), dir = nanArr(n), up = nanArr(n), down = nanArr(n);
    /* dir 1 = up trend (line below price), -1 = down trend (line above price) */
    var pu = NAN, pl = NAN;
    var prevDir = 1, prevLine = NAN;
    for (var j = 0; j < n; j++) {
      if (a[j] !== a[j]) continue;
      var u = hl2[j] + mult * a[j], l = hl2[j] - mult * a[j];
      if (pl === pl) l = (l > pl || B.close[j - 1] < pl) ? l : pl;
      if (pu === pu) u = (u < pu || B.close[j - 1] > pu) ? u : pu;
      var nd;
      if (prevLine !== prevLine) nd = 1;
      else if (prevDir === 1) nd = B.close[j] < l ? -1 : 1;
      else nd = B.close[j] > u ? 1 : -1;
      var line = nd === 1 ? l : u;
      value[j] = line; dir[j] = nd;
      if (nd === 1) up[j] = line; else down[j] = line;
      prevDir = nd; prevLine = line; pu = u; pl = l;
    }
    return { value: value, direction: dir, up: up, down: down };
  }
  function ichimoku(conv, base, spanB) {
    conv = conv == null ? 9 : conv; base = base == null ? 26 : base; spanB = spanB == null ? 52 : spanB;
    function mid(len) { var h = highest(B.high, len), l = lowest(B.low, len), o = nanArr(n); for (var i = 0; i < n; i++) o[i] = (h[i] + l[i]) / 2; return o; }
    var ten = mid(conv), kij = mid(base), sa = nanArr(n);
    for (var i = 0; i < n; i++) sa[i] = (ten[i] + kij[i]) / 2;
    return { tenkan: ten, kijun: kij, spanA: sa, spanB: mid(spanB), chikou: B.close };
  }
  function donchian(len) {
    len = len == null ? 20 : len;
    var u = highest(B.high, len), l = lowest(B.low, len), m = nanArr(n);
    for (var i = 0; i < n; i++) m[i] = (u[i] + l[i]) / 2;
    return { upper: u, lower: l, middle: m };
  }
  function keltner(len, mult, atrLen) {
    len = len == null ? 20 : len; mult = mult == null ? 2 : mult; atrLen = atrLen == null ? 10 : atrLen;
    var b = ema(B.close, len), a = atr(atrLen), u = nanArr(n), l = nanArr(n);
    for (var i = 0; i < n; i++) { u[i] = b[i] + mult * a[i]; l[i] = b[i] - mult * a[i]; }
    return { basis: b, upper: u, lower: l };
  }
  function un(f) { return function (x) { var s = S(x), o = new F64(s.length); for (var i = 0; i < s.length; i++) o[i] = f(s[i]); return o; }; }
  function bi(f) { return function (a, b) { var x = S(a), y = S(b), o = new F64(x.length); for (var i = 0; i < x.length; i++) o[i] = f(x[i], y[i]); return o; }; }
  return {
    sma: sma, ema: ema, rma: rma, wma: wma, hma: hma, dema: dema, tema: tema, alma: alma, vwma: vwma,
    rsi: rsi, macd: macd, stoch: stoch, stochRaw: stochRaw, atr: atr, tr: tr, bbands: bbands, keltner: keltner, donchian: donchian,
    stdev: stdev, variance: variance, highest: highest, lowest: lowest, sum: rsum, change: change, roc: roc, mom: change, cum: cum,
    crossover: crossover, crossunder: crossunder, cross: cross,
    rising: function (s, l) { return trend(s, l, true); }, falling: function (s, l) { return trend(s, l, false); },
    barssince: barssince, valuewhen: valuewhen,
    pivothigh: function (s, l, r) { return pivot(s, l, r, true); }, pivotlow: function (s, l, r) { return pivot(s, l, r, false); },
    linreg: linreg, correlation: correlation, vwap: vwap, supertrend: supertrend, adx: adx, cci: cci, mfi: mfi, obv: obv, willr: willr,
    ichimoku: ichimoku,
    shift: shift,
    abs: un(Math.abs), sqrt: un(Math.sqrt), log: un(Math.log), exp: un(Math.exp), floor: un(Math.floor), ceil: un(Math.ceil), round: un(Math.round),
    sign: un(Math.sign), neg: un(function (x) { return -x; }),
    add: bi(function (a, b) { return a + b; }), sub: bi(function (a, b) { return a - b; }), mul: bi(function (a, b) { return a * b; }),
    div: bi(function (a, b) { return a / b; }), pow: bi(Math.pow), max: bi(Math.max), min: bi(Math.min),
    gt: function (a, b) { return cmp(a, b, 0); }, gte: function (a, b) { return cmp(a, b, 1); },
    lt: function (a, b) { return cmp(a, b, 2); }, lte: function (a, b) { return cmp(a, b, 3); },
    eq: function (a, b) { return cmp(a, b, 4); }, neq: function (a, b) { return cmp(a, b, 5); },
    and: bi(function (a, b) { return truthy(a) && truthy(b) ? 1 : 0; }), or: bi(function (a, b) { return truthy(a) || truthy(b) ? 1 : 0; }),
    not: un(function (a) { return truthy(a) ? 0 : 1; }),
    na: un(function (a) { return a !== a ? 1 : 0; }),
    nz: function (x, rep) { var s = S(x), o = new F64(s.length), r = rep == null ? 0 : +rep; for (var i = 0; i < s.length; i++) o[i] = s[i] !== s[i] ? r : s[i]; return o; },
    iff: function (c, a, b) {
      var k = S(c), x = S(a), y = S(b), o = new F64(k.length);
      for (var i = 0; i < k.length; i++) o[i] = truthy(k[i]) ? x[i] : y[i];
      return o;
    }
  };
}

/* ─────────── colors ─────────── */

var NAMED = {
  green: "#26a69a", red: "#ef5350", blue: "#2962ff", orange: "#ff9800", yellow: "#fbc02d", purple: "#9c27b0", aqua: "#00bcd4",
  teal: "#089981", lime: "#4caf50", pink: "#e91e63", maroon: "#b71c1c", olive: "#808000", navy: "#1a237e", gray: "#787b86", silver: "#b2b5be",
  white: "#ffffff", black: "#000000", fuchsia: "#e040fb"
};
var COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;
function okColor(c) {
  if (typeof c !== "string" || c.length > 48) return "";
  if (hasOwn.call(NAMED, c)) return NAMED[c];
  if (!COLOR_RE.test(c)) return "";
  if (c.length === 4 && c.charAt(0) === "#") return "#" + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2) + c.charAt(3) + c.charAt(3);
  return c;
}
function parseRgb(c) {
  c = okColor(c) || "#000000";
  var m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/i.exec(c);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
  var v = parseInt(c.slice(1, 7), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1];
}
function rgba(c, a) {
  var p = parseRgb(c);
  return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + Math.round(clampN(a == null ? 1 : +a, 0, 1) * 100) / 100 + ")";
}
function mixColor(c1, c2, t) {
  var a = parseRgb(c1), b = parseRgb(c2);
  t = clampN(+t, 0, 1);
  return "rgba(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + "," + Math.round((a[3] + (b[3] - a[3]) * t) * 100) / 100 + ")";
}
var COLORS = {
  rgba: rgba, mix: mixColor,
  cond: function (cond, a, b) {
    var c = S(cond), L = c.length, out = new Array(L);
    function pick(x, i) { return x == null ? null : (typeof x === "object" && typeof x.length === "number" ? x[i] : x); }
    for (var i = 0; i < L; i++) out[i] = truthy(c[i]) ? pick(a, i) : pick(b, i);
    return out;
  },
  gradient: function (src, lo, hi, cLo, cHi) {
    var s = S(src), L = s.length, out = new Array(L), steps = 48, cache = [];
    for (var i = 0; i < L; i++) {
      var v = s[i];
      if (!fin(v)) { out[i] = null; continue; }
      var t = hi === lo ? 0 : clampN((v - lo) / (hi - lo), 0, 1), k = Math.round(t * steps);
      out[i] = cache[k] || (cache[k] = mixColor(cLo, cHi, k / steps));
    }
    return out;
  }
};
for (var cn in NAMED) if (hasOwn.call(NAMED, cn)) COLORS[cn] = NAMED[cn];

/* ─────────── user-code execution ─────────── */

var BLOCKED_PARAMS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "localStorage", "sessionStorage",
  "document", "window", "navigator", "location", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "postMessage", "close",
  "setTimeout", "setInterval", "setImmediate", "requestAnimationFrame", "queueMicrotask", "globalThis", "self", "top", "parent", "frames",
  "Function", "WebAssembly", "SharedArrayBuffer", "Atomics", "Request", "Response", "Headers", "FormData", "Blob", "FileReader", "URL",
  "crypto", "Notification", "onmessage", "addEventListener", "removeEventListener", "dispatchEvent", "process", "require", "module", "global"];

var PLOT_COLORS = ["#2962ff", "#ff9800", "#e91e63", "#26a69a", "#7e57c2", "#fbc02d", "#00bcd4", "#ef5350"];
var PLOT_STYLES = ["line", "histogram", "area", "columns", "circles", "step"];
var LINE_STYLES = ["solid", "dashed", "dotted"];
var SHAPES = ["triangleup", "triangledown", "circle", "square", "arrowup", "arrowdown", "label", "flag", "diamond", "cross", "xcross"];
var SIZES = { tiny: 5, small: 7, normal: 9, large: 12, huge: 16 };

function slug(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 32);
}

function stripForScan(src) {
  var out = "", i = 0, n = src.length;
  while (i < n) {
    var ch = src.charAt(i), nx = src.charAt(i + 1);
    if (ch === "/" && nx === "/") { while (i < n && src.charAt(i) !== "\n") i++; continue; }
    if (ch === "/" && nx === "*") { i += 2; while (i < n && !(src.charAt(i) === "*" && src.charAt(i + 1) === "/")) { if (src.charAt(i) === "\n") out += "\n"; i++; } i += 2; continue; }
    if (ch === "'" || ch === '"') {
      var q = ch; i++;
      while (i < n && src.charAt(i) !== q && src.charAt(i) !== "\n") { if (src.charAt(i) === "\\") i++; i++; }
      i++; out += '""'; continue;
    }
    out += ch; i++;
  }
  return out;
}

var LINE_OFFSET = 0;
var COL_OFFSET = 0;
var WRAP_PREFIX = '"use strict";return (function(){';

function calibrate() {
  try {
    var f = new Fn("ctx", "ta", WRAP_PREFIX + "throw new Error('p');\n})()");
    try { f(); } catch (e) {
      var loc = parseLoc(e);
      if (loc) { LINE_OFFSET = loc.line - 1; COL_OFFSET = loc.col - 7; }
    }
  } catch (e2) { /* keep defaults */ }
}

function parseLoc(e) {
  var st = e && e.stack ? String(e.stack) : "";
  var m = /\(eval at [^\n]*?\), <anonymous>:(\d+):(\d+)/.exec(st) || /line (\d+) > (?:Function|eval):(\d+):(\d+)/.exec(st) || /(?:^|\s)<anonymous>:(\d+):(\d+)/m.exec(st);
  if (!m) return null;
  if (m.length === 4) return { line: +m[2], col: +m[3] };
  return { line: +m[1], col: +m[2] };
}

function locate(e, code) {
  var loc = parseLoc(e);
  if (loc) {
    var line = loc.line - LINE_OFFSET, col = line === 1 ? loc.col - COL_OFFSET : loc.col;
    if (line >= 1) return { line: line, col: Math.max(1, col) };
  }
  return null;
}

/* SyntaxErrors from the Function constructor carry no position: find the first line where compiling the prefix
   fails with something other than "unexpected end of input". */
function syntaxLine(code) {
  var lines = code.split("\n"), cap = Math.min(lines.length, 600);
  for (var k = 1; k <= cap; k++) {
    var part = lines.slice(0, k).join("\n");
    try { new Fn("ctx", "ta", WRAP_PREFIX + part + "\n})()"); } catch (e) {
      var msg = String(e && e.message);
      if (!/end of input|Unterminated|unterminated|Unexpected end|missing \)|missing \}|expected expression, got end|expected \}|Unclosed/i.test(msg)) return k;
    }
  }
  return null;
}

function execute(m) {
  var t0 = now();
  N = m.c.length;
  var lim = m.limits || {};
  var L_PLOTS = lim.plots || 20, L_VALUES = lim.values || 5000000, L_SHAPES = lim.shapes || 2000;
  var params = m.params || {};
  var B = makeBars(m);
  var dt = makeDt(B);
  var ta = makeTa(B);
  var st = { plots: [], hlines: [], fills: [], bg: [], bar: [], shapes: [], alerts: [], logs: [], inputs: [], meta: { name: "", overlay: false, format: "inherit", minmax: null, paneRatio: 0, precision: -1 }, total: 0, shapesCut: false };

  function budget(cnt) {
    st.total += cnt;
    if (st.total > L_VALUES) throw new Error("Output is too large: more than " + L_VALUES + " values");
  }
  function fit(d) {
    if (d.length === N) return d;
    var o = nanArr(N);
    for (var i = 0; i < N && i < d.length; i++) o[i] = d[i];
    return o;
  }
  function encodeColors(x) {
    if (typeof x === "string" || x == null) {
      var c = okColor(x);
      return { pal: c ? [c] : [], idx: null };
    }
    if (!(x && typeof x.length === "number")) return { pal: [], idx: null };
    var map = {}, pal = [], idx = new Uint16Array(N), L = Math.min(N, x.length);
    for (var i = 0; i < L; i++) {
      var col = okColor(x[i]);
      if (!col) continue;
      var k = map[col];
      if (k === undefined) {
        if (pal.length >= 4000) throw new Error("Too many distinct colors in one series (max 4000)");
        pal.push(col); k = pal.length; map[col] = k;
      }
      idx[i] = k;
    }
    return { pal: pal, idx: idx };
  }
  function uniqueTitle(t, list, field) {
    t = String(t).slice(0, 40) || "Plot";
    var base = t, k = 2, ok = false;
    while (!ok) {
      ok = true;
      for (var i = 0; i < list.length; i++) if (list[i][field] === t) { ok = false; break; }
      if (!ok) t = base + " " + (k++);
    }
    return t;
  }
  function pushShape(rec) {
    if (st.shapes.length >= L_SHAPES) { st.shapesCut = true; return false; }
    st.shapes.push(rec);
    return true;
  }

  /* inputs */
  function declare(type, name, def, o, extra) {
    o = o || {};
    if (st.inputs.length >= 60) throw new Error("Too many inputs (max 60)");
    var key = slug(o.key != null ? o.key : name) || ("input" + (st.inputs.length + 1)), k = key, c = 2;
    for (;;) {
      var dup = false;
      for (var i = 0; i < st.inputs.length; i++) if (st.inputs[i].key === k) { dup = true; break; }
      if (!dup) break;
      k = key + "_" + (c++);
    }
    var d = { key: k, name: String(name).slice(0, 60), type: type, def: def };
    if (extra) for (var p in extra) if (hasOwn.call(extra, p)) d[p] = extra[p];
    if (o.group) d.group = String(o.group).slice(0, 40);
    st.inputs.push(d);
    return d;
  }
  function given(key) { return hasOwn.call(params, key) ? params[key] : undefined; }
  function numInput(type, name, def, o) {
    o = o || {};
    var isInt = type === "int";
    var lo = o.min != null ? +o.min : (o.minval != null ? +o.minval : -1e9);
    var hi = o.max != null ? +o.max : (o.maxval != null ? +o.maxval : 1e9);
    var step = o.step != null ? +o.step : (isInt ? 1 : 0.1);
    def = +def; if (!fin(def)) def = 0;
    var d = declare(type, name, def, o, { min: lo, max: hi, step: step });
    var v = given(d.key);
    v = typeof v === "number" && fin(v) ? v : def;
    v = clampN(v, lo, hi);
    return isInt ? Math.round(v) : v;
  }
  var input = {
    int: function (name, def, o) { return numInput("int", name, def, o); },
    float: function (name, def, o) { return numInput("float", name, def, o); },
    bool: function (name, def, o) {
      var d = declare("bool", name, !!def, o), v = given(d.key);
      return typeof v === "boolean" ? v : !!def;
    },
    string: function (name, def, o) {
      var d = declare("string", name, String(def == null ? "" : def).slice(0, 200), o), v = given(d.key);
      return typeof v === "string" ? v.slice(0, 200) : d.def;
    },
    select: function (name, def, options, o) {
      var opts = [];
      if (options && typeof options.length === "number") {
        for (var i = 0; i < options.length && i < 60; i++) {
          var it = options[i];
          if (it && typeof it === "object") opts.push({ value: String(it.value), label: String(it.label != null ? it.label : it.value) });
          else opts.push({ value: String(it), label: String(it) });
        }
      } else if (options && typeof options === "object") {
        var n = 0;
        for (var kk in options) if (hasOwn.call(options, kk) && n++ < 60) opts.push({ value: kk, label: String(options[kk]) });
      }
      if (!opts.length) throw new Error("input.select: options are required");
      var dv = String(def);
      var has = false;
      for (var j = 0; j < opts.length; j++) if (opts[j].value === dv) has = true;
      if (!has) dv = opts[0].value;
      var d = declare("select", name, dv, o, { options: opts }), v = given(d.key);
      if (typeof v === "string") for (var q = 0; q < opts.length; q++) if (opts[q].value === v) return v;
      return dv;
    },
    color: function (name, def, o) {
      var c = okColor(def);
      if (!/^#[0-9a-f]{6}$/i.test(c)) { var p = parseRgb(c || "#2962ff"); c = "#" + [p[0], p[1], p[2]].map(function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }
      var d = declare("color", name, c, o), v = given(d.key);
      return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : c;
    },
    source: function (name, def, o) {
      var keys = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4", "volume"];
      var opts = keys.map(function (k) { return { value: k, label: k }; });
      var dv = keys.indexOf(String(def)) >= 0 ? String(def) : "close";
      var d = declare("select", name, dv, o, { options: opts, source: true }), v = given(d.key);
      return pickSource(B, typeof v === "string" && keys.indexOf(v) >= 0 ? v : dv);
    }
  };

  /* outputs */
  var ctx = {
    bars: B, n: N, dt: dt, interval: m.interval || 0, precision: m.precision == null ? 2 : m.precision,
    input: input, color: COLORS,
    indicator: function (o) {
      o = o || {};
      var mt = st.meta;
      if (o.name != null) mt.name = String(o.name).slice(0, 60);
      else if (o.title != null) mt.name = String(o.title).slice(0, 60);
      if (o.overlay != null) mt.overlay = !!o.overlay;
      if (o.format === "price" || o.format === "volume" || o.format === "percent" || o.format === "inherit") mt.format = o.format;
      if (o.minmax && o.minmax.length === 2 && fin(+o.minmax[0]) && fin(+o.minmax[1])) mt.minmax = [+o.minmax[0], +o.minmax[1]];
      if (o.paneRatio != null && fin(+o.paneRatio)) mt.paneRatio = clampN(+o.paneRatio, 0.08, 0.6);
      if (o.precision != null && fin(+o.precision)) mt.precision = clampN(Math.round(+o.precision), 0, 8);
    },
    plot: function (series, o) {
      o = o || {};
      if (st.plots.length >= L_PLOTS) throw new Error("Too many plots (max " + L_PLOTS + ")");
      var d = fit(S(series));
      budget(N);
      var style = PLOT_STYLES.indexOf(o.style) >= 0 ? o.style : "line";
      var enc = typeof o.color === "string" || o.color == null ? { pal: [], idx: null } : encodeColors(o.color);
      var base = typeof o.color === "string" ? okColor(o.color) : "";
      var rec = {
        title: uniqueTitle(o.title != null ? o.title : "Plot " + (st.plots.length + 1), st.plots, "title"),
        style: style,
        color: base || PLOT_COLORS[st.plots.length % PLOT_COLORS.length],
        pal: enc.pal, idx: enc.idx,
        width: fin(+(o.linewidth != null ? o.linewidth : o.width)) ? clampN(+(o.linewidth != null ? o.linewidth : o.width), 0.5, 8) : 0,
        linestyle: LINE_STYLES.indexOf(o.linestyle) >= 0 ? o.linestyle : "solid",
        offset: Math.round(fin(+o.offset) ? clampN(+o.offset, -5000, 5000) : 0),
        hidden: o.display === "none" || o.hidden === true,
        pricelabel: o.pricelabel == null ? null : !!o.pricelabel,
        legend: o.legend == null ? null : !!o.legend,
        connect: !!o.connect,
        data: d
      };
      st.plots.push(rec);
      return { __k: "plot", i: st.plots.length - 1 };
    },
    hline: function (price, o) {
      o = o || {};
      if (st.hlines.length >= 20) throw new Error("Too many hline (max 20)");
      var p = +price;
      if (!fin(p)) throw new Error("hline: price must be a number");
      st.hlines.push({
        price: p, title: uniqueTitle(o.title != null ? o.title : "Level " + (st.hlines.length + 1), st.hlines, "title"),
        color: okColor(o.color) || "#787b86", linestyle: LINE_STYLES.indexOf(o.linestyle) >= 0 ? o.linestyle : (o.style === "solid" ? "solid" : (o.style === "dotted" ? "dotted" : "dashed")),
        width: fin(+o.linewidth) ? clampN(+o.linewidth, 0.5, 6) : 1
      });
      return { __k: "hline", i: st.hlines.length - 1 };
    },
    fill: function (a, b, o) {
      o = o || {};
      if (st.fills.length >= 10) throw new Error("Too many fill (max 10)");
      function ref(x) {
        if (x && x.__k === "plot") return { t: "plot", i: x.i };
        if (x && x.__k === "hline") return { t: "hline", i: x.i };
        var d = fit(S(x)); budget(N);
        return { t: "ser", data: d };
      }
      st.fills.push({
        a: ref(a), b: ref(b), title: uniqueTitle(o.title != null ? o.title : "Fill " + (st.fills.length + 1), st.fills, "title"),
        color: okColor(o.color) || "rgba(41,98,255,0.12)", colorUp: okColor(o.colorUp) || "", colorDown: okColor(o.colorDown) || ""
      });
    },
    bgcolor: function (c) {
      if (st.bg.length >= 4) return;
      var e = encodeColors(c); if (e.pal.length) st.bg.push(e);
    },
    barcolor: function (c) {
      if (st.bar.length >= 4) return;
      var e = encodeColors(c); if (e.pal.length) st.bar.push(e);
    },
    plotshape: function (cond, o) {
      o = o || {};
      var loc = o.location === "below" || o.location === "belowbar" ? "b" : o.location === "absolute" ? "x" : "a";
      var shape = SHAPES.indexOf(o.shape) >= 0 ? o.shape : "circle";
      var c = S(cond), price = o.price != null ? S(o.price) : null;
      var col = o.color;
      var colIsArr = col && typeof col === "object" && typeof col.length === "number";
      var base = (!colIsArr && okColor(col)) || "#2962ff";
      var tcol = okColor(o.textcolor || o.textColor) || "";
      var text = o.text == null ? "" : String(o.text).slice(0, 24);
      var size = SIZES[o.size] || SIZES.small;
      var off = Math.round(fin(+o.offset) ? clampN(+o.offset, -5000, 5000) : 0);
      for (var i = 0; i < N; i++) {
        var v = c[i], p = NAN;
        if (loc === "x") {
          p = price ? price[i] : v;
          if (!fin(p) || (price && !truthy(v))) continue;
        } else {
          if (!truthy(v)) continue;
          if (price) p = price[i];
        }
        var color = colIsArr ? (okColor(col[i]) || base) : base;
        var pos = i + off;
        if (pos < 0 || pos >= N) continue;
        if (!pushShape({ i: pos, s: shape, l: loc, p: p, c: color, t: text, tc: tcol, z: size })) break;
      }
    },
    alertcondition: function (cond, message) {
      var c = S(cond), cnt = 0;
      for (var i = 0; i < c.length; i++) if (truthy(c[i])) cnt++;
      if (st.alerts.length < 20) st.alerts.push({ message: String(message == null ? "" : message).slice(0, 200), count: cnt, last: c.length ? truthy(c[c.length - 1]) : false });
    },
    log: function () {
      if (st.logs.length >= 200) return;
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i], s;
        try {
          if (typeof a === "string") s = a;
          else if (a instanceof F64) s = "[" + Array.prototype.slice.call(a.subarray(Math.max(0, a.length - 8))).map(function (x) { return fin(x) ? String(Math.round(x * 1e8) / 1e8) : "NaN"; }).join(", ") + "] (last 8 of " + a.length + ")";
          else s = JSON.stringify(a);
        } catch (e) { s = String(a); }
        parts.push(s === undefined ? "undefined" : s);
      }
      st.logs.push(parts.join(" ").slice(0, 500));
    },
    prev: shift,
    forEachBar: function (fn) { for (var i = 0; i < N; i++) fn(i); },
    series: function (fn) {
      var out = nanArr(N);
      for (var i = 0; i < N; i++) { var v = fn(i); out[i] = v == null ? NAN : num(v); }
      return out;
    },
    nan: function (fill) { var a = new F64(N); a.fill(fill == null ? NAN : +fill); return a; }
  };

  var code = String(m.code || "");
  var scan = stripForScan(code);
  var error = null;
  if (/\bimport\s*\(/.test(scan)) {
    error = { message: "Dynamic import() is not allowed in indicator scripts", line: null, col: null };
  } else {
    var fn = null;
    try {
      var args = ["ctx", "ta"].concat(BLOCKED_PARAMS);
      args.push(WRAP_PREFIX + code + "\n})()");
      fn = Reflect.construct(Fn, args);
    } catch (e) {
      error = { message: String(e && e.message || e), line: syntaxLine(code), col: null, syntax: true };
    }
    if (fn) {
      try {
        fn(ctx, ta);
      } catch (e2) {
        var loc = locate(e2, code);
        error = { message: String(e2 && e2.message || e2), line: loc ? loc.line : null, col: loc ? loc.col : null };
      }
    }
  }

  var res = { type: "done", id: m.id, ok: !error, error: error, logs: st.logs, inputs: st.inputs, meta: st.meta, ms: Math.round((now() - t0) * 10) / 10, n: N, alerts: st.alerts, shapesCut: st.shapesCut };
  var transfer = [];
  if (!error) {
    res.plots = st.plots.map(function (p) {
      var d = new F64(N); d.set(p.data.length === N ? p.data : fit(p.data));
      transfer.push(d.buffer);
      if (p.idx) transfer.push(p.idx.buffer);
      return { title: p.title, style: p.style, color: p.color, pal: p.pal, idx: p.idx, width: p.width, linestyle: p.linestyle, offset: p.offset, hidden: p.hidden, pricelabel: p.pricelabel, legend: p.legend, connect: p.connect, data: d };
    });
    res.hlines = st.hlines;
    res.fills = st.fills.map(function (f) {
      function cp(r) { if (r.t !== "ser") return r; var d = new F64(N); d.set(r.data); transfer.push(d.buffer); return { t: "ser", data: d }; }
      return { a: cp(f.a), b: cp(f.b), title: f.title, color: f.color, colorUp: f.colorUp, colorDown: f.colorDown };
    });
    res.bg = st.bg; res.bar = st.bar;
    for (var q = 0; q < st.bg.length; q++) if (st.bg[q].idx) transfer.push(st.bg[q].idx.buffer);
    for (var w = 0; w < st.bar.length; w++) if (st.bar[w].idx) transfer.push(st.bar[w].idx.buffer);
    res.shapes = st.shapes;
  }
  return { msg: res, transfer: transfer };
}

/* ─────────── lock down the worker scope ─────────── */

function lockdown() {
  var names = ["fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "EventSource", "importScripts", "indexedDB", "IDBFactory", "caches", "CacheStorage",
    "localStorage", "sessionStorage", "navigator", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel", "MessagePort", "postMessage",
    "close", "setTimeout", "setInterval", "setImmediate", "requestAnimationFrame", "queueMicrotask", "eval", "Function", "WebAssembly",
    "SharedArrayBuffer", "Atomics", "Request", "Response", "Headers", "FormData", "Blob", "File", "FileReader", "FileReaderSync", "URL", "URLSearchParams",
    "crypto", "Notification", "WebTransport", "RTCPeerConnection", "openDatabase", "addEventListener", "removeEventListener", "dispatchEvent",
    "onmessage", "onmessageerror", "onerror", "onunhandledrejection", "createImageBitmap", "OffscreenCanvas", "structuredClone", "reportError",
    "registration", "serviceWorker", "clients", "Cache", "Lock", "LockManager", "Clipboard", "Gamepad", "PushManager", "BackgroundFetchManager"];
  var protos = [];
  for (var o = G; o; o = Object.getPrototypeOf(o)) { if (o === Object.prototype) break; protos.push(o); }
  for (var i = 0; i < names.length; i++) {
    for (var j = 0; j < protos.length; j++) {
      try { Object.defineProperty(protos[j], names[i], { value: undefined, writable: false, configurable: false, enumerable: false }); } catch (e) { /* not configurable */ }
      try { if (hasOwn.call(protos[j], names[i]) && protos[j][names[i]] !== undefined) protos[j][names[i]] = undefined; } catch (e2) { /* read-only */ }
    }
  }
  /* no way back to a code-generating constructor through function objects */
  var thrower = function () { throw new Error("Code generation is disabled in indicator scripts"); };
  var fprotos = [Fn.prototype];
  try { fprotos.push(Object.getPrototypeOf(async function () {})); } catch (e3) { /* old engine */ }
  try { fprotos.push(Object.getPrototypeOf(function* () {})); } catch (e4) { /* old engine */ }
  try { fprotos.push(Object.getPrototypeOf(async function* () {})); } catch (e5) { /* old engine */ }
  for (var k = 0; k < fprotos.length; k++) {
    try { Object.defineProperty(fprotos[k], "constructor", { value: thrower, writable: false, configurable: false }); } catch (e6) { /* ignore */ }
  }
}

addL("message", function (ev) {
  var m = ev.data;
  if (!m || m.type !== "run") return;
  var r;
  try {
    r = execute(m);
  } catch (e) {
    r = { msg: { type: "done", id: m.id, ok: false, error: { message: String(e && e.message || e), line: null, col: null }, logs: [], inputs: [], meta: null, ms: 0, n: 0, alerts: [], shapesCut: false }, transfer: [] };
  }
  post(r.msg, r.transfer);
});
calibrate();
lockdown();
post({ type: "ready" });
})();
`;

import type { Candle } from "./types";

/* ───────────── price ticks ───────────── */

const STEPS = [1, 2, 2.5, 5, 10];

export function niceTicks(min: number, max: number, targetCount: number): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min) return [];
  const raw = (max - min) / Math.max(1, targetCount);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = 10 * mag;
  for (const s of STEPS) {
    if (norm <= s) {
      step = s * mag;
      break;
    }
  }
  const out: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let v = first; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Decimal places needed to show the given price without losing its tick. */
export function inferPrecision(candles: Candle[]): number {
  let max = 0;
  const from = Math.max(0, candles.length - 200);
  for (let i = from; i < candles.length; i++) {
    for (const v of [candles[i].o, candles[i].h, candles[i].l, candles[i].c]) {
      if (!isFinite(v)) continue;
      const s = String(v);
      if (s.includes("e")) {
        max = Math.max(max, 8);
        continue;
      }
      const dot = s.indexOf(".");
      if (dot >= 0) max = Math.max(max, s.length - dot - 1);
    }
  }
  return Math.min(8, max);
}

const nfCache = new Map<string, Intl.NumberFormat>();
export function formatPrice(v: number, precision: number, locale: string): string {
  const key = `${locale}|${precision}`;
  let nf = nfCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, { minimumFractionDigits: precision, maximumFractionDigits: precision });
    nfCache.set(key, nf);
  }
  return nf.format(v);
}

export function formatVolume(v: number, locale: string): string {
  const abs = Math.abs(v);
  const nf = (n: number, d: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(n);
  if (abs >= 1e9) return `${nf(v / 1e9, 2)}B`;
  if (abs >= 1e6) return `${nf(v / 1e6, 2)}M`;
  if (abs >= 1e3) return `${nf(v / 1e3, 2)}K`;
  return nf(v, 0);
}

/* ───────────── time ticks ───────────── */

/**
 * How "important" a bar's timestamp is as an axis label, judged by the wall-clock field that changed
 * relative to the previous bar: year > month > day > hour > minute.
 */
export function tickWeight(t: number, prevT: number | null, shiftMs: number): number {
  const d = new Date(t + shiftMs);
  if (prevT === null) return 10;
  const p = new Date(prevT + shiftMs);
  if (d.getUTCFullYear() !== p.getUTCFullYear()) return 70;
  if (d.getUTCMonth() !== p.getUTCMonth()) return 60;
  if (d.getUTCDate() !== p.getUTCDate()) return 50;
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (h !== p.getUTCHours()) {
    if (h % 12 === 0) return 45;
    if (h % 6 === 0) return 40;
    if (h % 3 === 0) return 35;
    return 30;
  }
  if (m % 30 === 0) return 25;
  if (m % 15 === 0) return 20;
  if (m % 10 === 0) return 17;
  if (m % 5 === 0) return 15;
  return 10;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" });
    dtfCache.set(key, f);
  }
  return f;
}

export function formatTickLabel(t: number, weight: number, shiftMs: number, locale: string): string {
  const d = new Date(t + shiftMs);
  if (weight >= 70) return String(d.getUTCFullYear());
  if (weight >= 60) return dtf(locale, { month: "short" }).format(d).replace(/\.$/, "");
  if (weight >= 50) return String(d.getUTCDate());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function formatCrosshairTime(t: number, shiftMs: number, locale: string, intraday: boolean): string {
  const d = new Date(t + shiftMs);
  const base: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "2-digit" };
  if (intraday) Object.assign(base, { hour: "2-digit", minute: "2-digit", hour12: false });
  return dtf(locale, base).format(d);
}

export function intervalToMs(interval: string): number {
  switch (interval) {
    case "1": return 60_000;
    case "5": return 5 * 60_000;
    case "10": return 10 * 60_000;
    case "15": return 15 * 60_000;
    case "60": return 3_600_000;
    case "240": return 4 * 3_600_000;
    case "D": return 86_400_000;
    case "W": return 7 * 86_400_000;
    case "M": return 30 * 86_400_000;
    default: return 86_400_000;
  }
}

/** Heikin-Ashi transform for display. */
export function toHeikinAshi(src: Candle[]): Candle[] {
  const out: Candle[] = new Array(src.length);
  let po = 0;
  let pc = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const close = (c.o + c.h + c.l + c.c) / 4;
    const open = i === 0 ? (c.o + c.c) / 2 : (po + pc) / 2;
    out[i] = { t: c.t, o: open, h: Math.max(c.h, open, close), l: Math.min(c.l, open, close), c: close, v: c.v };
    po = open;
    pc = close;
  }
  return out;
}

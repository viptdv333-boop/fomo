/* The clock of the forming bar: when it closes and how the time left is written (the countdown under the last-price tag of the chart).
   Pure (no DOM): the engine draws it, scripts/check-bar-countdown.ts checks it.

   Chart time is `real UTC ms + clockOffsetMs`; a bar's time is its START in that basis. Bar grids:
     - native and seconds bars start on a multiple of their length (the exchange clock for MOEX, UTC for the rest) and last `intervalMs`;
     - aggregated bars (45m, 2h, 3h ... and the MOEX 4h / 10m) are anchored to the first bar of each day (aggregateCandles in intervals.ts): a step
       grid from the day's first bar, so the day's LAST bar is cut at the day boundary (the chart-time day, floor(t / DAY));
     - W is 7 days, M and Y follow the calendar of the exchange wall clock (`wallShiftMs` = how far the wall clock the month is read on is from chart time:
       the server zone shift of MOEX candles, 0 for UTC sources).
   The exchange sessions themselves (a break, the end of the evening session) are not known here: a bar is assumed to run to the end of its grid slot. */

const DAY = 86_400_000;

/** Longest pause (ms) after a bar's end during which the countdown keeps rolling over the grid (the next bar has not been opened by a trade yet). */
export function rollGraceMs(intervalMs: number): number {
  return Math.min(30 * 60_000, Math.max(120_000, 2 * intervalMs));
}

/**
 * Close time (chart time) of the bar that starts at `barStart`, or null when it is not a bar of a known grid.
 * Months and years end on the next 1st of the wall clock; everything shorter ends one slot later but never after the end of its (chart-time) day.
 */
export function barCloseTime(barStart: number, intervalMs: number, wallShiftMs = 0): number {
  if (intervalMs >= 360 * DAY) {
    const d = new Date(barStart + wallShiftMs);
    return Date.UTC(d.getUTCFullYear() + 1, 0, 1) - wallShiftMs;
  }
  if (intervalMs >= 28 * DAY) {
    const d = new Date(barStart + wallShiftMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - wallShiftMs;
  }
  const end = barStart + intervalMs;
  if (intervalMs < DAY) return Math.min(end, (Math.floor(barStart / DAY) + 1) * DAY);
  return end;
}

/**
 * Milliseconds until the forming bar closes, or null when there is nothing to count down to (the market is closed, the data is old).
 * `lastStart` is the start of the newest bar, `nowChart` the current time in chart time. A bar that has just ended and has no successor yet
 * (a quiet instrument, a second chart between trades) rolls over to the next slot of the grid for a short while (`rollGraceMs`);
 * daily and longer bars never roll (a closed market must not show a clock).
 */
export function barCountdownMs(lastStart: number, intervalMs: number, nowChart: number, wallShiftMs = 0): number | null {
  if (!Number.isFinite(lastStart) || !Number.isFinite(nowChart) || !(intervalMs > 0)) return null;
  const end = barCloseTime(lastStart, intervalMs, wallShiftMs);
  if (end > nowChart) return end - nowChart;
  if (intervalMs >= DAY) return null;
  if (nowChart - end > rollGraceMs(intervalMs)) return null;
  // the slot of the grid "now" falls in; it may not reach past the day of the last bar (a new day opens its own grid)
  const start = lastStart + Math.floor((nowChart - lastStart) / intervalMs) * intervalMs;
  const dayEnd = (Math.floor(lastStart / DAY) + 1) * DAY;
  if (start >= dayEnd) return null;
  const close = Math.min(start + intervalMs, dayEnd);
  return close > nowChart ? close - nowChart : null;
}

export interface CountdownUnits {
  /** the day mark: "д" / "d" / "天" */
  d: string;
}

const UNITS: Record<string, CountdownUnits> = { ru: { d: "д" }, en: { d: "d" }, zh: { d: "天" }, cn: { d: "天" } };

/** Day mark for a locale ("ru-RU", "en-US", "zh-CN", "ru", "cn"). */
export function countdownUnits(locale: string): CountdownUnits {
  return UNITS[String(locale || "en").slice(0, 2).toLowerCase()] ?? UNITS.en;
}

/**
 * The time left as the tag shows it: "14:32" under an hour, "02:15:07" under a day, "3д 05:12" from a day up (weekly / monthly bars; the seconds
 * would not fit the 64 px tag and mean nothing at that scale).  Whole seconds, rounded down (the last 999 ms read "00:00").
 */
export function formatCountdown(ms: number, units: CountdownUnits = UNITS.en): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const p = (v: number) => String(v).padStart(2, "0");
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}${units.d} ${p(h)}:${p(m)}`;
  if (h > 0) return `${p(h)}:${p(m)}:${p(s)}`;
  return `${p(m)}:${p(s)}`;
}

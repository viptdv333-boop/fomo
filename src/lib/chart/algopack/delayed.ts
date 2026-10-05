/* The "15 min delayed" badge of the chart. Pure, so the rule can be checked. */

const MIN = 60_000;
const INTERVAL_MS: Record<string, number> = { "1": MIN, "5": 5 * MIN, "15": 15 * MIN, "30": 30 * MIN, "60": 60 * MIN, "120": 120 * MIN, "240": 240 * MIN };

/**
 * Show the badge when: MOEX data, intraday, the server says the newest bars are the delayed public ISS ones, and the chart is on
 * a live session (the newest bar is at most 45 min + one bar old on the exchange clock) — a closed market is not "delayed".
 * `offsetMs`: chart time = real UTC ms + offset (the chart's own clock offset).
 */
export function delayedNow(source: string, delayed: boolean | undefined, lastT: number | undefined, offsetMs: number, interval: string, now = Date.now()): boolean {
  if (source !== "moex" || delayed !== true || lastT === undefined) return false;
  if (interval === "D" || interval === "W" || interval === "M" || interval === "Y") return false;
  const iv = INTERVAL_MS[interval] ?? (Number(interval) > 0 ? Number(interval) * MIN : MIN);
  return now + offsetMs - lastT < 45 * MIN + iv;
}

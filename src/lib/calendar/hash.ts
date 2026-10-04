/** Deep link of a calendar reminder notification: /calendar#YYYY-MM-DD opens that day on the public page. Pure helpers. */

const DAY = 86_400_000;
/** how far (in 28-day windows) a link may jump from today */
const MAX_WINDOWS = 24;

/** "#2026-10-05" -> "2026-10-05" (a real calendar date), anything else -> null. */
export function parseCalendarHash(hash: string): string | null {
  const m = /^#(\d{4})-(\d{2})-(\d{2})$/.exec(hash);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Which 28-day step of the month grid (counted from the window that starts at `windowStart`) contains `day`. */
export function offsetForDay(windowStart: string, day: string): number {
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${windowStart}T00:00:00Z`)) / DAY);
  return Math.max(-MAX_WINDOWS, Math.min(MAX_WINDOWS, Math.floor(diff / 28)));
}

/* Time-zone helpers of the calendar. All "dates" are YYYY-MM-DD strings in a given IANA zone; all instants are real UTC ms. */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(zone: string, key: string, opts: Intl.DateTimeFormatOptions, locale = "en-US"): Intl.DateTimeFormat {
  const k = `${locale}|${zone}|${key}`;
  let f = dtfCache.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { timeZone: zone, ...opts });
    } catch {
      f = new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts });
    }
    dtfCache.set(k, f);
  }
  return f;
}

/** Offset of a zone from UTC at an instant (ms; Moscow = +3h). */
export function tzOffsetMs(utcMs: number, zone: string): number {
  const parts = dtf(zone, "parts", { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => +(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of an instant as seen in a zone. */
export function dayKey(utcMs: number, zone: string): string {
  const wall = new Date(utcMs + tzOffsetMs(utcMs, zone));
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
}

/** YYYY-MM-DD plus n days (calendar arithmetic, zone independent). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** UTC ms of 00:00 of a date in a zone (DST safe). */
export function zonedDayStart(date: string, zone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off1 = tzOffsetMs(guess, zone);
  let t = guess - off1;
  const off2 = tzOffsetMs(t, zone);
  if (off2 !== off1) t = guess - off2;
  return t;
}

/** HH:mm of an instant in a zone. */
export function formatClock(utcMs: number, zone: string): string {
  const wall = new Date(utcMs + tzOffsetMs(utcMs, zone));
  return `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

/** "Mon, 5 Oct" style heading for a YYYY-MM-DD date. */
export function formatDayHeading(date: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  const [y, m, d] = date.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  } catch {
    return date;
  }
}

export type RangePreset = "yesterday" | "today" | "tomorrow" | "week" | "nextweek" | "custom";

export interface DateRange {
  from: string;
  to: string;
}

/** Inclusive date range of a preset in the display zone. */
export function rangeFor(preset: RangePreset, zone: string, nowMs: number, custom?: DateRange): DateRange {
  const today = dayKey(nowMs, zone);
  switch (preset) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case "tomorrow": {
      const d = addDays(today, 1);
      return { from: d, to: d };
    }
    case "week": {
      const mon = addDays(today, -weekday(today));
      return { from: mon, to: addDays(mon, 6) };
    }
    case "nextweek": {
      const mon = addDays(today, 7 - weekday(today));
      return { from: mon, to: addDays(mon, 6) };
    }
    case "custom": {
      if (custom && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) && /^\d{4}-\d{2}-\d{2}$/.test(custom.to)) {
        return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
      }
      return { from: today, to: today };
    }
    default:
      return { from: today, to: today };
  }
}

/** Instant bounds [start, end) of a date range in a zone. */
export function rangeBounds(r: DateRange, zone: string): { start: number; end: number } {
  return { start: zonedDayStart(r.from, zone), end: zonedDayStart(addDays(r.to, 1), zone) };
}

export const MAX_RANGE_DAYS = 31;

/** Days between two dates, inclusive. */
export function daySpan(r: DateRange): number {
  const [y1, m1, d1] = r.from.split("-").map(Number);
  const [y2, m2, d2] = r.to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
}

/** Monday-aligned 7-day UTC blocks covering [from, to] (inclusive dates): the unit the server caches and fetches. */
export function utcWeekBlocks(from: string, to: string): DateRange[] {
  const out: DateRange[] = [];
  let mon = addDays(from, -weekday(from));
  while (mon <= to && out.length < 8) {
    out.push({ from: mon, to: addDays(mon, 6) });
    mon = addDays(mon, 7);
  }
  return out;
}

/** "H:MM:SS" / "MM:SS" / "Nd HH:MM:SS" countdown text. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const hms = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** Short age: "45s", "12m", "3h", "2d". */
export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** The calendar day an event belongs to in a display zone (date-only events keep their own UTC date). */
export function eventDay(e: { ts: number; allDay: boolean }, zone: string): string {
  return e.allDay ? new Date(e.ts).toISOString().slice(0, 10) : dayKey(e.ts, zone);
}

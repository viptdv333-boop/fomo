// Pure helpers of the app's «Уведомления» list (Профиль tab, src/components/app/profile/NotifInbox.tsx): rows, cursor, day groups, relative time,
// where a tap goes, the offline copy. No React, no DOM, no Prisma: scripts/check-notif-inbox.ts runs them.
import { CHAT_BADGE_COVERED_TYPES, tabForNotifType } from "@/lib/app-badges";
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";

/** One notification as GET /api/notifications returns it (the fields the list shows). */
export interface InboxRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  /** ISO timestamp */
  createdAt: string;
}

/** Rows per page of the list («Показать ещё» fetches the next 50). */
export const INBOX_PAGE = 50;

/**
 * Types the list leaves out: the chat ones whose unread state the chat badge owns (CHAT_BADGE_COVERED_TYPES: reading a dialog never marks their
 * notification read, so they would sit in the list as «unread» for ever). They live in the Болталка tab.
 */
export const INBOX_HIDDEN_TYPES: readonly string[] = CHAT_BADGE_COVERED_TYPES;

/* ---------- rows ---------- */

/** A row from JSON of unknown shape; null when it is not a notification (the list ignores it). */
export function parseRow(raw: unknown): InboxRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || typeof r.type !== "string") return null;
  const at = typeof r.createdAt === "string" || typeof r.createdAt === "number" ? new Date(r.createdAt) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  return {
    id: r.id,
    type: r.type,
    title: typeof r.title === "string" ? r.title : "",
    body: typeof r.body === "string" && r.body ? r.body : null,
    link: typeof r.link === "string" && r.link.trim() ? r.link.trim() : null,
    isRead: r.isRead === true,
    createdAt: at.toISOString(),
  };
}

export function parseRows(raw: unknown): InboxRow[] {
  return Array.isArray(raw) ? raw.map(parseRow).filter((r): r is InboxRow => r !== null) : [];
}

const byNewest = (a: InboxRow, b: InboxRow) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.createdAt < b.createdAt ? 1 : -1);

/** Newest first, no duplicates: `incoming` (fresh from the server) wins over what is already in the list. */
export function mergeRows(existing: readonly InboxRow[], incoming: readonly InboxRow[]): InboxRow[] {
  const map = new Map<string, InboxRow>();
  for (const r of existing) map.set(r.id, r);
  for (const r of incoming) map.set(r.id, r);
  return [...map.values()].sort(byNewest);
}

/** The rows with these ids (or all of them) turned read. Same array when nothing changed. */
export function markRowsRead(rows: readonly InboxRow[], ids: ReadonlySet<string> | "all"): InboxRow[] {
  let changed = false;
  const out = rows.map((r) => {
    if (r.isRead || (ids !== "all" && !ids.has(r.id))) return r;
    changed = true;
    return { ...r, isRead: true };
  });
  return changed ? out : (rows as InboxRow[]);
}

export function countUnread(rows: readonly InboxRow[]): number {
  return rows.reduce((n, r) => n + (r.isRead ? 0 : 1), 0);
}

/**
 * Rows the list marks read by itself once they have been on screen for a moment: the unread ones that light the PROFILE tab (new_follower, payment,
 * system ...), which have no item to be opened in. The others (a comment, a post, a like, an alert ...) keep their unread state until the user opens
 * them (a tap here, or the idea / channel itself): their dock badge and the highlight inside Доска / Каналы stay truthful.
 * `done` = ids already sent, so a row is never sent twice.
 */
export function autoReadIds(rows: readonly InboxRow[], done: ReadonlySet<string> = new Set()): string[] {
  return rows.filter((r) => !r.isRead && !done.has(r.id) && tabForNotifType(r.type) === "me").map((r) => r.id);
}

/** Types that have a plain-words name in the dictionaries (appprof.nt.<type>); the title of a row falls back to it when the row has none. */
export const KNOWN_TYPES: readonly string[] = [
  "new_comment", "comment_reply", "idea_like", "comment_like", "channel_like", "channel_post", "channel_comment", "new_follower", "new_idea", "room_join",
  "subscription", "subscription_extended", "subscription_removed", "subscription_expiring", "subscription_expired", "payment", "price_alert", "line_alert", "calendar_reminder",
  "new_message", "chat_mention", "chat_reply", "chat_room_message", "report", "broadcast", "email_broadcast", "system", "security",
];

/** Dictionary key of the fallback title of a type («Новый подписчик»); "appprof.nt.other" for a type nobody named. */
export function typeLabelKey(type: unknown): string {
  return typeof type === "string" && KNOWN_TYPES.includes(type) ? `appprof.nt.${type}` : "appprof.nt.other";
}

/* ---------- paging cursor ---------- */

/** «<createdAt in ms>.<id>»: the keyset position of a row (the newest-first order is createdAt, then id). */
export function encodeCursor(createdAt: Date | string | number, id: string): string {
  const ms = new Date(createdAt).getTime();
  return `${Number.isFinite(ms) ? ms : 0}.${id}`;
}

export function decodeCursor(raw: unknown): { at: Date; id: string } | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 8.64e15) return null;
  return { at: new Date(ms), id: m[2] };
}

/** Page size from `?limit=`: 1..INBOX_PAGE, junk -> the default. */
export function clampLimit(raw: unknown, fallback = 20): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? Math.floor(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(INBOX_PAGE, n));
}

/* ---------- days and times ---------- */

export interface DayGroup {
  /** local date as YYYY-MM-DD (a stable React key) */
  key: string;
  kind: "today" | "yesterday" | "date";
  /** local midnight of the day */
  day: Date;
  rows: InboxRow[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Rows (newest first) split by LOCAL calendar day: Сегодня / Вчера / a date. The order of the rows is kept. */
export function groupByDay(rows: readonly InboxRow[], now: Date = new Date()): DayGroup[] {
  const today = startOfDay(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const out: DayGroup[] = [];
  for (const r of rows) {
    const day = startOfDay(new Date(r.createdAt));
    const key = dayKey(day);
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, day, kind: key === dayKey(today) ? "today" : key === dayKey(yesterday) ? "yesterday" : "date", rows: [] };
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
}

export type RelTime = { unit: "now" } | { unit: "min" | "hour"; n: number } | { unit: "time"; hhmm: string };

/** «только что» / «5 мин» / «3 ч» for the last 24 hours, the clock time («14:05») for older rows (the day header names the date). */
export function relativeTime(iso: string, now: Date = new Date()): RelTime {
  const at = new Date(iso);
  const diff = now.getTime() - at.getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return { unit: "now" };
  if (diff < 3_600_000) return { unit: "min", n: Math.floor(diff / 60_000) };
  if (diff < 86_400_000) return { unit: "hour", n: Math.floor(diff / 3_600_000) };
  const p = (n: number) => String(n).padStart(2, "0");
  return { unit: "time", hhmm: `${p(at.getHours())}:${p(at.getMinutes())}` };
}

/* ---------- where a tap goes ---------- */

export type LinkTarget = { kind: "none" } | { kind: "path"; path: string } | { kind: "external"; url: string };

/**
 * A stored notification link -> where to go. A path of this site (any locale prefix is dropped, the caller re-adds the current language), a full
 * URL of this site (-> its path), another http(s) address (external) or nothing (empty / javascript: / data: ... never navigated).
 */
export function linkTarget(link: unknown, origin?: string): LinkTarget {
  if (typeof link !== "string") return { kind: "none" };
  const l = link.trim();
  if (!l) return { kind: "none" };
  if (l.startsWith("/") && !l.startsWith("//")) return { kind: "path", path: stripLocale(l).path };
  if (/^https?:\/\//i.test(l)) {
    try {
      const u = new URL(l);
      if (origin && u.origin === new URL(origin).origin) return { kind: "path", path: stripLocale(u.pathname).path + u.search + u.hash };
      return { kind: "external", url: u.toString() };
    } catch {
      return { kind: "none" };
    }
  }
  return { kind: "none" };
}

/** The address to open a path target at in the language the user reads the app in. */
export function openHref(locale: Locale, path: string): string {
  return localizedPath(locale, path);
}

/* ---------- offline copy ---------- */

export const INBOX_CACHE_PREFIX = "fomo-notif-inbox:";
const CACHE_V = 1;

export interface InboxCache {
  rows: InboxRow[];
  unread: number;
  savedAt: number;
}

/** What is kept on the device: the first page, so the list opens at once and still shows something with no network. */
export function buildCache(rows: readonly InboxRow[], unread: number, now: number = Date.now()): string {
  return JSON.stringify({ v: CACHE_V, savedAt: now, unread, rows: rows.slice(0, INBOX_PAGE) });
}

export function parseCache(raw: unknown): InboxCache | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (!j || j.v !== CACHE_V || typeof j.savedAt !== "number") return null;
    const rows = parseRows(j.rows);
    const unread = typeof j.unread === "number" && Number.isFinite(j.unread) ? Math.max(0, Math.floor(j.unread)) : countUnread(rows);
    return { rows, unread, savedAt: j.savedAt };
  } catch {
    return null;
  }
}

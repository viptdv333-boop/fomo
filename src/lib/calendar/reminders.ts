"use client";

import { useSyncExternalStore } from "react";
import { listUserData, saveUserData } from "@/lib/chart/userdata";
import type { CalEvent } from "./types";

/* Reminders for calendar events («колокольчик»).
   - Signed in ("server" mode): stored on the server (/api/calendar/reminders) and delivered by server/calendar-reminders.ts as a
     "calendar_reminder" notification through the user's channels (bell, push, e-mail, Telegram ...), also with the browser closed.
     The reminders this browser had kept locally before are moved to the server once, on the first load after sign-in.
   - Guest ("local" mode): the old behaviour, kept in the per-user store (userdata kind 'calendar_reminders', localStorage for guests)
     and fired by <CalendarRemindersHost> while the terminal is open (a toast and a browser notification).
   The exported API (useReminders / addReminder / removeReminder / dueReminders) is the same for both. */

export interface Reminder {
  id: string;
  /** Release time, UTC ms. */
  ts: number;
  event: string;
  country: string;
  impact: number;
  /** Minutes before the release. */
  minutes: number;
  /** Glossary key and category: the server stores them for the brief of the notification. */
  gk?: string;
  category?: string;
  /** Delivered by the server (not by the in-page host). */
  server?: boolean;
  /** The server has already sent it. */
  sent?: boolean;
}

export type ReminderMode = "unknown" | "server" | "local";
export type ReminderResult = { ok: true; server: boolean } | { ok: false; error: "limit" | "past" | "failed" };

const KIND = "calendar_reminders";
const KEY = "default";
/** the localStorage key that chart/userdata.ts uses for guests of this kind */
const GUEST_LS = "fomo-terminal-userdata:calendar_reminders";
const FIRED_LS = "fomo-calendar-fired-v1";
const MAX = 100;
const API = "/api/calendar/reminders";
const STALE_MS = 60_000;

let mode: ReminderMode = "unknown";
let localList: Reminder[] = [];
let serverList: Reminder[] = [];
let view: Reminder[] = [];
let readyP: Promise<void> | null = null;
let loadedAt = 0;
const listeners = new Set<() => void>();
const EMPTY: Reminder[] = [];

function rebuild() {
  view = mode === "server" ? serverList : localList;
  listeners.forEach((l) => l());
}

function clean(raw: unknown): Reminder[] {
  const arr = raw && typeof raw === "object" && Array.isArray((raw as { list?: unknown }).list) ? (raw as { list: unknown[] }).list : [];
  const out: Reminder[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.ts !== "number" || typeof x.event !== "string") continue;
    out.push({
      id: x.id,
      ts: x.ts,
      event: x.event.slice(0, 200),
      country: typeof x.country === "string" ? x.country : "",
      impact: typeof x.impact === "number" ? x.impact : 1,
      minutes: typeof x.minutes === "number" && x.minutes >= 0 && x.minutes <= 1440 ? x.minutes : 15,
      gk: typeof x.gk === "string" ? x.gk : undefined,
      category: typeof x.category === "string" ? x.category : undefined,
    });
  }
  // events long past are dropped
  const cutoff = Date.now() - 3_600_000;
  return out.filter((r) => r.ts > cutoff).slice(0, MAX);
}

function persistLocal() {
  void saveUserData(KIND, KEY, { list: localList });
}

/* ───────────── server ───────────── */

interface ServerRow {
  eventId: string;
  eventTs: number;
  title: string;
  country: string;
  impact: number;
  category: string;
  leadMin: number;
  notifiedAt: number | null;
}

const fromServer = (r: ServerRow): Reminder => ({ id: r.eventId, ts: r.eventTs, event: r.title, country: r.country, impact: r.impact, minutes: r.leadMin, category: r.category, server: true, sent: r.notifiedAt !== null });

/** The server list, "guest" for a signed-out visitor, null when it could not be read (offline, 5xx). */
async function fetchServer(): Promise<Reminder[] | "guest" | null> {
  try {
    const r = await fetch(API, { cache: "no-store" });
    if (r.status === 401) return "guest";
    if (!r.ok) return null;
    const j = (await r.json()) as { reminders?: ServerRow[] };
    const rows = Array.isArray(j.reminders) ? j.reminders : [];
    // one bell per event: prefer the unsent row when an event has several
    const byEvent = new Map<string, Reminder>();
    for (const row of rows) {
      const cur = byEvent.get(row.eventId);
      const next = fromServer(row);
      if (!cur || (cur.sent && !next.sent)) byEvent.set(row.eventId, next);
    }
    return [...byEvent.values()].sort((a, b) => a.ts - b.ts);
  } catch {
    return null;
  }
}

async function postServer(r: Reminder, minutes: number): Promise<ReminderResult & { row?: ServerRow }> {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: r.id, eventTs: r.ts, title: r.event, country: r.country.slice(0, 8), impact: r.impact === 3 || r.impact === 2 ? r.impact : 1, category: (r.category || "other").slice(0, 24), ...(r.gk ? { gk: r.gk.slice(0, 64) } : {}), leadMin: minutes }),
    });
    if (res.status === 409) return { ok: false, error: "limit" };
    if (res.status === 400) return { ok: false, error: "past" };
    if (!res.ok) return { ok: false, error: "failed" };
    const j = (await res.json().catch(() => ({}))) as { reminder?: ServerRow | null };
    return { ok: true, server: true, row: j.reminder ?? undefined };
  } catch {
    return { ok: false, error: "failed" };
  }
}

function readGuestLs(): Reminder[] {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_LS) || "[]");
    const item = Array.isArray(raw) ? raw.find((i: { key?: string }) => i?.key === KEY) : null;
    return clean(item?.data);
  } catch {
    return [];
  }
}

/** First load after sign-in: whatever this browser / account kept locally goes to the server (soonest first, within the cap). */
async function migrateLocal(): Promise<void> {
  const now = Date.now();
  const guest = readGuestLs();
  if (guest.length === 0 && localList.length === 0) return; // nothing kept locally: no write on every page load
  const byId = new Map<string, Reminder>();
  for (const r of [...guest, ...localList]) if (r.ts > now) byId.set(r.id, r);
  const todo = [...byId.values()].sort((a, b) => a.ts - b.ts).slice(0, 60);
  let stop = false;
  for (const r of todo) {
    if (stop) break;
    if (serverList.some((s) => s.id === r.id)) continue;
    const res = await postServer(r, r.minutes);
    if (!res.ok && res.error === "limit") stop = true;
  }
  localList = [];
  persistLocal();
  try {
    localStorage.removeItem(GUEST_LS);
  } catch {}
}

async function refresh(): Promise<void> {
  const res = await fetchServer();
  if (res === "guest") {
    mode = "local";
  } else if (Array.isArray(res)) {
    if (mode !== "server") {
      mode = "server";
      serverList = res;
      await migrateLocal();
      const again = await fetchServer();
      if (Array.isArray(again)) serverList = again;
    } else {
      serverList = res;
    }
  } else if (mode === "unknown") {
    mode = "local"; // offline: keep working in this browser
  }
  loadedAt = Date.now();
  rebuild();
}

async function init(): Promise<void> {
  // the local copy first (guests and the migration need it), then the server decides the mode
  try {
    const items = await listUserData(KIND, KEY);
    localList = clean(items[0]?.data);
  } catch {}
  rebuild();
  await refresh();
  if (typeof document !== "undefined") {
    // pick up changes made on another device when the tab comes back
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && mode === "server" && Date.now() - loadedAt > STALE_MS) void refresh();
    });
  }
}

/* ───────────── public API ───────────── */

export function loadReminders(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!readyP) readyP = init();
  return readyP;
}

export function getReminders(): Reminder[] {
  return view;
}

export function getReminderMode(): ReminderMode {
  return mode;
}

export function addReminder(
  e: Pick<CalEvent, "id" | "ts" | "event" | "country" | "impact"> & Partial<Pick<CalEvent, "category" | "gk">>,
  minutes: number
): Promise<ReminderResult> {
  return (async () => {
    await loadReminders();
    const rem: Reminder = { id: e.id, ts: e.ts, event: e.event, country: e.country, impact: e.impact, minutes, category: e.category, gk: e.gk };
    if (mode === "server") {
      const before = serverList;
      serverList = [...before.filter((r) => r.id !== e.id), { ...rem, server: true }].sort((a, b) => a.ts - b.ts);
      rebuild();
      const res = await postServer(rem, minutes);
      if (!res.ok) {
        serverList = before;
        rebuild();
        return res;
      }
      return { ok: true, server: true };
    }
    localList = [...localList.filter((r) => r.id !== e.id), rem].sort((a, b) => a.ts - b.ts).slice(0, MAX);
    persistLocal();
    rebuild();
    return { ok: true, server: false };
  })();
}

export function removeReminder(id: string): Promise<void> {
  return (async () => {
    await loadReminders();
    if (mode === "server") {
      const before = serverList;
      serverList = before.filter((r) => r.id !== id);
      rebuild();
      try {
        const res = await fetch(`${API}?eventId=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
      } catch {
        serverList = before;
        rebuild();
      }
      return;
    }
    localList = localList.filter((r) => r.id !== id);
    persistLocal();
    rebuild();
  })();
}

function subscribe(cb: () => void) {
  void loadReminders();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useReminders(): Reminder[] {
  return useSyncExternalStore(subscribe, getReminders, () => EMPTY);
}

/** "server" once the account's reminders are loaded (signed in), "local" for guests, "unknown" before the first answer. */
export function useReminderMode(): ReminderMode {
  return useSyncExternalStore(subscribe, getReminderMode, () => "unknown" as ReminderMode);
}

/* fired set (so a local reminder shows once, also across reloads) */

function readFired(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_LS) || "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function wasFired(r: Reminder): boolean {
  return readFired().includes(`${r.id}:${r.minutes}`);
}
export function markFired(r: Reminder) {
  try {
    localStorage.setItem(FIRED_LS, JSON.stringify([...readFired(), `${r.id}:${r.minutes}`].slice(-200)));
  } catch {}
}

/** Local reminders that should show now: the moment has come and the release is not more than 10 minutes past. Server ones are delivered by the server. */
export function dueReminders(all: readonly Reminder[], now: number): Reminder[] {
  return all.filter((r) => !r.server && now >= r.ts - r.minutes * 60_000 && now < r.ts + 10 * 60_000 && !wasFired(r));
}

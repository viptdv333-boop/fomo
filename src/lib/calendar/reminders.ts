"use client";

import { useSyncExternalStore } from "react";
import { listUserData, saveUserData } from "@/lib/chart/userdata";
import type { CalEvent } from "./types";

/* In-page reminders for calendar events. Stored in the per-user store (userdata kind 'calendar_reminders', key 'default';
   localStorage for guests) and fired by <CalendarRemindersHost> while the terminal is open. No server push: that is a follow-up. */

export interface Reminder {
  id: string;
  /** Release time, UTC ms. */
  ts: number;
  event: string;
  country: string;
  impact: number;
  /** Minutes before the release. */
  minutes: number;
}

const KIND = "calendar_reminders";
const KEY = "default";
const FIRED_LS = "fomo-calendar-fired-v1";
const MAX = 100;

let list: Reminder[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const EMPTY: Reminder[] = [];

const emit = () => listeners.forEach((l) => l());

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
    });
  }
  // events long past are dropped
  const cutoff = Date.now() - 3_600_000;
  return out.filter((r) => r.ts > cutoff).slice(0, MAX);
}

function persist() {
  void saveUserData(KIND, KEY, { list });
}

export function loadReminders() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  void listUserData(KIND, KEY).then((items) => {
    const remote = clean(items[0]?.data);
    if (remote.length || list.length === 0) {
      // merge: whatever was added before the load finished stays
      const byId = new Map(remote.map((r) => [r.id, r]));
      for (const r of list) byId.set(r.id, r);
      list = [...byId.values()].sort((a, b) => a.ts - b.ts);
      emit();
    }
  });
}

export function getReminders(): Reminder[] {
  return list;
}

export function addReminder(e: Pick<CalEvent, "id" | "ts" | "event" | "country" | "impact">, minutes: number) {
  loadReminders();
  list = [...list.filter((r) => r.id !== e.id), { id: e.id, ts: e.ts, event: e.event, country: e.country, impact: e.impact, minutes }].sort((a, b) => a.ts - b.ts).slice(0, MAX);
  persist();
  emit();
}

export function removeReminder(id: string) {
  list = list.filter((r) => r.id !== id);
  persist();
  emit();
}

function subscribe(cb: () => void) {
  loadReminders();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useReminders(): Reminder[] {
  return useSyncExternalStore(subscribe, getReminders, () => EMPTY);
}

/* fired set (so a reminder shows once, also across reloads) */

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

/** Reminders that should show now: the moment has come and the release is not more than 10 minutes past. */
export function dueReminders(all: readonly Reminder[], now: number): Reminder[] {
  return all.filter((r) => now >= r.ts - r.minutes * 60_000 && now < r.ts + 10 * 60_000 && !wasFired(r));
}

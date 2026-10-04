"use client";

import { useSyncExternalStore } from "react";
import { listUserData, saveUserData } from "@/lib/chart/userdata";
import { DEFAULT_TERMINAL_NOTIFY, TERMINAL_NOTIFY_KEY, TERMINAL_NOTIFY_KIND, sanitizeTerminalNotify, type TerminalNotifyDefaults } from "@/lib/terminal-alert-defaults";

/*
 * Client store of the terminal alert defaults. Source of truth: the per-user terminal store (account for signed-in users,
 * localStorage for guests, see chart/userdata.ts). A localStorage mirror makes the synchronous reads (sound / pop-up when an
 * alert fires) possible and keeps the last known values when offline.
 */

const LS = "fomo-terminal-notify-v1";

let current: TerminalNotifyDefaults = DEFAULT_TERMINAL_NOTIFY;
let loading: Promise<TerminalNotifyDefaults> | null = null;
let mirrored = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readMirror() {
  if (mirrored || typeof window === "undefined") return;
  mirrored = true;
  try {
    const raw = localStorage.getItem(LS);
    if (raw) current = sanitizeTerminalNotify(JSON.parse(raw));
  } catch {}
}
function writeMirror() {
  try {
    localStorage.setItem(LS, JSON.stringify(current));
  } catch {}
}

/** Current values, synchronously (defaults until the first load finishes). */
export function getTerminalNotifyDefaults(): TerminalNotifyDefaults {
  readMirror();
  return current;
}

/** Fetches the stored values once per page load and resolves with them; never rejects. */
export function loadTerminalNotifyDefaults(force = false): Promise<TerminalNotifyDefaults> {
  readMirror();
  if (typeof window === "undefined") return Promise.resolve(current);
  if (!loading || force) {
    loading = listUserData(TERMINAL_NOTIFY_KIND, TERMINAL_NOTIFY_KEY)
      .then((items) => {
        if (items[0]?.data !== undefined) {
          current = sanitizeTerminalNotify(items[0].data);
          writeMirror();
          emit();
        }
        return current;
      })
      .catch(() => current);
  }
  return loading;
}

/** Merge a change, update every listener at once and persist (resolves false when the server refused). */
export async function saveTerminalNotifyDefaults(patch: Partial<TerminalNotifyDefaults>): Promise<boolean> {
  readMirror();
  current = sanitizeTerminalNotify({ ...current, ...patch });
  writeMirror();
  emit();
  return saveUserData(TERMINAL_NOTIFY_KIND, TERMINAL_NOTIFY_KEY, current);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  void loadTerminalNotifyDefaults();
  return () => {
    listeners.delete(cb);
  };
}

export function useTerminalNotifyDefaults(): TerminalNotifyDefaults {
  return useSyncExternalStore(subscribe, getTerminalNotifyDefaults, () => DEFAULT_TERMINAL_NOTIFY);
}

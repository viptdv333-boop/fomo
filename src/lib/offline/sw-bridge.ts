// Page <-> service worker talk for the offline mode (public/sw.js): who is signed in, the on/off switch, wipe, storage numbers.
// Every function is safe without a service worker (old browser, private window, http): it just does nothing.

export const OFFLINE_KEY = "fomo-offline";
/** window event: the user switched the offline mode */
export const OFFLINE_MODE_EVENT = "fomo-offline-mode";

/** The switch «Офлайн-режим» (default ON). Stored in localStorage; the service worker gets it by message. */
export function isOfflineModeEnabled(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) !== "0";
  } catch {
    return true;
  }
}

async function controller(): Promise<ServiceWorker | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    return reg ? reg.active : null;
  } catch {
    return null;
  }
}

/** True once a service worker controls this page (a first visit installs it a moment after load); waits up to `ms` for that. False without service workers. */
export async function swControlled(ms = 10000): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (navigator.serviceWorker.controller) return true;
  return new Promise<boolean>((resolve) => {
    const done = (v: boolean) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(v);
    };
    const onChange = () => done(!!navigator.serviceWorker.controller);
    const timer = setTimeout(() => done(!!navigator.serviceWorker.controller), ms);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    void navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller && done(true)).catch(() => {});
  });
}

/** Fire and forget */
export function swPost(msg: Record<string, unknown>): void {
  void controller().then((c) => c?.postMessage(msg)).catch(() => {});
}

/** Request / answer through a MessageChannel; null when there is no worker or it does not answer in time. */
export async function swAsk<T = unknown>(msg: Record<string, unknown>, ms = 4000): Promise<T | null> {
  const c = await controller();
  if (!c) return null;
  return new Promise<T | null>((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), ms);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data as T);
    };
    try {
      c.postMessage(msg, [ch.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export function setOfflineModeEnabled(on: boolean): void {
  try {
    localStorage.setItem(OFFLINE_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  swPost({ type: "fomo-config", enabled: on });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_MODE_EVENT));
}

/** Tells the worker who is signed in (only a real user id is announced) and in which language / home section the app starts. */
export function announceIdentity(uid: string, locale: string, home: string): void {
  if (!uid) return;
  swPost({ type: "fomo-identity", uid, locale, home });
}

/** «Очистить сохранённые данные»: pages, API answers, uploads of this device (and, with `outbox`, the unsent queue). */
export async function clearSavedData(opts: { outbox?: boolean; signOut?: boolean } = {}): Promise<void> {
  await swAsk({ type: "fomo-purge", outbox: opts.outbox === true, signOut: opts.signOut === true });
  // the chart's stored candles live in IndexedDB (src/lib/chart/candle-cache.ts), not in the worker's caches
  try {
    await (await import("@/lib/chart/candle-cache")).clearBars();
  } catch {
    /* nothing stored */
  }
}

/** A successful write happened: stored copies of lists may be out of date, the worker asks the network first from now on. */
export function noteWrite(): void {
  swPost({ type: "fomo-wrote" });
}

export interface SwStats {
  caches: Record<string, number>;
  usage: number;
  quota: number;
  state: { uid: string; locale: string; home: string; enabled: boolean; build: string };
}
export function swStats(): Promise<SwStats | null> {
  return swAsk<SwStats>({ type: "fomo-stats" });
}

// The page side of the offline OUTBOX (the write queue). The state machine, ordering, backoff and the IndexedDB layer are in
// public/sw-outbox-core.js (shared with the service worker's Background Sync); this file is the singleton that
//  * keeps the queue in memory (mirror of IndexedDB) for the screens,
//  * sends it: when the page loads, on `online`, on tab resume, after a backoff timer and, where supported, via Background Sync,
//  * announces delivered items (window event OUTBOX_SENT_EVENT) so a thread can refresh at once.
// Nothing here runs on the server.
import core from "../../../public/sw-outbox-core.js";
import type { OutboxItem, OutboxKind, OutboxStore } from "../../../public/sw-outbox-core";
import { isOnline, markReachable, noteNetworkError, subscribeOnline } from "../offline/online";
import { rawFetch } from "../offline/fetch-guard";
import { noteWrite } from "../offline/sw-bridge";

export type { OutboxItem, OutboxKind } from "../../../public/sw-outbox-core";

export const OUTBOX_SENT_EVENT = "fomo-outbox-sent";
export interface OutboxSentDetail {
  clientId: string;
  kind: OutboxKind;
  target: string;
  serverId: string;
}

type Listener = () => void;

let store: OutboxStore | null = null;
let memory: OutboxItem[] = []; // fallback when IndexedDB is unavailable
let items: OutboxItem[] = [];
let uid = "";
let started = false;
let flushing = false;
let flushAgain = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function memoryStore(): OutboxStore {
  return {
    getAll: async () => memory.map((i) => ({ ...i })),
    put: async (it) => {
      const k = memory.findIndex((m) => m.clientId === it.clientId);
      if (k >= 0) memory[k] = { ...it };
      else memory.push({ ...it });
    },
    del: async (id) => {
      memory = memory.filter((m) => m.clientId !== id);
    },
    clear: async () => {
      memory = [];
    },
  };
}

function getStore(): OutboxStore {
  if (!store) {
    let s: OutboxStore | null = null;
    try {
      s = core.openStore(typeof indexedDB !== "undefined" ? indexedDB : null);
    } catch {
      s = null;
    }
    store = s ?? memoryStore();
  }
  return store;
}

function emit() {
  listeners.forEach((l) => l());
}

async function refresh(): Promise<void> {
  try {
    items = await getStore().getAll();
  } catch {
    // IndexedDB refused (private mode, quota): keep going in memory
    store = memoryStore();
    items = await store.getAll();
  }
  emit();
}

export function subscribeOutbox(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The list for useSyncExternalStore: the same array until something changes */
export function outboxSnapshot(): OutboxItem[] {
  return items;
}
export function outboxUid(): string {
  return uid;
}

/** counts for the signed-in user: waiting (incl. waiting for sign-in) and failed */
export function outboxCounts(): { pending: number; failed: number; auth: number } {
  return core.counts(items, uid || undefined);
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushOutbox();
  }, Math.max(500, Math.min(ms, 5 * 60 * 1000)));
}

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks?.request) return (await locks.request("fomo-outbox-flush", { ifAvailable: true }, (lock) => (lock ? fn() : null))) as T | null;
  return fn();
}

/** Sends what is due. Safe to call from anywhere, any number of times (one flush at a time, in this tab and across tabs). */
export async function flushOutbox(): Promise<void> {
  if (!uid || typeof window === "undefined") return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    do {
      flushAgain = false;
      if (!isOnline()) break;
      const res = await withLock(() =>
        core.flushOnce({
          getAll: () => getStore().getAll(),
          put: (it) => getStore().put(it),
          del: (id) => getStore().del(id),
          uid,
          now: () => Date.now(),
          rnd: () => Math.random(),
          send: async (it) => {
            try {
              const r = await rawFetch(it.url, { method: it.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(it.body) });
              let json: unknown = null;
              try {
                json = await r.json();
              } catch {
                /* empty body */
              }
              if (r.status < 500) markReachable();
              if (r.ok) noteWrite(); // the service worker's stored lists are older than this write now: it asks the network first
              return { status: r.status, json };
            } catch {
              void noteNetworkError();
              return { status: 0 };
            }
          },
          onChange: (it, kind) => {
            if (kind === "sent") {
              window.dispatchEvent(new CustomEvent<OutboxSentDetail>(OUTBOX_SENT_EVENT, { detail: { clientId: it.clientId, kind: it.kind, target: it.target, serverId: it.serverId || "" } }));
            }
            void refresh();
          },
        })
      );
      await refresh();
      try {
        for (const id of core.gcIds(items, Date.now())) await getStore().del(id);
      } catch {
        /* ignore */
      }
      if (res && res.wakeMs !== null && res.stopped !== "auth") schedule(res.wakeMs);
      else if (res && res.stopped === "network") schedule(core.backoffMs(1));
    } while (flushAgain);
  } finally {
    flushing = false;
  }
  // delivered items stay visible for a moment (no flash); refresh again when the grace is over
  if (items.some((i) => i.status === "sent")) {
    setTimeout(() => {
      void (async () => {
        try {
          for (const id of core.gcIds(await getStore().getAll(), Date.now())) await getStore().del(id);
        } catch {
          /* ignore */
        }
        await refresh();
      })();
    }, core.SENT_GRACE_MS + 500);
  }
}

/**
 * The signed-in user is known (or changed). Loads the saved queue, removes what belongs to somebody else, brings the items parked for a
 * sign-in back, starts the triggers and sends. Call with "" when there is no user.
 */
export async function setOutboxUser(next: string): Promise<void> {
  uid = next;
  await refresh();
  if (!uid) return;
  try {
    const s = getStore();
    for (const id of core.purgeIds(items, { keepUid: uid })) await s.del(id);
    for (const it of core.recoverSending(items.filter((i) => i.uid === uid))) await s.put(it);
    for (const it of core.resumeAuth(items.filter((i) => i.uid === uid), uid)) await s.put(it);
  } catch {
    /* ignore */
  }
  await refresh();
  startTriggers();
  void flushOutbox();
}

function startTriggers() {
  if (started || typeof window === "undefined") return;
  started = true;
  subscribeOnline(() => {
    if (isOnline()) void flushOutbox();
  });
  window.addEventListener("online", () => void flushOutbox());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });
  // another tab or the service worker changed the queue
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "fomo-outbox-changed") void refresh();
    });
  }
}

export interface EnqueueInput {
  /** keep the id of a request that may already have reached the server (the server then recognises the replay) */
  clientId?: string;
  kind: OutboxKind;
  target: string;
  url: string;
  body: Record<string, unknown>;
  coalesceKey?: string;
  preview?: Record<string, unknown> | null;
}

/** Puts a request into the queue (it survives a restart) and tries to send it at once. Returns null when nobody is signed in or the queue is full. */
export async function enqueue(input: EnqueueInput): Promise<OutboxItem | null> {
  if (!uid) return null;
  if (!items.length) await refresh();
  if (!core.canAdd(items)) return null;
  const s = getStore();
  const item = core.makeItem({ clientId: input.clientId, uid, kind: input.kind, target: input.target, url: input.url, body: input.body, coalesceKey: input.coalesceKey, preview: input.preview }, Date.now(), core.nextSeq(items));
  try {
    for (const id of core.coalesceDeletes(items, item)) await s.del(id);
    await s.put(item);
  } catch {
    store = memoryStore();
    memory = [];
    await store.put(item);
  }
  await refresh();
  registerBackgroundSync();
  void flushOutbox();
  return item;
}

function registerBackgroundSync() {
  try {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("fomo-outbox"))
      .catch(() => {});
  } catch {
    /* no Background Sync */
  }
}

/** «Повторить» on a failed item */
export async function retryItem(clientId: string): Promise<void> {
  const it = items.find((i) => i.clientId === clientId);
  if (!it) return;
  await getStore().put(core.retryNow({ ...it }, Date.now()));
  await refresh();
  void flushOutbox();
}

/** «Удалить» */
export async function removeItem(clientId: string): Promise<void> {
  await getStore().del(clientId);
  await refresh();
}

/** Sign-out / «Очистить сохранённые данные»: the whole queue goes */
export async function purgeOutboxAll(): Promise<void> {
  try {
    await getStore().clear();
  } catch {
    /* ignore */
  }
  memory = [];
  await refresh();
}

/** test hook: forget the module state */
export function __resetOutboxForTests(): void {
  store = null;
  memory = [];
  items = [];
  uid = "";
}

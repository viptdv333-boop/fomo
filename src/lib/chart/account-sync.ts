/**
 * Chart state that follows the account (indicators, per-pane preferences, drawings per symbol, the last symbol).
 *
 * Every item keeps working exactly as before from localStorage; for a signed-in user a "channel" mirrors it to
 * /api/terminal/userdata. The local copy is read first (no flicker), then the account copy is fetched and the NEWER
 * one wins (whole object, `at` = ms of the last user change, kept next to the local copy in a sibling key so data
 * written by older versions stays valid). Pushes are debounced, spaced and fail soft: a refused or lost write only
 * means that the next load pushes again. Guests (401) never reach the network again.
 */

import { resetUserDataGuest } from "./userdata";
import {
  PUSH_DEBOUNCE_MS,
  MIN_GAP_MS,
  RECHECK_MS,
  canonJson,
  decide,
  isForeign,
  nextSendAt,
  packRemote,
  parseRemote,
  recheckDue,
  retryDelay,
  type LocalState,
} from "./sync-logic";

const API = "/api/terminal/userdata";
const META_PREFIX = "fomo-chart-sync:";
const BACKUP_PREFIX = "fomo-chart-sync-bak:";
/** Id of the account this browser last synced with: lets the terminal page decide whether waiting for the account is worth it. */
export const SYNC_UID_HINT = "fomo-chart-sync-uid";
/* A 401 marks this page "guest" for a short while (no request storm from a guest changing the chart). It is short on purpose and
   noteSignedIn() clears it at once: a guest who signs in WITHOUT a page reload (the login page navigates client-side) used to stay a
   "guest" for the rest of the window, so the chart opened clean and nothing was saved to the account until the next reload. */
const GUEST_FOR_MS = 60_000;

/** Tunable for the checks only. */
export const timing = { debounce: PUSH_DEBOUNCE_MS, gap: MIN_GAP_MS, recheck: RECHECK_MS, guestFor: GUEST_FOR_MS };

/* ───────────── tiny storage helpers (never throw) ───────────── */

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

interface Meta {
  at: number;
  uid?: string;
}
function readMeta(lsKey: string): Meta {
  try {
    const m = JSON.parse(lsGet(META_PREFIX + lsKey) || "null") as Meta | null;
    if (m && typeof m === "object") return { at: typeof m.at === "number" && m.at > 0 ? m.at : 0, uid: typeof m.uid === "string" ? m.uid : undefined };
  } catch {}
  return { at: 0 };
}
function writeMeta(lsKey: string, m: Meta) {
  lsSet(META_PREFIX + lsKey, JSON.stringify(m.uid ? { at: m.at, uid: m.uid } : { at: m.at }));
}

/* ───────────── account session facts ───────────── */

let guestUntil = 0;
let uidSeen: string | null = null;

const isGuest = () => Date.now() < guestUntil;
function markGuest() {
  guestUntil = Date.now() + timing.guestFor;
  uidSeen = null;
  lsDel(SYNC_UID_HINT);
  pending.clear();
}
function markUid(uid: string) {
  guestUntil = 0;
  if (uidSeen !== uid || lsGet(SYNC_UID_HINT) !== uid) {
    uidSeen = uid;
    lsSet(SYNC_UID_HINT, uid);
  }
}

/** The visitor has just signed in (or the session turned out to be live): forget the guest verdict and reconcile every open channel now. */
export function noteSignedIn() {
  const wasGuest = guestUntil !== 0;
  guestUntil = 0;
  const wasListGuest = resetUserDataGuest();
  if (wasGuest || wasListGuest) for (const c of Array.from(channels)) c.recheck(true);
}

/** True when this browser has synced with an account before (and has not seen a 401 since). */
export function hasAccountHint(): boolean {
  return !isGuest() && !!lsGet(SYNC_UID_HINT);
}

/* ───────────── reading ───────────── */

export interface AccountItem {
  data: unknown;
  updatedAt?: string;
}
export type GetResult = { status: "ok"; uid: string; item: AccountItem | null } | { status: "guest" } | { status: "error" };

const inflight = new Map<string, Promise<GetResult>>();

/** One item of the account, or why there is none. Concurrent calls for the same item share one request. */
export function accountGet(kind: string, key: string): Promise<GetResult> {
  if (isGuest()) return Promise.resolve({ status: "guest" });
  const id = `${kind}\u0000${key}`;
  const hit = inflight.get(id);
  if (hit) return hit;
  const p = (async (): Promise<GetResult> => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 10_000) : null;
    try {
      const r = await fetch(`${API}?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}`, { cache: "no-store", signal: ctl?.signal });
      if (r.status === 401) {
        markGuest();
        return { status: "guest" };
      }
      if (!r.ok) return { status: "error" };
      const j = (await r.json()) as { items?: { key: string; data: unknown; updatedAt?: string }[]; uid?: unknown };
      if (typeof j.uid !== "string" || !j.uid) return { status: "error" };
      markUid(j.uid);
      const it = Array.isArray(j.items) ? j.items.find((x) => x.key === key) : undefined;
      return { status: "ok", uid: j.uid, item: it ? { data: it.data, updatedAt: it.updatedAt } : null };
    } catch {
      return { status: "error" };
    } finally {
      if (timer) clearTimeout(timer);
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}

/* ───────────── writing: one queue for everything ───────────── */

interface Pending {
  kind: string;
  key: string;
  body: string;
  due: number;
  attempt: number;
}
const pending = new Map<string, Pending>();
let lastSent = 0;
let sending = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function enqueue(kind: string, key: string, env: unknown, delay: number) {
  let body: string;
  try {
    body = JSON.stringify({ kind, key, data: env });
  } catch {
    return;
  }
  pending.set(`${kind}\u0000${key}`, { kind, key, body, due: Date.now() + delay, attempt: 0 });
  schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = undefined;
  if (sending || pending.size === 0) return;
  let at = Infinity;
  for (const p of pending.values()) at = Math.min(at, nextSendAt(p.due, lastSent, timing.gap));
  timer = setTimeout(() => void drain(), Math.max(0, at - Date.now()));
}

async function drain() {
  timer = undefined;
  if (sending) return;
  const now = Date.now();
  let pick: [string, Pending] | null = null;
  for (const e of pending) if (nextSendAt(e[1].due, lastSent, timing.gap) <= now && (!pick || e[1].due < pick[1].due)) pick = e;
  if (!pick) return schedule();
  const [id, p] = pick;
  sending = true;
  lastSent = now;
  let status = 0;
  try {
    const r = await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: p.body });
    status = r.status;
  } catch {
    status = 0;
  }
  sending = false;
  if (status === 401) markGuest();
  else if (pending.get(id) === p) {
    if (status >= 200 && status < 300) pending.delete(id);
    else if (status === 0 && typeof navigator !== "undefined" && navigator.onLine === false) {
      // no network: the change stays queued (it is already in localStorage) and goes out when the browser reports the network back (installHooks)
      p.due = Date.now() + 30_000;
    } else {
      const wait = retryDelay(status, p.attempt);
      if (wait === null) pending.delete(id);
      else {
        p.attempt++;
        p.due = Date.now() + wait;
      }
    }
  }
  schedule();
}

/** Page is going away: send what is waiting right now (keepalive lets the request outlive the page). */
export function flushPending() {
  if (typeof fetch === "undefined") return;
  clearTimeout(timer);
  timer = undefined;
  const items = Array.from(pending.entries()).slice(0, 12);
  for (const [id, p] of items) {
    pending.delete(id);
    try {
      void fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: p.body, keepalive: p.body.length < 60_000 }).catch(() => {});
    } catch {}
  }
}

/* ───────────── channels ───────────── */

export interface ChannelOpts {
  kind: string;
  /** Account key; null = this item is not synced (e.g. a ticker that does not fit a key). */
  key: string | null;
  /** The localStorage key that holds the item (also the base of the sibling timestamp key). */
  lsKey: string;
  /** The live state, serialized the way the local copy is. */
  current(): string;
  /** Put an account copy on the live chart. The local copy is already updated; must not throw. */
  apply(json: string): void;
  isEmpty(json: string): boolean;
  /** What "no state" is: a foreign local copy is replaced by it when the account has nothing. */
  emptyJson: string;
  /** Size caps for the account copy: the payload to push, or null to skip the push. */
  fit?(json: string): string | null;
}

export interface Channel {
  /** Reconcile the local copy with the account copy once. Never rejects. */
  start(): Promise<void>;
  /** The live state changed because of the user: store it locally (stamped) and push it (debounced; `immediate`: the page is closing, send now). */
  changed(json: string, immediate?: boolean): void;
  dispose(): void;
}

const channels = new Set<{ recheck(force?: boolean): void }>();
let globalHooks = false;

function installHooks() {
  if (globalHooks || typeof window === "undefined") return;
  globalHooks = true;
  window.addEventListener("pagehide", flushPending);
  // the network is back: changes made offline are pushed now, and every channel checks whether the account has something newer
  window.addEventListener("online", () => {
    const now = Date.now();
    for (const p of pending.values()) {
      p.due = now;
      p.attempt = 0;
    }
    schedule();
    for (const c of Array.from(channels)) c.recheck(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPending();
    else for (const c of Array.from(channels)) c.recheck();
  });
}

export function openChannel(o: ChannelOpts): Channel {
  installHooks();
  let baseline = "";
  let disposed = false;
  let lastCheck = 0;

  const readRaw = () => {
    const v = lsGet(o.lsKey);
    return v === null || v === "" ? null : v;
  };

  const push = (json: string, at: number, delay: number) => {
    if (!o.key) return;
    const fitted = o.fit ? o.fit(json) : json;
    if (fitted === null) return;
    const env = packRemote(at, fitted);
    if (env) enqueue(o.kind, o.key, env, delay);
  };

  async function reconcile(): Promise<void> {
    if (!o.key || disposed) return;
    lastCheck = Date.now();
    const res = await accountGet(o.kind, o.key);
    if (disposed || res.status !== "ok") return;
    const uid = res.uid;
    const meta = readMeta(o.lsKey);
    const foreign = isForeign(meta.uid, uid);
    const raw = readRaw();
    const live = o.current();
    const local: LocalState = foreign ? { exists: false, at: 0, empty: true } : { exists: raw !== null, at: meta.at, empty: o.isEmpty(live) };
    const remote = res.item ? parseRemote(res.item.data) : null;
    const same = !!remote && canonJson(remote.json) === canonJson(live);
    const action = decide(local, remote ? { at: remote.at, empty: o.isEmpty(remote.json) } : null, same);

    if (foreign && !remote) {
      // the chart on screen is another account's: wipe it, never carry it over
      lsDel(o.lsKey);
      writeMeta(o.lsKey, { at: 0, uid });
      o.apply(o.emptyJson);
      baseline = o.current();
      return;
    }
    if (action === "pull" && remote) {
      // an unstamped (older version) non-empty copy that is about to be replaced: keep one backup of it
      if (raw !== null && meta.at === 0 && !foreign && !local.empty) lsSet(BACKUP_PREFIX + o.lsKey, raw);
      lsSet(o.lsKey, remote.json);
      writeMeta(o.lsKey, { at: remote.at, uid });
      o.apply(remote.json);
      baseline = o.current();
      return;
    }
    if (action === "push") {
      const at = local.at > 0 ? local.at : Date.now();
      writeMeta(o.lsKey, { at, uid });
      push(live, at, 0);
      return;
    }
    // nothing to transfer: just remember whose copy this is
    if (raw !== null && (meta.uid !== uid || (same && remote && remote.at > meta.at))) writeMeta(o.lsKey, { at: same && remote ? Math.max(meta.at, remote.at) : meta.at, uid });
  }

  const self = {
    recheck(force?: boolean) {
      if (disposed || (!force && !recheckDue(Date.now(), lastCheck, timing.recheck))) return;
      void reconcile();
    },
  };
  channels.add(self);

  return {
    start() {
      baseline = o.current();
      return reconcile().catch(() => {});
    },
    changed(json, immediate) {
      if (json === baseline) return;
      baseline = json;
      const at = Date.now();
      lsSet(o.lsKey, json);
      const prev = readMeta(o.lsKey);
      writeMeta(o.lsKey, { at, uid: isGuest() ? undefined : (uidSeen ?? prev.uid ?? undefined) });
      if (isGuest()) return;
      push(json, at, immediate ? 0 : timing.debounce);
      if (immediate) flushPending();
    },
    dispose() {
      disposed = true;
      channels.delete(self);
    },
  };
}

/* ───────────── helpers for callers ───────────── */

/** Resolves when `p` does or after `ms`, whichever is first. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(undefined);
      },
    );
  });
}

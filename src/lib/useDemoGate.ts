"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { useScreenWarm } from "@/components/app/tabhost/warm";
import {
  DEMO_STORAGE_KEY,
  addUsage,
  freshState,
  isExhausted,
  localDay,
  mergeStates,
  normalizeState,
  parseState,
  serializeState,
  type DemoState,
} from "./demo-gate";

/* Guest demo gate (see demo-gate.ts for the accounting). One module-level store shared by every page that uses the gate, so
   the three pages draw on ONE budget and navigating between them neither resets nor double counts it.

   - counts only while somebody is watching: the session is known to be "unauthenticated" and the document is visible; a tick every
     second adds at most MAX_STEP_MS (a sleeping laptop does not burn the budget);
   - persists to localStorage every few seconds and on pagehide / visibilitychange; storage may be missing or throw (private mode,
     blocked site data): then the in-memory state is the only truth and the gate still works inside the page;
   - other tabs: the `storage` event and a BroadcastChannel carry their state here; the larger usage wins, so two visible tabs
     count the same wall time once;
   - nothing here is ever rendered: no counter, no hint. */

const TICK_MS = 1000;
const PERSIST_MS = 4000;
const CHANNEL = "fomo-demo-gate";

interface Store {
  state: DemoState;
  locked: boolean;
  counting: boolean;
  refs: number;
  last: number;
  lastPersist: number;
  timer: ReturnType<typeof setInterval> | null;
  listeners: Set<() => void>;
  channel: BroadcastChannel | null;
}

const G = globalThis as unknown as { __fomoDemoGate?: Store };

function store(): Store {
  if (!G.__fomoDemoGate) {
    const today = localDay();
    G.__fomoDemoGate = { state: freshState(today), locked: false, counting: false, refs: 0, last: 0, lastPersist: 0, timer: null, listeners: new Set(), channel: null };
  }
  return G.__fomoDemoGate;
}

function readStored(today: string): DemoState {
  try {
    return parseState(window.localStorage.getItem(DEMO_STORAGE_KEY), today);
  } catch {
    return freshState(today);
  }
}

function writeStored(s: DemoState): void {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, serializeState(s));
  } catch {
    /* no storage: in-memory counting only */
  }
}

function emit(st: Store): void {
  const today = localDay();
  const locked = isExhausted(st.state, today);
  if (locked === st.locked) return;
  st.locked = locked;
  st.listeners.forEach((l) => l());
}

/** Takes in a state from the storage / another tab; never lowers what this tab already counted. */
function absorb(st: Store, other: DemoState): void {
  const today = localDay();
  const merged = mergeStates(st.state, other, today);
  if (merged.usedMs !== st.state.usedMs || merged.day !== st.state.day) {
    st.state = merged;
    emit(st);
  }
}

function persist(st: Store, force = false): void {
  const now = Date.now();
  if (!force && now - st.lastPersist < PERSIST_MS) return;
  st.lastPersist = now;
  const today = localDay();
  // merge with what another tab wrote meanwhile before writing, so a slow tab never lowers the stored usage
  st.state = mergeStates(st.state, readStored(today), today);
  writeStored(st.state);
  try {
    st.channel?.postMessage(st.state);
  } catch {
    /* channel closed */
  }
}

function tick(st: Store): void {
  const now = Date.now();
  const delta = st.last ? now - st.last : 0;
  st.last = now;
  const today = localDay(new Date(now));
  if (st.counting && typeof document !== "undefined" && document.visibilityState === "visible" && !isExhausted(st.state, today)) {
    st.state = addUsage(st.state, delta, today);
    persist(st, isExhausted(st.state, today));
  } else if (st.state.day !== today) {
    // midnight passed: a new day, a new budget
    st.state = freshState(today);
    persist(st, true);
  }
  emit(st);
}

function onStorage(e: StorageEvent): void {
  if (e.key !== DEMO_STORAGE_KEY) return;
  absorb(store(), parseState(e.newValue, localDay()));
}

function onVisibility(): void {
  const st = store();
  if (document.visibilityState === "hidden") persist(st, true);
  else st.last = Date.now(); // do not count the time the page was hidden
}

function onPageHide(): void {
  persist(store(), true);
}

function start(st: Store): void {
  if (st.timer) return;
  const today = localDay();
  st.state = mergeStates(st.state, readStored(today), today);
  st.last = Date.now();
  st.lastPersist = Date.now();
  emit(st);
  try {
    if (typeof BroadcastChannel !== "undefined") {
      st.channel = new BroadcastChannel(CHANNEL);
      st.channel.onmessage = (ev: MessageEvent) => absorb(store(), normalizeState(ev.data, localDay()));
    }
  } catch {
    st.channel = null;
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);
  st.timer = setInterval(() => tick(st), TICK_MS);
}

function stop(st: Store): void {
  if (st.timer) clearInterval(st.timer);
  st.timer = null;
  persist(st, true);
  window.removeEventListener("storage", onStorage);
  window.removeEventListener("pagehide", onPageHide);
  document.removeEventListener("visibilitychange", onVisibility);
  try {
    st.channel?.close();
  } catch {
    /* ignore */
  }
  st.channel = null;
}

function subscribe(cb: () => void): () => void {
  const st = store();
  st.listeners.add(cb);
  return () => {
    st.listeners.delete(cb);
  };
}

/**
 * { locked } is true for a guest whose demo budget of the day is used up. Signed-in users and a still-loading session are
 * never locked and never counted (no flash for members). Mounting the gate on a page is all that is needed.
 */
export function useDemoGate(): { locked: boolean } {
  const { status } = useSession();
  const guest = status === "unauthenticated";
  const exhausted = useSyncExternalStore(
    subscribe,
    () => store().locked,
    () => false,
  );

  const warm = useScreenWarm(); // a screen that is only being pre-mounted is not watched by anybody: no demo time is spent on it
  useEffect(() => {
    if (!guest || warm) return;
    const st = store();
    st.refs++;
    st.counting = true;
    if (st.refs === 1) start(st);
    return () => {
      st.refs--;
      if (st.refs <= 0) {
        st.refs = 0;
        st.counting = false;
        stop(st);
      }
    };
  }, [guest, warm]);

  return { locked: guest && exhausted };
}

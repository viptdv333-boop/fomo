// "Is the network there?" for the whole page. navigator.onLine alone is not enough (a phone on a dead Wi-Fi says "online"), so two more signals:
//  * a /api answer marked X-Fomo-Offline by the service worker, or a failed request followed by a failed probe -> unreachable
//  * while unreachable, a probe of /api/version every few seconds brings it back
// useOnline() (src/lib/offline/useOnline.ts) and the banner read this store.

type Listener = () => void;
const listeners = new Set<Listener>();
let reachable = true;
let probing = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let lastFailProbe = 0;
let started = false;

export const ONLINE_EVENT = "fomo-online-change";

export function isOnline(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return reachable;
}

export function subscribeOnline(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ONLINE_EVENT));
}

function setReachable(v: boolean) {
  if (reachable === v) return;
  reachable = v;
  emit();
  if (!v) scheduleProbe(6000);
}

/** A real answer from the server came back */
export function markReachable(): void {
  if (!reachable) setReachable(true);
}

/** The service worker said «offline» for a read it could not serve from the network */
export function markUnreachable(): void {
  setReachable(false);
}

async function probe(): Promise<boolean> {
  if (typeof fetch === "undefined") return true;
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 5000);
  try {
    const res = await fetch("/api/version", { cache: "no-store", signal: ctl?.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function scheduleProbe(ms: number) {
  if (probeTimer || typeof window === "undefined") return;
  probeTimer = setTimeout(async () => {
    probeTimer = null;
    if (reachable && navigator.onLine !== false) return;
    if (navigator.onLine === false) return scheduleProbe(6000); // the browser knows better; its `online` event wakes us
    const ok = await probe();
    if (ok) setReachable(true);
    else scheduleProbe(8000);
  }, ms);
}

/** A request failed with a network error: if a probe fails too, the app is offline. At most one probe per 5 s. */
export async function noteNetworkError(): Promise<void> {
  if (!reachable || probing || Date.now() - lastFailProbe < 5000) return;
  probing = true;
  try {
    if (navigator.onLine === false) {
      setReachable(false);
      return;
    }
    const ok = await probe();
    if (!ok) {
      lastFailProbe = Date.now();
      setReachable(false);
    }
  } finally {
    probing = false;
  }
}

/** Starts listening to the browser's own online / offline events. Idempotent. */
export function startOnlineWatch(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => {
    // the browser says the link is back: confirm with a probe before trusting it
    void probe().then((ok) => (ok ? setReachable(true) : scheduleProbe(3000)));
    emit();
  });
  window.addEventListener("offline", () => {
    reachable = false;
    emit();
  });
  if (navigator.onLine === false) reachable = false;
}

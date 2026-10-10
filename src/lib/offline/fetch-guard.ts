// One central wrapper around window.fetch for same-origin /api calls, installed once by OfflineSync. It
//  * answers a WRITE (POST / PATCH / PUT / DELETE) at once with a 503 {error:"Нет сети", offline:true} and a toast when the browser knows there is no
//    network, instead of letting it hang: payments, subscribing, publishing, uploads ... all fail the same clear way, no component is touched.
//    (Likes, comments and messages do not come here while offline: they go through the outbox, src/lib/outbox/send.ts, and are sent later.)
//  * toasts a write that failed with a network error, and tells the online store about it
//  * reports an answer marked X-Fomo-Offline by the service worker (a read it could not serve) to the online store
//  * tells the service worker after every successful write, so its stored lists are not served as «instant» any more
//  * asks before «Выйти», when unsent messages would be deleted by it
import { markReachable, markUnreachable, noteNetworkError } from "./online";
import { noteWrite } from "./sw-bridge";
import { showToast } from "./toast";

const texts = { noNetwork: "Нет сети", signOutPending: "Есть неотправленные сообщения: {n}. При выходе они будут удалены. Выйти?" };
let pendingCount: () => number = () => 0;
let nativeFetch: typeof fetch | null = null;
let installed = false;

export function setGuardTexts(t: Partial<typeof texts>): void {
  Object.assign(texts, t);
}
export function setPendingCounter(fn: () => number): void {
  pendingCount = fn;
}

// How many /api reads are on their way: the thin refresh line under the header and the tab host's warm-up (it waits until a pre-mounted screen has its data) read it.
let inflight = 0;
const inflightListeners = new Set<() => void>();
function inflightChange(d: number): void {
  inflight = Math.max(0, inflight + d);
  inflightListeners.forEach((l) => l());
}
export function apiReadsInFlight(): number {
  return inflight;
}
export function subscribeApiReads(cb: () => void): () => void {
  inflightListeners.add(cb);
  return () => void inflightListeners.delete(cb);
}

/** The real fetch (the outbox uses it: it must not be pre-blocked or toasted by the guard). */
export function rawFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return (nativeFetch ?? fetch)(input, init);
}

/** writes whose failure is not worth a toast (fire and forget) and that do not change lists */
const QUIET = /^\/api\/(push\/|ideas\/[^/]+\/view$|chat\/read$|me\/locale$|version$)/;
const AUTH = /^\/api\/auth\//;

function describe(input: RequestInfo | URL, init?: RequestInit): { path: string; method: string; same: boolean } {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, window.location.href);
    const method = (init?.method || (typeof input === "object" && "method" in input ? input.method : "") || "GET").toUpperCase();
    return { path: u.pathname, method, same: u.origin === window.location.origin };
  } catch {
    return { path: "", method: "GET", same: false };
  }
}

function offlineResponse(): Response {
  return new Response(JSON.stringify({ error: texts.noNetwork, offline: true }), {
    status: 503,
    headers: { "Content-Type": "application/json", "X-Fomo-Offline": "1" },
  });
}

export function installFetchGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  nativeFetch = window.fetch.bind(window);
  const native = nativeFetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const d = describe(input, init);
    if (!d.same || !d.path.startsWith("/api/")) return native(input, init);

    const isWrite = d.method !== "GET" && d.method !== "HEAD";
    if (!isWrite) {
      inflightChange(1);
      try {
        const res = await native(input, init);
        if (res.headers.get("x-fomo-offline")) markUnreachable();
        else if (res.status < 500 && !res.headers.get("x-fomo-from-cache")) markReachable();
        return res;
      } catch (e) {
        if (e instanceof TypeError) void noteNetworkError();
        throw e;
      } finally {
        inflightChange(-1);
      }
    }

    // sign-out with unsent messages: ask first (the service worker deletes the queue with the rest of the user's data)
    if (/^\/api\/auth\/signout/.test(d.path)) {
      const n = pendingCount();
      if (n > 0 && typeof window.confirm === "function" && !window.confirm(texts.signOutPending.replace("{n}", String(n)))) {
        throw new TypeError("sign-out cancelled");
      }
    }

    const quiet = QUIET.test(d.path) || AUTH.test(d.path);
    if (!quiet && navigator.onLine === false) {
      showToast(texts.noNetwork);
      return offlineResponse();
    }
    try {
      const res = await native(input, init);
      if (res.ok && !quiet) noteWrite();
      if (res.status < 500) markReachable();
      return res;
    } catch (e) {
      if (e instanceof TypeError) {
        if (!quiet) showToast(texts.noNetwork);
        void noteNetworkError();
      }
      throw e;
    }
  };
}

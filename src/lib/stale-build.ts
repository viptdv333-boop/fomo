/**
 * A page that was loaded from an older release than the one the server runs now («stale shell»): its HTML (stored by the service worker, or kept open in
 * a tab / an installed app) points to JS chunks that are gone, or mixes an old page with new files. Symptoms: a blank chart, a missing timeframe row,
 * «Something went wrong», until a hard refresh. This file holds the PURE rules of the self-heal (scripts/check-sw-cache.ts runs them in node) and the
 * browser actions (drop the stored shell, reload once, loop guard).
 *
 *  - what counts as a stale-build error: chunk / dynamic import failures, a missing Server Action, a script or stylesheet under /_next/static that fails
 *  - when to reload by itself: right after the page opened (nothing typed yet), or when the app comes back from the background; otherwise a banner
 *  - never in a loop: at most one recovery per minute and three per tab session; never offline (a reload would land on the offline page)
 *  - what is dropped: the stored HTML / RSC pages and the build files (/_next/*); the user's data caches (api / media), the offline switch and the
 *    outbox stay, and the service worker is kept (the new sw.js is picked up by the browser by itself)
 */
import { isOnline } from "./offline/online";

export const RECOVER_KEY = "fomo-stale-recover";
/** one recovery per this long ... */
export const RECOVER_GAP_MS = 60_000;
/** ... and at most this many per tab session */
export const RECOVER_MAX = 3;
/** a page this young with no input yet reloads silently when it finds out it is stale */
export const STARTUP_WINDOW_MS = 20_000;
/** back from the background after this long: reload silently (nothing is being typed) */
export const RESUME_AFTER_MS = 30_000;

const STALE_MESSAGE =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to find Server Action|Server Action [^\n]{0,80}(was not found|not found)/i;

/** Is this error the signature of a stale build (a file of another release is missing / answered with a page)? */
export function isStaleBuildError(error: { name?: string; message?: string } | string | null | undefined): boolean {
  if (!error) return false;
  const text = typeof error === "string" ? error : `${error.name ?? ""} ${error.message ?? ""}`;
  return STALE_MESSAGE.test(text);
}

/** A build file of this site (hashed chunks, css): a failed load of one of these means the page and the server are of different releases. */
export function isBuildAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url, "https://x.invalid").pathname.indexOf("/_next/static/") === 0;
  } catch {
    return false;
  }
}

/** The server runs another release than this bundle (dev builds and unknown ids never count). */
export function buildMismatch(mine: string | null | undefined, server: string | null | undefined): boolean {
  if (!mine || mine === "dev" || !server || server === "dev") return false;
  return mine !== server;
}

export interface RecoverState {
  n: number;
  at: number;
}

/** May a recovery reload start now? Returns the state to store when it may. */
export function recoverDecision(state: RecoverState | null | undefined, now: number, online: boolean): { go: boolean; next: RecoverState } {
  const prev: RecoverState = state && Number.isFinite(state.n) && Number.isFinite(state.at) ? state : { n: 0, at: 0 };
  if (!online) return { go: false, next: prev };
  if (prev.n >= RECOVER_MAX) return { go: false, next: prev };
  if (prev.at > 0 && now - prev.at < RECOVER_GAP_MS) return { go: false, next: prev };
  return { go: true, next: { n: prev.n + 1, at: now } };
}

export interface AutoUpdateInput {
  mismatch: boolean;
  /** how long ago this page started (ms) */
  pageAgeMs: number;
  /** has the person touched the page (pointer / key) since it started */
  interacted: boolean;
  /** how long the tab was in the background just before now (0 = it was not) */
  hiddenForMs: number;
  /** a text field has the focus (a draft may be typed) */
  editing: boolean;
}

/** "now": reload silently; "banner": tell the person (the «Вышла новая версия» card); "none": nothing to do. */
export function autoUpdateDecision(i: AutoUpdateInput): "now" | "banner" | "none" {
  if (!i.mismatch) return "none";
  if (i.editing) return "banner";
  if (!i.interacted && i.pageAgeMs <= STARTUP_WINDOW_MS) return "now";
  if (i.hiddenForMs >= RESUME_AFTER_MS) return "now";
  return "banner";
}

/** Which entries of a service-worker cache go when the shell is dropped: every stored page / RSC payload, and the build files; nothing else. */
export function shellEntryDrop(cacheName: string, pathname: string): boolean {
  if (/^fomo-pages-/.test(cacheName)) return true;
  if (/^fomo-static-/.test(cacheName)) return pathname.indexOf("/_next/") === 0;
  return false;
}

/** Drops the stored shell (see shellEntryDrop). Works whatever version of the service worker is installed: it only uses the Cache API of the page. */
export async function purgeShellCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  for (const name of names) {
    if (/^fomo-pages-/.test(name)) {
      await caches.delete(name);
    } else if (/^fomo-static-/.test(name)) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        let path = "";
        try {
          path = new URL(req.url).pathname;
        } catch {}
        if (shellEntryDrop(name, path)) await cache.delete(req);
      }
    }
  }
}

function readState(): RecoverState | null {
  try {
    return JSON.parse(sessionStorage.getItem(RECOVER_KEY) || "null");
  } catch {
    return null;
  }
}

/** Is the server really answering? (a dead Wi-Fi says «online»; nothing is deleted before the server confirms) */
async function serverAnswers(): Promise<boolean> {
  try {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), 4000);
    const res = await fetch("/api/version", { cache: "no-store", signal: ctl?.signal });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Drops the stored shell and reloads from the network, once (loop guard in sessionStorage). Returns true when a reload was started.
 * `reason` is only for the console.
 */
export async function recoverStaleShell(reason: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const d = recoverDecision(readState(), Date.now(), isOnline());
  if (!d.go) return false;
  try {
    sessionStorage.setItem(RECOVER_KEY, JSON.stringify(d.next));
  } catch {}
  if (!(await serverAnswers())) return false;
  try {
    console.info("[fomo] stale build, reloading:", reason);
    await purgeShellCaches();
    // ask the browser for the newest sw.js too (it normally does so on its own navigation checks)
    const reg = await navigator.serviceWorker?.getRegistration?.();
    void reg?.update().catch(() => {});
  } catch {
    // best effort: the reload below still asks the network
  }
  window.location.reload();
  return true;
}

// Background warm-up: while the app is open and online, the things a reader opens first are fetched at low priority, so the service worker
// (public/sw.js) has them stored when the network is gone, and the next tab switch finds them in its cache. Bounded (requests, bytes, time),
// at most every 10 minutes, nothing on a slow / data-saver connection, nothing when the offline mode is switched off, silent.
import { APP_TABS, appTabHref } from "../app-ui";
import { apiRange } from "../calendar/useCalendar";
import { dayKey, rangeFor, addDays } from "../calendar/time";
import { isOfflineModeEnabled, swControlled } from "./sw-bridge";
import { isOnline } from "./online";
import { rawFetch } from "./fetch-guard";
import { chunkUrlsFromHtml, chunkUrlsFromRuntime, runtimeUrl, storableResources } from "./assets";

export const WARMUP_EVERY_MS = 10 * 60 * 1000;
export const WARMUP_NOW_EVENT = "fomo-warmup-now";
const LAST_KEY = "fomo-warm-at";
const MAX_REQUESTS = 40;
const MAX_BYTES = 6 * 1024 * 1024;
/** build files (scripts, styles) are counted separately: they are content-hashed, so after the first round only the changed ones are fetched */
const MAX_ASSET_REQUESTS = 140;
const MAX_ASSET_BYTES = 14 * 1024 * 1024;

export interface WarmCtx {
  uid: string;
  locale: string;
  /** Next's router.prefetch for the dock sections */
  prefetch?: (href: string) => void;
}
export interface WarmResult {
  skipped?: string;
  requests: number;
  bytes: number;
  ms: number;
}

interface Conn {
  saveData?: boolean;
  effectiveType?: string;
}
function slowConnection(): boolean {
  const c = (navigator as Navigator & { connection?: Conn }).connection;
  return !!c && (c.saveData === true || c.effectiveType === "slow-2g" || c.effectiveType === "2g");
}

function lastRun(): number {
  try {
    return Number(localStorage.getItem(LAST_KEY) || 0);
  } catch {
    return 0;
  }
}
function markRun() {
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/** Why a warm-up must not run now ("" = it may). Pure enough to test. */
export function warmupBlocker(opts: { enabled: boolean; online: boolean; hidden: boolean; slow: boolean; last: number; now: number; force: boolean }): string {
  if (!opts.enabled) return "off";
  if (!opts.online) return "offline";
  if (opts.hidden) return "hidden";
  if (opts.slow) return "slow";
  if (!opts.force && opts.now - opts.last < WARMUP_EVERY_MS) return "recent";
  return "";
}

/** The GET urls of the first wave, in order (the exact urls the screens use, so the stored answers are the ones they ask for). */
export function warmupUrls(uid: string, locale: string, zone: string, now: number): string[] {
  const urls = ["/api/ideas?limit=50&page=1", "/api/ideas/authors", "/api/categories?withInstruments=true", "/api/channels", "/api/authors", "/api/languages"];
  if (uid) {
    urls.push("/api/subscriptions", "/api/feed/mutes", "/api/rooms", "/api/chat/rooms", "/api/chat/favorites", "/api/chat/notify", "/api/assets", "/api/notifications", "/api/messages/conversations", `/api/users/${encodeURIComponent(uid)}`);
  }
  try {
    const week = { from: dayKey(now, zone), to: addDays(dayKey(now, zone), 6) };
    const today = rangeFor("today", zone, now);
    for (const r of [week, today]) {
      const a = apiRange(r, zone);
      urls.push(`/api/economic-calendar?from=${a.from}&to=${a.to}&lang=${locale}&limit=5000`);
    }
  } catch {
    /* an unknown time zone: no calendar warm-up */
  }
  return urls;
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 4000 });
    else setTimeout(resolve, 200);
  });
}

export async function runWarmup(ctx: WarmCtx, force = false): Promise<WarmResult> {
  const t0 = Date.now();
  const res: WarmResult = { requests: 0, bytes: 0, ms: 0 };
  const why = warmupBlocker({ enabled: isOfflineModeEnabled(), online: isOnline(), hidden: document.hidden, slow: slowConnection(), last: lastRun(), now: t0, force });
  if (why) return { ...res, skipped: why };
  // answers are only stored by the service worker: wait until it controls the page (the first visit installs it a moment after load)
  if (!(await swControlled())) return { ...res, skipped: "no-sw" };
  markRun();

  const get = async (url: string): Promise<unknown> => {
    if (res.requests >= MAX_REQUESTS || res.bytes >= MAX_BYTES || document.hidden || !isOnline()) return null;
    await idle();
    res.requests++;
    try {
      const r = await rawFetch(url, { priority: "low", credentials: "same-origin" } as RequestInit);
      if (!r.ok) return null;
      const buf = await r.arrayBuffer();
      res.bytes += buf.byteLength;
      if (!/json/i.test(r.headers.get("content-type") || "")) return null;
      return JSON.parse(new TextDecoder().decode(buf));
    } catch {
      return null;
    }
  };

  // build files: a first page load happens before the service worker controls the page, so its own scripts are not stored yet
  const seenAssets = new Set<string>();
  let assetRequests = 0;
  let assetBytes = 0;
  const storeAsset = async (path: string): Promise<void> => {
    if (seenAssets.has(path) || assetRequests >= MAX_ASSET_REQUESTS || assetBytes >= MAX_ASSET_BYTES || document.hidden || !isOnline()) return;
    seenAssets.add(path);
    try {
      if (typeof caches !== "undefined" && (await caches.match(path))) return; // already stored
    } catch {
      /* no Cache API */
    }
    await idle();
    assetRequests++;
    try {
      const r = await rawFetch(path, { priority: "low", credentials: "same-origin" } as RequestInit);
      if (r.ok) assetBytes += (await r.arrayBuffer()).byteLength;
    } catch {
      /* the next round */
    }
  };
  const resources = performance.getEntriesByType("resource").map((e) => e.name);
  for (const p of storableResources(resources, window.location.origin)) await storeAsset(p);
  const rt = runtimeUrl(resources);
  if (rt) {
    try {
      const r = await rawFetch(rt, { priority: "low" } as RequestInit);
      if (r.ok) for (const p of chunkUrlsFromRuntime(await r.text())) await storeAsset(p);
    } catch {
      /* the next round */
    }
  }

  let zone = "UTC";
  try {
    zone = localStorage.getItem("fomo-calendar-tz") || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    /* default */
  }

  const answers: Record<string, unknown> = {};
  // the service worker keeps the last session answer of the signed-in user: without it an offline start would look signed out
  if (ctx.uid) await get("/api/auth/session");
  for (const url of warmupUrls(ctx.uid, ctx.locale, zone, t0)) answers[url] = await get(url);

  if (ctx.uid) {
    // posts of the channels the user follows
    const subs = answers["/api/subscriptions"];
    const channelIds: string[] = [];
    if (Array.isArray(subs)) {
      for (const s of subs as { channel?: { id?: string } | null }[]) {
        const id = s?.channel?.id;
        if (id && !channelIds.includes(id)) channelIds.push(id);
        if (channelIds.length >= 5) break;
      }
    }
    for (const id of channelIds) await get(`/api/ideas?channelId=${encodeURIComponent(id)}&limit=50`);

    // the last messages of the busiest threads. peek=1: the DM endpoint must not mark the conversation as read just because we looked ahead
    const convs = answers["/api/messages/conversations"];
    if (Array.isArray(convs)) {
      const ids = (convs as { id?: string }[]).map((c) => c?.id).filter((x): x is string => !!x).slice(0, 4);
      for (const id of ids) await get(`/api/messages/conversations/${encodeURIComponent(id)}/messages?peek=1`);
    }
    const roomIds: string[] = [];
    const favs = answers["/api/chat/favorites"];
    if (Array.isArray(favs)) for (const f of favs as { roomId?: string }[]) if (f?.roomId && roomIds.length < 3) roomIds.push(f.roomId);
    const priv = answers["/api/rooms"];
    if (Array.isArray(priv)) for (const r of priv as { id?: string }[]) if (r?.id && roomIds.length < 3 && !roomIds.includes(r.id)) roomIds.push(r.id);
    for (const id of roomIds) await get(`/api/chat/messages?roomId=${encodeURIComponent(id)}`);
  }

  // the page shells of the dock sections: stored by the service worker, so the section opens offline, and prefetched for the router
  for (const tab of APP_TABS) {
    if (tab.id === "settings") continue;
    const href = appTabHref(ctx.locale as "ru" | "en" | "cn", tab);
    if (res.requests < MAX_REQUESTS && !document.hidden && isOnline()) {
      await idle();
      res.requests++;
      try {
        const r = await rawFetch(href, { headers: { Accept: "text/html" }, credentials: "same-origin", priority: "low" } as RequestInit);
        if (r.ok) {
          const html = await r.text();
          res.bytes += html.length;
          for (const p of chunkUrlsFromHtml(html)) await storeAsset(p);
        }
      } catch {
        /* the next round */
      }
    }
    try {
      ctx.prefetch?.(href);
    } catch {
      /* old router */
    }
  }

  res.bytes += assetBytes;
  res.requests += assetRequests;
  res.ms = Date.now() - t0;
  return res;
}

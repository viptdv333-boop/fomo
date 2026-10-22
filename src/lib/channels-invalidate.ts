// «Channels changed»: one place that keeps the channel screens in step with the server.
//  * invalidateChannels() after a write by the user (create / edit / delete a channel, add or remove a plan, pay / renew, subscribe, delete a post):
//    the service worker drops its stored lists and pages about channels (public/sw.js invalidateScope), the other open windows are told, and every
//    mounted screen reads its data again through the `fomo:channels-changed` window event.
//  * the same event is fired when the service worker finds that a list it answered from its copy is different on the server (fomo-data-updated),
//    and the hooks below also re-read silently when the app comes back to the foreground, gets focus or the network returns.
// The pure parts (which writes count, the throttle) are checked by scripts/check-channels-invalidate.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { swAsk } from "./offline/sw-bridge";

/** window event: something about channels / plans / subscriptions / posts changed (here or elsewhere): read it again */
export const CHANNELS_CHANGED_EVENT = "fomo:channels-changed";
/** the foreground / focus / online triggers fire together and often: at most one silent re-read per this time */
export const REVALIDATE_MIN_GAP_MS = 2000;
/** how long a write waits for the service worker to drop its copies before the caller goes on */
export const INVALIDATE_WAIT_MS = 800;

/**
 * Is this a successful write that changes what the channel screens show? (method, pathname of the /api call)
 * Channels and their settings, plans (tariffs), subscriptions and payments (a confirmed payment makes a subscription), follows, a profile
 * (the author's name is on the channel card) and posts (create / pin / delete a post; their comments, votes and views do not count).
 */
export function isChannelMutation(method: string, pathname: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if (/^\/api\/channels(\/|$)/.test(pathname)) return true;
  if (/^\/api\/subscriptions(\/|$)/.test(pathname)) return true;
  if (/^\/api\/(payments|yukassa)(\/|$)/.test(pathname)) return true;
  if (/^\/api\/users\/[^/]+\/(tariffs|follow)(\/|$)/.test(pathname)) return true;
  if (/^\/api\/users\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/ideas(\/[^/]+)?$/.test(pathname)) return true;
  return false;
}

/** Throttle for the silent re-reads: `force` (a write, a server-side change) always goes, the rest at most once per `gap`. */
export function revalidateDue(now: number, last: number, force: boolean, gap = REVALIDATE_MIN_GAP_MS): boolean {
  if (force) return true;
  return now - last >= gap;
}

export type ChannelsChangedDetail = { reason: "write" | "sw" | "invalidate" | "manual"; path?: string };

/** Tells the mounted screens (this window only) to read their channel data again. */
export function dispatchChannelsChanged(detail: ChannelsChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ChannelsChangedDetail>(CHANNELS_CHANGED_EVENT, { detail }));
}

/**
 * A channel / plan / subscription / post was changed by this user: the service worker forgets its stored copies (and tells the other windows), then the
 * mounted screens re-read. Never throws; waits for the worker at most INVALIDATE_WAIT_MS (no worker = nothing to wait for).
 */
export async function invalidateChannels(reason: ChannelsChangedDetail["reason"] = "manual"): Promise<void> {
  try {
    await Promise.race([swAsk({ type: "fomo-invalidate", scope: "channels" }, INVALIDATE_WAIT_MS), new Promise((r) => setTimeout(r, INVALIDATE_WAIT_MS))]);
  } catch {
    /* no worker */
  }
  dispatchChannelsChanged({ reason });
}

/**
 * Calls `cb` when the channels changed (the event; always) and when the app is shown again / gets focus / is back online (throttled).
 * Returns the unsubscribe function. `cb` should read with cache: "no-store" (network first): what is on screen came from a copy already.
 */
export function subscribeChannelsChanged(cb: (why: "event" | "visible" | "focus" | "online") => void): () => void {
  if (typeof window === "undefined") return () => {};
  let last = Date.now();
  const run = (why: "event" | "visible" | "focus" | "online", force: boolean) => {
    const now = Date.now();
    if (!revalidateDue(now, last, force)) return;
    last = now;
    cb(why);
  };
  const onEvent = () => run("event", true);
  const onVisible = () => {
    if (document.visibilityState === "visible") run("visible", false);
  };
  const onFocus = () => run("focus", false);
  const onOnline = () => run("online", false);
  window.addEventListener(CHANNELS_CHANGED_EVENT, onEvent);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener(CHANNELS_CHANGED_EVENT, onEvent);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
  };
}

/** A screen's loader runs again whenever the channels changed or the app is back (see subscribeChannelsChanged). `load` must read with cache: "no-store". */
export function useChannelsChanged(load: () => void, enabled = true): void {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    if (!enabled) return;
    return subscribeChannelsChanged(() => ref.current());
  }, [enabled]);
}

/** For effects that fetch in their own way: a number that grows with every trigger (put it in the effect's dependencies). */
export function useChannelsTick(enabled = true): number {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  useChannelsChanged(bump, enabled);
  return tick;
}

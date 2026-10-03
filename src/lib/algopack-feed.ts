/**
 * How the ISS candle rows of /api/klines are read for one request, and how the live edge is labelled (X-Candle-Tail).
 * Kept out of the route so it can be checked without Next (scripts / __checks__/algopack.check.ts).
 */

import { apGet, PUBLIC_ISS } from "./algopack";
import type { TailResult } from "./tinkoff-candles";

// Where the ISS candle rows come from for this request. `ap` (privileged requester + ALGOPACK key): the authenticated gateway
// apim.moex.com serves the same ISS routes with online (real-time) data for the subscription; any failure of it (no entitlement,
// 429 cool-down, network) falls back to the public delayed ISS for that call, so the chart never ends up emptier than before.
export interface Feed {
  ap: boolean;
  apHits: number;
  apMiss: number;
  apReason: string;
}

export async function getIssJson(url: string, feed: Feed): Promise<any | null> {
  if (feed.ap && url.startsWith(PUBLIC_ISS)) {
    const r = await apGet(url, undefined, { ttlMs: 1500, family: "candles", timeoutMs: 15_000 });
    if (r.ok && r.data) {
      feed.apHits++;
      return r.data;
    }
    feed.apMiss++;
    feed.apReason = r.reason;
  }
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// The diagnostic label of the live edge: tinkoff (T-Invest added newer bars) | algopack (the base rows came from the online
// gateway, nothing newer to add) | iss (delayed ISS). The reason says what happened to ALGOPACK as well.
export function labelTail(t: TailResult, feed: Feed): TailResult {
  if (!feed.ap) return t;
  const apOk = feed.apHits > 0 && feed.apMiss === 0;
  const apNote = apOk ? "apim ok" : `apim ${feed.apMiss > 0 ? feed.apReason || "fallback" : "unused"}`;
  if (t.tail === "iss" && apOk) return { ...t, tail: "algopack", reason: `${apNote}; ${t.reason}` };
  return { ...t, reason: `${apNote}; ${t.reason}` };
}


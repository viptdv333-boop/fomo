/**
 * LICENSING SAFETY: real-time Moscow Exchange data (the ALGOPACK online gateway, the T-Invest candle tail and quotes) is not
 * served to requests without a session. A guest gets the public delayed ISS data instead (candles ~15 minutes late, quotes from
 * ISS marketdata) and a 403 from the ALGOPACK-only routes. Crypto (Bybit public data) and the other sources are unaffected.
 * GUEST_REALTIME=1 restores the old behaviour (everything for everybody). Pure and framework-free: the routes feed it the
 * session user (see getViewer() in algopack-access.ts); scripts/check-demo-gate.ts checks the rules.
 */

import type { AlgoAccess } from "./algopack-policy";

/** GUEST_REALTIME=1|true: the owner allows real-time MOEX data for visitors without a session too (his own licensing decision). */
export function guestRealtimeFlag(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.GUEST_REALTIME ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/** May this requester be served real-time MOEX data (T-Invest tail / quotes)? Any session user, or everybody with GUEST_REALTIME. */
export function realtimeAllowed(signedIn: boolean, flag: boolean = guestRealtimeFlag()): boolean {
  return signedIn || flag;
}

/** ALGOPACK_PUBLIC opens the data for everybody, but never for a request without a session unless GUEST_REALTIME is set. */
export function guestGateAlgopack(access: AlgoAccess, signedIn: boolean, flag: boolean = guestRealtimeFlag()): AlgoAccess {
  if (access.allowed && access.why === "public" && !signedIn && !flag) return { enabled: access.enabled, allowed: false, why: "denied" };
  return access;
}

/**
 * ACCESS POLICY of everything that comes from ALGOPACK (real-time candles / trades / order books and the Promo-only
 * datasets). By default the data is served to every signed-in user (the owner's decision, the tabs «Стакан» and «ALGOPACK» are a
 * normal feature of the terminal); a request without a session never gets it (guest-delay.ts). Kill switch: ALGOPACK_PUBLIC=0 limits
 * it to site admins (ADMIN / OWNER) and everyone else keeps the public delayed ISS / T-Invest rules; no ALGOPACK_KEY = nobody.
 * Pure and framework-free so the rule can be unit-tested; the routes call `getAlgopackAccess()` (algopack-access.ts) which feeds it
 * the session user.
 */

import { algopackEnabled, algopackPublicFlag } from "./algopack";
import { isAdmin } from "./roles";

export type AlgoWhy = "admin" | "public" | "denied" | "no-key";

export interface AlgoAccess {
  /** the key is configured on the server */
  enabled: boolean;
  /** this requester may be served ALGOPACK data */
  allowed: boolean;
  why: AlgoWhy;
}

export function algopackPolicy(user: unknown, env?: { enabled?: boolean; publicFlag?: boolean }): AlgoAccess {
  const enabled = env?.enabled ?? algopackEnabled();
  if (!enabled) return { enabled: false, allowed: false, why: "no-key" };
  if (env?.publicFlag ?? algopackPublicFlag()) return { enabled, allowed: true, why: "public" };
  if (user && isAdmin(user)) return { enabled, allowed: true, why: "admin" };
  return { enabled, allowed: false, why: "denied" };
}

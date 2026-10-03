/**
 * ACCESS POLICY of everything that comes from ALGOPACK (real-time candles / trades / order books and the Promo-only
 * datasets). The subscription is personal: by default the data is served only to site admins (ADMIN / OWNER); the owner may
 * open it to everybody with ALGOPACK_PUBLIC=1 (his own licensing decision). Everyone else keeps the previous behaviour
 * (public delayed ISS / T-Invest rules). Pure and framework-free so the rule can be unit-tested; the routes call
 * `getAlgopackAccess()` (algopack-access.ts) which feeds it the session user.
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

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { algopackEnabled } from "./algopack";
import { algopackPolicy, type AlgoAccess } from "./algopack-policy";

/* Server-side access check of the ALGOPACK routes (see algopack-policy.ts for the rule). Never trust the client:
   every route that returns ALGOPACK data calls this first. Without the key it does not even look at the session. */

export async function getAlgopackAccess(): Promise<AlgoAccess> {
  if (!algopackEnabled()) return { enabled: false, allowed: false, why: "no-key" };
  let user: unknown = null;
  try {
    user = (await auth())?.user ?? null;
  } catch {
    user = null; // no session store reachable: treated as an anonymous visitor
  }
  return algopackPolicy(user);
}

/** Responses carrying ALGOPACK data are for one requester only: never stored by a shared cache. */
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" } as const;

/** What a non-entitled requester gets from an ALGOPACK-only route. The reason does not reveal whether a key exists. */
export function denied(a: AlgoAccess): NextResponse {
  return NextResponse.json({ ok: false, reason: a.why === "no-key" ? "unavailable" : "forbidden" }, { status: a.why === "no-key" ? 404 : 403, headers: PRIVATE_HEADERS });
}

export { ipOf, overLimit } from "./mem-rate-limit";

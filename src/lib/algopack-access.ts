import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { algopackEnabled } from "./algopack";
import { algopackPolicy, type AlgoAccess } from "./algopack-policy";
import { guestGateAlgopack, realtimeAllowed } from "./guest-delay";

/* Server-side access check of the ALGOPACK routes (see algopack-policy.ts for the rule). Never trust the client:
   every route that returns ALGOPACK data calls this first. Without the key it does not even look at the session. */

/** The signed-in user of this request (null: a guest, or no session store reachable: treated as an anonymous visitor). */
export async function getSessionUser(): Promise<unknown> {
  try {
    return (await auth())?.user ?? null;
  } catch {
    return null;
  }
}

export async function getAlgopackAccess(): Promise<AlgoAccess> {
  if (!algopackEnabled()) return { enabled: false, allowed: false, why: "no-key" };
  const user = await getSessionUser();
  // ALGOPACK_PUBLIC never reaches a request without a session (GUEST_REALTIME=1 restores that)
  return guestGateAlgopack(algopackPolicy(user), !!user);
}

/** Who is asking, for the routes that serve both real-time and delayed MOEX data: a session user gets real time, a guest the delayed feed. */
export async function getViewer(): Promise<{ signedIn: boolean; realtime: boolean }> {
  const signedIn = !!(await getSessionUser());
  return { signedIn, realtime: realtimeAllowed(signedIn) };
}

/** Responses carrying ALGOPACK data are for one requester only: never stored by a shared cache. */
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" } as const;

/** What a non-entitled requester gets from an ALGOPACK-only route. The reason does not reveal whether a key exists. */
export function denied(a: AlgoAccess): NextResponse {
  return NextResponse.json({ ok: false, reason: a.why === "no-key" ? "unavailable" : "forbidden" }, { status: a.why === "no-key" ? 404 : 403, headers: PRIVATE_HEADERS });
}

export { ipOf, overLimit } from "./mem-rate-limit";

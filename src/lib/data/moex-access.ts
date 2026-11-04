/**
 * MOEX data: a user who connected his OWN key (Settings -> Data providers) is served on it (the T-Invest token: real-time tail of candles, quotes
 * and trades; the ALGOPACK key: online gateway, order book, ALGOPACK tab). Without his own key a signed-in user is served as before, on the
 * server's keys; a guest gets the public delayed ISS feed. Server only.
 *
 *   MOEX_OWN_KEYS_ONLY=1   the server's keys serve site admins only: everyone else needs his own key
 *   GUEST_REALTIME=1       guests are served on the server's keys too
 */
import { getSessionUser } from "@/lib/algopack-access";
import { guestRealtimeFlag } from "@/lib/guest-delay";
import { isAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { decryptKey } from "./crypto";
import { runWithMoexKeys, type MoexKeys } from "./moex-keys";
import { memoized } from "./user-key";

const serverKeys = (): MoexKeys => ({ tinkoff: (process.env.TINKOFF_TOKEN ?? "").trim(), algopack: (process.env.ALGOPACK_KEY ?? "").trim() });
const NONE: MoexKeys = { tinkoff: "", algopack: "" };

export async function resolveMoexKeys(): Promise<MoexKeys> {
  if (guestRealtimeFlag()) return serverKeys();
  const user = (await getSessionUser()) as { id?: string } | null;
  if (!user) return NONE;
  const server = serverKeys();
  if (isAdmin(user)) return server;
  const userId = user.id;
  if (!userId) return NONE;
  const ownOnly = process.env.MOEX_OWN_KEYS_ONLY === "1";
  // a connection changes rarely and every chart refresh asks: kept for a few seconds
  return memoized(`moexkeys:${userId}`, 15_000, async () => {
    try {
      const rows = await prisma.dataConnection.findMany({ where: { userId, enabled: true, provider: { in: ["tinvest", "algopack"] } }, select: { provider: true, keyEnc: true } });
      // the user's own key first; what he has not connected is served on the server's key, as before
      const out: MoexKeys = ownOnly ? { tinkoff: "", algopack: "" } : { ...server };
      for (const r of rows) {
        const k = decryptKey(r.keyEnc) ?? "";
        if (!k) continue;
        if (r.provider === "tinvest") out.tinkoff = k;
        else if (r.provider === "algopack") out.algopack = k;
      }
      return out;
    } catch {
      return ownOnly ? NONE : server;
    }
  });
}

/** Runs a route's work with the keys of its requester (see moex-keys.ts). */
export async function withMoexKeys<T>(fn: () => Promise<T>): Promise<T> {
  return runWithMoexKeys(await resolveMoexKeys(), fn);
}

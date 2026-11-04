/**
 * MOEX data is served on the requester's OWN keys (Settings -> Data providers): the T-Invest token gives him the real-time tail of candles,
 * quotes and trades, the ALGOPACK key the online gateway, order book and the ALGOPACK tab. Everyone else gets the public delayed ISS feed.
 * Site admins (the owner) keep using the server's own keys. Server only.
 *
 *   GUEST_REALTIME=1 or MOEX_SHARED_KEYS=1   the old behaviour: every (signed-in) requester is served on the server's keys
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
  if (guestRealtimeFlag() || process.env.MOEX_SHARED_KEYS === "1") return serverKeys();
  const user = (await getSessionUser()) as { id?: string } | null;
  if (!user) return NONE;
  if (isAdmin(user)) return serverKeys();
  const userId = user.id;
  if (!userId) return NONE;
  // a connection changes rarely and every chart refresh asks: kept for a few seconds
  return memoized(`moexkeys:${userId}`, 15_000, async () => {
    try {
      const rows = await prisma.dataConnection.findMany({ where: { userId, enabled: true, provider: { in: ["tinvest", "algopack"] } }, select: { provider: true, keyEnc: true } });
      const out: MoexKeys = { tinkoff: "", algopack: "" };
      for (const r of rows) {
        const k = decryptKey(r.keyEnc) ?? "";
        if (r.provider === "tinvest") out.tinkoff = k;
        else if (r.provider === "algopack") out.algopack = k;
      }
      return out;
    } catch {
      return NONE;
    }
  });
}

/** Runs a route's work with the keys of its requester (see moex-keys.ts). */
export async function withMoexKeys<T>(fn: () => Promise<T>): Promise<T> {
  return runWithMoexKeys(await resolveMoexKeys(), fn);
}

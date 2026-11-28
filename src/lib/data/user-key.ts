/**
 * The market-data key of the signed-in user for one provider (server only). Returns the decrypted key of an enabled connection, or null
 * (no session, no key, switched off, unreadable). The key stays inside the server: callers send it only to the provider's own host.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptKey } from "./crypto";
import type { DataProvider } from "./providers";
import { globalProviderKey } from "./global-key";

export interface UserKey {
  userId: string;
  key: string;
}

export async function getUserKey(provider: DataProvider["id"]): Promise<UserKey | null> {
  let userId: string | undefined;
  try {
    userId = (await auth())?.user?.id;
  } catch {}
  try {
    if (userId) {
      const row = await prisma.dataConnection.findUnique({ where: { userId_provider: { userId, provider } }, select: { keyEnc: true, enabled: true } });
      const key = row?.enabled ? decryptKey(row.keyEnc) : null;
      if (key) return { userId, key };
    }
    const shared = ["twelvedata", "databento"].includes(provider) ? await globalProviderKey(provider) : null;
    return shared ? { userId: "global", key: shared } : null;
  } catch {
    return null;
  }
}

/** The providers the signed-in user has connected and not switched off (empty for a guest): their catalogues are shown in the search. */
export async function connectedProviders(): Promise<DataProvider["id"][]> {
  let userId: string | undefined;
  try {
    userId = (await auth())?.user?.id;
  } catch {}
  if (!userId) { const shared = await Promise.all([globalProviderKey("twelvedata"), globalProviderKey("databento")]); return (["twelvedata", "databento"] as const).filter((_, i) => !!shared[i]); }
  const uid = userId;
  return memoized(`conn:${uid}`, 10_000, async () => {
    try {
      const rows = await prisma.dataConnection.findMany({ where: { userId: uid, enabled: true }, select: { provider: true } });
      const providers = rows.map((r) => r.provider as DataProvider["id"]);
      if (!providers.includes("twelvedata") && await globalProviderKey("twelvedata")) providers.push("twelvedata");
      if (!providers.includes("databento") && await globalProviderKey("databento")) providers.push("databento");
      return providers;
    } catch {
      return [] as DataProvider["id"][];
    }
  });
}

/** Answers of a provider call are kept for a few seconds per user and request, so a chart refresh and a watchlist poll share one upstream call. */
const memo = new Map<string, { at: number; value: unknown }>();

export async function memoized<T>(key: string, ttlMs: number, load: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  if (keep(value)) {
    memo.set(key, { at: now, value });
    if (memo.size > 400) for (const [k, v] of memo) if (now - v.at > 60_000) memo.delete(k);
  }
  return value;
}

/**
 * The market-data key of the signed-in user for one provider (server only). Returns the decrypted key of an enabled connection, or null
 * (no session, no key, switched off, unreadable). The key stays inside the server: callers send it only to the provider's own host.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptKey } from "./crypto";
import type { DataProvider } from "./providers";

export interface UserKey {
  userId: string;
  key: string;
}

export async function getUserKey(provider: DataProvider["id"]): Promise<UserKey | null> {
  let userId: string | undefined;
  try {
    userId = (await auth())?.user?.id;
  } catch {
    return null;
  }
  if (!userId) return null;
  try {
    const row = await prisma.dataConnection.findUnique({ where: { userId_provider: { userId, provider } }, select: { keyEnc: true, enabled: true } });
    if (!row || !row.enabled) return null;
    const key = decryptKey(row.keyEnc);
    return key ? { userId, key } : null;
  } catch {
    return null;
  }
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

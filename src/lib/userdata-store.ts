import { prisma } from "./prisma";

/**
 * Per-user JSON blobs of the terminal (TerminalUserData): the limits and the write path shared by the user's own API
 * (api/terminal/userdata) and by the copy that arrives from the other site (userdata-mirror-server.ts).
 */

export const MAX_BYTES = 512 * 1024;
export const MAX_PER_KIND = 300;
/** Chart state that follows the account: small per-kind byte caps. */
export const KIND_MAX_BYTES: Record<string, number> = { chart_prefs: 16 * 1024, chart_indicators: 64 * 1024, chart_drawings: 400 * 1024, terminal_last: 2 * 1024 };
/** Drawings keep the newest 200 symbols: the oldest is evicted instead of refusing the write, so the limit never shows up as an error. */
export const EVICT_KINDS: Record<string, number> = { chart_drawings: 200 };

export type UserDataDb = Pick<typeof prisma, "terminalUserData">;

/**
 * Upsert of one blob. `at` sets `updatedAt` explicitly (the user's own write and its copy on the other site carry the same instant, which is
 * what the two sites compare); without it Prisma stamps "now". "limit" = a new row would exceed MAX_PER_KIND.
 */
export async function upsertUserData(db: UserDataDb, userId: string, kind: string, key: string, data: unknown, at?: Date): Promise<"ok" | "limit"> {
  const exists = await db.terminalUserData.findUnique({ where: { userId_kind_key: { userId, kind, key } }, select: { id: true } });
  if (!exists) {
    const count = await db.terminalUserData.count({ where: { userId, kind } });
    const evictAt = EVICT_KINDS[kind];
    if (evictAt !== undefined && count >= evictAt) {
      const oldest = await db.terminalUserData.findMany({ where: { userId, kind }, orderBy: { updatedAt: "asc" }, take: count - evictAt + 1, select: { id: true } });
      await db.terminalUserData.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
    } else if (count >= MAX_PER_KIND) return "limit";
  }
  await db.terminalUserData.upsert({
    where: { userId_kind_key: { userId, kind, key } },
    create: { userId, kind, key, data: data as object, ...(at ? { createdAt: at, updatedAt: at } : {}) },
    update: { data: data as object, ...(at ? { updatedAt: at } : {}) },
  });
  return "ok";
}

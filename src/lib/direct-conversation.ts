import { prisma } from "@/lib/prisma";

/**
 * The direct conversation of two users, created when there is none. Calls for the same pair are serialized by a Postgres advisory lock: a double
 * click on «Написать», a retried request or a payment confirmation arriving at the same moment as the buyer's own request used to find nothing
 * at the same time and each create a conversation (a list of nine empty «Сергей»). When a pair already has several (older duplicates), the one
 * with the most messages is used, so the history stays in one place.
 */
export async function getOrCreateConversation(a: string, b: string): Promise<{ id: string; created: boolean }> {
  const key = [a, b].sort().join(":");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const existing = await tx.directConversation.findFirst({
      where: { AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }] },
      orderBy: [{ messages: { _count: "desc" } }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    const conv = await tx.directConversation.create({
      data: { participants: { create: [{ userId: a }, { userId: b }] } },
      select: { id: true },
    });
    return { id: conv.id, created: true };
  });
}

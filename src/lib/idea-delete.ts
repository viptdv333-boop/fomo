import type { Prisma } from "@prisma/client";

/** Caller owns the transaction. Files are removed only after a successful commit. */
export async function deleteIdeaRecords(tx: Prisma.TransactionClient, where: Prisma.IdeaWhereInput) {
  const ideas = await tx.idea.findMany({
    where, select: { id: true, authorId: true, attachments: true, comments: { select: { userId: true, fileUrl: true } } },
  });
  if (!ideas.length) return ideas;
  const ids = ideas.map(i => i.id);
  // Notifications have no FK. Delete exact idea links, including comment anchors,
  // but never a different idea whose id merely starts with the same characters.
  await tx.notification.deleteMany({ where: { OR: ids.flatMap(id => [
    { link: `/ideas/${id}` },
    { link: { startsWith: `/ideas/${id}#` } },
    { link: { startsWith: `/ideas/${id}?` } },
  ]) } });
  await tx.idea.deleteMany({ where: { id: { in: ids } } });
  // Comments, votes and instrument links cascade in PostgreSQL.
  return ideas;
}

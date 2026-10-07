import { prisma } from "@/lib/prisma";
import { IDEA_READ_TYPES, IDEA_UNREAD_TYPES, ideaIdFromLink, type TariffByIdea, type UnreadRow } from "@/lib/app-unread";

// Server side of the per-item unread markers (see src/lib/app-unread.ts). No schema change: the idea of a notification is parsed from Notification.link.

/** Unread idea notifications of the user (oldest first) and the channel (tariff) of every idea they point at. Ideas that no longer exist are absent from the map. */
export async function loadIdeaUnread(userId: string): Promise<{ rows: (UnreadRow & { createdAt: Date })[]; tariffByIdea: TariffByIdea }> {
  const rows = await prisma.notification.findMany({
    where: { userId, isRead: false, type: { in: [...IDEA_UNREAD_TYPES] }, link: { startsWith: "/ideas/" } },
    select: { type: true, link: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  const ids = [...new Set(rows.map((r) => ideaIdFromLink(r.link)).filter((x): x is string => !!x))];
  const ideas = ids.length ? await prisma.idea.findMany({ where: { id: { in: ids } }, select: { id: true, tariffId: true } }) : [];
  return { rows, tariffByIdea: new Map(ideas.map((i) => [i.id, i.tariffId])) };
}

/** Where-clause of the notifications that point at one idea (`/ideas/<id>`, with a query or a hash). */
function linksOfIdea(ideaId: string) {
  return [{ link: `/ideas/${ideaId}` }, { link: { startsWith: `/ideas/${ideaId}?` } }, { link: { startsWith: `/ideas/${ideaId}#` } }];
}

/** The idea was opened: its comment / post notifications are read. Returns how many were marked. */
export async function markIdeaRead(userId: string, ideaId: string): Promise<number> {
  const r = await prisma.notification.updateMany({
    where: { userId, isRead: false, type: { in: [...IDEA_READ_TYPES] }, OR: linksOfIdea(ideaId) },
    data: { isRead: true },
  });
  return r.count;
}

/** The viewer cannot open anything in this channel (no subscription): its notifications would keep the badge forever, so they are read. */
export async function markChannelRead(userId: string, channelId: string): Promise<number> {
  const rows = await prisma.notification.findMany({
    where: { userId, isRead: false, type: { in: [...IDEA_READ_TYPES] }, link: { startsWith: "/ideas/" } },
    select: { id: true, link: true },
    take: 2000,
  });
  const byIdea = new Map<string, string[]>();
  for (const r of rows) {
    const id = ideaIdFromLink(r.link);
    if (id) (byIdea.get(id) ?? byIdea.set(id, []).get(id)!).push(r.id);
  }
  if (byIdea.size === 0) return 0;
  const ideas = await prisma.idea.findMany({ where: { id: { in: [...byIdea.keys()] }, tariffId: channelId }, select: { id: true } });
  const notifIds = ideas.flatMap((i) => byIdea.get(i.id) ?? []);
  if (notifIds.length === 0) return 0;
  const r = await prisma.notification.updateMany({ where: { id: { in: notifIds }, userId, isRead: false }, data: { isRead: true } });
  return r.count;
}

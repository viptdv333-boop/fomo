import type { PrismaClient } from "@prisma/client";

// Paid-channel chat rooms (ChatRoom linked from SubscriptionTariff.channelRoomId)
// used to be "open by id": only the /api/channels/[id]/chat lookup checked the
// subscription, so anyone holding the room id — including a subscriber whose
// term had ended or who was removed — could keep reading and posting. This is
// the single rule for REST and Socket.IO. Takes the client as a parameter
// because server/socket.ts runs with its own PrismaClient.
export async function canAccessRoom(db: PrismaClient, roomId: string, userId: string): Promise<boolean> {
  const tariff = await db.subscriptionTariff.findUnique({
    where: { channelRoomId: roomId },
    select: { id: true, authorId: true },
  });
  if (!tariff) return true; // not a channel room — other rules apply

  if (tariff.authorId === userId) return true;

  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "ADMIN" || user?.role === "OWNER") return true;

  // Same rule as paid ideas: this channel's subscription, or a legacy
  // author-wide one (tariffId null), and only while the term hasn't ended.
  const sub = await db.subscription.findFirst({
    where: {
      subscriberId: userId,
      authorId: tariff.authorId,
      OR: [{ tariffId: tariff.id }, { tariffId: null }],
      status: "active",
      endDate: { gt: new Date() },
    },
    select: { id: true },
  });
  return Boolean(sub);
}

// ---- Batch / pure part (live-socket sweep, server/subscription-sweep.ts) ----
// canAccessRoom answers one (room, user) pair with 2-3 queries; the sweep asks about every
// connected socket of every channel room, so it uses these instead: one query per table, the rule
// itself is the pure function below (same rule as canAccessRoom: the author, staff, or a subscription
// to this channel / a legacy author-wide one that is "active" and not past endDate).

export interface AccessTariff { id: string; authorId: string }
export interface AccessSub { subscriberId: string; authorId: string; tariffId: string | null; status: string; endDate: Date }

/** May `userId` be in the channel room of `tariff` right now? (pure) */
export function mayStayInChannelRoom(tariff: AccessTariff, userId: string, isStaff: boolean, subs: AccessSub[], now: Date): boolean {
  if (tariff.authorId === userId || isStaff) return true;
  return subs.some(
    (s) =>
      s.subscriberId === userId &&
      s.authorId === tariff.authorId &&
      (s.tariffId === tariff.id || s.tariffId === null) &&
      s.status === "active" &&
      s.endDate.getTime() > now.getTime()
  );
}

/**
 * For {roomId -> userIds present in it}: the users who may NOT be there, per paid-channel room, plus the
 * channel page path for each such room. Rooms that are not channel rooms are skipped (never denied here).
 */
export async function deniedChannelRoomUsers(
  db: PrismaClient,
  present: Map<string, Set<string>>,
  now: Date = new Date()
): Promise<{ denied: Map<string, Set<string>>; paths: Map<string, string> }> {
  const denied = new Map<string, Set<string>>();
  const paths = new Map<string, string>();
  if (present.size === 0) return { denied, paths };

  const tariffs = await db.subscriptionTariff.findMany({
    where: { channelRoomId: { in: [...present.keys()] } },
    select: { id: true, authorId: true, slug: true, channelRoomId: true },
  });
  if (tariffs.length === 0) return { denied, paths };

  const userIds = new Set<string>();
  for (const t of tariffs) for (const u of present.get(t.channelRoomId as string) ?? []) userIds.add(u);
  if (userIds.size === 0) return { denied, paths };

  const [staff, subs] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...userIds] }, role: { in: ["ADMIN", "OWNER"] } }, select: { id: true } }),
    db.subscription.findMany({
      where: {
        subscriberId: { in: [...userIds] },
        authorId: { in: [...new Set(tariffs.map((t) => t.authorId))] },
        status: "active",
        endDate: { gt: now },
      },
      select: { subscriberId: true, authorId: true, tariffId: true, status: true, endDate: true },
    }),
  ]);
  const staffIds = new Set(staff.map((u) => u.id));

  for (const t of tariffs) {
    const roomId = t.channelRoomId as string;
    for (const userId of present.get(roomId) ?? []) {
      if (mayStayInChannelRoom(t, userId, staffIds.has(userId), subs, now)) continue;
      if (!denied.has(roomId)) denied.set(roomId, new Set());
      denied.get(roomId)!.add(userId);
      paths.set(roomId, `/channels/${t.slug || t.id}`);
    }
  }
  return { denied, paths };
}

/** Channel page path (/channels/<slug|id>) of a paid-channel chat room; null for any other room. */
export async function channelPathForRoom(db: PrismaClient, roomId: string): Promise<string | null> {
  const t = await db.subscriptionTariff.findUnique({ where: { channelRoomId: roomId }, select: { id: true, slug: true } });
  return t ? `/channels/${t.slug || t.id}` : null;
}

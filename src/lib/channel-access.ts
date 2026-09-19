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

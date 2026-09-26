import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { canAccessRoom } from "@/lib/channel-access";

// Access the global IO instance set by server/socket.ts
const globalForIO = globalThis as unknown as { io: any };

function emitNotification(userId: string) {
  const io = globalForIO.io;
  if (io) {
    io.to(`user_${userId}`).emit("new_notification");
  }
}

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export async function createNotification({
  userId,
  type,
  title,
  body,
  link,
}: CreateNotificationParams) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, link },
  });
  emitNotification(userId);
  sendPushToUser(userId, { title, body, url: link }).catch(() => {});
  return notification;
}

export async function notifyFollowers(
  authorId: string,
  type: string,
  title: string,
  body?: string,
  link?: string
) {
  const followers = await prisma.follow.findMany({
    where: { authorId },
    select: { followerId: true },
  });

  if (followers.length === 0) return;

  await prisma.notification.createMany({
    data: followers.map((f) => ({
      userId: f.followerId,
      type,
      title,
      body,
      link,
    })),
  });

  // Emit to all followers
  for (const f of followers) {
    emitNotification(f.followerId);
    sendPushToUser(f.followerId, { title, body, url: link }).catch(() => {});
  }
}

// Every message in a room, not just @mentions — opt-in via the болталка bell
// (ChatRoomNotify). excludeUserId is always the sender, so a message never
// notifies its own author.
export async function notifyRoomSubscribers(
  roomId: string,
  excludeUserIds: string[],
  type: string,
  title: string,
  body?: string,
  link?: string
) {
  const subscribers = await prisma.chatRoomNotify.findMany({
    where: { roomId, userId: { notIn: excludeUserIds } },
    select: { userId: true },
  });
  if (subscribers.length === 0) return;

  // Re-check access on every send, not just at subscribe time — a private
  // room can remove a member, or a paid channel's subscription can lapse,
  // after the ChatRoomNotify row was created; without this a stale row
  // would keep leaking message previews via notification/push.
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  if (!room) return;

  let candidateIds = subscribers.map((s) => s.userId);
  if (room.ownerId) {
    const members = await prisma.chatRoomMember.findMany({
      where: { roomId, userId: { in: candidateIds } },
      select: { userId: true },
    });
    candidateIds = members.map((m) => m.userId);
  }
  if (candidateIds.length === 0) return;

  const allowed = await Promise.all(
    candidateIds.map(async (userId) => ((await canAccessRoom(prisma, roomId, userId)) ? userId : null))
  );
  const recipients = allowed.filter((id): id is string => id !== null);
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type,
      title,
      body,
      link,
    })),
  });

  for (const userId of recipients) {
    emitNotification(userId);
    sendPushToUser(userId, { title, body, url: link }).catch(() => {});
  }
}

// New post in a paid channel — every active subscriber, not just those who
// enabled the Telegram toggle. The author never notifies themselves.
export async function notifyChannelSubscribers(
  tariffId: string,
  excludeUserIds: string[],
  title: string,
  body?: string,
  link?: string,
  type = "channel_post"
) {
  const subs = await prisma.subscription.findMany({
    where: {
      tariffId,
      status: "active",
      endDate: { gt: new Date() },
      subscriberId: { notIn: excludeUserIds },
    },
    select: { subscriberId: true },
  });
  const recipients = [...new Set(subs.map((s) => s.subscriberId))];
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, title, body, link })),
  });

  for (const userId of recipients) {
    emitNotification(userId);
    sendPushToUser(userId, { title, body, url: link }).catch(() => {});
  }
}

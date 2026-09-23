import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

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

  await prisma.notification.createMany({
    data: subscribers.map((s) => ({
      userId: s.userId,
      type,
      title,
      body,
      link,
    })),
  });

  for (const s of subscribers) {
    emitNotification(s.userId);
    sendPushToUser(s.userId, { title, body, url: link }).catch(() => {});
  }
}

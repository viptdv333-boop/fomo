import { prisma } from "@/lib/prisma";

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
  }
}

import { prisma } from "@/lib/prisma";

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
  return prisma.notification.create({
    data: { userId, type, title, body, link },
  });
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
}

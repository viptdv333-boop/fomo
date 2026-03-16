import { prisma } from "@/lib/prisma";

export async function recalculateRating(userId: string): Promise<number> {
  const config = await prisma.ratingConfig.findFirst({
    where: { id: "singleton" },
  });

  if (!config) {
    throw new Error("RatingConfig not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastPublishedAt: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const [followerCount, likesAgg, dislikesAgg] = await Promise.all([
    prisma.follow.count({ where: { authorId: userId } }),
    prisma.ideaVote.aggregate({
      where: { idea: { authorId: userId }, value: 1 },
      _sum: { value: true },
    }),
    prisma.ideaVote.aggregate({
      where: { idea: { authorId: userId }, value: -1 },
      _sum: { value: true },
    }),
  ]);

  const likes = likesAgg._sum.value ?? 0;
  const dislikes = Math.abs(dislikesAgg._sum.value ?? 0);

  let inactivityDays = 0;
  if (user.lastPublishedAt) {
    const daysSincePublish = Math.floor(
      (Date.now() - user.lastPublishedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    inactivityDays = Math.max(0, daysSincePublish - config.inactivityThresholdDays);
  }

  const raw =
    followerCount * Number(config.subscriberWeight) +
    likes * Number(config.likeWeight) -
    dislikes * Number(config.dislikeWeight) -
    inactivityDays * Number(config.inactivityPenalty);

  const rating = Math.min(10, Math.max(1, raw));
  const rounded = Math.round(rating * 100) / 100;

  await prisma.user.update({
    where: { id: userId },
    data: { rating: rounded },
  });

  return rounded;
}

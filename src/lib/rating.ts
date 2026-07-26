import { prisma } from "@/lib/prisma";

export const MAX_RATING = 10;
const MIN_RATING = 1;

export async function recalculateRating(userId: string): Promise<number> {
  const config = await prisma.ratingConfig.findFirst({
    where: { id: "singleton" },
  });

  if (!config) {
    throw new Error("RatingConfig not found");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastPublishedAt: true, role: true, ratingBonus: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // The platform owner is pinned to the maximum. Every rating gate on the site
  // (paid ideas, paid tariffs) reads this value, and the owner must never be
  // locked out of their own platform by their own formula.
  if (user.role === "OWNER") {
    await prisma.user.update({
      where: { id: userId },
      data: { rating: MAX_RATING },
    });
    return MAX_RATING;
  }

  const [followerCount, likesAgg, dislikesAgg, ideaCount] = await Promise.all([
    prisma.follow.count({ where: { authorId: userId } }),
    prisma.ideaVote.aggregate({
      where: { idea: { authorId: userId }, value: 1 },
      _sum: { value: true },
    }),
    prisma.ideaVote.aggregate({
      where: { idea: { authorId: userId }, value: -1 },
      _sum: { value: true },
    }),
    prisma.idea.count({
      where: { authorId: userId, moderationStatus: "published" },
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

  // Publishing must never lower the rating: start from a base and add a
  // capped bonus for published ideas, then apply engagement on top.
  const ideaBonus = Math.min(
    ideaCount * Number(config.ideaWeight),
    Number(config.ideaBonusCap)
  );

  const raw =
    Number(config.baseRating) +
    ideaBonus +
    // Manual admin adjustment. Lives in its own column because writing it into
    // `rating` meant the next publish/vote/follow recalculated it away.
    Number(user.ratingBonus) +
    followerCount * Number(config.subscriberWeight) +
    likes * Number(config.likeWeight) -
    dislikes * Number(config.dislikeWeight) -
    inactivityDays * Number(config.inactivityPenalty);

  const rating = Math.min(MAX_RATING, Math.max(MIN_RATING, raw));
  const rounded = Math.round(rating * 100) / 100;

  await prisma.user.update({
    where: { id: userId },
    data: { rating: rounded },
  });

  return rounded;
}

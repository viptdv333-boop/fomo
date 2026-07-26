/**
 * Recomputes every author's rating with the current formula.
 *
 * Needed after adding RatingConfig.baseRating / ideaWeight: existing users
 * still hold values produced by the old formula (which had no base term and
 * collapsed active authors to the 1.0 floor).
 *
 * Usage on the VPS:
 *   DRY_RUN=1 npx tsx prisma/recalculate-all-ratings.ts   # preview
 *   DRY_RUN=0 npx tsx prisma/recalculate-all-ratings.ts   # apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const DRY_RUN = process.env.DRY_RUN !== "0";
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}\n`);

  const config = await prisma.ratingConfig.findUnique({ where: { id: "singleton" } });
  if (!config) throw new Error("RatingConfig not found — run the migration first");

  console.log("Config:");
  console.log(`  base=${config.baseRating} idea=${config.ideaWeight} cap=${config.ideaBonusCap}`);
  console.log(`  sub=${config.subscriberWeight} like=${config.likeWeight} dislike=${config.dislikeWeight}`);
  console.log(`  inactivity=${config.inactivityPenalty}/day after ${config.inactivityThresholdDays}d\n`);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      rating: true,
      lastPublishedAt: true,
      role: true,
      ratingBonus: true,
    },
    orderBy: { displayName: "asc" },
  });

  let changed = 0;
  for (const u of users) {
    // The owner is pinned to the maximum — see src/lib/rating.ts.
    if (u.role === "OWNER") {
      const prev = Number(u.rating);
      if (prev !== 10) {
        changed++;
        console.log(`  ${u.displayName.padEnd(24)} ${String(prev).padStart(6)} ->     10   (OWNER)`);
        if (!DRY_RUN) {
          await prisma.user.update({ where: { id: u.id }, data: { rating: 10 } });
        }
      }
      continue;
    }

    const [followerCount, likesAgg, dislikesAgg, ideaCount] = await Promise.all([
      prisma.follow.count({ where: { authorId: u.id } }),
      prisma.ideaVote.aggregate({
        where: { idea: { authorId: u.id }, value: 1 },
        _sum: { value: true },
      }),
      prisma.ideaVote.aggregate({
        where: { idea: { authorId: u.id }, value: -1 },
        _sum: { value: true },
      }),
      prisma.idea.count({ where: { authorId: u.id, moderationStatus: "published" } }),
    ]);

    const likes = likesAgg._sum.value ?? 0;
    const dislikes = Math.abs(dislikesAgg._sum.value ?? 0);

    let inactivityDays = 0;
    if (u.lastPublishedAt) {
      const days = Math.floor((Date.now() - u.lastPublishedAt.getTime()) / 86_400_000);
      inactivityDays = Math.max(0, days - config.inactivityThresholdDays);
    }

    const ideaBonus = Math.min(
      ideaCount * Number(config.ideaWeight),
      Number(config.ideaBonusCap)
    );

    const raw =
      Number(config.baseRating) +
      ideaBonus +
      followerCount * Number(config.subscriberWeight) +
      likes * Number(config.likeWeight) -
      dislikes * Number(config.dislikeWeight) -
      inactivityDays * Number(config.inactivityPenalty);

    const next = Math.round(Math.min(10, Math.max(1, raw)) * 100) / 100;
    const prev = Number(u.rating);

    if (next !== prev) {
      changed++;
      console.log(
        `  ${u.displayName.padEnd(24)} ${String(prev).padStart(6)} -> ${String(next).padStart(6)}` +
          `   (идей ${ideaCount}, подписчиков ${followerCount}, +${likes}/-${dislikes})`
      );
      if (!DRY_RUN) {
        await prisma.user.update({ where: { id: u.id }, data: { rating: next } });
      }
    }
  }

  console.log(`\nUsers: ${users.length}, changed: ${changed}`);
  if (DRY_RUN) console.log("DRY RUN — nothing written. Re-run with DRY_RUN=0 to apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

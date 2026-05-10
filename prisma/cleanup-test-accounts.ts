/**
 * Removes seeded test accounts (@pulse.local) and all their cascading data.
 *
 * Real accounts are kept. All User foreign keys in the schema are
 * onDelete: Cascade, so deleting the user cleans ideas, votes, comments,
 * subscriptions, follows, payments, messages, watchlists, etc.
 *
 * Usage on the VPS:
 *   DRY_RUN=1 npx tsx prisma/cleanup-test-accounts.ts   # preview only
 *   DRY_RUN=0 npx tsx prisma/cleanup-test-accounts.ts   # actually delete
 *
 * Override the email pattern with TEST_DOMAIN (e.g. TEST_DOMAIN=@example.com).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const TEST_DOMAIN = process.env.TEST_DOMAIN || "@pulse.local";
  const DRY_RUN = process.env.DRY_RUN !== "0";

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "DELETE"}`);
  console.log(`Filter: email ENDS WITH "${TEST_DOMAIN}"`);
  console.log();

  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: TEST_DOMAIN } },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      _count: {
        select: {
          ideas: true,
          ideaComments: true,
          votes: true,
        },
      },
    },
    orderBy: { email: "asc" },
  });

  if (testUsers.length === 0) {
    console.log("No matching users found.");
    return;
  }

  console.log(`Found ${testUsers.length} matching account(s):\n`);
  for (const u of testUsers) {
    console.log(
      `  - ${u.email.padEnd(36)} ${u.displayName.padEnd(24)} role=${u.role} status=${u.status}` +
        `  ideas=${u._count.ideas} comments=${u._count.ideaComments} votes=${u._count.votes}`
    );
  }
  console.log();

  // Show real users that will be kept, for a sanity check
  const keptCount = await prisma.user.count({
    where: { email: { not: { endsWith: TEST_DOMAIN } } },
  });
  console.log(`Real accounts to keep (NOT deleted): ${keptCount}`);
  console.log();

  if (DRY_RUN) {
    console.log("DRY RUN — nothing was deleted.");
    console.log("Re-run with DRY_RUN=0 to actually remove these accounts.");
    return;
  }

  const ids = testUsers.map((u) => u.id);
  const result = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${result.count} account(s) (cascading rows removed automatically).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

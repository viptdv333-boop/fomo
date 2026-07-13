/**
 * Renames each Instrument to the short Russian asset name from its
 * linked Asset. Instruments without an Asset link are printed and
 * skipped so they can be handled manually.
 *
 * Usage on the VPS:
 *   DRY_RUN=1 npx tsx prisma/rename-instruments-to-assets.ts   # preview
 *   DRY_RUN=0 npx tsx prisma/rename-instruments-to-assets.ts   # apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const DRY_RUN = process.env.DRY_RUN !== "0";
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}\n`);

  const instruments = await prisma.instrument.findMany({
    select: {
      id: true,
      name: true,
      ticker: true,
      slug: true,
      assetId: true,
      asset: { select: { name: true } },
    },
    orderBy: [{ categoryId: "asc" }, { name: "asc" }],
  });

  const linked = instruments.filter((i) => i.asset);
  const orphans = instruments.filter((i) => !i.asset);

  console.log(`Total instruments: ${instruments.length}`);
  console.log(`  linked to Asset: ${linked.length}`);
  console.log(`  without Asset link (will be skipped): ${orphans.length}\n`);

  if (orphans.length > 0) {
    console.log("=== Skipped (no Asset link) ===");
    for (const o of orphans) {
      console.log(
        `  ${(o.ticker ?? "-").padEnd(10)} ${o.name.padEnd(45)}  slug=${o.slug}`
      );
    }
    console.log();
  }

  console.log("=== Renames ===");
  let renameCount = 0;
  let skipCount = 0;
  const changes: { id: string; from: string; to: string }[] = [];
  for (const i of linked) {
    const newName = i.asset!.name;
    if (newName === i.name) {
      skipCount++;
      continue;
    }
    renameCount++;
    changes.push({ id: i.id, from: i.name, to: newName });
    console.log(
      `  ${(i.ticker ?? "-").padEnd(10)} "${i.name}"  ->  "${newName}"`
    );
  }
  console.log();
  console.log(`Would rename: ${renameCount}`);
  console.log(`Already correct: ${skipCount}\n`);

  if (DRY_RUN) {
    console.log("DRY RUN — no changes applied. Re-run with DRY_RUN=0 to apply.");
    return;
  }

  if (changes.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  await prisma.$transaction(
    changes.map((c) =>
      prisma.instrument.update({
        where: { id: c.id },
        data: { name: c.to },
      })
    )
  );
  console.log(`Applied ${changes.length} rename(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

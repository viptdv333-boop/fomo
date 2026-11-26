// Explicit one-author maintenance. Dry-run by default; never purge other authors' archives.
import { prisma } from "../src/lib/prisma";
import { deleteIdeaRecords } from "../src/lib/idea-delete";
import { removeDeletedIdeaUploads } from "../src/lib/upload-cleanup";

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const authorId = value("--author");
  if (!authorId || !/^[A-Za-z0-9_-]+$/.test(authorId)) throw new Error("--author is required");
  const where = { authorId, moderationStatus: "archived" };
  const count = await prisma.idea.count({ where });
  const published = await prisma.idea.count({ where: { authorId, moderationStatus: "published" } });
  console.log(JSON.stringify({ archived: count, published, apply: args.includes("--apply") }));
  if (!args.includes("--apply")) return;
  const expected = Number(value("--expected"));
  if (!Number.isInteger(expected) || expected !== count) throw new Error("Expected count differs; inspect again");
  const removed = await prisma.$transaction(async tx => {
    const rows = await deleteIdeaRecords(tx, where);
    if (rows.length !== expected) throw new Error("Archive changed; rolled back");
    return rows;
  });
  await removeDeletedIdeaUploads(removed);
  console.log(JSON.stringify({ deleted: removed.length, archivedRemaining: await prisma.idea.count({ where }), publishedRemaining: await prisma.idea.count({ where: { authorId, moderationStatus: "published" } }) }));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

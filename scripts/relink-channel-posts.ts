/**
 * Attaches posts that lost their channel (tariffId NULL after the channel was deleted) back to a channel, chosen by title prefix.
 * DRY RUN by default; `--apply` writes (one updateMany by the listed ids, nothing else is touched, nothing is deleted).
 *
 *   cd /opt/fomo && npx tsx scripts/relink-channel-posts.ts --channel "Торговые сигналы: Месяц" --title-prefix "Видеоурок" [--apply]
 *
 * Only posts of the channel's own author with tariffId NULL are considered.
 */
import { existsSync } from "fs";

if (existsSync(".env") && typeof (process as any).loadEnvFile === "function") (process as any).loadEnvFile(".env");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const channelName = arg("channel");
  const prefix = arg("title-prefix");
  if (!channelName || !prefix) return void console.log('usage: --channel "<name>" --title-prefix "<prefix>" [--apply]');
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const ch = await p.subscriptionTariff.findFirst({ where: { name: channelName }, select: { id: true, authorId: true, name: true } });
    if (!ch) return void console.log("channel not found");
    const posts = await p.idea.findMany({
      where: { authorId: ch.authorId, tariffId: null, title: { startsWith: prefix, mode: "insensitive" } },
      select: { id: true, title: true, isPaid: true, isPinned: true, moderationStatus: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log("MODE:", apply ? "APPLY" : "DRY RUN", "| channel:", ch.name, "| posts to attach:", posts.length);
    for (const x of posts) console.log("  ", x.createdAt.toISOString().slice(0, 10), "|", (x.title || "").slice(0, 40), "| paid", x.isPaid, "| pinned", x.isPinned, "|", x.moderationStatus);
    if (!apply) return void console.log("DRY RUN done. Re-run with --apply to write.");
    const res = await p.idea.updateMany({ where: { id: { in: posts.map((x) => x.id) }, tariffId: null }, data: { tariffId: ch.id } });
    console.log("ATTACHED:", res.count);
  } finally {
    await p.$disconnect();
  }
}
main().catch((e) => console.log("relink error:", e instanceof Error ? e.message.slice(0, 300) : String(e)));

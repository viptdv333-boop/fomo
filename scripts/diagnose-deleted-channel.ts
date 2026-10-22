/**
 * READ-ONLY diagnosis after a channel (SubscriptionTariff row) was deleted by mistake: what is left of it?
 * A deleted tariff leaves its subscriptions and posts with tariffId = NULL (onDelete: SetNull) and its chat room orphaned.
 * Run on the server:  cd /opt/fomo && npx tsx scripts/diagnose-deleted-channel.ts
 * Prints counts and ids only (no secrets, no personal data beyond ids).
 */
import { existsSync } from "fs";

if (existsSync(".env") && typeof (process as any).loadEnvFile === "function") (process as any).loadEnvFile(".env");

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    const tariffs = await p.subscriptionTariff.findMany({
      select: { id: true, name: true, authorId: true, price: true, durationDays: true, isActive: true, slug: true, channelRoomId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log("TARIFFS NOW:", tariffs.length);
    for (const t of tariffs) console.log(" -", t.id, "|", t.name, "|", String(t.price), "RUB /", t.durationDays, "d | active", t.isActive, "| room", t.channelRoomId ?? "none", "| author", t.authorId);

    const legacy = await p.subscription.findMany({
      where: { tariffId: null },
      select: { id: true, authorId: true, monthlyPrice: true, durationDays: true, status: true, endDate: true },
    });
    const now = Date.now();
    const groups = new Map<string, { n: number; active: number }>();
    for (const s of legacy) {
      const k = `${s.authorId} | ${String(s.monthlyPrice)} RUB | ${s.durationDays ?? "?"} d`;
      const g = groups.get(k) || { n: 0, active: 0 };
      g.n++;
      if (s.status === "active" && s.endDate.getTime() > now) g.active++;
      groups.set(k, g);
    }
    console.log("SUBSCRIPTIONS WITHOUT A CHANNEL (tariffId NULL):", legacy.length);
    for (const [k, g] of groups) console.log(" -", k, "| total", g.n, "| active", g.active);

    const ideas = await p.idea.groupBy({ by: ["authorId"], where: { tariffId: null, isPaid: true }, _count: { _all: true } });
    console.log("PAID POSTS WITHOUT A CHANNEL:", ideas.map((i) => `${i.authorId}: ${i._count._all}`).join(" ; ") || "none");

    const rooms = await p.chatRoom.findMany({
      where: { name: { contains: "Чат", mode: "insensitive" } },
      select: { id: true, name: true, createdAt: true, _count: { select: { messages: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const used = new Set(tariffs.map((t) => t.channelRoomId).filter(Boolean));
    console.log("CHAT ROOMS «Чат…» (newest 12):");
    for (const r of rooms) console.log(" -", r.id, "|", r.name, "|", r._count.messages, "msgs |", used.has(r.id) ? "linked to a channel" : "ORPHAN (no channel)");
  } finally {
    await p.$disconnect();
  }
}
main().catch((e) => console.log("diagnose error:", e instanceof Error ? e.message.slice(0, 300) : String(e)));

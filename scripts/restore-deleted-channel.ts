/**
 * Restores a channel (SubscriptionTariff row) that was deleted by mistake with the OLD delete button, from what survived:
 * its subscriptions / posts / payment requests have tariffId = NULL (onDelete: SetNull) and its chat room is orphaned.
 * DRY RUN by default (prints exactly what would change); `--apply` writes, in ONE transaction. Idempotent: a second run finds nothing to relink.
 *
 *   cd /opt/fomo && npx tsx scripts/restore-deleted-channel.ts --template <tariffId> --room <chatRoomId> --name "Торговые сигналы: Месяц" --price 3000 --days 30 [--slug x] [--apply]
 *
 * --template : an existing channel of the SAME author; its description / payment methods / avatar / instruments are copied (the deleted row is gone:
 *              check the payment methods in the channel editor afterwards).
 * --room     : the orphaned chat room of the deleted channel (scripts/diagnose-deleted-channel.ts lists them).
 * Relinks, for the template's author: subscriptions and paid posts that have no channel (posts only if created after the room existed),
 * and payment requests without a channel for the same price. Never deletes anything. Prints ids and counts only.
 */
import { existsSync } from "fs";

if (existsSync(".env") && typeof (process as any).loadEnvFile === "function") (process as any).loadEnvFile(".env");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  let templateId = arg("template");
  let roomId = arg("room");
  const name = arg("name");
  const price = Number(arg("price"));
  const days = Number(arg("days"));
  const slug = arg("slug") || null;
  if (!templateId || !roomId || !name || !Number.isFinite(price) || price < 0 || !Number.isInteger(days) || days < 1) {
    console.log('usage: --template <tariffId> --room <chatRoomId> --name "<name>" --price <rub> --days <n> [--slug x] [--apply]');
    return;
  }
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  try {
    // "auto": the only channel that exists / the orphaned chat room (no channel) with the most messages whose name carries the channel's name prefix
    if (templateId === "auto") {
      const all = await p.subscriptionTariff.findMany({ select: { id: true } });
      if (all.length !== 1) return void console.log("--template auto needs exactly one existing channel, found", all.length);
      templateId = all[0].id;
    }
    if (roomId === "auto") {
      const t0 = await p.subscriptionTariff.findUnique({ where: { id: templateId }, select: { name: true } });
      const prefix = (t0?.name || "").split(":")[0].trim();
      const linked = new Set((await p.subscriptionTariff.findMany({ select: { channelRoomId: true } })).map((t) => t.channelRoomId).filter(Boolean) as string[]);
      const rooms = await p.chatRoom.findMany({ where: { name: { contains: prefix, mode: "insensitive" } }, select: { id: true, name: true, _count: { select: { messages: true } } } });
      const orphans = rooms.filter((r) => !linked.has(r.id)).sort((a, b) => b._count.messages - a._count.messages);
      console.log("orphan chat rooms matching '" + prefix + "':", orphans.map((r) => `${r.name} (${r._count.messages} msgs)`).join(" ; ") || "none");
      if (orphans.length === 0) return void console.log("no orphan room found");
      roomId = orphans[0].id;
    }
    const tpl = await p.subscriptionTariff.findUnique({ where: { id: templateId } });
    if (!tpl) return void console.log("template tariff not found");
    const room = await p.chatRoom.findUnique({ where: { id: roomId }, select: { id: true, name: true, createdAt: true } });
    if (!room) return void console.log("chat room not found");
    const roomTaken = await p.subscriptionTariff.findUnique({ where: { channelRoomId: roomId }, select: { id: true, name: true } });
    if (roomTaken) return void console.log("this chat room already belongs to a channel:", roomTaken.id, roomTaken.name, "- nothing to restore");
    const existing = await p.subscriptionTariff.findFirst({ where: { authorId: tpl.authorId, name }, select: { id: true } });
    const author = tpl.authorId;

    const subs = await p.subscription.findMany({ where: { tariffId: null, authorId: author }, select: { id: true, status: true, endDate: true, monthlyPrice: true } });
    const now = Date.now();
    const posts = await p.idea.findMany({
      where: { tariffId: null, authorId: author, isPaid: true, createdAt: { gte: room.createdAt } },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const postsBefore = await p.idea.count({ where: { tariffId: null, authorId: author, isPaid: true, createdAt: { lt: room.createdAt } } });
    const pays = await p.paymentRequest.findMany({ where: { tariffId: null, sellerId: author, amount: price }, select: { id: true, status: true } });

    console.log("MODE:", apply ? "APPLY" : "DRY RUN (nothing is written)");
    console.log("author:", author, "| template:", tpl.name, "| room:", room.name, "(created", room.createdAt.toISOString() + ")");
    console.log("will create channel:", JSON.stringify({ name, price, durationDays: days, isActive: true, slug, channelRoomId: roomId }), existing ? "| WARNING: a channel with this name exists already: " + existing.id : "");
    console.log("subscriptions to relink:", subs.length, "| active now:", subs.filter((s) => s.status === "active" && s.endDate.getTime() > now).length);
    console.log("paid posts to relink (created after the room):", posts.length, "| older paid posts without a channel (left alone):", postsBefore);
    for (const x of posts) console.log("   post", x.id, "|", x.createdAt.toISOString().slice(0, 10), "|", (x.title || "").slice(0, 60));
    console.log("payment requests to relink:", pays.length);
    if (!apply) return void console.log("DRY RUN done. Re-run with --apply to write.");
    if (existing) return void console.log("refusing to apply: a channel with this name already exists (remove or rename it first)");

    const res = await p.$transaction(async (tx) => {
      const created = await tx.subscriptionTariff.create({
        data: {
          authorId: author,
          name,
          description: tpl.description,
          price,
          durationDays: days,
          isActive: true,
          paymentMethods: tpl.paymentMethods,
          cardNumber: tpl.cardNumber,
          sbpQrUrl: tpl.sbpQrUrl,
          yukassaShopId: tpl.yukassaShopId,
          yukassaSecret: tpl.yukassaSecret,
          avatarUrl: tpl.avatarUrl,
          instrumentIds: tpl.instrumentIds,
          channelRoomId: roomId,
          slug,
          authorTelegramNotify: tpl.authorTelegramNotify,
        },
        select: { id: true },
      });
      const s = await tx.subscription.updateMany({ where: { id: { in: subs.map((x) => x.id) }, tariffId: null }, data: { tariffId: created.id } });
      const i = await tx.idea.updateMany({ where: { id: { in: posts.map((x) => x.id) }, tariffId: null }, data: { tariffId: created.id } });
      const pr = await tx.paymentRequest.updateMany({ where: { id: { in: pays.map((x) => x.id) }, tariffId: null }, data: { tariffId: created.id } });
      return { id: created.id, s: s.count, i: i.count, pr: pr.count };
    });
    console.log("RESTORED: channel", res.id, "| subscriptions", res.s, "| posts", res.i, "| payment requests", res.pr);
  } finally {
    await p.$disconnect();
  }
}
main().catch((e) => console.log("restore error:", e instanceof Error ? e.message.slice(0, 300) : String(e)));

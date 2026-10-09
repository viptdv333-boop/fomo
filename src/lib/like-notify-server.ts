import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { emitNotification } from "@/lib/notify-dispatch";
import { renderNotifText } from "@/lib/notif-render";
import { likeBaseLink, likeBody, likeTitle, planLikeNotification, type LikeKind } from "@/lib/like-notify";

// Server side of the «X liked your idea / comment» notifications (rules and texts: src/lib/like-notify.ts). Never throws: the vote /
// reaction routes call it after their answer is computed and must not fail or wait for it.

interface LikeInput {
  kind: LikeKind;
  /** the recipient: author of the idea / of the comment */
  ownerId: string;
  actorId: string;
  ideaId: string;
  commentId?: string;
  /** the text the body quotes: idea title / comment text */
  quote: string | null | undefined;
}

async function run(i: LikeInput) {
  if (!i.ownerId || i.ownerId === i.actorId) return; // never about your own like
  const base = likeBaseLink(i.ideaId, i.commentId);
  const rows = await prisma.notification.findMany({
    where: { userId: i.ownerId, type: i.kind, OR: [{ link: base }, { link: { startsWith: `${base}${base.includes("?") ? "&" : "?"}lk=` } }] },
    select: { id: true, link: true, isRead: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const plan = planLikeNotification(rows, base, i.actorId);
  if (plan.action === "skip") return;

  const actor = await prisma.user.findUnique({ where: { id: i.actorId }, select: { displayName: true } });
  const name = actor?.displayName?.trim() || "…";

  if (plan.action === "create") {
    await createNotification({ userId: i.ownerId, type: i.kind, title: likeTitle(i.kind, name, plan.count), body: likeBody(i.quote), link: plan.link });
    return;
  }
  // an unread row of this target exists: rewrite it (new name + count, back to the top of the bell) — no new row, no push, no e-mail
  const owner = await prisma.user.findUnique({ where: { id: i.ownerId }, select: { locale: true } });
  const r = await prisma.notification.updateMany({
    where: { id: plan.id, userId: i.ownerId, isRead: false },
    data: { title: renderNotifText(likeTitle(i.kind, name, plan.count), owner?.locale), link: plan.link, createdAt: new Date() },
  });
  if (r.count > 0) emitNotification(i.ownerId);
}

/** Fire-and-forget; resolves always. */
export function notifyLike(i: LikeInput): Promise<void> {
  return run(i).catch((e) => {
    console.error("[like-notify]", e instanceof Error ? e.message : e);
  });
}

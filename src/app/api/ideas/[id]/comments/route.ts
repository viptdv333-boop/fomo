import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification, notifyChannelSubscribers } from "@/lib/notifications";
import { imageUrlsFromAttachments, toPlainText } from "@/lib/notify-text";
import { ideaCommentLink } from "@/lib/app-unread";
import { claimClientRequest } from "@/lib/client-request";
import { familyOfTariff } from "@/lib/tariff-plans";

// Who may read / write the thread of a paid post (a channel post or a paid idea): the author, staff, a buyer, or a
// subscriber of that channel / author whose term has not ended. Used by GET and POST, so a lapsed subscriber can
// neither read nor add comments.
async function canUsePaidIdeaThread(
  idea: { authorId: string; tariffId: string | null },
  ideaId: string,
  userId: string | undefined,
  role: string | undefined
): Promise<boolean> {
  if (!userId) return false;
  if (idea.authorId === userId || role === "ADMIN" || role === "OWNER") return true;
  const [purchase, subscription] = await Promise.all([
    prisma.purchase.findUnique({ where: { userId_ideaId: { userId, ideaId } } }),
    prisma.subscription.findFirst({
      where: {
        subscriberId: userId,
        authorId: idea.authorId,
        status: "active",
        endDate: { gt: new Date() },
        ...(idea.tariffId ? { OR: [{ tariffId: { in: await familyOfTariff(prisma, idea.tariffId) } }, { tariffId: null }] } : {}),
      },
    }),
  ]);
  return !!(purchase || subscription);
}

// GET — list comments for an idea
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ideaId } = await params;

  // The comments of a paid post (a channel post or a paid idea) are part of the paid content: they are shown only to the author,
  // a buyer, a subscriber of that channel / author and the staff — the same rule as the idea itself (api/ideas/[id]).
  const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { isPaid: true, authorId: true, tariffId: true } });
  if (!idea) return NextResponse.json([]);
  if (idea.isPaid) {
    const session = await auth();
    if (!(await canUsePaidIdeaThread(idea, ideaId, session?.user?.id, (session?.user as { role?: string } | undefined)?.role))) {
      return NextResponse.json([]);
    }
  }

  const comments = await prisma.ideaComment.findMany({
    where: { ideaId, isDeleted: false },
    select: {
      id: true,
      text: true,
      fileUrl: true,
      reactions: true,
      createdAt: true,
      user: { select: { id: true, displayName: true, avatarUrl: true } },
      replyTo: {
        select: { id: true, text: true, user: { select: { displayName: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return NextResponse.json(comments);
}

// POST — add comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: ideaId } = await params;
  const { text, replyToId, fileUrl, clientId } = await request.json();

  if (!text?.trim() && !fileUrl) {
    return NextResponse.json({ error: "Text or file required" }, { status: 400 });
  }
  if (fileUrl !== undefined && fileUrl !== null && !/^\/uploads\//.test(fileUrl)) {
    return NextResponse.json({ error: "Invalid fileUrl" }, { status: 400 });
  }

  const target = await prisma.idea.findUnique({ where: { id: ideaId }, select: { isPaid: true, authorId: true, tariffId: true } });
  if (!target) return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  if (target.isPaid && !(await canUsePaidIdeaThread(target, ideaId, session.user.id, (session.user as { role?: string }).role))) {
    return NextResponse.json({ error: "Access denied", needSubscription: true }, { status: 403 });
  }

  // Offline outbox: the same clientId again (a lost reply, a retry) is answered with the first result, nothing is created or notified twice.
  const claim = await claimClientRequest(session.user.id, clientId, "idea_comment");
  if (claim.kind === "duplicate") return NextResponse.json({ duplicate: true, id: claim.resourceId });
  if (claim.kind === "busy") return NextResponse.json({ error: "Request in progress" }, { status: 409 });

  let comment;
  try {
    comment = await prisma.ideaComment.create({
      data: {
        ideaId,
        userId: session.user.id,
        text: (text || "").trim(),
        fileUrl: fileUrl || null,
        replyToId: replyToId || null,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  } catch (e) {
    await claim.release();
    throw e;
  }
  await claim.attach(comment.id);

  // Notify the idea's author and — separately, so a reply doesn't get lost in
  // a busy thread — whoever's comment this one replies to. Never notify
  // yourself: commenting on your own idea, or replying to your own comment,
  // shouldn't ping you about your own action.
  const preview = comment.text.length > 80 ? comment.text.slice(0, 80) + "…" : comment.text;
  const authorName = comment.user.displayName;
  // Full comment text for e-mail / Telegram (the bell keeps the 80-char preview). Comments are
  // readable by whoever may open the thread (paid posts: GET above is gated), and every recipient here is such a person.
  const commentText = toPlainText(comment.text);
  const full = commentText
    ? { fullText: commentText, author: authorName, images: imageUrlsFromAttachments(comment.fileUrl ? [{ url: comment.fileUrl, name: comment.fileUrl }] : []) }
    : undefined;
  const parentMayRead = async (uid: string) => {
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { role: true } });
    return canUsePaidIdeaThread(target, ideaId, uid, u?.role).catch(() => false);
  };
  const notified = new Set<string>([session.user.id]);
  // The idea page scrolls to this comment (and the unread markers of the app find it): /ideas/<id>?comment=<commentId>
  const link = ideaCommentLink(ideaId, comment.id);

  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { authorId: true, title: true, tariffId: true, tariff: { select: { name: true } } },
  });
  if (idea && !notified.has(idea.authorId)) {
    notified.add(idea.authorId);
    await createNotification({
      userId: idea.authorId,
      type: "new_comment",
      title: { key: "notif.newComment.title", vars: { name: authorName } },
      body: preview,
      link,
      full,
    });
  }

  if (replyToId) {
    const parent = await prisma.ideaComment.findUnique({
      where: { id: replyToId },
      select: { userId: true },
    });
    if (parent && !notified.has(parent.userId)) {
      notified.add(parent.userId);
      await createNotification({
        userId: parent.userId,
        type: "comment_reply",
        title: { key: "notif.commentReply.title", vars: { name: authorName } },
        body: preview,
        link,
        // In a paid thread the full text goes only to someone who may still read it (the quoted author may have lapsed).
        full: !target.isPaid || (await parentMayRead(parent.userId)) ? full : undefined,
      });
    }
  }

  // Comment under a paid-channel post — every active subscriber of the
  // channel is told, except those already pinged above and the commenter.
  if (idea?.tariffId) {
    await notifyChannelSubscribers(
      idea.tariffId,
      [...notified],
      { key: "notif.channelComment.title", vars: { name: authorName, channel: idea.tariff?.name ?? { key: "notif.fallback.channel" } } },
      preview || { key: "notif.attachment" },
      link,
      "channel_comment",
      full
    ).catch(() => {});
  }

  return NextResponse.json(comment, { status: 201 });
}

// DELETE — delete comment (author or admin)
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const commentId = request.nextUrl.searchParams.get("commentId");
  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  const comment = await prisma.ideaComment.findUnique({ where: { id: commentId } });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = (session.user as any).role === "ADMIN" || (session.user as any).role === "OWNER";
  if (comment.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.ideaComment.update({ where: { id: commentId }, data: { isDeleted: true } });
  return NextResponse.json({ ok: true });
}

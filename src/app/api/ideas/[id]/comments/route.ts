import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

// GET — list comments for an idea
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ideaId } = await params;

  const comments = await prisma.ideaComment.findMany({
    where: { ideaId, isDeleted: false },
    include: {
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
  const { text, replyToId } = await request.json();

  if (!text?.trim()) return NextResponse.json({ error: "Text required" }, { status: 400 });

  const comment = await prisma.ideaComment.create({
    data: {
      ideaId,
      userId: session.user.id,
      text: text.trim(),
      replyToId: replyToId || null,
    },
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  // Notify the idea's author and — separately, so a reply doesn't get lost in
  // a busy thread — whoever's comment this one replies to. Never notify
  // yourself: commenting on your own idea, or replying to your own comment,
  // shouldn't ping you about your own action.
  const preview = comment.text.length > 80 ? comment.text.slice(0, 80) + "…" : comment.text;
  const authorName = comment.user.displayName;
  const notified = new Set<string>([session.user.id]);

  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { authorId: true, title: true },
  });
  if (idea && !notified.has(idea.authorId)) {
    notified.add(idea.authorId);
    await createNotification({
      userId: idea.authorId,
      type: "new_comment",
      title: `${authorName} прокомментировал вашу идею`,
      body: preview,
      link: `/ideas/${ideaId}`,
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
        title: `${authorName} ответил на ваш комментарий`,
        body: preview,
        link: `/ideas/${ideaId}`,
      });
    }
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

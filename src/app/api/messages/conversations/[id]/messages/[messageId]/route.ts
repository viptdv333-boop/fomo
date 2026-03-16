import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

// PATCH: Update message (pin, delete, react)
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId, messageId } = await context.params;
  const userId = session.user.id!;

  // Verify participant
  const participant = await prisma.directConversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const message = await prisma.directMessage.findUnique({
    where: { id: messageId },
  });
  if (!message || message.conversationId !== conversationId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const body = await request.json();

  // Delete (soft delete, only sender can delete)
  if (body.action === "delete") {
    if (message.senderId !== userId) {
      return NextResponse.json({ error: "Only sender can delete" }, { status: 403 });
    }
    await prisma.directMessage.update({
      where: { id: messageId },
      data: { isDeleted: true, text: "Сообщение удалено" },
    });
    return NextResponse.json({ ok: true });
  }

  // Pin/unpin (any participant can pin)
  if (body.action === "pin") {
    await prisma.directMessage.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned },
    });
    return NextResponse.json({ ok: true, isPinned: !message.isPinned });
  }

  // React with emoji
  if (body.action === "react" && body.emoji) {
    const reactions = (message.reactions as Record<string, string[]>) || {};
    const emoji = body.emoji as string;

    if (!reactions[emoji]) reactions[emoji] = [];

    const idx = reactions[emoji].indexOf(userId);
    if (idx >= 0) {
      reactions[emoji].splice(idx, 1);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(userId);
    }

    await prisma.directMessage.update({
      where: { id: messageId },
      data: { reactions: Object.keys(reactions).length > 0 ? (reactions as any) : undefined },
    });
    return NextResponse.json({ ok: true, reactions });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

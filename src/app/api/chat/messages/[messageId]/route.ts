import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const globalForIO = globalThis as unknown as { io: any };

type RouteContext = { params: Promise<{ messageId: string }> };

// PATCH: edit or (soft) delete a chat message — sender only for both actions.
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await context.params;
  const userId = session.user.id;

  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message || message.isDeleted) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (message.userId !== userId) {
    return NextResponse.json({ error: "Only the sender can edit or delete this message" }, { status: 403 });
  }

  const body = await request.json();
  let updated;

  if (body.action === "edit") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text && !message.fileUrl) {
      return NextResponse.json({ error: "Message text required" }, { status: 400 });
    }
    updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { text, isEdited: true },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        replyTo: { select: { id: true, text: true, user: { select: { displayName: true } } } },
      },
    });
  } else if (body.action === "delete") {
    updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { isDeleted: true, text: "Сообщение удалено", fileUrl: null, fileName: null, fileType: null },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        replyTo: { select: { id: true, text: true, user: { select: { displayName: true } } } },
      },
    });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const io = globalForIO.io;
  if (io) {
    io.to(message.roomId).emit("message_updated", updated);
  }

  return NextResponse.json(updated);
}

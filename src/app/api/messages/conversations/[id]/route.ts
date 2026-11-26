import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

/** Hide a direct conversation from the current user's list without deleting the other participant's history. */
export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: conversationId } = await context.params;
  const userId = session.user.id!;
  const result = await prisma.directConversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { hiddenAt: new Date() },
  });

  if (!result.count) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

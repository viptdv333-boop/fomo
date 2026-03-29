import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ideaId, status, note } = await request.json();

  if (!ideaId || !["published", "hidden", "archived"].includes(status)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const idea = await prisma.idea.update({
    where: { id: ideaId },
    data: {
      moderationStatus: status,
      moderationNote: note || null,
    },
  });

  return NextResponse.json(idea);
}

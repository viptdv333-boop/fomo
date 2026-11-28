import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateRating } from "@/lib/rating";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (id === session.user.id) return NextResponse.json({ error: "Cannot vote for yourself" }, { status: 400 });
  const author = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!author) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await prisma.terminalUserData.create({ data: { userId: session.user.id, kind: "author_rating_vote", key: id, data: { value: 0.1 } } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "Already voted" }, { status: 409 });
    throw e;
  }
  const rating = await recalculateRating(id);
  return NextResponse.json({ rating });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

// GET — every authorId this user has muted from "Моя доска".
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.feedMute.findMany({
    where: { userId: session.user.id },
    select: { mutedAuthorId: true },
  });
  return NextResponse.json({ authorIds: rows.map((r) => r.mutedAuthorId) });
}

const bodySchema = z.object({
  authorId: z.string(),
  muted: z.boolean(),
});

// POST — mute/unmute one author for "Моя доска" (doesn't touch Follow/Subscription).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { authorId, muted } = parsed.data;
  const userId = session.user.id;

  if (muted) {
    await prisma.feedMute.upsert({
      where: { userId_mutedAuthorId: { userId, mutedAuthorId: authorId } },
      create: { userId, mutedAuthorId: authorId },
      update: {},
    });
  } else {
    await prisma.feedMute.deleteMany({ where: { userId, mutedAuthorId: authorId } });
  }

  return NextResponse.json({ ok: true, muted });
}

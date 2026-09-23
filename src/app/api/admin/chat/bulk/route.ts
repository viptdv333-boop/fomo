import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { z } from "zod/v4";

// POST — close/open (or archive) every chat room in one asset category at
// once, e.g. "Акции ММВБ" as a whole. Separate from the per-room PUT in
// src/app/api/admin/chat/route.ts, which the same admin page uses for a
// single room (or a single asset picked out of a category).
const bodySchema = z.object({
  categorySlug: z.string(),
  field: z.enum(["isClosed", "isArchived"]),
  value: z.boolean(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { categorySlug, field, value } = parsed.data;

  const assets = await prisma.asset.findMany({
    where: { category: { slug: categorySlug }, chatRoom: { isNot: null } },
    select: { chatRoom: { select: { id: true } } },
  });
  const roomIds = assets.map((a) => a.chatRoom!.id);
  if (roomIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const result = await prisma.chatRoom.updateMany({
    where: { id: { in: roomIds } },
    data: { [field]: value },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// Increments the idea's viewCount by 1. Anonymous — no auth required.
// Client debounces via sessionStorage so a refresh doesn't spam this.
export async function POST(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const updated = await prisma.idea.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });
    return NextResponse.json({ viewCount: updated.viewCount });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

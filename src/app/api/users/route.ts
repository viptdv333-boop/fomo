import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  // Public user search (for author filter, contacts, etc.)
  if (search) {
    const limit = Math.min(20, parseInt(searchParams.get("limit") ?? "10", 10));
    const users = await prisma.user.findMany({
      where: {
        status: "APPROVED",
        displayName: { contains: search, mode: "insensitive" },
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        rating: true,
      },
      take: limit,
      orderBy: { rating: "desc" },
    });
    return NextResponse.json(users);
  }

  // Admin-only full user list
  if (!isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (status && ["PENDING", "APPROVED", "BANNED"].includes(status)) {
    where.status = status;
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      displayName: true,
      fomoId: true,
      avatarUrl: true,
      role: true,
      status: true,
      rating: true,
      bannedUntil: true,
      banReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

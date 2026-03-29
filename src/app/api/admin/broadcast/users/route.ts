import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get("q") || "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const users = await prisma.user.findMany({
    where: {
      status: "APPROVED",
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { fomoId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      role: true,
      status: true,
    },
    take: 20,
    orderBy: { displayName: "asc" },
  });

  return NextResponse.json(users);
}

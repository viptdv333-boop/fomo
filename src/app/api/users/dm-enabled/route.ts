import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: {
      status: "APPROVED",
      dmEnabled: true,
      id: { not: session.user.id },
    },
    select: {
      id: true,
      displayName: true,
      fomoId: true,
      avatarUrl: true,
    },
    orderBy: { displayName: "asc" },
  });

  return NextResponse.json(users);
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.groupBy({
    by: ["role"],
    where: { status: "APPROVED" },
    _count: true,
  });

  const byRole: Record<string, number> = {};
  let total = 0;
  for (const g of users) {
    byRole[g.role] = g._count;
    total += g._count;
  }

  return NextResponse.json({ total, byRole });
}

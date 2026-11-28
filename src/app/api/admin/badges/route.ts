import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [reports, users] = await Promise.all([prisma.report.count({ where: { status: "pending" } }), prisma.user.count({ where: { status: "PENDING" } })]);
  return NextResponse.json({ reports, users }, { headers: { "Cache-Control": "no-store" } });
}

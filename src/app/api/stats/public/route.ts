import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [users, ideas, instruments] = await Promise.all([
    prisma.user.count({ where: { status: "APPROVED" } }),
    prisma.idea.count(),
    prisma.instrument.count(),
  ]);

  return NextResponse.json({ users, ideas, instruments });
}

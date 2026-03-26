import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const exchanges = await prisma.exchange.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { instruments: true } },
    },
  });

  return NextResponse.json(exchanges);
}

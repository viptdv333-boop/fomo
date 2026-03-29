import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const assets = await prisma.asset.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { ticker: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      ticker: true,
      slug: true,
      category: { select: { name: true, slug: true } },
    },
    take: Math.min(limit, 20),
    orderBy: { name: "asc" },
  });

  return NextResponse.json(assets);
}

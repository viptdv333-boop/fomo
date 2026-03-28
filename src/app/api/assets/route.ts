import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const categorySlug = request.nextUrl.searchParams.get("categorySlug");
  const search = request.nextUrl.searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (categorySlug) where.category = { slug: categorySlug };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { instruments: { some: { ticker: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const assets = await prisma.asset.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      category: { select: { id: true, name: true, slug: true } },
      instruments: {
        orderBy: { name: "asc" },
        include: {
          exchangeRel: { select: { id: true, shortName: true, slug: true, country: true } },
        },
      },
      chatRoom: { select: { id: true } },
      _count: { select: { instruments: true } },
    },
    ...(search ? { take: 20 } : {}),
  });

  return NextResponse.json(assets);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, slug, categoryId, description, sortOrder } = body;

  if (!name || !slug || !categoryId) {
    return NextResponse.json({ error: "name, slug, categoryId required" }, { status: 400 });
  }

  const asset = await prisma.asset.create({
    data: {
      name,
      slug,
      categoryId,
      description: description || null,
      sortOrder: sortOrder || 0,
      chatRoom: { create: { name } },
    },
    include: {
      category: true,
      chatRoom: { select: { id: true } },
    },
  });

  return NextResponse.json(asset, { status: 201 });
}

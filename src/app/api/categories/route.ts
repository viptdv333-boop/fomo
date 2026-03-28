import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { z } from "zod/v4";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  sortOrder: z.number().int().optional(),
});

export async function GET(request: NextRequest) {
  const withInstruments = request.nextUrl.searchParams.get("withInstruments") === "true";

  const categories = await prisma.instrumentCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      instruments: withInstruments
        ? {
            orderBy: { name: "asc" },
            include: {
              chatRoom: { select: { id: true } },
              exchangeRel: { select: { id: true, shortName: true, slug: true } },
            },
          }
        : false,
      _count: { select: { instruments: true, assets: true } },
    },
  });

  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.instrumentCategory.findFirst({
    where: { OR: [{ name: parsed.data.name }, { slug: parsed.data.slug }] },
  });
  if (existing) {
    return NextResponse.json({ error: "Category already exists" }, { status: 409 });
  }

  const category = await prisma.instrumentCategory.create({
    data: parsed.data,
  });

  return NextResponse.json(category, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await prisma.instrument.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });

  await prisma.instrumentCategory.delete({ where: { id } });

  return NextResponse.json({ message: "Deleted" });
}

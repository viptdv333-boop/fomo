import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const createInstrumentSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  categoryId: z.string().optional(),
});

export async function GET() {
  const instruments = await prisma.instrument.findMany({
    orderBy: { name: "asc" },
    include: {
      chatRoom: { select: { id: true } },
      category: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json(instruments);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createInstrumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.instrument.findFirst({
    where: {
      OR: [{ name: parsed.data.name }, { slug: parsed.data.slug }],
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Instrument with this name or slug already exists" },
      { status: 409 }
    );
  }

  const instrument = await prisma.instrument.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      categoryId: parsed.data.categoryId || null,
      chatRoom: {
        create: {
          name: parsed.data.name,
        },
      },
    },
    include: {
      chatRoom: { select: { id: true } },
      category: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json(instrument, { status: 201 });
}

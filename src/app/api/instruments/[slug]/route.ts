import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const updateInstrumentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  categoryId: z.string().nullable().optional(),
});

type RouteContext = { params: Promise<{ slug: string }> };

// Find instrument by slug or by cuid ID
async function findInstrument(slugOrId: string) {
  // Try slug first
  let instrument = await prisma.instrument.findUnique({ where: { slug: slugOrId } });
  if (!instrument) {
    // Try by ID
    instrument = await prisma.instrument.findUnique({ where: { id: slugOrId } });
  }
  return instrument;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { slug } = await params;

  const instrument = await prisma.instrument.findUnique({
    where: { slug },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      chatRoom: { select: { id: true, name: true } },
    },
  });

  if (!instrument) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(instrument);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug: slugOrId } = await context.params;
  const body = await request.json();
  const parsed = updateInstrumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const instrument = await findInstrument(slugOrId);
  if (!instrument) {
    return NextResponse.json({ error: "Instrument not found" }, { status: 404 });
  }

  // Check uniqueness if name or slug is being changed
  if (parsed.data.name || parsed.data.slug) {
    const conflicts = await prisma.instrument.findFirst({
      where: {
        id: { not: instrument.id },
        OR: [
          ...(parsed.data.name ? [{ name: parsed.data.name }] : []),
          ...(parsed.data.slug ? [{ slug: parsed.data.slug }] : []),
        ],
      },
    });
    if (conflicts) {
      return NextResponse.json(
        { error: "Name or slug already taken" },
        { status: 409 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.slug !== undefined) data.slug = parsed.data.slug;
  if (parsed.data.categoryId !== undefined) data.categoryId = parsed.data.categoryId;

  const updated = await prisma.instrument.update({
    where: { id: instrument.id },
    data,
    include: { chatRoom: { select: { id: true } } },
  });

  // Also update the chat room name if instrument name changed
  if (parsed.data.name && updated.chatRoom) {
    await prisma.chatRoom.update({
      where: { id: updated.chatRoom.id },
      data: { name: parsed.data.name },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug: slugOrId } = await context.params;

  const instrument = await findInstrument(slugOrId);
  if (!instrument) {
    return NextResponse.json({ error: "Instrument not found" }, { status: 404 });
  }

  const full = await prisma.instrument.findUnique({
    where: { id: instrument.id },
    include: { chatRoom: true },
  });

  // Delete chat room first if it exists
  if (full?.chatRoom) {
    await prisma.chatRoom.delete({ where: { id: full.chatRoom.id } });
  }

  await prisma.instrument.delete({ where: { id: instrument.id } });

  return NextResponse.json({ message: "Instrument deleted" });
}

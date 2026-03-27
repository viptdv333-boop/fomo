import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

type RouteContext = { params: Promise<{ slug: string }> };

// GET: list related instruments
export async function GET(_req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const instrument = await prisma.instrument.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: {
      relatedFrom: {
        include: { related: { select: { id: true, name: true, ticker: true, slug: true, exchangeRel: { select: { shortName: true } } } } },
      },
      relatedTo: {
        include: { instrument: { select: { id: true, name: true, ticker: true, slug: true, exchangeRel: { select: { shortName: true } } } } },
      },
    },
  });

  if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Merge both directions
  const related = [
    ...instrument.relatedFrom.map(r => r.related),
    ...instrument.relatedTo.map(r => r.instrument),
  ];

  // Dedupe
  const seen = new Set<string>();
  const unique = related.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });

  return NextResponse.json(unique);
}

// POST: add related instrument (admin only)
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await context.params;
  const { relatedId } = await request.json();
  if (!relatedId) return NextResponse.json({ error: "relatedId required" }, { status: 400 });

  const instrument = await prisma.instrument.findFirst({ where: { OR: [{ slug }, { id: slug }] } });
  if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (instrument.id === relatedId) return NextResponse.json({ error: "Cannot relate to self" }, { status: 400 });

  // Create bidirectional relation
  await prisma.instrumentRelation.createMany({
    data: [
      { instrumentId: instrument.id, relatedId },
      { instrumentId: relatedId, relatedId: instrument.id },
    ],
    skipDuplicates: true,
  });

  return NextResponse.json({ message: "Related" }, { status: 201 });
}

// DELETE: remove related instrument (admin only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await context.params;
  const { relatedId } = await request.json();

  const instrument = await prisma.instrument.findFirst({ where: { OR: [{ slug }, { id: slug }] } });
  if (!instrument) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete both directions
  await prisma.instrumentRelation.deleteMany({
    where: {
      OR: [
        { instrumentId: instrument.id, relatedId },
        { instrumentId: relatedId, relatedId: instrument.id },
      ],
    },
  });

  return NextResponse.json({ message: "Removed" });
}

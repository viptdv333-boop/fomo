import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { slug } = await params;

  // Try as Asset slug first
  let asset = await prisma.asset.findUnique({
    where: { slug },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      chatRoom: { select: { id: true } },
      instruments: {
        orderBy: { name: "asc" },
        include: {
          exchangeRel: { select: { id: true, name: true, shortName: true, slug: true, country: true } },
          chatRoom: { select: { id: true } },
        },
      },
    },
  });

  if (!asset) {
    // Try finding by instrument slug and return its parent asset
    const instrument = await prisma.instrument.findUnique({
      where: { slug },
      select: { assetId: true },
    });
    if (instrument?.assetId) {
      asset = await prisma.asset.findUnique({
        where: { id: instrument.assetId },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          chatRoom: { select: { id: true } },
          instruments: {
            orderBy: { name: "asc" },
            include: {
              exchangeRel: { select: { id: true, name: true, shortName: true, slug: true, country: true } },
              chatRoom: { select: { id: true } },
            },
          },
        },
      });
    }
  }

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(asset);
}

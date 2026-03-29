import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/watchlist?userId=xxx — get user's watchlist (public)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const items = await prisma.watchlistItem.findMany({
      where: { userId: session.user.id },
      include: { asset: { include: { category: true, instruments: { select: { tradingViewSymbol: true, ticker: true, source: true }, take: 5 } } } },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(items);
  }

  // Public watchlist for user profile
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    include: { asset: { include: { category: true, instruments: { select: { tradingViewSymbol: true, ticker: true, source: true }, take: 5 } } } },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(items);
}

// POST /api/watchlist — add asset to watchlist
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assetId } = await request.json();
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  const existing = await prisma.watchlistItem.findUnique({
    where: { userId_assetId: { userId: session.user.id, assetId } },
  });
  if (existing) return NextResponse.json({ error: "Already in watchlist" }, { status: 409 });

  const count = await prisma.watchlistItem.count({ where: { userId: session.user.id } });
  const item = await prisma.watchlistItem.create({
    data: { userId: session.user.id, assetId, sortOrder: count },
    include: { asset: true },
  });

  return NextResponse.json(item, { status: 201 });
}

// DELETE /api/watchlist?assetId=xxx — remove from watchlist
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  await prisma.watchlistItem.deleteMany({
    where: { userId: session.user.id, assetId },
  });

  return NextResponse.json({ ok: true });
}

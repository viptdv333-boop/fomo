import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tariffs = await prisma.subscriptionTariff.findMany({
      where: { isActive: true },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            rating: true,
          },
        },
        _count: {
          select: { subscriptions: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Resolve instrument names for tags
    const allInstrumentIds = [...new Set(tariffs.flatMap((t) => (t as any).instrumentIds || []))];
    const instruments = allInstrumentIds.length > 0
      ? await prisma.instrument.findMany({
          where: { id: { in: allInstrumentIds } },
          select: { id: true, name: true, ticker: true, slug: true },
        })
      : [];
    const instMap = new Map(instruments.map((i) => [i.id, i]));

    return NextResponse.json(
      tariffs.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price: Number(t.price),
        durationDays: t.durationDays,
        subscribersCount: t._count.subscriptions,
        author: t.author,
        avatarUrl: (t as any).avatarUrl || null,
        instruments: ((t as any).instrumentIds || []).map((id: string) => instMap.get(id)).filter(Boolean),
      }))
    );
  } catch {
    // SubscriptionTariff table might not exist yet
    return NextResponse.json([]);
  }
}

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
          select: {
            subscriptions: true,
            ideas: { where: { moderationStatus: "published" } },
          },
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
        slug: (t as any).slug || null,
        name: t.name,
        description: t.description,
        price: Number(t.price),
        durationDays: t.durationDays,
        subscribersCount: t._count.subscriptions,
        ideasCount: t._count.ideas,
        author: t.author,
        avatarUrl: (t as any).avatarUrl || null,
        authorTelegramNotify: (t as any).authorTelegramNotify || false,
        instruments: ((t as any).instrumentIds || []).map((id: string) => instMap.get(id)).filter(Boolean),
      }))
    );
  } catch {
    // SubscriptionTariff table might not exist yet
    return NextResponse.json([]);
  }
}

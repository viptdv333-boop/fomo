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

    return NextResponse.json(
      tariffs.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price: Number(t.price),
        durationDays: t.durationDays,
        subscribersCount: t._count.subscriptions,
        author: t.author,
      }))
    );
  } catch {
    // SubscriptionTariff table might not exist yet
    return NextResponse.json([]);
  }
}

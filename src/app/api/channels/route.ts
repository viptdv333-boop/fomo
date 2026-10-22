import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeSubWhere } from "@/lib/subscription-expire";
import { CHANNEL_ROWS, defaultPlan, planViews, subscribersByRoot } from "@/lib/tariff-plans";

export async function GET() {
  try {
    const tariffs = await prisma.subscriptionTariff.findMany({
      // Channels only: plans (parentId) are options of a channel, never catalog entries. The channel row's isActive is the
      // channel's visibility switch («Скрыть канал»): a hidden channel sells no plan at all.
      where: { ...CHANNEL_ROWS, isActive: true },
      include: {
        plans: { select: { id: true, name: true, parentId: true, price: true, durationDays: true, isActive: true } },
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
            ideas: { where: { moderationStatus: "published" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Members of the whole family (the channel's own subscription row + its plans'), one person counted once;
    // only active, not past endDate (expired rows wait for the sweep).
    const rootOfTariff = new Map<string, string>();
    for (const t of tariffs) {
      rootOfTariff.set(t.id, t.id);
      for (const p of t.plans) rootOfTariff.set(p.id, t.id);
    }
    const activeSubs = await prisma.subscription.findMany({
      where: { ...activeSubWhere(), tariffId: { in: [...rootOfTariff.keys()] } },
      select: { tariffId: true, subscriberId: true },
    });
    const memberCount = subscribersByRoot(activeSubs, rootOfTariff);

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
      tariffs.map((t) => {
        // price / durationDays stay for old clients: the default (cheapest) plan; `plans` lists every plan on sale.
        const plans = planViews(t, t.plans);
        const def = defaultPlan(plans);
        return {
        id: t.id,
        slug: (t as any).slug || null,
        name: t.name,
        description: t.description,
        price: def ? def.price : Number(t.price),
        durationDays: def ? def.durationDays : t.durationDays,
        plans,
        subscribersCount: memberCount.get(t.id) ?? 0,
        ideasCount: t._count.ideas,
        author: t.author,
        avatarUrl: (t as any).avatarUrl || null,
        authorTelegramNotify: (t as any).authorTelegramNotify || false,
        instruments: ((t as any).instrumentIds || []).map((id: string) => instMap.get(id)).filter(Boolean),
        };
      })
    );
  } catch {
    // SubscriptionTariff table might not exist yet
    return NextResponse.json([]);
  }
}

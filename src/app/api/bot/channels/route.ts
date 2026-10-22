import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BOT_AUTHOR_ID, checkBotToken } from "@/lib/bot-auth";
import { activeSubWhere } from "@/lib/subscription-expire";
import { CHANNEL_ROWS, planViews, subscribersByRoot } from "@/lib/tariff-plans";

// Каналы автора бота — для настройки публикации в терминале (13.09.2026):
// терминал показывает этот список, Босс привязывает к каналу тикеры прогнозов и
// сигналов. Только чтение, только каналы бота-автора.
export async function GET(request: NextRequest) {
  if (!checkBotToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tariffs = await prisma.subscriptionTariff.findMany({
    // Channels only (plans are options of a channel); the bot posts into the channel
    where: { authorId: BOT_AUTHOR_ID, ...CHANNEL_ROWS },
    select: {
      id: true,
      name: true,
      isActive: true,
      price: true,
      durationDays: true,
      plans: { select: { id: true, name: true, parentId: true, price: true, durationDays: true, isActive: true } },
      _count: { select: { subscriptions: { where: activeSubWhere() } } },
    },
    orderBy: { createdAt: "asc" },
  });
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
  return NextResponse.json(
    tariffs.map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.isActive,
      price: Number(t.price),
      durationDays: t.durationDays,
      subscribersCount: memberCount.get(t.id) ?? 0,
      plans: planViews(t, t.plans),
      url: `/channels/${t.id}`,
    }))
  );
}

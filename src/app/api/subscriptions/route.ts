import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { familyOfTariff, planLabelOf } from "@/lib/tariff-plans";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get paid subscriptions
  const paidSubs = await prisma.subscription.findMany({
    where: {
      subscriberId: session.user.id,
      status: "active",
      endDate: { gt: new Date() },
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true, rating: true },
      },
      // "Моя доска" pins channels (not their old author-wide subscription,
      // tariffId null) as their own entities — needs the tariff's own name
      // and picture, not just the author's.
      tariff: {
        select: {
          id: true, name: true, avatarUrl: true, slug: true, parentId: true, planName: true, archivedAt: true,
          // A subscription may sit on a PLAN of the channel: the channel itself is the plan's parent (tariff-plans.ts)
          parent: { select: { id: true, name: true, avatarUrl: true, slug: true, archivedAt: true } },
        },
      },
    },
    orderBy: { endDate: "asc" },
  });

  // Get free follows
  const follows = await prisma.follow.findMany({
    where: {
      followerId: session.user.id,
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true, rating: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // One entry per CHANNEL: legacy duplicates (a row per plan) collapse to the one that ends last (it is the sorted-asc tail),
  // closed channels disappear.
  const channelOf = (s: (typeof paidSubs)[number]) => (s.tariff ? s.tariff.parent ?? s.tariff : null);
  const lastByChannel = new Map<string, string>();
  for (const s of paidSubs) {
    const ch = channelOf(s);
    if (ch) lastByChannel.set(ch.id, s.id);
  }
  const visibleSubs = paidSubs.filter((s) => {
    const ch = channelOf(s);
    if (!ch) return true;
    return !ch.archivedAt && lastByChannel.get(ch.id) === s.id;
  });

  // Combine: paid subs keep their format, follows get mapped to a similar shape
  const result = [
    ...visibleSubs.map((s) => ({
      id: s.id,
      type: "paid" as const,
      // канал подписки (13.09.2026, у плана — его канал); null — старая подписка на автора целиком
      tariffId: channelOf(s)?.id ?? s.tariffId,
      // the plan actually paid (22.10.2026): its row id and name
      planId: s.tariffId,
      planName: s.tariff ? planLabelOf(s.tariff) : null,
      channel: channelOf(s) ? { id: channelOf(s)!.id, name: channelOf(s)!.name, avatarUrl: channelOf(s)!.avatarUrl, slug: channelOf(s)!.slug } : null,
      telegramNotify: s.telegramNotify,
      monthlyPrice: s.monthlyPrice,
      startDate: s.startDate,
      endDate: s.endDate,
      author: s.author,
    })),
    ...follows.map((f) => ({
      id: f.id,
      type: "free" as const,
      tariffId: null,
      channel: null,
      telegramNotify: false,
      monthlyPrice: 0,
      startDate: f.createdAt,
      endDate: null,
      author: f.author,
    })),
  ];

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-cache, must-revalidate" } });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Subscription id required" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id },
  });

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  if (subscription.subscriberId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.subscription.update({
    where: { id },
    data: { status: "cancelled", endDate: new Date() },
  });
  // Old data may hold a second row for another plan of the same channel: leaving the channel cancels them all.
  if (subscription.tariffId) {
    const family = await familyOfTariff(prisma, subscription.tariffId);
    await prisma.subscription.updateMany({
      where: { subscriberId: subscription.subscriberId, authorId: subscription.authorId, tariffId: { in: family }, status: "active" },
      data: { status: "cancelled", endDate: new Date(), telegramNotify: false },
    });
  }

  return NextResponse.json({ success: true });
}

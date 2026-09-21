import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { grantSubscription } from "@/lib/subscriptions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { tariffId },
    include: {
      subscriber: {
        select: { id: true, displayName: true, avatarUrl: true, fomoId: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  const now = new Date();

  return NextResponse.json(
    subscriptions.map((s) => ({
      id: s.id,
      subscriberId: s.subscriber.id,
      displayName: s.subscriber.displayName,
      avatarUrl: s.subscriber.avatarUrl,
      fomoId: s.subscriber.fomoId,
      monthlyPrice: Number(s.monthlyPrice),
      status: s.status,
      isActive: s.status === "active" && s.endDate > now,
      startDate: s.startDate,
      endDate: s.endDate,
    }))
  );
}

// POST — owner grants extra days: to one subscription (subscriptionId) or to
// every currently-active subscriber of the channel. Extends from the current
// end date when still active; an expired/cancelled subscription that the
// owner explicitly picks is reactivated from now. "All" never resurrects
// people who left or lapsed.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const days = Number(body?.days);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return NextResponse.json({ error: "Укажите число дней от 1 до 3650" }, { status: 400 });
  }
  const subscriptionId: string | undefined = typeof body?.subscriptionId === "string" ? body.subscriptionId : undefined;
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  // Owner adds a site user to the channel without payment. Extends an existing
  // active term, or (re)activates from now.
  if (typeof body?.userId === "string") {
    if (body.userId === id) {
      return NextResponse.json({ error: "Автор уже имеет доступ к своему каналу" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== "APPROVED") {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    const existing = await prisma.subscription.findFirst({
      where: { subscriberId: user.id, authorId: id, tariffId },
      orderBy: { endDate: "desc" },
    });
    const base = existing && existing.status === "active" && existing.endDate > now ? existing.endDate : now;
    await grantSubscription({
      subscriberId: user.id,
      authorId: id,
      tariffId,
      monthlyPrice: 0,
      endDate: new Date(base.getTime() + days * DAY),
      durationDays: days,
    });
    await createNotification({
      userId: user.id,
      type: "subscription_extended",
      title: `Вас добавили в канал «${tariff.name}» на ${days} дн.`,
      body: tariff.name,
      link: `/channels/${tariff.slug || tariff.id}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, added: user.id, days });
  }

  const targets = await prisma.subscription.findMany({
    where: subscriptionId
      ? { id: subscriptionId, tariffId }
      : { tariffId, status: "active", endDate: { gt: now } },
    select: { id: true, subscriberId: true, status: true, endDate: true },
  });
  if (targets.length === 0) {
    return NextResponse.json({ error: "Подписчики не найдены" }, { status: 404 });
  }

  await Promise.all(
    targets.map((s) => {
      const stillActive = s.status === "active" && s.endDate > now;
      const base = stillActive ? s.endDate : now;
      return prisma.subscription.update({
        where: { id: s.id },
        data: { status: "active", endDate: new Date(base.getTime() + days * DAY) },
      });
    })
  );

  await Promise.all(
    targets.map((s) =>
      createNotification({
        userId: s.subscriberId,
        type: "subscription_extended",
        title: `Автор продлил вашу подписку на ${days} дн.`,
        body: tariff.name,
        link: `/channels/${tariff.slug || tariff.id}`,
      }).catch(() => {})
    )
  );

  return NextResponse.json({ ok: true, updated: targets.length, days });
}

// DELETE — owner removes a subscriber from the channel: the subscription is
// cancelled and its term cut to now, which closes access to paid ideas and
// (via canAccessRoom) the channel chat immediately. No money is returned —
// refunds are handled outside the platform.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { subscriptionId } = await request.json().catch(() => ({}));
  if (typeof subscriptionId !== "string") {
    return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });
  }

  const sub = await prisma.subscription.findFirst({
    where: { id: subscriptionId, tariffId },
    select: { id: true, subscriberId: true },
  });
  if (!sub) return NextResponse.json({ error: "Подписчик не найден" }, { status: 404 });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "cancelled", endDate: new Date(), telegramNotify: false },
  });

  await createNotification({
    userId: sub.subscriberId,
    type: "subscription_removed",
    title: "Автор закрыл вам доступ к каналу",
    body: tariff.name,
    link: `/channels/${tariff.slug || tariff.id}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

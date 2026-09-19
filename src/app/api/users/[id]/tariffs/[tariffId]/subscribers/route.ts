import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

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
  const targets = await prisma.subscription.findMany({
    where: subscriptionId
      ? { id: subscriptionId, tariffId }
      : { tariffId, status: "active", endDate: { gt: now } },
    select: { id: true, subscriberId: true, status: true, endDate: true },
  });
  if (targets.length === 0) {
    return NextResponse.json({ error: "Подписчики не найдены" }, { status: 404 });
  }

  const DAY = 24 * 60 * 60 * 1000;
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

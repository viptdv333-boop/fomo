import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { grantSubscription } from "@/lib/subscriptions";
import { getT } from "@/lib/i18n/server";
import { isAdmin } from "@/lib/roles";
import { isActiveTerm } from "@/lib/subscription-renew";
import { rootIdOf, tariffFamily, planLabelOf } from "@/lib/tariff-plans";

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
  // Names and links in notifications are the channel's (the plan's parent), whichever row the panel was opened on.
  const channel = tariff.parentId ? (await prisma.subscriptionTariff.findUnique({ where: { id: tariff.parentId } })) ?? tariff : tariff;

  // The panel of a channel lists the members of the whole family (the channel's own plan + all its plans), each with the plan
  // they are on; a person who ended up with two rows (old data) is listed once, by the row that ends last.
  const family = await tariffFamily(prisma, rootIdOf(tariff));
  const subscriptions = await prisma.subscription.findMany({
    where: { tariffId: { in: family } },
    include: {
      subscriber: {
        select: { id: true, displayName: true, avatarUrl: true, fomoId: true },
      },
      tariff: { select: { name: true, parentId: true, planName: true } },
    },
    orderBy: { startDate: "desc" },
  });
  const bestBySubscriber = new Map<string, (typeof subscriptions)[number]>();
  for (const s of subscriptions) {
    const prev = bestBySubscriber.get(s.subscriberId);
    if (!prev || s.endDate > prev.endDate) bestBySubscriber.set(s.subscriberId, s);
  }
  const rows = subscriptions.filter((s) => bestBySubscriber.get(s.subscriberId)?.id === s.id);

  const now = new Date();

  return NextResponse.json(
    rows.map((s) => ({
      id: s.id,
      planId: s.tariffId,
      planName: s.tariff ? planLabelOf(s.tariff) : null,
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
  // Names and links in notifications are the channel's (the plan's parent), whichever row the panel was opened on.
  const channel = tariff.parentId ? (await prisma.subscriptionTariff.findUnique({ where: { id: tariff.parentId } })) ?? tariff : tariff;

  const rootId = rootIdOf(tariff);
  const family = await tariffFamily(prisma, rootId);
  const body = await request.json().catch(() => ({}));
  const { t } = await getT();
  const days = Number(body?.days);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return NextResponse.json({ error: t("notif.err.daysRange") }, { status: 400 });
  }
  const subscriptionId: string | undefined = typeof body?.subscriptionId === "string" ? body.subscriptionId : undefined;
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  // Owner adds a site user to the channel without payment. Extends an existing
  // active term, or (re)activates from now.
  if (typeof body?.userId === "string") {
    if (body.userId === id) {
      return NextResponse.json({ error: t("notif.err.authorHasAccess") }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== "APPROVED") {
      return NextResponse.json({ error: t("notif.err.userNotFound") }, { status: 404 });
    }
    const existing = await prisma.subscription.findFirst({
      where: { subscriberId: user.id, authorId: id, tariffId: { in: family } },
      orderBy: { endDate: "desc" },
    });
    const base = existing && existing.status === "active" && existing.endDate > now ? existing.endDate : now;
    await grantSubscription({
      subscriberId: user.id,
      authorId: id,
      // a free grant joins the channel: an existing subscriber keeps their plan (grantSubscription re-uses the row), a new one gets the channel's own row
      tariffId: existing?.tariffId ?? rootId,
      monthlyPrice: 0,
      endDate: new Date(base.getTime() + days * DAY),
      durationDays: days,
    });
    await createNotification({
      userId: user.id,
      type: "subscription_extended",
      title: { key: "notif.subscription.added.title", vars: { channel: channel.name, days } },
      body: channel.name,
      link: `/channels/${channel.slug || channel.id}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, added: user.id, days });
  }

  const targets = await prisma.subscription.findMany({
    where: subscriptionId
      ? { id: subscriptionId, tariffId: { in: family } }
      : { tariffId: { in: family }, status: "active", endDate: { gt: now } },
    select: { id: true, subscriberId: true, status: true, endDate: true },
  });
  if (targets.length === 0) {
    return NextResponse.json({ error: t("notif.err.subscribersNotFound") }, { status: 404 });
  }

  await Promise.all(
    targets.map((s) => {
      const stillActive = s.status === "active" && s.endDate > now;
      const base = stillActive ? s.endDate : now;
      // updateMany: a row the expiry sweep deleted a moment ago is skipped instead of failing the whole request
      return prisma.subscription.updateMany({
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
        title: { key: "notif.subscription.extended.title", vars: { days } },
        body: channel.name,
        link: `/channels/${channel.slug || channel.id}`,
      }).catch(() => {})
    )
  );

  return NextResponse.json({ ok: true, updated: targets.length, days });
}

// DELETE — owner (or an admin) removes a subscriber from the channel.
//  - an ACTIVE subscription is cancelled and its term cut to now, which closes access to paid ideas and (via
//    canAccessRoom) the channel chat immediately. No money is returned — refunds are handled outside the platform.
//  - an expired / cancelled row (status "expired" set by server/subscription-expire-sweep.ts, or a lapsed one) is deleted
//    for good: it only sits in the owner's «Истекшие» section. Payments live in PaymentRequest, so income is unaffected.
//  - { allExpired: true } clears the whole «Истекшие» section of this channel at once.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tariffId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tariffId } = await params;
  if (session.user.id !== id && !isAdmin(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tariff = await prisma.subscriptionTariff.findUnique({ where: { id: tariffId } });
  if (!tariff || tariff.authorId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Names and links in notifications are the channel's (the plan's parent), whichever row the panel was opened on.
  const channel = tariff.parentId ? (await prisma.subscriptionTariff.findUnique({ where: { id: tariff.parentId } })) ?? tariff : tariff;

  const family = await tariffFamily(prisma, rootIdOf(tariff));
  const body = await request.json().catch(() => ({}));
  const now = new Date();

  if (body?.allExpired === true) {
    const res = await prisma.subscription.deleteMany({
      where: { tariffId: { in: family }, OR: [{ status: { not: "active" } }, { endDate: { lte: now } }] },
    });
    return NextResponse.json({ ok: true, deleted: res.count });
  }

  const subscriptionId = body?.subscriptionId;
  if (typeof subscriptionId !== "string") {
    return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });
  }

  const sub = await prisma.subscription.findFirst({
    where: { id: subscriptionId, tariffId: { in: family } },
    select: { id: true, subscriberId: true, status: true, endDate: true },
  });
  if (!sub) {
    const { t } = await getT();
    return NextResponse.json({ error: t("notif.err.subscriberNotFound") }, { status: 404 });
  }

  if (!isActiveTerm(sub, now)) {
    await prisma.subscription.deleteMany({ where: { id: sub.id } });
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "cancelled", endDate: now, telegramNotify: false },
  });

  await createNotification({
    userId: sub.subscriberId,
    type: "subscription_removed",
    title: { key: "notif.subscription.removed.title" },
    body: channel.name,
    link: `/channels/${channel.slug || channel.id}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

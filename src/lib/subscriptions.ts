import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { extendedEnd, isRenewal } from "@/lib/subscription-renew";

// Подписка — на КАНАЛ (тариф), а не на автора целиком (13.09.2026).
// Раньше Subscription был уникален по паре (subscriberId, authorId): у автора с
// тремя каналами читатель мог держать только одну подписку, и она открывала всё
// платное автора сразу. Уникальность снята (см. миграцию channel_ideas), поэтому
// upsert по составному ключу больше невозможен — поиск и выдача идут здесь.
//
// tariffId = null — старая подписка «на автора» (legacy monthly без тарифа): она
// по-прежнему открывает все платные материалы автора.

export async function findActiveSubscription(
  subscriberId: string,
  authorId: string,
  tariffId: string | null
) {
  return prisma.subscription.findFirst({
    where: {
      subscriberId,
      authorId,
      tariffId,
      status: "active",
      endDate: { gt: new Date() },
    },
  });
}

export async function grantSubscription(args: {
  subscriberId: string;
  authorId: string;
  tariffId: string | null;
  monthlyPrice: Prisma.Decimal | number | string;
  endDate: Date;
  durationDays: number;
}) {
  const { subscriberId, authorId, tariffId, monthlyPrice, endDate, durationDays } = args;
  const existing = await prisma.subscription.findFirst({
    where: { subscriberId, authorId, tariffId },
    orderBy: { endDate: "desc" },
  });
  if (existing) {
    return prisma.subscription.update({
      where: { id: existing.id },
      data: { status: "active", startDate: new Date(), endDate, monthlyPrice, durationDays },
    });
  }
  return prisma.subscription.create({
    data: { subscriberId, authorId, tariffId, monthlyPrice, endDate, durationDays },
  });
}

/**
 * A paid period for a channel (a confirmed payment): EXTENDS the current term instead of replacing it.
 * end = max(now, currentEnd) + durationDays while the subscription is active (renewal in advance keeps every remaining day);
 * a cancelled / expired one restarts from now. One row per (subscriber, author, tariff) - a renewal updates it, never adds a
 * second row (the subscriber counters and the access checks stay as they were). The update is compare-and-set on the
 * previous endDate, so two payments confirmed at the same moment both land (the second retries on the fresh end date).
 * The price is the tariff's CURRENT one (the caller passes the confirmed payment's amount).
 */
export async function extendSubscription(args: {
  subscriberId: string;
  authorId: string;
  tariffId: string | null;
  monthlyPrice: Prisma.Decimal | number | string;
  durationDays: number;
  now?: Date;
}) {
  const { subscriberId, authorId, tariffId, monthlyPrice, durationDays } = args;
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = args.now ?? new Date();
    const existing = await prisma.subscription.findFirst({
      where: { subscriberId, authorId, tariffId },
      orderBy: { endDate: "desc" },
    });
    const endDate = extendedEnd(existing, durationDays, now);
    if (!existing) {
      const subscription = await prisma.subscription.create({
        data: { subscriberId, authorId, tariffId, monthlyPrice, endDate, durationDays, startDate: now },
      });
      return { subscription, renewed: false, previousEnd: null as Date | null, endDate };
    }
    const renewed = isRenewal(existing, now);
    const res = await prisma.subscription.updateMany({
      where: { id: existing.id, endDate: existing.endDate, status: existing.status },
      data: renewed
        ? { endDate, monthlyPrice, durationDays }
        : { status: "active", startDate: now, endDate, monthlyPrice, durationDays },
    });
    if (res.count === 1) {
      const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: existing.id } });
      return { subscription, renewed, previousEnd: renewed ? existing.endDate : null, endDate };
    }
  }
  throw new Error("extendSubscription: concurrent updates, giving up");
}

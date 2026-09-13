import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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

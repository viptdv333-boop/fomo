/**
 * Удаление канала и удаление тарифного плана (22.10.2026). Логика отдельно от route-ов, чтобы её проверял
 * scripts/check-tariff-plans.ts на фейковой БД. Клиент БД и уведомления приходят параметрами.
 *
 * КАНАЛ (корень, parentId = null) — «Удалить канал»:
 *  - только автор (или ADMIN/OWNER); повторный вызов безвреден (mode "already");
 *  - есть активные подписчики -> нужно ввести название канала (confirmName), иначе отказ confirmRequired;
 *  - в ОДНОЙ транзакции: активные подписки семьи -> status "cancelled", endDate = сейчас, telegramNotify = false (без возврата
 *    денег); ожидающие платежи PENDING -> REJECTED (иначе подтверждённый позже платёж выдал бы «подписку на автора»);
 *  - строка канала НЕ удаляется, если у неё есть посты / подписки / платежи: она помечается archivedAt, isActive = false,
 *    slug освобождается; планы закрываются так же. Причина: Idea.tariffId и Subscription.tariffId — onDelete SetNull, и
 *    физическое удаление превратило бы платные посты в «платные идеи автора без канала» (видны в профиле как закрытые, но
 *    уже не принадлежат каналу). Посты получают moderationStatus "archived" (видны только автору в его архиве), чат-комната
 *    архивируется и закрывается (сообщения сохраняются), сокеты не-автора отключает штатная подметалка (subscription-sweep).
 *  - канал, у которого НИКОГДА не было ни постов, ни подписок, ни платежей, удаляется физически (ошибочно созданный);
 *  - после коммита каждому бывшему активному подписчику уходит ОДНО уведомление «Канал закрыт»; одна строка аудита в лог.
 *
 * ПЛАН (parentId != null) — «Удалить тариф»:
 *  - удаляется только строка плана; подписчики плана остаются в канале до конца оплаченного срока (их Subscription
 *    переносится на корень канала, срок не меняется); ожидающие платежи плана -> REJECTED;
 *  - сам канал (корень) этим путём не удаляется (notAPlan): корень всегда остаётся первым планом, поэтому «последнего плана»
 *    у канала не бывает.
 */

import type { PrismaClient } from "@prisma/client";
import { rootIdOf, splitTariffName, tariffFamily } from "./tariff-plans";

export type CloseFail = { ok: false; code: "notFound" | "forbidden" | "notRoot" | "confirmRequired"; activeSubscribers: number };
export type CloseOk = {
  ok: true;
  mode: "archived" | "deleted" | "already";
  /** Сколько активных подписок завершено. */
  cancelled: number;
  /** Подписчики (distinct), получившие уведомление. */
  subscriberIds: string[];
};
export type CloseResult = CloseOk | CloseFail;

export interface CloseArgs {
  rootId: string;
  actorId: string;
  actorIsAdmin?: boolean;
  /** Введённое владельцем название канала (обязательно при активных подписчиках). */
  confirmName?: string | null;
  now?: Date;
  /** Одно уведомление подписчику (после коммита); ошибки глотаются. */
  notify?: (userId: string, channelName: string) => Promise<unknown>;
  /** Строка аудита (по умолчанию console.log). */
  log?: (line: string) => void;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Принимаемые варианты названия для подтверждения: полное имя строки и имя канала до «: План» у старых строк. */
export function confirmNameMatches(root: { name: string; planName?: string | null }, typed: string | null | undefined): boolean {
  if (!typed || !norm(typed)) return false;
  const t = norm(typed);
  return t === norm(root.name) || t === norm(splitTariffName(root.name, root.planName).channel);
}

export async function closeChannel(db: PrismaClient, args: CloseArgs): Promise<CloseResult> {
  const now = args.now ?? new Date();
  const root = await db.subscriptionTariff.findUnique({
    where: { id: args.rootId },
    select: { id: true, authorId: true, parentId: true, name: true, planName: true, archivedAt: true, channelRoomId: true },
  });
  if (!root) return { ok: false, code: "notFound", activeSubscribers: 0 };
  if (root.authorId !== args.actorId && !args.actorIsAdmin) return { ok: false, code: "forbidden", activeSubscribers: 0 };
  if (root.parentId) return { ok: false, code: "notRoot", activeSubscribers: 0 };
  if (root.archivedAt) return { ok: true, mode: "already", cancelled: 0, subscriberIds: [] };

  const family = await tariffFamily(db, root.id);
  const active = await db.subscription.findMany({
    where: { tariffId: { in: family }, status: "active", endDate: { gt: now } },
    select: { id: true, subscriberId: true },
  });
  const subscriberIds = [...new Set(active.map((s) => s.subscriberId))];
  if (subscriberIds.length > 0 && !confirmNameMatches(root, args.confirmName)) {
    return { ok: false, code: "confirmRequired", activeSubscribers: subscriberIds.length };
  }

  const mode = await db.$transaction(async (tx) => {
    const [ideas, subsEver, payments] = await Promise.all([
      tx.idea.count({ where: { tariffId: { in: family } } }),
      tx.subscription.count({ where: { tariffId: { in: family } } }),
      tx.paymentRequest.count({ where: { tariffId: { in: family } } }),
    ]);

    // Ни у кого нет прав на канал после этого момента; деньги не возвращаются (возвраты — вне платформы).
    await tx.subscription.updateMany({
      where: { tariffId: { in: family }, status: "active" },
      data: { status: "cancelled", endDate: now, telegramNotify: false },
    });
    await tx.paymentRequest.updateMany({ where: { tariffId: { in: family }, status: "PENDING" }, data: { status: "REJECTED" } });

    if (root.channelRoomId) {
      await tx.chatRoom.updateMany({ where: { id: root.channelRoomId }, data: { isArchived: true, isClosed: true } });
    }

    if (ideas === 0 && subsEver === 0 && payments === 0) {
      await tx.subscriptionTariff.deleteMany({ where: { parentId: root.id } });
      await tx.subscriptionTariff.deleteMany({ where: { id: root.id } });
      return "deleted" as const;
    }

    await tx.idea.updateMany({ where: { tariffId: { in: family }, moderationStatus: "published" }, data: { moderationStatus: "archived" } });
    await tx.subscriptionTariff.updateMany({ where: { parentId: root.id }, data: { isActive: false, archivedAt: now } });
    await tx.subscriptionTariff.updateMany({
      where: { id: root.id },
      data: { isActive: false, archivedAt: now, slug: null, authorTelegramNotify: false },
    });
    return "archived" as const;
  });

  // Уведомления - после коммита, по одному; сбой уведомления не откатывает закрытие.
  if (args.notify) {
    await Promise.all(subscriberIds.map((u) => Promise.resolve(args.notify!(u, root.name)).catch(() => {})));
  }
  (args.log ?? ((l: string) => console.log(l)))(
    `[channel-close] ${JSON.stringify({ channel: root.id, mode, actor: args.actorId, cancelled: active.length, notified: subscriberIds.length })}`
  );
  return { ok: true, mode, cancelled: active.length, subscriberIds };
}

export type PlanDeleteResult =
  | { ok: true; movedSubscriptions: number; rejectedPayments: number }
  | { ok: false; code: "notFound" | "forbidden" | "notAPlan" };

export async function deletePlan(
  db: PrismaClient,
  args: { planId: string; actorId: string; actorIsAdmin?: boolean }
): Promise<PlanDeleteResult> {
  const plan = await db.subscriptionTariff.findUnique({
    where: { id: args.planId },
    select: { id: true, authorId: true, parentId: true },
  });
  if (!plan) return { ok: false, code: "notFound" };
  if (plan.authorId !== args.actorId && !args.actorIsAdmin) return { ok: false, code: "forbidden" };
  if (!plan.parentId) return { ok: false, code: "notAPlan" };

  const rootId = rootIdOf(plan);
  return db.$transaction(async (tx) => {
    // The term the subscriber paid for stays: the row moves to the channel and keeps its endDate.
    const moved = await tx.subscription.updateMany({ where: { tariffId: plan.id }, data: { tariffId: rootId } });
    const rejected = await tx.paymentRequest.updateMany({ where: { tariffId: plan.id, status: "PENDING" }, data: { status: "REJECTED" } });
    await tx.subscriptionTariff.deleteMany({ where: { id: plan.id } });
    return { ok: true as const, movedSubscriptions: moved.count, rejectedPayments: rejected.count };
  });
}

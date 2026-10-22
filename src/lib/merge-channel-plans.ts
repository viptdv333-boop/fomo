/**
 * Склейка отдельных «каналов-тарифов» в ОДИН канал с несколькими планами (22.10.2026, см. tariff-plans.ts).
 * Логика отдельно от CLI (scripts/merge-channel-plans.ts), чтобы её проверял scripts/check-tariff-plans.ts на фейковой БД.
 *
 * Что делает apply (всё в одной транзакции), для корня R и каждого плана P:
 *  1. P.parentId = R.id — строка становится планом канала R; её Subscription остаются на строке P (доступ и счётчики идут по
 *     семье R, подписчики не теряют ни дня); у P сбрасываются channelRoomId и slug (у плана нет своего чата и адреса).
 *  2. Посты (Idea.tariffId = P) переезжают на R — публикации канала живут на корне.
 *  3. Чат: сообщения комнаты P переносятся в комнату R (если у R комнаты ещё нет, R забирает комнату P целиком); опустевшая
 *     комната P НЕ удаляется, а архивируется и закрывается (isArchived, isClosed) — безопасный вариант, ничего не теряется.
 *  4. Имена: R.name = имя канала (--rename, по умолчанию часть до «: » старого имени), R.planName = название плана R
 *     (по умолчанию суффикс после «: »), P.name = название плана P (по умолчанию суффикс после «: », либо --plan-name id=Имя).
 *  5. Подписчик, у которого уже есть активные строки и в R, и в P (старые дубликаты), только ПЕРЕЧИСЛЯЕТСЯ в отчёте; с флагом
 *     mergeDuplicates строки объединяются: остаётся строка с самым поздним концом, к ней добавляется остаток срока второй, вторая
 *     закрывается (status "cancelled", endDate = сейчас) — оплаченные дни не теряются.
 * Ничего не удаляется. Повторный запуск безопасен (идемпотентно): уже склеенные планы пропускаются.
 */

import type { PrismaClient } from "@prisma/client";
import { splitTariffName } from "./tariff-plans";

export interface MergeOptions {
  rootId: string;
  planIds: string[];
  /** Новое имя канала (корня); по умолчанию — часть имени корня до «:». */
  rename?: string | null;
  /** Название плана корня; по умолчанию — суффикс его старого имени. */
  rootPlanName?: string | null;
  /** id плана -> название плана; по умолчанию суффикс его старого имени. */
  planNames?: Record<string, string>;
  mergeDuplicates?: boolean;
  now?: Date;
}

export interface MergePlanRow {
  planId: string;
  oldName: string;
  newName: string;
  alreadyMerged: boolean;
  subscriptions: number;
  activeSubscriptions: number;
  ideas: number;
  chatMessages: number;
  roomAction: "none" | "move-messages-and-archive" | "root-takes-room";
  slug: string | null;
}

export interface MergeReport {
  ok: boolean;
  errors: string[];
  root?: { id: string; oldName: string; newName: string; planName: string };
  plans: MergePlanRow[];
  duplicates: { subscriberId: string; rows: number }[];
  applied: boolean;
}

type TariffRow = {
  id: string;
  authorId: string;
  name: string;
  planName: string | null;
  parentId: string | null;
  archivedAt: Date | null;
  channelRoomId: string | null;
  slug: string | null;
};

const SELECT = { id: true, authorId: true, name: true, planName: true, parentId: true, archivedAt: true, channelRoomId: true, slug: true } as const;

export async function mergeChannelPlans(db: PrismaClient, opts: MergeOptions, apply: boolean): Promise<MergeReport> {
  const report: MergeReport = { ok: false, errors: [], plans: [], duplicates: [], applied: false };
  const now = opts.now ?? new Date();
  const planIds = [...new Set(opts.planIds)];
  if (planIds.length === 0) report.errors.push("нужен хотя бы один --plan");
  if (planIds.includes(opts.rootId)) report.errors.push("корень не может быть своим же планом");

  const root = (await db.subscriptionTariff.findUnique({ where: { id: opts.rootId }, select: SELECT })) as TariffRow | null;
  if (!root) {
    report.errors.push(`корень ${opts.rootId} не найден`);
    return report;
  }
  if (root.parentId) report.errors.push(`${root.id} сам является планом канала ${root.parentId} — укажите сам канал`);
  if (root.archivedAt) report.errors.push(`канал ${root.id} закрыт (archivedAt)`);

  const planRows = (await db.subscriptionTariff.findMany({ where: { id: { in: planIds } }, select: SELECT })) as TariffRow[];
  for (const id of planIds) {
    const p = planRows.find((x) => x.id === id);
    if (!p) report.errors.push(`план ${id} не найден`);
    else {
      if (p.authorId !== root.authorId) report.errors.push(`у ${id} другой автор — склеивать можно только каналы одного автора`);
      if (p.archivedAt) report.errors.push(`${id} закрыт (archivedAt)`);
    }
  }
  const childCount = await db.subscriptionTariff.count({ where: { parentId: { in: planIds.filter((id) => id !== opts.rootId) } } });
  if (childCount > 0) report.errors.push("у одного из планов уже есть собственные планы — сначала склейте их с их каналом");
  if (report.errors.length) return report;

  // Names
  const rootSplit = splitTariffName(root.name, root.planName);
  const newRootName = (opts.rename ?? rootSplit.channel).trim();
  const newRootPlan = (opts.rootPlanName ?? rootSplit.plan ?? root.planName ?? "Базовый").trim();
  report.root = { id: root.id, oldName: root.name, newName: newRootName, planName: newRootPlan };
  const takenNames = new Set([newRootPlan.toLowerCase()]);

  for (const p of planRows) {
    const alreadyMerged = p.parentId === root.id;
    const label = (opts.planNames?.[p.id] ?? (alreadyMerged ? p.name : splitTariffName(p.name, p.planName).plan ?? p.name)).trim();
    if (takenNames.has(label.toLowerCase())) report.errors.push(`название плана «${label}» повторяется — задайте --plan-name ${p.id}=<Имя>`);
    takenNames.add(label.toLowerCase());
    const [subs, active, ideas, msgs] = await Promise.all([
      db.subscription.count({ where: { tariffId: p.id } }),
      db.subscription.count({ where: { tariffId: p.id, status: "active", endDate: { gt: now } } }),
      db.idea.count({ where: { tariffId: p.id } }),
      p.channelRoomId ? db.chatMessage.count({ where: { roomId: p.channelRoomId } }) : Promise.resolve(0),
    ]);
    report.plans.push({
      planId: p.id,
      oldName: p.name,
      newName: label,
      alreadyMerged,
      subscriptions: subs,
      activeSubscriptions: active,
      ideas,
      chatMessages: msgs,
      roomAction: !p.channelRoomId ? "none" : root.channelRoomId ? "move-messages-and-archive" : "root-takes-room",
      slug: p.slug,
    });
  }
  if (report.errors.length) return report;

  // Duplicates: people with active rows on more than one row of the future family
  const family = [root.id, ...planIds];
  const activeRows = await db.subscription.findMany({
    where: { tariffId: { in: family }, status: "active", endDate: { gt: now } },
    select: { id: true, subscriberId: true, endDate: true },
    orderBy: { endDate: "desc" },
  });
  const bySubscriber = new Map<string, { id: string; endDate: Date }[]>();
  for (const r of activeRows) bySubscriber.set(r.subscriberId, [...(bySubscriber.get(r.subscriberId) ?? []), { id: r.id, endDate: r.endDate }]);
  report.duplicates = [...bySubscriber].filter(([, rows]) => rows.length > 1).map(([subscriberId, rows]) => ({ subscriberId, rows: rows.length }));

  report.ok = true;
  if (!apply) return report;

  await db.$transaction(async (tx) => {
    // 3. chat rooms first (a unique channelRoomId must be freed before it can move)
    let rootRoom = root.channelRoomId;
    for (const p of planRows) {
      if (!p.channelRoomId || p.parentId === root.id) continue;
      const planRoom = p.channelRoomId;
      await tx.subscriptionTariff.updateMany({ where: { id: p.id }, data: { channelRoomId: null } });
      if (!rootRoom) {
        await tx.subscriptionTariff.updateMany({ where: { id: root.id }, data: { channelRoomId: planRoom } });
        rootRoom = planRoom;
      } else {
        await tx.chatMessage.updateMany({ where: { roomId: planRoom }, data: { roomId: rootRoom } });
        await tx.chatRoom.updateMany({ where: { id: planRoom }, data: { isArchived: true, isClosed: true } });
      }
    }

    // 1/2/4. plans and posts
    for (const p of planRows) {
      const label = report.plans.find((r) => r.planId === p.id)!.newName;
      await tx.subscriptionTariff.updateMany({ where: { id: p.id }, data: { parentId: root.id, name: label, planName: null, slug: null } });
      await tx.idea.updateMany({ where: { tariffId: p.id }, data: { tariffId: root.id } });
    }
    await tx.subscriptionTariff.updateMany({ where: { id: root.id }, data: { name: newRootName, planName: newRootPlan } });

    // 5. duplicate rows
    if (opts.mergeDuplicates) {
      for (const [, rows] of bySubscriber) {
        if (rows.length < 2) continue;
        const [keep, ...rest] = rows; // sorted by endDate desc
        let end = keep.endDate.getTime();
        for (const extra of rest) {
          end += Math.max(0, extra.endDate.getTime() - now.getTime());
          await tx.subscription.updateMany({ where: { id: extra.id }, data: { status: "cancelled", endDate: now, telegramNotify: false } });
        }
        await tx.subscription.updateMany({ where: { id: keep.id }, data: { endDate: new Date(end) } });
      }
    }
  });
  report.applied = true;
  return report;
}

import type { Prisma, PrismaClient } from "@prisma/client";

export const SETUP_BATCH_SECONDS = 15 * 60;
export const SETUP_BATCH_VERSION = 1;
export const SETUP_SCOPE_VERSION = 1;

// 08.10.2026: окно фиксируется первым сетапом, следующие его НЕ продлевают.
export function batchStart(previous: Date | null, now: Date): Date {
  return previous && now.getTime() - previous.getTime() <= SETUP_BATCH_SECONDS * 1000
    ? previous : now;
}

const select = { id: true, title: true, createdAt: true, tariffId: true } as const;

export async function createBotIdea(
  db: PrismaClient,
  data: Prisma.IdeaUncheckedCreateInput,
  setupTicker?: string,
  setupScope?: string,
) {
  if (!setupTicker) {
    return { idea: await db.idea.create({ data, select }), setupBatch: null };
  }
  if (!data.tariffId) throw new Error("A setup requires a closed channel");

  // 12.10.2026: отдельная пачка на источник-счёт и горизонт. Старые посты
  // без scope не присваиваем счёту и не архивируем по догадке. Поле уже индексировано.
  const batchKey = setupScope ? JSON.stringify([setupTicker, setupScope]) : setupTicker;
  const scope = { authorId: data.authorId, tariffId: data.tariffId, botSetupTicker: batchKey };
  // 08.10.2026: блокировка БД, а не память процесса — параллельные публикации
  // одного тикера/канала не удаляют друг друга. Создание и архив — одна транзакция.
  return db.$transaction(async (tx) => {
    const key = JSON.stringify([scope.authorId, scope.tariffId, batchKey]);
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const previous = await tx.idea.findFirst({
      where: scope, orderBy: { createdAt: "desc" }, select: { botSetupBatchAt: true },
    });
    const startedAt = batchStart(previous?.botSetupBatchAt ?? null, clock.now);
    let archivedCount = 0;
    if (previous && startedAt.getTime() !== previous.botSetupBatchAt?.getTime()) {
      const archived = await tx.idea.updateMany({
        where: { ...scope, moderationStatus: "published" },
        data: { moderationStatus: "archived", isPinned: false, pinnedAt: null },
      });
      archivedCount = archived.count;
    }
    const idea = await tx.idea.create({
      data: { ...data, botSetupTicker: batchKey, botSetupBatchAt: startedAt, createdAt: clock.now },
      select,
    });
    return {
      idea,
      setupBatch: { version: SETUP_BATCH_VERSION, ticker: setupTicker, scope: setupScope ?? null, startedAt,
        windowSeconds: SETUP_BATCH_SECONDS, archivedCount },
    };
  });
}

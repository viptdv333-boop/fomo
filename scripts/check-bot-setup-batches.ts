// 08.10.2026: изолированная проверка пачек — без боевой БД и отправки подписчикам.
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { batchStart, createBotIdea } from "../src/lib/bot-setup-batch";

type Row = Record<string, any>;
let rows: Row[] = [];
let now = new Date("2026-10-08T10:00:00Z");
let failCreate = false;
let failArchive = false;
let tail = Promise.resolve();
let locks = 0;
function matches(row: Row, where: Row) {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}
const create = async ({ data }: Row) => {
  if (failCreate) throw new Error("create failed");
  const row = { id: `id-${rows.length}`, moderationStatus: "published", createdAt: now, ...data };
  rows.push(row);
  return row;
};
const db = {
  idea: { create },
  $transaction: async (fn: (tx: any) => Promise<any>) => {
    const wait = tail;
    let release!: () => void;
    tail = new Promise<void>(r => { release = r; });
    await wait;
    const before = structuredClone(rows);
    let locked = false;
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        if (strings.join("").includes("pg_advisory_xact_lock")) {
          locked = true; locks++; return [{ locked: 1 }];
        }
        assert.ok(locked, "время читается после блокировки");
        return [{ now }];
      },
      idea: {
        create,
        findFirst: async ({ where }: Row) => {
          assert.ok(locked, "поиск пачки после блокировки");
          return rows.filter(r => matches(r, where)).sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null;
        },
        updateMany: async ({ where, data }: Row) => {
          if (failArchive) throw new Error("archive failed");
          const selected = rows.filter(r => matches(r, where));
          selected.forEach(r => Object.assign(r, data));
          return { count: selected.length };
        },
      },
    };
    try { return await fn(tx); }
    catch (error) { rows = before; throw error; }
    finally { release(); }
  },
} as unknown as PrismaClient;
const data = { authorId: "bot", tariffId: "signals", title: "test", preview: "test", content: "test" };
async function publish(ticker = "NGV6", channel = "signals") {
  return createBotIdea(db, { ...data, tariffId: channel }, ticker);
}

async function main() {
  const first = await publish();
  assert.equal(first.setupBatch?.archivedCount, 0);
  now = new Date("2026-10-08T10:10:00Z");
  await publish();
  now = new Date("2026-10-08T10:15:00Z");
  const edge = await publish();
  assert.equal(+edge.setupBatch!.startedAt, +first.setupBatch!.startedAt);
  await publish("CCX6");
  await publish("NGV6", "gas");
  // Прогноз, событие сделки, чужой автор и старые карточки без меток не затрагиваются.
  await createBotIdea(db, { ...data, title: "forecast" });
  await createBotIdea(db, { ...data, title: "trade event" });
  await createBotIdea(db, { ...data, title: "legacy setup" });
  rows.push({ ...data, authorId: "another", botSetupTicker: "NGV6", moderationStatus: "published" });
  rows.push({ ...data, botSetupTicker: "NGV6", moderationStatus: "hidden", createdAt: first.idea.createdAt });
  const protectedRows = structuredClone(rows.slice(3));
  now = new Date("2026-10-08T10:15:00.001Z");
  const replaced = await publish();
  assert.equal(replaced.setupBatch?.archivedCount, 3);
  assert.ok(rows.slice(0, 3).every(r => r.moderationStatus === "archived"));
  assert.deepEqual(rows.slice(3, -1), protectedRows);
  assert.equal(+replaced.setupBatch!.startedAt, +now);
  assert.equal(locks, 6);

  now = new Date("2026-10-08T11:00:00Z");
  const before = structuredClone(rows);
  failCreate = true;
  await assert.rejects(publish(), /create failed/);
  failCreate = false;
  assert.deepEqual(rows, before, "неудавшийся новый пост не убирает старый");
  failArchive = true;
  await assert.rejects(publish(), /archive failed/);
  failArchive = false;
  assert.deepEqual(rows, before, "при ошибке архива нет полузамены");
  const parallel = await Promise.all([publish(), publish()]);
  assert.deepEqual(parallel.map(r => r.setupBatch!.archivedCount), [1, 0]);
  assert.ok(rows.slice(-2).every(r => r.moderationStatus === "published"));
  assert.equal(+parallel[0].setupBatch!.startedAt, +parallel[1].setupBatch!.startedAt);
  assert.equal(+batchStart(null, now), +now);
  await assert.rejects(createBotIdea(db, { ...data, tariffId: null }, "NGV6"), /closed channel/);
  console.log("OK: fixed window, exact boundary, ticker/channel/author isolation, rollback, concurrent batch, no public setup");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

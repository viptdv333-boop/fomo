/* Check of the user-data copy between the two sites (src/lib/userdata-sync.ts, userdata-mirror-server.ts, the "userdata" op of the account mirror).
   Run: npx tsx scripts/check-userdata-sync.ts   (no network, no database: an in-memory fake) */
import { mirrorMessageSchema, inboundBucket, isCriticalOp } from "../src/lib/account-mirror";
import { MIRRORED_KINDS, incomingWins, isMirroredKind, newerSide } from "../src/lib/userdata-sync";
import { applyUserDataMessage, applyWatchlistMessage, type UserDataMirrorDb, type WatchlistMirrorDb } from "../src/lib/userdata-mirror-server";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// ---- pure logic ----
eq("whitelist: settings, indicators, drawings are copied", ["chart_settings", "chart_indicators", "chart_drawings"].map(isMirroredKind), [true, true, true]);
eq("whitelist: extra watchlists are copied, notification devices stay per site", ["terminal_watchlists", "terminal_notify", "nope"].map(isMirroredKind), [true, false, false]);
eq("whitelist has no duplicates", new Set(MIRRORED_KINDS).size, MIRRORED_KINDS.length);
eq("newer wins: no local row / older local / equal / newer local", [incomingWins(null, 5), incomingWins(4, 5), incomingWins(5, 5), incomingWins(6, 5)], [true, true, false, false]);
eq("newerSide", [newerSide(null, null), newerSide(1, null), newerSide(null, 1), newerSide(2, 1), newerSide(1, 2), newerSide(3, 3)], ["same", "a", "b", "a", "b", "same"]);

// ---- wire format ----
const base = { op: "userdata", email: "anna@example.com", kind: "chart_settings", key: "default", at: 1700000000000 };
eq("schema: a blob", mirrorMessageSchema.safeParse({ ...base, data: { v: 1 } }).success, true);
eq("schema: a removal", mirrorMessageSchema.safeParse({ ...base, deleted: true }).success, true);
eq("schema: bad kind / empty key / zero time are refused", [mirrorMessageSchema.safeParse({ ...base, kind: "Bad Kind" }).success, mirrorMessageSchema.safeParse({ ...base, key: "" }).success, mirrorMessageSchema.safeParse({ ...base, at: 0 }).success], [false, false, false]);
eq("bucket: a bucket of its own, not a critical op", [inboundBucket("userdata").key, isCriticalOp("userdata")], ["account-mirror:in:userdata", false]);

// ---- receiver on an in-memory fake ----
type Row = { id: string; userId: string; kind: string; key: string; data: unknown; updatedAt: Date; createdAt: Date };
function fakeDb(users: { id: string; email: string }[]) {
  const rows: Row[] = [];
  let n = 0;
  const db = {
    user: { findFirst: async ({ where }: { where: { email: { equals: string } } }) => users.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null },
    terminalUserData: {
      findUnique: async ({ where }: { where: { userId_kind_key: { userId: string; kind: string; key: string } } }) => {
        const w = where.userId_kind_key;
        return rows.find((r) => r.userId === w.userId && r.kind === w.kind && r.key === w.key) ?? null;
      },
      count: async ({ where }: { where: { userId: string; kind: string } }) => rows.filter((r) => r.userId === where.userId && r.kind === where.kind).length,
      findMany: async ({ where, take }: { where: { userId: string; kind: string }; take: number }) => rows.filter((r) => r.userId === where.userId && r.kind === where.kind).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()).slice(0, take),
      deleteMany: async ({ where }: { where: { id?: { in: string[] }; userId?: string; kind?: string; key?: string } }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i];
          if ((where.id && where.id.in.includes(r.id)) || (where.userId && r.userId === where.userId && r.kind === where.kind && r.key === where.key)) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      },
      upsert: async ({ where, create, update }: { where: { userId_kind_key: { userId: string; kind: string; key: string } }; create: Partial<Row>; update: Partial<Row> }) => {
        const w = where.userId_kind_key;
        const cur = rows.find((r) => r.userId === w.userId && r.kind === w.kind && r.key === w.key);
        if (cur) Object.assign(cur, update);
        else rows.push({ id: `r${++n}`, userId: w.userId, kind: w.kind, key: w.key, data: create.data, updatedAt: create.updatedAt ?? new Date(), createdAt: create.createdAt ?? new Date() });
      },
    },
  };
  return { db: db as unknown as UserDataMirrorDb, rows };
}
const msg = (o: Record<string, unknown>) => mirrorMessageSchema.parse({ ...base, ...o }) as Parameters<typeof applyUserDataMessage>[0];

(async () => {
  const { db, rows } = fakeDb([{ id: "u1", email: "Anna@Example.com" }]);
  eq("receiver: a new blob is created, the account is found by e-mail without regard to case", [(await applyUserDataMessage(msg({ email: "anna@example.com", data: { color: "red" } }), db)).result, rows.length, rows[0].updatedAt.getTime()], ["updated", 1, 1700000000000]);
  eq("receiver: the same message again is a no-op (idempotent)", [(await applyUserDataMessage(msg({ data: { color: "red" } }), db)).result, rows.length], ["noop", 1]);
  eq("receiver: an OLDER copy never overwrites", [(await applyUserDataMessage(msg({ at: 1699999999999, data: { color: "blue" } }), db)).result, (rows[0].data as { color: string }).color], ["noop", "red"]);
  eq("receiver: a NEWER copy replaces it and keeps the sender's instant", [(await applyUserDataMessage(msg({ at: 1700000005000, data: { color: "green" } }), db)).result, (rows[0].data as { color: string }).color, rows[0].updatedAt.getTime()], ["updated", "green", 1700000005000]);
  eq("receiver: a stale removal is ignored, a newer one removes the row", [(await applyUserDataMessage(msg({ at: 1700000000001, deleted: true }), db)).result, rows.length, (await applyUserDataMessage(msg({ at: 1700000009000, deleted: true }), db)).result, rows.length], ["noop", 1, "updated", 0]);
  eq("receiver: an unknown address", (await applyUserDataMessage(msg({ email: "nobody@example.com", data: {} }), db)).result, "not_found");
  eq("receiver: a kind that stays per site is refused", [(await applyUserDataMessage(msg({ kind: "terminal_notify", data: {} }), db)).result, rows.length], ["skipped", 0]);
  eq("receiver: a blob over the per-kind cap is refused", [(await applyUserDataMessage(msg({ kind: "terminal_last", data: { s: "x".repeat(3000) } }), db)).result, rows.length], ["skipped", 0]);
  // drawings keep the newest 200 symbols: the 201st evicts the oldest instead of failing
  for (let i = 0; i < 201; i++) await applyUserDataMessage(msg({ kind: "chart_drawings", key: `moex:S${i}`, at: 1700000100000 + i, data: { i } }), db);
  eq("receiver: drawings are capped at 200 symbols, the oldest is evicted", [rows.filter((r) => r.kind === "chart_drawings").length, rows.some((r) => r.key === "moex:S0")], [200, false]);

  // ---- the main watchlist ----
  const wmsg = (o: Record<string, unknown>) => mirrorMessageSchema.parse({ op: "watchlist", email: "anna@example.com", at: 1700000000000, items: [{ source: "moex", ticker: "SBER", dataTicker: "SBER", name: "Сбербанк" }], ...o }) as Parameters<typeof applyWatchlistMessage>[0];
  eq("watchlist schema: a list, an empty list, a bad source and 201 items are refused", [mirrorMessageSchema.safeParse(wmsg({}) ).success, mirrorMessageSchema.safeParse({ op: "watchlist", email: "a@b.co", at: 1, items: [] }).success, mirrorMessageSchema.safeParse({ op: "watchlist", email: "a@b.co", at: 1, items: [{ source: "x", ticker: "A", dataTicker: "A", name: "" }] }).success, mirrorMessageSchema.safeParse({ op: "watchlist", email: "a@b.co", at: 1, items: Array.from({ length: 201 }, () => ({ source: "moex", ticker: "A", dataTicker: "A", name: "" })) }).success], [true, true, false, false]);
  const wl: { userId: string; source: string; dataTicker: string; sortOrder: number; createdAt: Date }[] = [];
  const wdb = {
    user: { findFirst: async ({ where }: { where: { email: { equals: string } } }) => (where.email.equals.toLowerCase() === "anna@example.com" ? { id: "u1" } : null) },
    terminalWatchItem: {
      findFirst: async () => wl.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      deleteMany: async () => { wl.length = 0; return { count: 0 }; },
      createMany: async ({ data }: { data: typeof wl }) => { wl.push(...data); return { count: data.length }; },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as WatchlistMirrorDb;
  eq("watchlist: a list arrives on an empty side with the sender's instant", [(await applyWatchlistMessage(wmsg({}), wdb)).result, wl.length, wl[0]?.createdAt.getTime()], ["updated", 1, 1700000000000]);
  eq("watchlist: the same message again is a no-op", [(await applyWatchlistMessage(wmsg({}), wdb)).result, wl.length], ["noop", 1]);
  eq("watchlist: an older list never overwrites", [(await applyWatchlistMessage(wmsg({ at: 1699999999999, items: [] }), wdb)).result, wl.length], ["noop", 1]);
  eq("watchlist: a newer list replaces it in the sender's order, duplicates dropped", [(await applyWatchlistMessage(wmsg({ at: 1700000005000, items: [{ source: "moex", ticker: "GAZP", dataTicker: "GAZP", name: "" }, { source: "bybit", ticker: "BTC", dataTicker: "BTCUSDT", name: "" }, { source: "moex", ticker: "GAZP", dataTicker: "GAZP", name: "" }] }), wdb)).result, wl.map((r) => r.dataTicker), wl.map((r) => r.sortOrder)], ["updated", ["GAZP", "BTCUSDT"], [0, 1]]);
  eq("watchlist: a newer EMPTY list clears it (a cleared list is a change too)", [(await applyWatchlistMessage(wmsg({ at: 1700000009000, items: [] }), wdb)).result, wl.length], ["updated", 0]);
  eq("watchlist: an unknown address", (await applyWatchlistMessage(wmsg({ email: "nobody@example.com" }), wdb)).result, "not_found");

  console.log(failed ? `\n${failed} FAILED` : "\nall ok");
  process.exit(failed ? 1 : 0);
})();
